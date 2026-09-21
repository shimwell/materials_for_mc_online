// The engine's naming and validation, which every fetch and every lookup is
// built from.
//
// These are small functions and that is the point: their mistakes do not throw.
// A wrong URL is a 404 the page reports as missing data; a wrong store path is
// a nuclide the wasm loader cannot find; a key that does not survive being
// parsed back forgets the wrong material and leaves a stale one plotted. None
// of that surfaces as a stack trace, so it is pinned here.
//
// The rest of engine.js needs an initialised wasm module and is exercised by
// tests/e2e.mjs in a browser instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORIGIN, dataUrl, storeDir, materialKey, materialIdFromKey, nuclideKey,
  checkTemperature, checkLibrary,
} from '../engine.js';
import { LIBRARIES, DEFAULT_LIBRARY } from '../libraries.js';
import { DEFAULT_TEMPERATURE } from '../temperatures.js';

test('a data URL follows the published layout', () => {
  assert.equal(
    dataUrl(ORIGIN, 'endf-b8.1', 'Fe56', 'reactions.arrow'),
    'https://yamc-data.xsplot.com/endf-b8.1/neutron/Fe56.arrow/reactions.arrow',
  );
  // The layout is the data host's, not this page's: nuclide directories carry
  // the .arrow suffix and sit under a per-particle directory.
  assert.match(dataUrl(ORIGIN, 'jeff-4.0', 'Li6', 'version.json'), /\/jeff-4\.0\/neutron\/Li6\.arrow\/version\.json$/);
});

test('the origin is substituted, so a test host can stand in for the real one', () => {
  assert.equal(
    dataUrl('http://127.0.0.1:8770', 'endf-b8.1', 'Li6', 'energy.arrow'),
    'http://127.0.0.1:8770/endf-b8.1/neutron/Li6.arrow/energy.arrow',
  );
});

test('the store path names the same nuclide directory the URL does', () => {
  assert.equal(storeDir('endf-b8.1', 'Fe56'), '/endf-b8.1/Fe56.arrow');
  // The wasm loader resolves a nuclide by this path, and the bytes it resolves
  // to were fetched from that URL, so the two have to agree on the directory
  // name. They are not otherwise the same shape: the URL carries a particle
  // segment the store path does not.
  const urlDir = dataUrl(ORIGIN, 'endf-b8.1', 'Pb208', 'reactions.arrow').split('/').at(-2);
  const storeDirName = storeDir('endf-b8.1', 'Pb208').split('/').at(-1);
  assert.equal(storeDirName, urlDir, 'store path and URL disagree about the nuclide directory');
  assert.equal(urlDir, 'Pb208.arrow');
});

test('a material key carries library, id and temperature', () => {
  assert.equal(materialKey('endf-b8.1', 'pure_li6', '294K'), 'endf-b8.1/pure_li6/294K');
  // All three, because the same composition at another temperature is another
  // material: keying on the id alone would reuse the one built at 294 K.
  assert.notEqual(
    materialKey('endf-b8.1', 'pure_li6', '294K'),
    materialKey('endf-b8.1', 'pure_li6', '600K'),
  );
  assert.notEqual(
    materialKey('endf-b8.1', 'pure_li6', '294K'),
    materialKey('jeff-4.0', 'pure_li6', '294K'),
  );
});

// The coupling worth pinning: forgetMaterial drops every library and
// temperature an id was built at by reading the id back out of the key. If the
// two ever disagree it forgets the wrong materials and leaves a stale one
// plotted, silently.
test('a material id survives the round trip through its key', () => {
  for (const id of ['pure_li6', 'a150_tissue', 'custom-1730000000000', 'x']) {
    assert.equal(materialIdFromKey(materialKey('endf-b8.1', id, '294K')), id);
    assert.equal(materialIdFromKey(materialKey('jeff-4.0', id, '2500K')), id);
  }
});

test('a nuclide key is per library, not per temperature', () => {
  assert.equal(nuclideKey('endf-b8.1', 'Fe56'), 'endf-b8.1/Fe56');
  assert.notEqual(nuclideKey('endf-b8.1', 'Fe56'), nuclideKey('jeff-4.0', 'Fe56'));
  // One download carries every temperature the file publishes, so temperature
  // deliberately does not appear: including it would refetch the same object.
  assert.equal(nuclideKey('endf-b8.1', 'Fe56').includes('K'), false);
});

test('a published temperature passes and an unpublished one is refused by name', () => {
  assert.equal(checkTemperature(DEFAULT_TEMPERATURE), DEFAULT_TEMPERATURE);
  assert.throws(() => checkTemperature('123K'), /123K is not one of the temperatures/);
  assert.throws(() => checkTemperature(''), /not one of the temperatures/);
});

test('a known library passes and an unknown one is refused, naming the alternatives', () => {
  assert.equal(checkLibrary(DEFAULT_LIBRARY), DEFAULT_LIBRARY);
  for (const { id } of LIBRARIES) assert.equal(checkLibrary(id), id);
  assert.throws(() => checkLibrary('endf-b8.0'), (e) => {
    assert.match(e.message, /unknown library endf-b8\.0/);
    // The message lists what there is, because the caller is a person choosing
    // from a dropdown, not a program.
    assert.ok(e.message.includes(DEFAULT_LIBRARY), `should name the libraries: ${e.message}`);
    return true;
  });
});
