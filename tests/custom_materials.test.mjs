import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  componentKind, componentElement, normaliseDefinition, definitionToForm,
  customId, isCustomId, byId, mergeDefinition, loadStored, saveStored, STORAGE_KEY,
} from '../custom_materials.js';

const known = new Set(['H', 'O', 'Li', 'Be', 'Fe', 'Am']);
const form = (over = {}) => ({
  name: 'Enriched lithium',
  fractionType: 'atom',
  density: 0.534,
  unit: 'g/cm3',
  components: [{ name: 'Li6', fraction: 0.6 }, { name: 'Li7', fraction: 0.4 }],
  ...over,
});

test('a component is an element, a nuclide, or neither', () => {
  assert.equal(componentKind('Fe'), 'element');
  assert.equal(componentKind('H'), 'element');
  assert.equal(componentKind('Li6'), 'nuclide');
  assert.equal(componentKind('Am242_m1'), 'nuclide');
  assert.equal(componentKind('fe'), null);
  assert.equal(componentKind('Fe 56'), null);
  assert.equal(componentKind(''), null);
  assert.equal(componentElement('Am242_m1'), 'Am');
  assert.equal(componentElement('Fe'), 'Fe');
});

test('a good form becomes a definition of the same shape as a built-in material', () => {
  const { def, errors } = normaliseDefinition(form({
    components: [{ name: 'Li6', fraction: 0.6 }, { name: 'Li7', fraction: 0.4 }, { name: 'Be', fraction: 0.1 }],
  }), { knownElements: known });
  assert.deepEqual(errors, []);
  assert.deepEqual(def, {
    name: 'Enriched lithium',
    fraction_type: 'atom',
    density: { value: 0.534, unit: 'g/cm3' },
    elements: [{ name: 'Be', fraction: 0.1 }],
    nuclides: [{ name: 'Li6', fraction: 0.6 }, { name: 'Li7', fraction: 0.4 }],
  });
  // Fractions are left as entered: the material API divides by their sum.
  assert.equal(def.nuclides[0].fraction + def.nuclides[1].fraction + def.elements[0].fraction, 1.1);
});

test('a form is checked in full, so one pass fixes everything', () => {
  const { def, errors } = normaliseDefinition({
    name: '  ', fractionType: 'weight', density: -1, unit: 'atom/barn-cm',
    components: [{ name: 'Zz', fraction: 1 }, { name: 'Fe', fraction: 0 }, { name: 'Fe', fraction: 1 }, { name: 'fe56', fraction: 1 }],
  }, { knownElements: known });
  assert.equal(def, null);
  const joined = errors.join(' ');
  for (const wanted of ['needs a name', 'greater than zero', 'atom/barn-cm', 'Zz is not an element', 'appears more than once', 'fe56 is not an element symbol']) {
    assert.ok(joined.includes(wanted), `${wanted} is reported: ${joined}`);
  }
});

test('empty rows are ignored but an empty composition is refused', () => {
  const blank = [{ name: '', fraction: '' }, { name: '', fraction: '' }];
  assert.equal(normaliseDefinition(form({ components: blank }), { knownElements: known }).def, null);
  const { def } = normaliseDefinition(form({ components: [...blank, { name: 'H', fraction: 2 }] }), { knownElements: known });
  assert.deepEqual(def.elements, [{ name: 'H', fraction: 2 }]);
});

test('weight fractions and the other density units are accepted', () => {
  const { def } = normaliseDefinition(form({ fractionType: 'weight', unit: 'kg/m3', density: 534 }), { knownElements: known });
  assert.equal(def.fraction_type, 'weight');
  assert.deepEqual(def.density, { value: 534, unit: 'kg/m3' });
});

test('a definition round-trips through the form', () => {
  const { def } = normaliseDefinition(form(), { knownElements: known });
  const again = normaliseDefinition(definitionToForm(def), { knownElements: known });
  assert.deepEqual(again.def, def);
});

test('ids are positional, short, and never clash with a built-in material', () => {
  assert.equal(customId(0), 'c1');
  assert.ok(isCustomId('c1') && isCustomId('c12'));
  assert.ok(!isCustomId('pure_li6') && !isCustomId('c') && !isCustomId('concrete'));
  const defs = [{ name: 'a' }, { name: 'b' }];
  assert.deepEqual(Object.keys(byId(defs)), ['c1', 'c2']);
});

test('merging reuses an identical material rather than duplicating it', () => {
  const a = { name: 'a', density: { value: 1, unit: 'g/cm3' } };
  const b = { name: 'b', density: { value: 2, unit: 'g/cm3' } };
  const first = mergeDefinition([a], b);
  assert.equal(first.id, 'c2');
  assert.equal(first.defs.length, 2);
  const again = mergeDefinition(first.defs, { ...a });
  assert.equal(again.id, 'c1', 'the same composition is the same material');
  assert.equal(again.defs.length, 2);
});

test('storage survives being empty, absent or corrupt', () => {
  const store = new Map();
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  };
  assert.deepEqual(loadStored(storage), []);
  const defs = [{ name: 'a', density: { value: 1, unit: 'g/cm3' } }];
  assert.ok(saveStored(storage, defs));
  assert.deepEqual(loadStored(storage), defs);
  store.set(STORAGE_KEY, '{not json');
  assert.deepEqual(loadStored(storage), []);
  store.set(STORAGE_KEY, '[{"no":"name"}]');
  assert.deepEqual(loadStored(storage), []);
  assert.deepEqual(loadStored(null), []);
  assert.equal(saveStored(null, defs), false);
});
