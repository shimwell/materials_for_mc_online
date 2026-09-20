// Materials the user builds in the browser, alongside the ones the page ships
// with.
//
// A custom material is the same shape as a prebuilt one: elements and nuclides
// with fractions, and a density. That is the whole trick, because the engine
// then needs no special case, and a definition can be copied into
// materials.json or out of it. The one addition is `fraction_type`, which the
// prebuilt materials leave at the wasm's default of atom fractions and a
// hand-entered composition often wants as weight.
//
// Components are named, not classified: `Fe` is an element and expands over
// natural abundance, `Fe56` and `Am242_m1` are nuclides and are taken
// literally. Mixing the two in one material is allowed and is how an enriched
// material is written, as its isotopes with the fractions you want.
//
// Nothing here touches the DOM or the network, so the rules can be checked
// under Node.

/// Density units the material API accepts. `atom/barn-cm` reads the value as a
/// total atom density and requires atom fractions.
export const DENSITY_UNITS = Object.freeze(['g/cm3', 'kg/m3', 'atom/barn-cm']);
export const FRACTION_TYPES = Object.freeze(['atom', 'weight']);
export const DEFAULT_UNIT = 'g/cm3';
export const DEFAULT_FRACTION_TYPE = 'atom';

/// Where the browser keeps them between visits.
export const STORAGE_KEY = 'materials_for_mc_online.custom';

const ELEMENT_RE = /^[A-Z][a-z]?$/;
const NUCLIDE_RE = /^[A-Z][a-z]?\d+(?:_m\d+)?$/;

/// What a component name is: `'element'`, `'nuclide'`, or null for neither.
export function componentKind(name) {
  const n = String(name ?? '').trim();
  if (ELEMENT_RE.test(n)) return 'element';
  if (NUCLIDE_RE.test(n)) return 'nuclide';
  return null;
}

/// The element a component belongs to: `Fe` and `Fe56` are both `Fe`.
export function componentElement(name) {
  const m = /^([A-Z][a-z]?)/.exec(String(name ?? '').trim());
  return m ? m[1] : null;
}

/// Turn what the builder form holds into a material definition.
///
/// Returns `{def, errors}`. `def` is null when anything is wrong, and `errors`
/// is a list of sentences to show the user; the form is checked in full rather
/// than at the first fault, so one pass fixes everything.
///
/// `knownElements`, when given, is the set of element symbols the data has, so
/// a typo like `Zz` is caught here rather than as a failed download. Nuclide
/// names are only checked for shape: whether a library publishes one is its
/// own question, and the engine already answers it by name.
export function normaliseDefinition(form, { knownElements = null } = {}) {
  const errors = [];
  const name = String(form?.name ?? '').trim();
  if (!name) errors.push('The material needs a name.');

  const fractionType = FRACTION_TYPES.includes(form?.fractionType) ? form.fractionType : DEFAULT_FRACTION_TYPE;
  const unit = DENSITY_UNITS.includes(form?.unit) ? form.unit : DEFAULT_UNIT;
  const density = Number(form?.density);
  if (!Number.isFinite(density) || density <= 0) errors.push('The density must be a number greater than zero.');
  if (unit === 'atom/barn-cm' && fractionType !== 'atom') {
    errors.push('A density in atom/barn-cm reads the fractions as atom fractions, so weight fractions cannot be used with it.');
  }

  const elements = [];
  const nuclides = [];
  const seen = new Set();
  const rows = (form?.components ?? []).filter((c) => String(c?.name ?? '').trim() || String(c?.fraction ?? '').trim());
  if (!rows.length) errors.push('Add at least one component.');

  for (const row of rows) {
    const component = String(row.name ?? '').trim();
    const fraction = Number(row.fraction);
    const kind = componentKind(component);
    if (!component) {
      errors.push('A component is missing its name.');
      continue;
    }
    if (!kind) {
      errors.push(`${component} is not an element symbol or a nuclide name, e.g. Fe, Li6 or Am242_m1.`);
      continue;
    }
    if (kind === 'element' && knownElements && !knownElements.has(component)) {
      errors.push(`${component} is not an element the nuclear data knows.`);
      continue;
    }
    if (knownElements && !knownElements.has(componentElement(component))) {
      errors.push(`${component} does not start with an element symbol the nuclear data knows.`);
      continue;
    }
    if (seen.has(component)) {
      errors.push(`${component} appears more than once.`);
      continue;
    }
    seen.add(component);
    if (!Number.isFinite(fraction) || fraction <= 0) {
      errors.push(`The fraction for ${component} must be a number greater than zero.`);
      continue;
    }
    (kind === 'element' ? elements : nuclides).push({ name: component, fraction });
  }

  if (errors.length) return { def: null, errors };

  // Fractions are relative, so they are kept as entered rather than
  // normalised: the material API divides by their sum, and showing a user
  // 0.0714 where they typed 1 would be its own confusion.
  const def = { name, fraction_type: fractionType, density: { value: density, unit } };
  if (elements.length) def.elements = elements;
  if (nuclides.length) def.nuclides = nuclides;
  return { def, errors };
}

/// The form fields that would rebuild a definition, for editing one.
export function definitionToForm(def) {
  return {
    name: def?.name ?? '',
    fractionType: def?.fraction_type ?? DEFAULT_FRACTION_TYPE,
    density: def?.density?.value ?? '',
    unit: def?.density?.unit ?? DEFAULT_UNIT,
    components: [...(def?.elements ?? []), ...(def?.nuclides ?? [])]
      .map((c) => ({ name: c.name, fraction: c.fraction })),
  };
}

/// The id a custom material is known by: `c1`, `c2`, and so on.
///
/// Short because it goes in the URL, and assigned by position so the same list
/// always yields the same ids, whether it came from the browser's storage or
/// from a shared link. No prebuilt material is named this way.
export const customId = (index) => `c${index + 1}`;

/// `{id: def}` for a list of custom materials, in order.
export function byId(defs) {
  return Object.fromEntries(defs.map((def, i) => [customId(i), def]));
}

/// True for an id that names a custom material rather than a prebuilt one.
export const isCustomId = (id) => /^c\d+$/.test(id);

/// Two definitions that would build the same material.
export const sameDefinition = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/// Add `def` to `defs` unless an identical one is already there; returns
/// `{defs, id}` naming the one to use either way.
export function mergeDefinition(defs, def) {
  const at = defs.findIndex((other) => sameDefinition(other, def));
  if (at >= 0) return { defs, id: customId(at) };
  const next = [...defs, def];
  return { defs: next, id: customId(next.length - 1) };
}

// --- storage ---------------------------------------------------------------

/// Read the saved materials, or an empty list if there are none or the entry
/// is unreadable. A corrupt entry is not worth an error message on a page the
/// user came to plot with.
export function loadStored(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((d) => d && typeof d === 'object' && d.name) : [];
  } catch {
    return [];
  }
}

/// Save the materials, quietly doing nothing where storage is unavailable
/// (private browsing, or a quota that is already full).
export function saveStored(storage, defs) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(defs));
    return true;
  } catch {
    return false;
  }
}
