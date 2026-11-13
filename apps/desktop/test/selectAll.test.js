// Phase 5, step 5 piece 15 follow-up (2026-11-12). Reproduces the exact
// screen sequence Ranjish hit after the piece 1 "fix" (build, then
// immediately click Select All with nothing deselected) to find out
// whether the fix actually landed, or landed for a different case than
// the one he's hitting - per his explicit instruction not to just
// assume the code change was enough.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { restoreSelectAll } = require("../src/renderer/src/playlistCheat/selectAll.ts");

// Mirrors PlaylistCheatScreen's handleMatch default-selection step: every
// matched song defaults to its first match (index 0) the instant results
// land - this is real, confirmed source behavior (sel2[ri+"-0"]=true,
// lines 4926/4972), not something this port invented.
function defaultsAfterMatch(results) {
  const defaults = {};
  results.forEach((r, i) => {
    if (r.matches.length) defaults[i] = 0;
  });
  return defaults;
}

const RESULTS = [
  { matches: [{}, {}, {}] }, // song with 3 matches (Results Per Track = 3)
  { matches: [{}, {}, {}] } // a second song, also 3 matches
];

test("reproduction: build then click Select All immediately (nothing deselected) - count does NOT change", () => {
  const afterBuild = defaultsAfterMatch(RESULTS); // {0:0, 1:0} - 2 selected out of 6 total matches, matching Ranjish's '2 / 6'
  const afterSelectAll = restoreSelectAll(RESULTS, afterBuild);
  assert.deepEqual(afterSelectAll, afterBuild);
  assert.equal(Object.keys(afterSelectAll).length, 2); // still 2/6 - visually indistinguishable from "did nothing"
});

test("Select All DOES do something, but only once a song has actually been deselected first", () => {
  const afterBuild = defaultsAfterMatch(RESULTS); // {0:0, 1:0}
  const afterDeselectSong0 = { ...afterBuild };
  delete afterDeselectSong0[0]; // simulates clicking song 0's already-selected match to deselect it (piece 1's deselect fix)
  assert.deepEqual(afterDeselectSong0, { 1: 0 }); // 1/6 now

  const restored = restoreSelectAll(RESULTS, afterDeselectSong0);
  assert.deepEqual(restored, { 0: 0, 1: 0 }); // back to 2/6 - this is the ONLY sequence where Select All is visibly different
});

test("restoreSelectAll never selects more than one match per song, even with several matches available", () => {
  const restored = restoreSelectAll(RESULTS, {});
  assert.equal(Object.keys(restored).length, RESULTS.length); // 2 songs selected, not 6 matches
});
