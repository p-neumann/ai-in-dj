// Phase 5, step 5 piece 3 - Mike's real vibe-slider labels, locked in as
// a regression test against the reference spec's own VIBE_LABELS, so a
// future edit can't accidentally reword or drop one of his real strings.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { getVibeLabel } = require("../src/renderer/src/trackCheat/vibeLabels.ts");

test("vibe -8 matches the reference spec exactly", () => {
  assert.deepEqual(getVibeLabel(-8), ["Vibe Lock", "Exact subgenre and style — strictest possible"]);
});

test("vibe 0 has no label, matching the original app's own null lookup - not an invented placeholder", () => {
  assert.equal(getVibeLabel(0), null);
});

test("vibe +5 matches the reference spec exactly", () => {
  assert.deepEqual(getVibeLabel(5), ["No Limits", "No genre restriction — anything goes"]);
});

test("vibe +8 matches the reference spec exactly, including the 'reserved for future tuning' note", () => {
  assert.deepEqual(getVibeLabel(8), [
    "Total Chaos",
    "No genre restriction — anything goes (same as +5 for now — reserved for future tuning)"
  ]);
});
