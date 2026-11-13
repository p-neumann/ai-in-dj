// Phase 5, step 5 piece 6 - same logic as apps/server/src/engine/
// fuzzyMatch.js, duplicated for the renderer (see that file's header
// comment for why).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { levenshtein, fuzzyEq } = require("../src/renderer/src/shared/fuzzyMatch.ts");

test("levenshtein: identical strings are distance 0", () => {
  assert.equal(levenshtein("work", "work"), 0);
});

test("levenshtein: one substitution is distance 1", () => {
  assert.equal(levenshtein("wurk", "work"), 1);
});

test("fuzzyEq: a one-letter spelling variant on a real word matches (wurk/work)", () => {
  assert.equal(fuzzyEq("wurk", "work"), true);
});

test("fuzzyEq: short words never fuzzy-match (avoids false positives on common short words)", () => {
  assert.equal(fuzzyEq("cat", "car"), false);
});

test("fuzzyEq: unrelated words of reasonable length do not match", () => {
  assert.equal(fuzzyEq("yesterday", "tomorrow"), false);
});

test("fuzzyEq: empty strings never match", () => {
  assert.equal(fuzzyEq("", "work"), false);
  assert.equal(fuzzyEq("work", ""), false);
});
