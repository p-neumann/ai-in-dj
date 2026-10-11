// Phase 5, step 5 piece 2 - the Library screen's client-side search. Pure
// function, no React/DOM needed to test it.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { filterTracks } = require("../src/renderer/src/library/filterTracks.ts");

function track(overrides) {
  return { id: 1, displayName: "", artist: "", title: "", bpm: 0, key: "", genre: "", year: 0, playcount: null, ...overrides };
}

test("filterTracks: an empty search returns everything, unfiltered", () => {
  const tracks = [track({ id: 1, displayName: "A" }), track({ id: 2, displayName: "B" })];
  assert.deepEqual(filterTracks(tracks, ""), tracks);
  assert.deepEqual(filterTracks(tracks, "   "), tracks);
});

test("filterTracks: matches a substring in displayName, case-insensitively", () => {
  const tracks = [track({ id: 1, displayName: "Daft Punk - One More Time" }), track({ id: 2, displayName: "Unrelated" })];
  const result = filterTracks(tracks, "DAFT");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 1);
});

test("filterTracks: also matches artist and title, not just displayName", () => {
  const byArtist = track({ id: 1, displayName: "something.mp3", artist: "Daft Punk", title: "Song" });
  const byTitle = track({ id: 2, displayName: "something-else.mp3", artist: "Other", title: "Punk Rock Anthem" });
  const noMatch = track({ id: 3, displayName: "x", artist: "y", title: "z" });

  assert.deepEqual(filterTracks([byArtist, byTitle, noMatch], "punk").map((t) => t.id), [1, 2]);
});

test("filterTracks: no match returns an empty list, not an error or the full list", () => {
  const tracks = [track({ id: 1, displayName: "Song" })];
  assert.deepEqual(filterTracks(tracks, "zzz-not-present"), []);
});
