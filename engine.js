// The material engine: fetches one temperature of nuclear data on demand and
// asks the yamc wasm for macroscopic cross sections.
//
// Data comes from the published Arrow directories at `ORIGIN`, one directory
// per library and nuclide, and only the pieces this page draws are downloaded:
//
//   version.json    whole (a few tens of kB), it carries the byte-range index
//   nuclide.arrow   whole (3 kB)
//   energy.arrow    the schema and the one record batch for TEMPERATURE
//   reactions.arrow the schema and one record batch per (wanted MT, TEMPERATURE)
//
// The pieces are spliced into Arrow IPC streams and handed to the wasm's
// in-memory filesystem, where the reader treats them exactly like the whole
// files. Reactions are fetched as the page asks for them, so choosing a new
// reaction costs one small range request per nuclide rather than a reload.
//
// Every material belongs to one library. The same nuclide from two libraries
// is two entries here and two directories in the wasm filesystem, and the
// wasm's nuclide-to-directory map is pointed at a material's own library each
// time that material is built, so two rows of the page can draw the same
// material from different libraries on one plot.
//
// The wasm caller must never ask for a reaction none of a material's nuclides
// carry: that is a Rust panic, and a panic leaves the module unusable. Every
// MT handed to `macroscopicCrossSection` here has first been fetched for at
// least one nuclide of the material.
//
// Nothing in this file touches the DOM or `self`, so the same code runs under
// Node against the live origin as well as inside the worker.

import { WasmMaterial, WasmSimulation, WasmConfig, element_nuclides } from './pkg/yamc.js';
import {
  reactionRanges, energyRanges, publishedMts, planFetch, coalesce, spliceStream, rangeHeader, EOS,
} from './ranges.js';
import { LIBRARIES, DEFAULT_LIBRARY } from './libraries.js';

export const ORIGIN = 'https://yamc-data.xsplot.com';
/// The temperature this page draws, spelled the way the files label it.
export const TEMPERATURE = '294K';
/// The bare label the wasm material API uses for the same temperature.
const TEMPERATURE_LABEL = TEMPERATURE.replace(/K$/, '');
/// Total cross section. The macroscopic calculation always needs it, whatever
/// reaction is asked for, so it is fetched for every nuclide up front.
const TOTAL_MT = 1;

const SECTIONS_WHOLE = ['version.json', 'nuclide.arrow'];
const KNOWN_LIBRARIES = new Set(LIBRARIES.map((l) => l.id));

