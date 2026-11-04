// Phase 5, step 5 piece 6 - the full plain-text Playlist Cheat flow.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { matchPlaylistFromPlainText } = require("../src/renderer/src/playlistCheat/matchPlaylist.ts");

function track(overrides) {
  return { id: 1, displayName: "", artist: "", title: "", bpm: 0, key: "", genre: "", year: 0, playcount: null, ...overrides };
}

test("matchPlaylistFromPlainText: end to end, one song, one match", () => {
  const lib = [track({ id: 1, displayName: "Beyonce - Crazy In Love", artist: "Beyonce" })];
  const results = matchPlaylistFromPlainText("Beyonce - Crazy In Love", lib, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].sourceArtist, "Beyonce");
  assert.equal(results[0].sourceName, "Crazy In Love");
  assert.equal(results[0].matches.length, 1);
  assert.equal(results[0].matches[0].id, 1);
});

test("matchPlaylistFromPlainText: a song with no library match returns zero matches, not an error", () => {
  const results = matchPlaylistFromPlainText("Nobody - Nothing Like This", [], 3);
  assert.equal(results.length, 1);
  assert.equal(results[0].matches.length, 0);
});

test("matchPlaylistFromPlainText: requesting more versions than exist returns all of them, no padding", () => {
  const lib = [track({ id: 1, displayName: "Beyonce - Crazy In Love (Clean)", artist: "Beyonce" })];
  const results = matchPlaylistFromPlainText("Beyonce - Crazy In Love", lib, 5);
  assert.equal(results[0].matches.length, 1);
});

test("matchPlaylistFromPlainText: multiple playlist lines each get their own result", () => {
  const lib = [
    track({ id: 1, displayName: "Beyonce - Crazy In Love", artist: "Beyonce" }),
    track({ id: 2, displayName: "Blackstreet - No Diggity", artist: "Blackstreet" })
  ];
  const results = matchPlaylistFromPlainText("Beyonce - Crazy In Love\nBlackstreet - No Diggity", lib, 1);
  assert.equal(results.length, 2);
  assert.equal(results[0].matches[0].id, 1);
  assert.equal(results[1].matches[0].id, 2);
});
