// The nuclear data libraries published at the data host, in the order the
// page offers them. `id` is the directory prefix on the host and the keyword
// yamc itself uses; `label` is what the page shows.
//
// Shared by the page (to build the dropdown) and the engine (to refuse a
// library it has never heard of before fetching anything), so the two can
// never disagree about what is on offer.

export const LIBRARIES = Object.freeze([
  { id: 'endf-b8.1', label: 'ENDF/B-VIII.1' },
  { id: 'jeff-4.0', label: 'JEFF-4.0' },
  { id: 'jendl-5.0', label: 'JENDL-5.0' },
  { id: 'tendl-2025', label: 'TENDL-2025' },
  { id: 'tendl-2017', label: 'TENDL-2017' },
  { id: 'fendl-3.2d', label: 'FENDL-3.2d' },
]);

export const DEFAULT_LIBRARY = 'endf-b8.1';

/// The display label of a library id, or the id itself if unknown.
export function libraryLabel(id) {
  return LIBRARIES.find((l) => l.id === id)?.label ?? id;
}
