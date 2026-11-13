// Phase 5, step 5 piece 13 (Stage 2b).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { normalizeSmartQuotes } = require("../src/renderer/src/shared/normalizeSmartQuotes.ts");

test("normalizeSmartQuotes: converts curly single quotes to straight", () => {
  assert.equal(normalizeSmartQuotes("I‘m ’here’"), "I'm 'here'");
});

test("normalizeSmartQuotes: converts curly double quotes to straight", () => {
  assert.equal(normalizeSmartQuotes("“redrums” only"), '"redrums" only');
});

test("normalizeSmartQuotes: null/undefined input is an empty string, not a crash", () => {
  assert.equal(normalizeSmartQuotes(null), "");
  assert.equal(normalizeSmartQuotes(undefined), "");
});

test("normalizeSmartQuotes: plain straight-quote text passes through unchanged", () => {
  assert.equal(normalizeSmartQuotes("no quotes here"), "no quotes here");
});
