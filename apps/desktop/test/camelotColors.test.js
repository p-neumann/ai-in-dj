// Phase 5, step 5 piece 12 (Stage 2a) - KeyPill's color lookup.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { CAMELOT_COLORS, normalizeKey } = require("../src/renderer/src/shared/camelotColors.ts");

test("normalizeKey: an already-valid Camelot key passes through unchanged", () => {
  assert.equal(normalizeKey("8A"), "8A");
});

test("normalizeKey: lowercase and whitespace are normalized", () => {
  assert.equal(normalizeKey(" 8a "), "8A");
});

test("normalizeKey: a trailing M (major) maps to the A side", () => {
  assert.equal(normalizeKey("8M"), "8A");
});

test("normalizeKey: a trailing D (dorian/minor-ish notation) maps to the B side", () => {
  assert.equal(normalizeKey("8D"), "8B");
});

test("normalizeKey: an unrecognized key is returned as-is, not blanked out", () => {
  assert.equal(normalizeKey("weird"), "WEIRD");
});

test("normalizeKey: blank/missing input is an empty string", () => {
  assert.equal(normalizeKey(""), "");
  assert.equal(normalizeKey(null), "");
  assert.equal(normalizeKey(undefined), "");
});

test("CAMELOT_COLORS: every key from 1A to 12B has a real color", () => {
  for (let n = 1; n <= 12; n++) {
    assert.ok(CAMELOT_COLORS[n + "A"], `${n}A missing`);
    assert.ok(CAMELOT_COLORS[n + "B"], `${n}B missing`);
  }
});