/// Build the engine. The wasm module must already be initialised.
export function createEngine({ origin = ORIGIN, fetchImpl = fetch } = {}) {
  // Owns the in-memory storage backend the wasm reads nuclear data from.
  // Constructing it installs that backend; nothing else in the wasm API does.
  const sim = new WasmSimulation();
  const elementMap = element_nuclides();

  /// Per-(library, nuclide) state. Held as the in-flight promise so concurrent
  /// materials sharing a nuclide coalesce onto one download.
  const nuclides = new Map();
  /// Materials the page has asked for, keyed by library and the page's id.
  const materials = new Map();
  /// Once a ranged request has come back as a whole object, something between
  /// here and the bucket strips `Range`; every later fetch asks for whole files
  /// so a plan of several spans does not download the file several times.
  let rangesStripped = false;

  const url = (library, name, file) => `${origin}/${library}/neutron/${name}.arrow/${file}`;
  const dir = (library, name) => `/${library}/${name}.arrow`;
  const key = (library, id) => `${library}/${id}`;

  function checkLibrary(library) {
    if (!KNOWN_LIBRARIES.has(library)) {
      throw new Error(`unknown library ${library}; one of ${[...KNOWN_LIBRARIES].join(', ')}`);
    }
    return library;
  }

  async function fetchBytes(target, range = null) {
    const resp = await fetchImpl(target, range ? { headers: { Range: rangeHeader(range) } } : undefined);
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText} fetching ${target}`);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (range && resp.status !== 206) {
      // The whole object arrived instead of the slice. It is still the right
      // data, so the caller takes it as the file rather than splicing it.
      rangesStripped = true;
      return { bytes, whole: true };
    }
    if (range && bytes.length !== range.len) {
      throw new Error(`${target}: asked for ${range.len} bytes, got ${bytes.length}`);
    }
    return { bytes, whole: false };
  }

  /// Fetch the spans of a plan and splice them into a stream, or return the
  /// whole file when a range request was not honoured.
  async function fetchSpliced(target, plan) {
    const got = await Promise.all(plan.spans.map((span) => fetchBytes(target, span)));
    const whole = got.find((g) => g.whole);
    if (whole) return { bytes: whole.bytes, whole: true };
    return { bytes: spliceStream(plan.parts, plan.spans, got.map((g) => g.bytes)), whole: false };
  }

  /// Load a nuclide's metadata and its energy grid at TEMPERATURE from one
  /// library, and record where its reactions live so they can be fetched one
  /// at a time later.
  function ensureNuclide(library, name) {
    const k = key(library, name);
    if (!nuclides.has(k)) {
      nuclides.set(k, loadNuclide(library, name).catch((err) => {
        // A failed load is not cached: a transient network error would
        // otherwise poison the nuclide for the rest of the session.
        nuclides.delete(k);
        throw err;
      }));
    }
    return nuclides.get(k);
  }

  async function loadNuclide(library, name) {
    const versionResp = await fetchImpl(url(library, name, 'version.json'));
    if (versionResp.status === 404) {
      // Nothing else under this directory can exist either. The libraries
      // differ in coverage (TENDL-2025 has no H1, for one), so this is the
      // message a user picking a library needs to see.
      throw new Error(`${name} is not published in ${library}`);
    }
    if (!versionResp.ok) {
      throw new Error(`${versionResp.status} ${versionResp.statusText} fetching ${url(library, name, 'version.json')}`);
    }
    const [versionBytes, nuclideBytes] = await Promise.all([
      versionResp.arrayBuffer().then((b) => new Uint8Array(b)),
      fetchBytes(url(library, name, 'nuclide.arrow')).then((g) => g.bytes),
    ]);
    let version;
    try {
      version = JSON.parse(new TextDecoder().decode(versionBytes));
    } catch (err) {
      throw new Error(`${library} ${name}: version.json does not parse: ${err.message}`);
    }
    const reactions = reactionRanges(version);
    const energy = energyRanges(version);

    const entry = {
      library,
      name,
      dir: dir(library, name),
      /// Reaction batches fetched so far, MT -> {off, len, bytes}, in file order
      /// when written out. Empty while `whole` is true.
      batches: new Map(),
      inFlight: new Map(),
      /// Bumped whenever reactions.arrow in the wasm filesystem is rewritten,
      /// so materials built against an older copy know to rebuild.
      fileVersion: 0,
      /// The MTs this nuclide publishes at TEMPERATURE, or null until known.
      mts: null,
      whole: false,
      schema: null,
      ranges: null,
    };

    sim.add_file(`${entry.dir}/version.json`, versionBytes);
    sim.add_file(`${entry.dir}/nuclide.arrow`, nuclideBytes);

    const indexed = reactions && energy && energy.temperatures.has(TEMPERATURE) && !rangesStripped;
    if (indexed) {
      const plan = planFetch(energy.schema, [energy.temperatures.get(TEMPERATURE)]);
      const got = await fetchSpliced(url(library, name, 'energy.arrow'), plan);
      sim.add_file(`${entry.dir}/energy.arrow`, got.bytes);
    } else {
      if (energy && !energy.temperatures.has(TEMPERATURE)) {
        throw new Error(`${name} is not published at ${TEMPERATURE} in ${library}`);
      }
      const got = await fetchBytes(url(library, name, 'energy.arrow'));
      sim.add_file(`${entry.dir}/energy.arrow`, got.bytes);
    }

    if (indexed && !rangesStripped) {
      entry.ranges = reactions;
      entry.mts = new Set(publishedMts(reactions, TEMPERATURE));
    } else {
      await loadWholeReactions(entry);
    }
    return entry;
  }

  /// Fallback for a nuclide without a usable index, or an origin that ignores
  /// `Range`: take the whole reactions file and let the wasm say what it holds.
  async function loadWholeReactions(entry) {
    const got = await fetchBytes(url(entry.library, entry.name, 'reactions.arrow'));
    sim.add_file(`${entry.dir}/reactions.arrow`, got.bytes);
    entry.whole = true;
    entry.batches.clear();
    entry.fileVersion++;
    // The map must name a directory that already holds files: the wasm checks
    // the path exists and panics otherwise. This throwaway material is what
    // reads the MT list out.
    WasmConfig.set_cross_sections({ [entry.name]: entry.dir });
    const probe = new WasmMaterial();
    probe.add_nuclide(entry.name, 1.0);
    probe.set_density('g/cm3', 1.0);
    try {
      entry.mts = new Set(Array.from(probe.reaction_mts()).map(Number));
    } finally {
      probe.free();
    }
  }

  /// Make sure the reactions file for `entry` in the wasm filesystem carries
  /// every MT in `wanted` that the nuclide publishes at TEMPERATURE.
  async function ensureReactions(entry, wanted) {
    if (entry.whole) return;
    const missing = [];
    for (const mt of wanted) {
      if (!entry.mts.has(mt) || entry.batches.has(mt) || entry.inFlight.has(mt)) continue;
      missing.push(mt);
    }
    const pending = [...wanted].filter((mt) => entry.inFlight.has(mt)).map((mt) => entry.inFlight.get(mt));
    if (missing.length) {
      const job = fetchReactions(entry, missing);
      for (const mt of missing) entry.inFlight.set(mt, job);
      pending.push(job);
    }
    await Promise.all(pending);
  }

  async function fetchReactions(entry, mts) {
    const { ranges } = entry;
    const byRange = new Map();
    for (const mt of mts) {
      const range = ranges.mts.get(mt).get(TEMPERATURE);
      byRange.set(`${range.off}+${range.len}`, { ...range, mt });
    }
    const wanted = [...byRange.values()];
    // The schema is the same bytes every time, so once it is in hand only the
    // batches are requested. This halves the requests for every reaction after
    // the first, since the schema sits at the head of the file and the batches
    // for one temperature sit far from it.
    const plan = entry.schema
      ? { parts: [...wanted].sort((a, b) => a.off - b.off), spans: coalesce([...wanted]) }
      : planFetch(ranges.schema, wanted);
    const target = url(entry.library, entry.name, 'reactions.arrow');
    try {
      const got = await Promise.all(plan.spans.map((span) => fetchBytes(target, span)));
      const whole = got.find((g) => g.whole);
      if (whole) {
        // The origin sent the whole file. Keep it: nothing else needs fetching
        // for this nuclide, and the ranged path is off for the session.
        sim.add_file(`${entry.dir}/reactions.arrow`, whole.bytes);
        entry.whole = true;
        entry.batches.clear();
        entry.fileVersion++;
        return;
      }
      const bodies = got.map((g) => g.bytes);
      const cut = (part) => {
        const i = plan.spans.findIndex((s) => part.off >= s.off && part.off + part.len <= s.off + s.len);
        if (i < 0) throw new Error(`${entry.name}: no fetched span covers ${part.off}+${part.len}`);
        const from = part.off - plan.spans[i].off;
        return bodies[i].slice(from, from + part.len);
      };
      if (!entry.schema) entry.schema = cut(ranges.schema);
      for (const part of wanted) {
        // One batch can be listed under several MTs only in files from before
        // the temperature split, which the index reader already rejects, so
        // each fetched range is one MT here.
        entry.batches.set(part.mt, { off: part.off, len: part.len, bytes: cut(part) });
      }
      writeReactions(entry);
    } finally {
      for (const mt of mts) entry.inFlight.delete(mt);
    }
  }

  /// Rewrite the nuclide's reactions.arrow in the wasm filesystem from the
  /// batches fetched so far: schema, batches in file order, end of stream.
  function writeReactions(entry) {
    const parts = [...entry.batches.values()].sort((a, b) => a.off - b.off);
    const total = entry.schema.length + parts.reduce((n, p) => n + p.len, 0) + EOS.length;
    const out = new Uint8Array(total);
    out.set(entry.schema, 0);
    let at = entry.schema.length;
    for (const p of parts) {
      out.set(p.bytes, at);
      at += p.len;
    }
    out.set(EOS, at);
    sim.add_file(`${entry.dir}/reactions.arrow`, out);
    entry.fileVersion++;
  }

  /// Every nuclide a material definition needs data for. Elements are expanded
  /// through the wasm's own abundance table so the list can never disagree
  /// with what `add_element` builds.
  function requiredNuclides(def) {
    const wanted = new Set();
    for (const e of def.elements ?? []) {
      const isotopes = elementMap.get(e.name);
      if (!isotopes) throw new Error(`unknown element ${e.name}`);
      for (const n of isotopes) wanted.add(n);
    }
    for (const n of def.nuclides ?? []) wanted.add(n.name);
    return [...wanted];
  }

  /// Register a material from one library and return the MTs it can be
  /// plotted for: the union of what its nuclides publish at TEMPERATURE, read
  /// from the indexes without touching the wasm.
  async function createMaterial(materialId, def, library = DEFAULT_LIBRARY) {
    checkLibrary(library);
    const k = key(library, materialId);
    if (materials.has(k)) return materials.get(k).mts;
    if (!def.density) throw new Error(`material ${materialId} has no density`);
    const names = requiredNuclides(def);
    const entries = await Promise.all(names.map((name) => ensureNuclide(library, name)));
    const mts = new Set();
    for (const entry of entries) for (const mt of entry.mts) mts.add(mt);
    const material = {
      def, library, entries,
      mts: [...mts].sort((a, b) => a - b),
      wasm: null,
      /// fileVersion of each nuclide when `wasm` was built.
      builtFrom: new Map(),
    };
    materials.set(k, material);
    // The total is wanted by every calculation, so start on it now rather than
    // when the first reaction is chosen. Failures surface on that first call.
    for (const entry of entries) ensureReactions(entry, [TOTAL_MT]).catch(() => {});
    return material.mts;
  }

  /// Drop the wasm object of any material built against an older copy of one
  /// of its nuclides' files, so the next calculation reads the new one.
  function invalidateStale() {
    for (const material of materials.values()) {
      if (!material.wasm) continue;
      const stale = material.entries.some((e) => material.builtFrom.get(e.name) !== e.fileVersion);
      if (stale) {
        material.wasm.free();
        material.wasm = null;
      }
    }
  }

  function buildMaterial(material) {
    const { def } = material;
    // The wasm maps a nuclide name to one directory, so point it at this
    // material's library right before the build. Another library's material
    // built earlier already holds its own copy of the data and is not
    // affected; one built later re-points the map for itself. The directories
    // exist already (the nuclides were loaded to get here), which is what
    // keeps this call from panicking.
    WasmConfig.set_cross_sections(Object.fromEntries(material.entries.map((e) => [e.name, e.dir])));
    const wasm = new WasmMaterial();
    try {
      // `fraction_type` is per component in the wasm but per material here:
      // the builder asks once, and a prebuilt material omits it and takes the
      // wasm's default of atom fractions, which is what materials.json holds.
      const fractionType = def.fraction_type ?? null;
      for (const e of def.elements ?? []) wasm.add_element(e.name, e.fraction, fractionType);
      for (const n of def.nuclides ?? []) wasm.add_nuclide(n.name, n.fraction, fractionType);
      // `set_density` is what builds the underlying material, and the
      // temperature setter only applies to a built one, so this order matters.
      wasm.set_density(def.density.unit, def.density.value);
      wasm.set_temperature(TEMPERATURE_LABEL);
    } catch (err) {
      wasm.free();
      throw err;
    }
    material.wasm = wasm;
    material.builtFrom = new Map(material.entries.map((e) => [e.name, e.fileVersion]));
  }

  /// Macroscopic cross sections of `materialId` from `library` for each MT in
  /// `mts` at TEMPERATURE, on the material's unified energy grid.
  async function calculateXs(materialId, mts, library = DEFAULT_LIBRARY) {
    checkLibrary(library);
    const material = materials.get(key(library, materialId));
    if (!material) throw new Error(`material ${materialId} from ${library} not created`);
    mts = [...new Set(mts.map(Number))];
    const wanted = new Set([TOTAL_MT, ...mts]);
    await Promise.all(material.entries.map((entry) => ensureReactions(entry, wanted)));

    invalidateStale();
    if (!material.wasm) buildMaterial(material);

    const crossSections = {};
    let energyGrid = null;
    for (const mt of mts) {
      // Guarded, not tried: an MT no nuclide of this material carries would
      // panic inside the wasm and take the whole engine with it.
      if (!material.entries.some((e) => e.mts.has(mt))) {
        throw new Error(`MT ${mt} is not available for material ${materialId} in ${library}`);
      }
      const [xs, energy] = material.wasm.macroscopicCrossSection(mt, TEMPERATURE_LABEL);
      crossSections[mt] = xs;
      if (!energyGrid) energyGrid = energy;
    }
    return { energyGrid: energyGrid ?? new Float64Array(0), crossSections };
  }

  /// Forget a material, in every library it was built for.
  ///
  /// A custom material keeps its id when its composition is edited, and the
  /// built wasm material behind that id would otherwise still be the old one.
  function forgetMaterial(materialId) {
    for (const [key, material] of materials) {
      if (key.slice(key.indexOf('/') + 1) !== materialId) continue;
      if (material.wasm) material.wasm.free();
      materials.delete(key);
    }
  }

  /// The elements the nuclear data knows, each with the nuclides natural
  /// abundance expands it to. The page uses the names to check a hand-typed
  /// composition before it fetches anything.
  function elements() {
    return Object.fromEntries([...elementMap].map(([element, nuclides]) => [element, [...nuclides]]));
  }

  return {
    createMaterial, calculateXs, requiredNuclides, elements, forgetMaterial,
    get rangesStripped() { return rangesStripped; },
  };
}
