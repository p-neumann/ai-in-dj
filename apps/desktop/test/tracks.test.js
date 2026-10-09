// Phase 5, step 3 - storing imported tracks. Real better-sqlite3, same
// pattern as test/db.test.js.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { runMigrations } = require("../src/main/db/migrate.ts");
const { replaceAllTracks, countTracks, getSampleTrackNames } = require("../src/main/db/tracks.ts");

function sampleTrack(n) {
  return {
    displayName: `Song ${n}`,
    artist: `Artist ${n}`,
    title: `Song ${n}`,
    bpm: 128,
    key: "8A",
    genre: "house",
    year: 2020,
    playcount: n,
    durationSec: 200,
    location: `/Music/Song ${n}.mp3`,
    extra: {}
  };
}

test("replaceAllTracks: inserts the given tracks and they can be counted back", () => {
  const db = new Database(":memory:");
  runMigrations(db);

  replaceAllTracks(db, [sampleTrack(1), sampleTrack(2), sampleTrack(3)]);
  assert.equal(countTracks(db), 3);
  db.close();
});

test("replaceAllTracks: importing again REPLACES the table, it doesn't add to it", () => {
  const db = new Database(":memory:");
  runMigrations(db);

  replaceAllTracks(db, [sampleTrack(1), sampleTrack(2)]);
  assert.equal(countTracks(db), 2);

  replaceAllTracks(db, [sampleTrack(1)]);
  assert.equal(countTracks(db), 1, "the second import's single track replaced the first import's two");
  db.close();
});

test("getSampleTrackNames: returns real display names, up to the requested limit", () => {
  const db = new Database(":memory:");
  runMigrations(db);
  replaceAllTracks(db, [sampleTrack(1), sampleTrack(2), sampleTrack(3)]);

  const names = getSampleTrackNames(db, 2);
  assert.equal(names.length, 2);
  assert.ok(names.every((n) => n.startsWith("Song ")));
  db.close();
});
