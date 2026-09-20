// The temperatures a material can be plotted at.
//
// Every library publishes each cross section at the same six temperatures,
// Doppler broadened from the same evaluation. A row picks one of them, so a
// material can be drawn at 294 K beside itself at 900 K.
//
// The libraries also publish a 0 K grid, and it is deliberately not offered
// here: only elastic scattering has a 0 K table, and a macroscopic cross
// section always needs the total as well, so a material at 0 K is not a thing
// the data can answer.
//
// Nothing here touches the DOM or the network.

/// The published ladder, coldest first, as the files label it.
export const TEMPERATURES = Object.freeze(['250K', '294K', '600K', '900K', '1200K', '2500K']);

/// Where a row starts: room temperature.
export const DEFAULT_TEMPERATURE = '294K';

/// True for a temperature the data actually carries.
export const isPublished = (label) => TEMPERATURES.includes(label);

/// How the material API spells a temperature: the bare number, no `K`.
export const bareLabel = (label) => String(label).replace(/K$/, '');

/// The kelvin value of a label, for ordering and for the download.
export const kelvinOf = (label) => Number(bareLabel(label));

/// How a temperature reads in a dropdown or a legend: `294 K`.
export const displayLabel = (label) => `${bareLabel(label)} K`;
