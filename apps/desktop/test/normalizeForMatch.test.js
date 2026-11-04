// Phase 5, step 5 piece 6 - Playlist Cheat's punctuation/accent
// normalizer, ported from the source's own documented bug fixes
// (v1.0.16061-16063) - these exact cases are what those fixes were for.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { normalizeForMatch } = require("../src/renderer/src/playlistCheat/normalizeForMatch.ts");

test("normalizeForMatch: strips accents (Beyonce)", () => {
  assert.equal(normalizeForMatch("Beyoncé"), "beyonce");
});

test("normalizeForMatch: drops a leading 'the '", () => {
  assert.equal(normalizeForMatch("The Black Eyed Peas"), "black eyed peas");
});

test("normalizeForMatch: $ becomes s (Ke$ha)", () => {
  assert.equal(normalizeForMatch("Ke$ha"), "kesha");
});

test("normalizeForMatch: hyphens become spaces (Flo-Rida)", () => {
  assert.equal(normalizeForMatch("Flo-Rida"), "flo rida");
});

test("normalizeForMatch: expands a dropped-g in' colloquialism", () => {
  assert.equal(normalizeForMatch("Rockin'"), "rocking");
  assert.equal(normalizeForMatch("Nothin'"), "nothing");
});

test("normalizeForMatch: does not touch real words that happen to end in 'in' with no apostrophe", () => {
  assert.equal(normalizeForMatch("Train"), "train");
  assert.equal(normalizeForMatch("Rain"), "rain");
});

test("normalizeForMatch: strips apostrophes, periods, exclamation marks, commas", () => {
  assert.equal(normalizeForMatch("Don't"), "dont");
  assert.equal(normalizeForMatch("Mr."), "mr");
  assert.equal(normalizeForMatch("3OH!3"), "3oh3");
});
