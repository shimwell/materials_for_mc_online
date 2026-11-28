// What "Download Plot Data" writes: one JSON object per plotted row.
//
// Each object carries its own provenance, so a file read a year later still
// says what it is: the material, the library and temperature its cross
// sections came from, the reaction, the units, and what to cite for that
// library under `citations` (each a `reference` and its `doi`) with the
// `terms` its data is redistributed under. Those two fields have the names
// yamc and yani give them in a run's `data_releases`.
//
// No DOM here, so it is tested under Node.

import { citationsFor, termsFor } from './citations.js';
import { kelvinOf } from './temperatures.js';

/// True for an MT whose macroscopic value is energy per unit path length
/// (eV per cm) rather than a cross section (per cm): 301 to 450 are the
/// energy-release (KERMA) parameters, 444 is damage energy production and
/// 901 is local heating.
export function isEnergyRelease(mt) {
  mt = Number(mt);
  return (mt >= 301 && mt <= 450) || mt === 901;
}

/// One plotted row as the object the download holds. `row` is
/// {material, library, temperature, mt, energy, values}, with `temperature`
/// a label such as '294K' and `energy`, `values` arrays or typed arrays.
export function exportRecord(row) {
  const energyRelease = isEnergyRelease(row.mt);
  return {
    material: row.material,
    library: row.library,
    temperature_K: kelvinOf(row.temperature),
    reaction: row.mt === 'total' ? 'Total' : `MT ${row.mt}`,
    reactionId: row.mt,
    units: energyRelease ? 'eV/cm' : '1/cm',
    citations: citationsFor(row.library),
    terms: termsFor(row.library),
    energy_eV: Array.from(row.energy),
    [energyRelease ? 'eV_per_cm' : 'xs_per_cm']: Array.from(row.values),
  };
}

/// The whole download as JSON text.
export function plotDataJson(rows) {
  return JSON.stringify(rows.map(exportRecord), null, 2);
}
