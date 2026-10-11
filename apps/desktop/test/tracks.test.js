// Phase 5, step 3 - storing imported tracks. Real better-sqlite3, same
// pattern as test/db.test.js.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { runMigrations } = require("../src/main/db/migrate.ts");
const {
  replaceAllTracks,
  countTracks,
  getSampleTrackNames,
  getSampleTracks,
  getTrackLocation,
  getAllTracksForLibrary
} = require("../src/main/db/tracks.ts");

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

test("getSampleTracks: returns real ids alongside display names - step 4 needs the id to reveal a file", () => {
  const db = new Database(":memory:");
  runMigrations(db);
  replaceAllTracks(db, [sampleTrack(1), sampleTrack(2)]);

  const tracks = getSampleTracks(db, 10);
  assert.equal(tracks.length, 2);
  assert.ok(tracks.every((t) => typeof t.id === "number" && t.displayName.startsWith("Song ")));
  db.close();
});

test("getTrackLocation: returns the real path for a known id, and null for an unknown one", () => {
  const db = new Database(":memory:");
  runMigrations(db);
  replaceAllTracks(db, [sampleTrack(1)]);

  const [track] = getSampleTracks(db, 1);
  assert.equal(getTrackLocation(db, track.id), "/Music/Song 1.mp3");
  assert.equal(getTrackLocation(db, 999999), null, "an id the renderer made up must never resolve to a real path");
  db.close();
});

test("getAllTracksForLibrary: returns every track with the fields the Library screen needs, no location/extra", () => {
  const db = new Database(":memory:");
  runMigrations(db);
  replaceAllTracks(db, [sampleTrack(1), sampleTrack(2), sampleTrack(3)]);

  const rows = getAllTracksForLibrary(db);
  assert.equal(rows.length, 3);
  const [row] = rows;
  assert.deepEqual(Object.keys(row).sort(), ["artist", "bpm", "displayName", "genre", "id", "key", "playcount", "title", "year"].sort());
  db.close();
});
