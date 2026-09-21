// The byte-range arithmetic, which decides what the page asks the data host
// for and how the answers are put back together.
//
// Worth testing on its own because its failures are quiet. A plan that names
// the wrong batch, or a splice that hands the decoder a batch nobody asked
// for, produces a stream that still decodes: the framing walks, the numbers
// come out, and they are the wrong cross section. Nothing downstream can tell.
// The one loud failure, a short span, is the one the module already refuses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EOS, COALESCE_GAP, reactionRanges, energyRanges, publishedMts,
  coalesce, planFetch, spliceStream, rangeHeader,
} from '../ranges.js';

/// A version.json in the shape the converter writes: one batch per
/// (MT, temperature) for reactions, one per temperature for the grids.
const version = {
  reaction_ranges: {
    schema: [64, 704],
    mts: {
      1: { '294K': [768, 100], '600K': [868, 100] },
      2: { '294K': [968, 100], '600K': [1068, 100] },
      102: { '294K': [1168, 100] },
    },
  },
  energy_ranges: {
    schema: [64, 384],
    temperatures: { '0K': [448, 50], '294K': [498, 50], '600K': [548, 50] },
  },
};

test('the reaction index reads as MT then temperature', () => {
  const r = reactionRanges(version);
  assert.deepEqual(r.schema, { off: 64, len: 704 });
  assert.deepEqual(r.mts.get(1).get('294K'), { off: 768, len: 100 });
  assert.deepEqual(r.mts.get(102).get('294K'), { off: 1168, len: 100 });
  assert.equal(r.mts.get(102).has('600K'), false, 'MT 102 is only published at 294 K here');
});

test('the energy index reads as temperature to range', () => {
  const e = energyRanges(version);
  assert.deepEqual(e.schema, { off: 64, len: 384 });
  assert.deepEqual(e.temperatures.get('294K'), { off: 498, len: 50 });
  // The 0 K grid is kept even though no cross section is tabulated there: the
  // NJOY route publishes one, and dropping it would make a ranged read offer
  // less than a whole-file read.
  assert.ok(e.temperatures.has('0K'));
});

// An index this reader cannot plan from must read as no index at all, so the
// caller falls back to whole files. Reading it as a half-index would leave a
// channel silently absent, and a nuclide missing a channel reacts at zero
// without saying so.
test('an index in the shape from before the temperature split reads as none', () => {
  assert.equal(reactionRanges({ reaction_ranges: { schema: [64, 704], mts: { 1: [768, 100] } } }), null);
});

test('a missing or malformed index reads as none', () => {
  assert.equal(reactionRanges(undefined), null);
  assert.equal(reactionRanges({}), null);
  assert.equal(reactionRanges({ reaction_ranges: { mts: {} } }), null);
  assert.equal(reactionRanges({ reaction_ranges: { schema: [64], mts: { 1: { '294K': [1, 2] } } } }), null,
    'a schema that is not a pair is not a schema');
  assert.equal(energyRanges({ energy_ranges: { schema: [64, 384], temperatures: {} } }), null);
});

test('publishedMts lists only the MTs carried at that temperature, in order', () => {
  const r = reactionRanges(version);
  assert.deepEqual(publishedMts(r, '294K'), [1, 2, 102]);
  assert.deepEqual(publishedMts(r, '600K'), [1, 2], 'MT 102 is not published at 600 K');
  assert.deepEqual(publishedMts(r, '2500K'), []);
});

test('touching spans merge and distant ones do not', () => {
  const spans = coalesce([{ off: 0, len: 10 }, { off: 10, len: 10 }]);
  assert.deepEqual(spans, [{ off: 0, len: 20 }], 'adjacent batches are one request');

  const apart = coalesce([{ off: 0, len: 10 }, { off: 10 + COALESCE_GAP + 1, len: 10 }]);
  assert.equal(apart.length, 2, 'a gap wider than the threshold stays two requests');
});

test('coalescing sorts by offset and swallows a contained span', () => {
  // Gap 0, so this is about ordering alone: under the default threshold these
  // two are 90 bytes apart and would rightly merge into one request.
  const spans = coalesce([{ off: 100, len: 10 }, { off: 0, len: 10 }], 0);
  assert.deepEqual(spans.map((s) => s.off), [0, 100], 'output is offset-ordered whatever the input');
  // A span already inside another must not shorten it.
  assert.deepEqual(coalesce([{ off: 0, len: 100 }, { off: 10, len: 5 }]), [{ off: 0, len: 100 }]);
});

