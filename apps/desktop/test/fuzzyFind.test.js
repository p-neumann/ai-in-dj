// Phase 5, step 5 piece 18 (free-typed GO, 2026-11-13). Ported from
// reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx's fuzzyFind (532-548)
// and its use in fetchSearchResults (line 3645).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { fuzzyFindTrack, resolveSeedTrack } = require("../src/renderer/src/trackCheat/fuzzyFind.ts");

function track(id, displayName) {
  return { id, displayName, artist: "", title: "", bpm: 0, key: "", genre: "", year: 0, playcount: 0 };
}

test("resolveSeedTrack: exact display-name match wins outright, no fuzzy involved", () => {
  const library = [track(1, "Daft Punk - One More Time"), track(2, "Daft Punk - One More Time (Redrum)")];
  const found = resolveSeedTrack("Daft Punk - One More Time", library);
  assert.equal(found.id, 1);
});

test("fuzzyFindTrack: a typo in the search still resolves, via fuzzyEq's tolerance", () => {
  const library = [track(1, "Blackstreet - No Diggity"), track(2, "Unrelated Artist - Different Song")];
  // "Diggety" (typo) vs "diggity" - within fuzzyEq's tolerance.
  const found = fuzzyFindTrack("Blackstreet - No Diggety", library);
  assert.equal(found.id, 1);
});

test("fuzzyFindTrack: below the 0.4 floor returns null, not the closest-anyway guess", () => {
  const library = [track(1, "Daft Punk - One More Time"), track(2, "Blackstreet - No Diggity")];
  const found = fuzzyFindTrack("Completely Unrelated Gibberish Text", library);
  assert.equal(found, null);
});

test("fuzzyFindTrack: a bare title with no extra words outscores one padded with an unrelated extra word", () => {
  // Not an exact tie (padding changes the score itself, since the
  // denominator is the LARGER word count) - but this is the real-world
  // shape of what his 7/16 tie-break comment (source 538-543) is
  // protecting against: a bare typed title shouldn't lose to a longer,
  // looser candidate. A genuine numeric tie is hard to construct by
  // hand reliably; this proves the same practical outcome via the
  // score formula itself, which the tie-break only has to step in for
  // when scores land exactly equal.
  const library = [track(1, "Artist - Come Baby Come Tonight"), track(2, "Artist - Come Baby Come")];
  const found = fuzzyFindTrack("Come Baby Come", library);
  assert.equal(found.id, 2);
});

test("fuzzyFindTrack: empty/whitespace-only query returns null, not a crash", () => {
  const library = [track(1, "Daft Punk - One More Time")];
  assert.equal(fuzzyFindTrack("   ", library), null);
});
