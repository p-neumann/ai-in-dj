// Phase 5, step 5 piece 6 - extracting the title-only portion of a
// Serato-style filename, ported from the source's own duplicate-detection
// bug fix (v1.0.13221).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { getRawTitleFromName } = require("../src/renderer/src/shared/getRawTitleFromName.ts");

test("getRawTitleFromName: strips artist prefix and version tag", () => {
  assert.equal(getRawTitleFromName("Blackstreet - No Diggity (Club Mix)"), "no diggity");
});

test("getRawTitleFromName: strips a leading bracketed BPM-range tag", () => {
  assert.equal(getRawTitleFromName("(090-124) Blackstreet - No Diggity"), "no diggity");
});

test("getRawTitleFromName: strips a trailing content-flag suffix", () => {
  assert.equal(getRawTitleFromName("Eminem - Lose Yourself - Clean"), "lose yourself");
  assert.equal(getRawTitleFromName("Eminem - Lose Yourself - Dirty"), "lose yourself");
});

test("getRawTitleFromName: title-only name with no artist dash returns as-is", () => {
  assert.equal(getRawTitleFromName("Africa"), "africa");
});
