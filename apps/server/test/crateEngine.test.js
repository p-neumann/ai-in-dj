// Unit tests for the Crate Cheat engine building blocks ported so far:
// Do Play / Do Not Play list matching, and curated-track library matching.
// No network, no API key, no randomness-sensitive assertions (shuffle
// order inside matchCuratedTracksInLibrary doesn't affect set membership,
// which is all these tests check).

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDoNotPlay, applyDoPlayBoost, matchesListEntry } from "../src/engine/crateLists.js";
import { matchCuratedTracksInLibrary } from "../src/engine/crateMatching.js";

function track(name, libOverrides) {
  return { name, _libTrack: { artist: name.split(" - ")[0], ...libOverrides } };
}

test("matchesListEntry: genre entries match the library tag or inferred genre", () => {
  const t = track("Bad Bunny - Titi Me Pregunto", { genre: "reggaeton" });
  assert.equal(matchesListEntry(t, { type: "genre", value: "reggaeton" }), true);
  assert.equal(matchesListEntry(t, { type: "genre", value: "country" }), false);
});

test("matchesListEntry: era entries match a two-digit decade against the track year", () => {
  const t90s = track("Artist - Song", { year: "1994" });
  const t2020s = track("Artist - Song", { year: "2022" });
  assert.equal(matchesListEntry(t90s, { type: "era", value: "90s" }), true);
  assert.equal(matchesListEntry(t2020s, { type: "era", value: "90s" }), false);
  assert.equal(matchesListEntry(t2020s, { type: "era", value: "20s" }), true);
});

test("matchesListEntry: content entries prefer a real explicit tag over guessing from the title", () => {
  const taggedClean = track("Artist - Dirty Sounding Title", { explicit: "false" });
  const untaggedDirty = track("Artist - Song (Dirty)", {});
  assert.equal(matchesListEntry(taggedClean, { type: "content", value: "dirty" }), false, "a real clean tag overrides a dirty-sounding title");
  assert.equal(matchesListEntry(untaggedDirty, { type: "content", value: "dirty" }), true, "falls back to guessing from the title when no tag exists");
});

test("applyDoNotPlay removes every track matching any list entry; empty list is a no-op", () => {
  const resolved = [
    track("Clean Artist - Song", { genre: "pop" }),
    track("Explicit Artist - Song", { genre: "hip hop", explicit: "true" })
  ];
  assert.deepEqual(applyDoNotPlay(resolved, []), resolved);
  const filtered = applyDoNotPlay(resolved, [{ type: "content", value: "dirty" }]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, "Clean Artist - Song");
});

test("applyDoPlayBoost sorts matching tracks first without removing anything", () => {
  const resolved = [
    track("No Match - Song", { genre: "rock" }),
    track("Wants This - Song", { genre: "edm" }),
    track("Also No Match - Song", { genre: "country" })
  ];
  const boosted = applyDoPlayBoost(resolved, [{ type: "genre", value: "edm" }]);
  assert.equal(boosted.length, 3, "boosting must never drop a track");
  assert.equal(boosted[0].name, "Wants This - Song");
});

test("matchCuratedTracksInLibrary: tolerates ft./& connector differences between curation and library tagging", () => {
  const library = [
    { artist: "Nelly & Kelly Rowland", title: "Dilemma", bpm: "90", key: "8A" },
    { artist: "Unrelated", title: "Other Song", bpm: "100", key: "6A" }
  ];
  const matches = matchCuratedTracksInLibrary([{ artist: "Nelly ft. Kelly Rowland", track: "Dilemma" }], {}, library);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].title, "Dilemma");
});

test("matchCuratedTracksInLibrary: tolerates abbreviation and fuzzy spelling differences", () => {
  const library = [
    { artist: "T-Pain", title: "Buy U A Drank", bpm: "70", key: "5A" }
  ];
  const abbrevMatch = matchCuratedTracksInLibrary([{ artist: "T-Pain", track: "Buy You A Drank" }], {}, library);
  assert.equal(abbrevMatch.length, 1);

  const library2 = [{ artist: "Juvenile", title: "Buy You A Drank", bpm: "70", key: "5A" }];
  const fuzzyMatch = matchCuratedTracksInLibrary([{ artist: "Juvenile", track: "Buy You A Drink" }], {}, library2);
  assert.equal(fuzzyMatch.length, 1, "expected the fuzzy fallback to catch Drank/Drink");
});

test("matchCuratedTracksInLibrary: respects alreadyIncludedMap and returns nothing for a genuine non-match", () => {
  const library = [{ artist: "Artist", title: "Song", bpm: "100", key: "8A" }];
  const already = { "Artist - Song": true };
  const matches = matchCuratedTracksInLibrary([{ artist: "Artist", track: "Song" }], already, library);
  assert.equal(matches.length, 0, "a track already marked included must not be matched again");

  const noMatch = matchCuratedTracksInLibrary([{ artist: "Nobody", track: "Nothing" }], {}, library);
  assert.equal(noMatch.length, 0);
});
