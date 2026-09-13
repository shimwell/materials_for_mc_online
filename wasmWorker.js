// Web Worker hosting the WebAssembly material engine.
//
// The page never touches wasm directly. It posts a request with a requestId and
// waits for a reply carrying the same id, so every call site on the main thread
// stays a plain promise and the heavy work (parsing tens of megabytes of
// nuclide JSON, then collapsing it to a macroscopic cross section) never blocks
// rendering.
//
// Protocol, all messages tagged with the caller's requestId:
//   in  {type: 'create_material', materialId, materialDef}
//   out {type: 'created', requestId, mts: [int]}
//   in  {type: 'calc_xs', materialId, mts: [int]}
//   out {type: 'xs', requestId, energy_grid: [f64], cross_sections: {mt: [f64]}}
//   out {type: 'error', requestId, error: string}   on any failure
// A single {type: 'ready'} with no requestId is posted once init finishes.

import init, {
  WasmMaterial,
  element_nuclides,
} from './pkg/materials_for_mc.js';

/// Materials the page has asked for, keyed by its own material id.
///
/// Held here rather than rebuilt per request because loading a material's
/// nuclide data is the expensive part, and the page plots several reactions
/// from the same material one after another.
const materials = new Map();

/// Raw nuclide JSON already fetched, keyed by nuclide name.
///
/// Two materials sharing a nuclide (almost every steel shares Fe56) should cost
/// one download, and the in-flight promise is cached rather than the result so
/// concurrent requests for the same nuclide coalesce instead of racing.
const nuclideFetches = new Map();

/// Which nuclides an element expands to, from the wasm's own abundance table.
///
/// Taken from wasm rather than duplicated here so the fetch list can never
/// disagree with what `add_element` actually builds.
let elementMap = null;

function fetchNuclide(name) {
  if (!nuclideFetches.has(name)) {
    nuclideFetches.set(
      name,
      fetch(`./xs_data/${name}.json`).then((r) => {
        if (!r.ok) throw new Error(`${name}: ${r.status} ${r.statusText}`);
        return r.text();
      }),
    );
  }
  return nuclideFetches.get(name);
}

/// Every nuclide a material definition needs data for.
///
/// Elements are expanded through the abundance table; explicit nuclides are
/// taken as given. A Set because a definition may name an element and one of
/// its isotopes separately, and fetching that isotope twice would be waste.
function requiredNuclides(def) {
  const wanted = new Set();
  for (const e of def.elements ?? []) {
    for (const n of elementMap.get(e.name) ?? []) wanted.add(n);
  }
  for (const n of def.nuclides ?? []) wanted.add(n.name);
  return [...wanted];
}

async function createMaterial(materialId, def) {
  if (materials.has(materialId)) return materials.get(materialId).reaction_mts();

  const material = new WasmMaterial();
  for (const e of def.elements ?? []) material.add_element(e.name, e.fraction);
  for (const n of def.nuclides ?? []) material.add_nuclide(n.name, n.fraction);
  if (def.density) material.set_density(def.density.unit, def.density.value);

  // Fetched in parallel, loaded in sequence: the network is the slow part and
  // benefits from concurrency, while `load_nuclide_data` mutates the material
  // and has no reason to interleave.
  const names = requiredNuclides(def);
  const bodies = await Promise.all(names.map(fetchNuclide));
  names.forEach((name, i) => material.load_nuclide_data(name, bodies[i]));

  materials.set(materialId, material);
  return material.reaction_mts();
}

/// Macroscopic cross section for `mts`, as the page's plotting code wants it.
///
/// `by_nuclide` is false: the page plots one line per material per reaction, so
/// the per-nuclide breakdown would be parsed and discarded.
function calcXs(materialId, mts) {
  const material = materials.get(materialId);
  if (!material) throw new Error(`material ${materialId} not created`);
  const result = material.calculate_macroscopic_xs_neutron(mts, false);
  return {
    energy_grid: result.energy_grid ?? [],
    cross_sections: result.cross_sections ?? {},
  };
}

const ready = init().then(() => {
  elementMap = element_nuclides();
  self.postMessage({ type: 'ready' });
});

self.onmessage = async (event) => {
  const { type, requestId } = event.data ?? {};
  try {
    // Requests posted before init resolves are held here rather than rejected;
    // the page starts fetching materials.json immediately and can reach
    // `create_material` before the wasm module has finished instantiating.
    await ready;
    switch (type) {
      case 'create_material': {
        const { materialId, materialDef } = event.data;
        const mts = await createMaterial(materialId, materialDef);
        self.postMessage({ type: 'created', requestId, mts: [...mts] });
        break;
      }
      case 'calc_xs': {
        const { materialId, mts } = event.data;
        const { energy_grid, cross_sections } = calcXs(materialId, mts);
        self.postMessage({ type: 'xs', requestId, energy_grid, cross_sections });
        break;
      }
      default:
        throw new Error(`unknown request type ${type}`);
    }
  } catch (err) {
    self.postMessage({ type: 'error', requestId, error: String(err?.message ?? err) });
  }
};
