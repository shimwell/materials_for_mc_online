import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMPERATURES, DEFAULT_TEMPERATURE, isPublished, bareLabel, kelvinOf, displayLabel,
} from '../temperatures.js';

test('the ladder is the six published temperatures, coldest first', () => {
  assert.deepEqual([...TEMPERATURES], ['250K', '294K', '600K', '900K', '1200K', '2500K']);
  const kelvin = TEMPERATURES.map(kelvinOf);
  assert.deepEqual(kelvin, [...kelvin].sort((a, b) => a - b));
});

test('0 K is not offered, because a material needs a total and only elastic has one', () => {
  assert.ok(!TEMPERATURES.includes('0K'));
  assert.ok(!isPublished('0K'));
});

test('a row starts at room temperature', () => {
  assert.equal(DEFAULT_TEMPERATURE, '294K');
  assert.ok(isPublished(DEFAULT_TEMPERATURE));
});

test('a label is spelled one way for the material API and another for a reader', () => {
  assert.equal(bareLabel('294K'), '294');
  assert.equal(bareLabel('2500K'), '2500');
  assert.equal(kelvinOf('1200K'), 1200);
  assert.equal(displayLabel('294K'), '294 K');
  assert.ok(!isPublished('300K') && !isPublished('') && !isPublished('294'));
});
