import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeState, decodeState } from '../url_state.js';

const material = {
  name: 'Enriched lithium',
  fraction_type: 'atom',
  density: { value: 0.534, unit: 'g/cm3' },
  nuclides: [{ name: 'Li6', fraction: 0.6 }, { name: 'Li7', fraction: 0.4 }],
};

test('an empty plot is an empty hash', () => {
  assert.equal(encodeState({ rows: [], materials: [] }), '');
  assert.equal(encodeState({ rows: [{ library: 'endf-b8.1', materialId: 'pure_li6', mt: '' }] }), '');
  const back = decodeState('');
  assert.deepEqual(back.rows, []);
  assert.deepEqual(back.materials, []);
});

test('rows round-trip', () => {
  const rows = [
    { library: 'endf-b8.1', materialId: 'pure_li6', mt: 1 },
    { library: 'jeff-4.0', materialId: 'concrete_ordinary', mt: 205 },
  ];
  const hash = encodeState({ rows, materials: [] });
  assert.equal(hash, '#r=endf-b8.1:pure_li6:1;jeff-4.0:concrete_ordinary:205');
  assert.deepEqual(decodeState(hash).rows, rows);
});

test('a custom material travels with the plot that uses it', () => {
  const hash = encodeState({ rows: [{ library: 'endf-b8.1', materialId: 'c1', mt: 1 }], materials: [material] });
  assert.ok(hash.startsWith('#r=endf-b8.1:c1:1&m='));
  const back = decodeState(hash);
  assert.deepEqual(back.rows, [{ library: 'endf-b8.1', materialId: 'c1', mt: 1 }]);
  assert.deepEqual(back.materials, [material]);
});

test('a material no row draws is left out of the link', () => {
  const hash = encodeState({ rows: [{ library: 'endf-b8.1', materialId: 'pure_li6', mt: 1 }], materials: [material] });
  assert.equal(hash, '#r=endf-b8.1:pure_li6:1', 'a link carries the plot, not the whole saved list');
});

test('a damaged link keeps whatever is still readable', () => {
  const rows = decodeState('#r=endf-b8.1:pure_li6:1;rubbish;jeff-4.0:x:2&m=not-base64!!').rows;
  assert.deepEqual(rows, [
    { library: 'endf-b8.1', materialId: 'pure_li6', mt: 1 },
    { library: 'jeff-4.0', materialId: 'x', mt: 2 },
  ]);
  assert.deepEqual(decodeState('#m=' + btoa('[1,2,3]')).materials, [], 'entries that are not materials are dropped');
});
