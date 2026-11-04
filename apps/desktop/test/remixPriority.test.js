// Phase 5, step 5 piece 6.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { getRemixPriority } = require("../src/renderer/src/playlistCheat/remixPriority.ts");

test("getRemixPriority: earlier keywords in the list rank lower (higher priority)", () => {
  assert.ok(getRemixPriority("Song (Extended)") < getRemixPriority("Song (Redrum)"));
});

test("getRemixPriority: an unrecognized descriptor sorts last", () => {
  assert.equal(getRemixPriority("Song (Some Unknown Tag)"), 999);
  assert.ok(getRemixPriority("Song (Extended)") < 999);
});

test("getRemixPriority: case-insensitive", () => {
  assert.equal(getRemixPriority("Song (EXTENDED)"), getRemixPriority("Song (extended)"));
});
