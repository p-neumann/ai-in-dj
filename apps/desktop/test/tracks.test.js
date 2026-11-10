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
  getAllTracksForLibrary,
  getTracksByIds,
  getTracksForDuplicateScan,
  deleteTracksByIds
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

// Step 5, piece 8 (Export) - Crate Cheat's own trackId->real-data lookup.
test("getTracksByIds: returns displayName/artist/bpm/key/location for known ids, skips unknown ones", () => {
  const db = new Database(":memory:");
  runMigrations(db);
  replaceAllTracks(db, [sampleTrack(1), sampleTrack(2), sampleTrack(3)]);

  const [t1, , t3] = getSampleTracks(db, 10);
  const rows = getTracksByIds(db, [t1.id, 999999, t3.id]);
  assert.equal(rows.length, 2, "the unknown id must be silently dropped, not guessed at or errored on");
  const byId = new Map(rows.map((r) => [r.id, r]));
  assert.equal(byId.get(t1.id).location, "/Music/Song 1.mp3");
  assert.equal(byId.get(t1.id).artist, "Artist 1");
  db.close();
});

test("getTracksByIds: an empty id list returns an empty list without touching the database", () => {
  const db = new Database(":memory:");
  runMigrations(db);
  assert.deepEqual(getTracksByIds(db, []), []);
  db.close();
});

// Step 5, piece 9 (Duplicate Finder) - its scan needs duration and
// location, which getAllTracksForLibrary deliberately leaves out.
test("getTracksForDuplicateScan: includes durationSec and location, unlike getAllTracksForLibrary", () => {
  const db = new Database(":memory:");
  runMigrations(db);
  replaceAllTracks(db, [sampleTrack(1)]);

  const [row] = getTracksForDuplicateScan(db);
  assert.equal(row.durationSec, 200);
  assert.equal(row.location, "/Music/Song 1.mp3");
  db.close();
});

// Step 5, piece 9 (Duplicate Finder) - the deliberate "Apply
// Permanently" path only. Everyday "Send to Recycle Bin" never calls
// this at all (it's session-only, in the renderer).
test("deleteTracksByIds: removes exactly the given ids, real rows, a real count back", () => {
  const db = new Database(":memory:");
  runMigrations(db);
  replaceAllTracks(db, [sampleTrack(1), sampleTrack(2), sampleTrack(3)]);
  const [t1, , t3] = getSampleTracks(db, 10);

  const deleted = deleteTracksByIds(db, [t1.id, t3.id, 999999]);
  assert.equal(deleted, 2, "the unknown id must not be counted or error, just have nothing to delete");
  assert.equal(countTracks(db), 1);
  db.close();
});

test("deleteTracksByIds: an empty id list deletes nothing and doesn't touch the database", () => {
  const db = new Database(":memory:");
  runMigrations(db);
  replaceAllTracks(db, [sampleTrack(1)]);
  assert.equal(deleteTracksByIds(db, []), 0);
  assert.equal(countTracks(db), 1);
  db.close();
});

// docs/decisions/0009: this same shape is now ALSO the library-sync
// payload (piece 3's fix for the real 413) - no separate "backend"
// projection exists anymore, so this test doubles as proof that the
// sync payload never carries a location, per CLAUDE.md 5.4.
test("getAllTracksForLibrary: returns every track with the fields the Library screen (and the backend sync) needs, no location/extra", () => {
  const db = new Database(":memory:");
  runMigrations(db);
  replaceAllTracks(db, [sampleTrack(1), sampleTrack(2), sampleTrack(3)]);

  const rows = getAllTracksForLibrary(db);
  assert.equal(rows.length, 3);
  const [row] = rows;
  assert.deepEqual(Object.keys(row).sort(), ["artist", "bpm", "displayName", "genre", "id", "key", "playcount", "title", "year"].sort());
  assert.equal(row.location, undefined, "no location must ever leave this process (CLAUDE.md 5.4)");
  db.close();
});
