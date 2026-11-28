import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportRecord, plotDataJson, isEnergyRelease } from '../download.js';
import { citationsFor, termsFor } from '../citations.js';

const row = {
  material: 'Pure Li-6',
  library: 'jendl-5.0',
  temperature: '294K',
  mt: '1',
  energy: new Float64Array([1e-5, 2e7]),
  values: new Float64Array([1.5, 0.2]),
};

test('a row carries its provenance, units and values', () => {
  const r = exportRecord(row);
  assert.equal(r.material, 'Pure Li-6');
  assert.equal(r.library, 'jendl-5.0');
  assert.equal(r.temperature_K, 294);
  assert.equal(r.reaction, 'MT 1');
  assert.equal(r.reactionId, '1');
  assert.equal(r.units, '1/cm');
  assert.deepEqual(r.energy_eV, [1e-5, 2e7]);
  assert.deepEqual(r.xs_per_cm, [1.5, 0.2]);
});

test('a row carries what to cite for its library and the terms', () => {
  const r = exportRecord(row);
  assert.deepEqual(r.citations, citationsFor('jendl-5.0'));
  assert.equal(r.citations[0].doi, '10.1080/00223131.2022.2141903');
  assert.equal(r.terms, termsFor('jendl-5.0'));
  assert.match(r.terms, /CC BY 4\.0/);
});

test('each row cites its own library', () => {
  const out = JSON.parse(plotDataJson([row, { ...row, library: 'endf-b8.1' }]));
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((r) => r.citations.map((c) => c.doi)), [
    ['10.1080/00223131.2022.2141903'],
    ['10.1016/j.nds.2026.04.001', '10.11578/endf/2571019'],
  ]);
});

test('an energy release is in eV per cm under its own key', () => {
  assert.ok(isEnergyRelease('301'));
  assert.ok(isEnergyRelease(444));
  assert.ok(isEnergyRelease('901'));
  assert.ok(!isEnergyRelease('102'));
  assert.ok(!isEnergyRelease('total'));
  const r = exportRecord({ ...row, mt: '301' });
  assert.equal(r.units, 'eV/cm');
  assert.deepEqual(r.eV_per_cm, [1.5, 0.2]);
  assert.ok(!('xs_per_cm' in r));
});

test('the total is named as such', () => {
  assert.equal(exportRecord({ ...row, mt: 'total' }).reaction, 'Total');
});