test('a plan leads with the schema and drops duplicate batches', () => {
  const r = reactionRanges(version);
  const batches = [r.mts.get(1).get('294K'), r.mts.get(2).get('294K'), r.mts.get(1).get('294K')];
  const plan = planFetch(r.schema, batches, 0);
  assert.deepEqual(plan.parts[0], { off: 64, len: 704 }, 'a stream whose schema is not first does not decode');
  assert.equal(plan.parts.length, 3, 'the repeated batch is asked for once');
  assert.deepEqual(plan.parts.map((p) => p.off), [64, 768, 968], 'parts are in file order');
});

test('a plan with a generous gap asks for fewer, larger spans', () => {
  const r = reactionRanges(version);
  const batches = [r.mts.get(1).get('294K'), r.mts.get(2).get('294K')];
  const tight = planFetch(r.schema, batches, 0);
  const loose = planFetch(r.schema, batches, COALESCE_GAP);
  assert.ok(loose.spans.length < tight.spans.length,
    `coalescing should reduce ${tight.spans.length} spans, got ${loose.spans.length}`);
  // Whatever the spans, the parts to cut back out are the same.
  assert.deepEqual(loose.parts, tight.parts);
});

/// Bytes whose value encodes their own offset, so a splice that takes the
/// wrong window is visible rather than merely wrong-sized.
const marked = (off, len) => Uint8Array.from({ length: len }, (_, i) => (off + i) % 251);

test('splicing returns the schema, the batches in order, then the end marker', () => {
  const parts = [{ off: 0, len: 4 }, { off: 10, len: 4 }];
  const spans = [{ off: 0, len: 4 }, { off: 10, len: 4 }];
  const out = spliceStream(parts, spans, [marked(0, 4), marked(10, 4)]);
  assert.deepEqual(out.subarray(0, 4), marked(0, 4));
  assert.deepEqual(out.subarray(4, 8), marked(10, 4));
  assert.deepEqual(out.subarray(8), EOS, 'without the marker a decoder reads the stream as truncated');
  assert.equal(out.length, 4 + 4 + EOS.length);
});

// The reason coalescing is safe: a span may cover bytes nobody asked for, and
// those bytes must not reach the decoder as a record batch.
test('a batch is cut back out of the larger span that covered it', () => {
  const parts = [{ off: 0, len: 4 }, { off: 20, len: 4 }];
  const spans = [{ off: 0, len: 24 }];
  const out = spliceStream(parts, spans, [marked(0, 24)]);
  assert.deepEqual(out.subarray(0, 4), marked(0, 4));
  assert.deepEqual(out.subarray(4, 8), marked(20, 4), 'the unwanted middle is dropped');
  assert.equal(out.length, 8 + EOS.length);
});

test('a short span is refused rather than spliced', () => {
  const parts = [{ off: 0, len: 4 }];
  const spans = [{ off: 0, len: 4 }];
  assert.throws(() => spliceStream(parts, spans, [marked(0, 3)]), /came back 3 bytes/);
});

test('a part no span covers, and a span that was not fetched, are refused', () => {
  assert.throws(() => spliceStream([{ off: 99, len: 4 }], [{ off: 0, len: 4 }], [marked(0, 4)]),
    /no fetched span covers/);
  assert.throws(() => spliceStream([{ off: 0, len: 4 }], [{ off: 0, len: 4 }], [undefined]),
    /was not fetched/);
});

test('the Range header ends inclusive', () => {
  assert.equal(rangeHeader({ off: 0, len: 100 }), 'bytes=0-99');
  assert.equal(rangeHeader({ off: 768, len: 1 }), 'bytes=768-768');
});

// End to end on the arithmetic alone: plan one temperature of one MT, serve
// the spans from a synthetic file, and get back exactly the schema and that
// batch. This is the whole job of the module in one assertion.
test('one MT at one temperature plans, fetches and splices back to itself', () => {
  const file = marked(0, 1300);
  const r = reactionRanges(version);
  const plan = planFetch(r.schema, [r.mts.get(102).get('294K')]);
  const bodies = plan.spans.map((s) => file.subarray(s.off, s.off + s.len));
  const out = spliceStream(plan.parts, plan.spans, bodies);
  assert.deepEqual(out.subarray(0, 704), file.subarray(64, 768), 'the schema message');
  assert.deepEqual(out.subarray(704, 804), file.subarray(1168, 1268), "MT 102's 294 K batch");
  assert.deepEqual(out.subarray(804), EOS);
});
