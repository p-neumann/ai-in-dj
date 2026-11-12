// Phase 5 SQLite milestone: the real migration list and the tables it creates
// (window_bounds, preferences, history, tracks). Every test works in its own temporary folder
// under the OS temp directory and deletes it afterwards — never the real
// user-data folder.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { migrate } from "../src/main/db/migrate.ts";
import { MIGRATIONS } from "../src/main/db/migrations.ts";
import { openDatabase } from "../src/main/db/connection.ts";
import { readSchemaVersion, userTableNames } from "../src/main/db/schema.ts";
import { getWindowBounds, saveWindowBounds } from "../src/main/db/windowBounds.ts";
import { getPreference, setPreference } from "../src/main/db/preferences.ts";
import { appendHistoryEntry, listHistory, updateHistoryEntry } from "../src/main/db/history.ts";
import { trackId } from "../src/main/db/trackId.ts";
import {
  countTracks,
  deleteTracksByIds,
  getAllTracksForLibrary,
  getTrackLocation,
  getTracksByIds,
  getTracksForDuplicateScan,
  replaceAllTracks
} from "../src/main/db/tracks.ts";

// --- helpers ---------------------------------------------------------------

const LATEST = MIGRATIONS[MIGRATIONS.length - 1].version;

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "ccdj-tables-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function withDb(path, fn, options) {
  const db = new Database(path, options);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

// A database migrated to the real latest version, opened the way the app will.
// One cleanup hook closes the connection before deleting the folder: on
// Windows an open handle makes the delete fail (EBUSY).
async function freshDb(t) {
  const dir = mkdtempSync(join(tmpdir(), "ccdj-tables-test-"));
  let db;
  t.after(() => {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const dbPath = join(dir, "ccdj-db.sqlite");
  assert.equal((await migrate(dbPath)).status, "migrated");
  db = openDatabase(dbPath);
  return db;
}

// --- migrations ------------------------------------------------------------

test("a new database reaches the latest version with every table", async (t) => {
  const dbPath = join(tempDir(t), "ccdj-db.sqlite");

  const result = await migrate(dbPath);

  assert.deepEqual(result, { status: "migrated", from: 0, to: LATEST, backupPath: null });
  withDb(
    dbPath,
    (db) => {
      assert.equal(readSchemaVersion(db), LATEST);
      for (const table of ["schema_migrations", "window_bounds", "preferences", "history", "tracks"]) {
        assert.ok(userTableNames(db).includes(table), `missing table ${table}`);
      }
    },
    { readonly: true }
  );
});

test("a v1 database upgrades to the latest version after a verified v1 backup", async (t) => {
  const dir = tempDir(t);
  const dbPath = join(dir, "ccdj-db.sqlite");
  await migrate(dbPath, MIGRATIONS.slice(0, 1));

  const result = await migrate(dbPath);

  const backupPath = join(dir, "ccdj-db.v1.bak");
  assert.deepEqual(result, { status: "migrated", from: 1, to: LATEST, backupPath });
  assert.equal(withDb(backupPath, readSchemaVersion, { readonly: true }), 1);
  assert.equal(withDb(dbPath, readSchemaVersion, { readonly: true }), LATEST);
});

// --- window_bounds ---------------------------------------------------------

test("window bounds: nothing saved reads as null", async (t) => {
  const db = await freshDb(t);
  assert.equal(getWindowBounds(db), null);
});

test("window bounds: save then get round-trips, and a second save overwrites", async (t) => {
  const db = await freshDb(t);

  saveWindowBounds(db, { x: 10, y: 20, width: 1100, height: 760 });
  assert.deepEqual(getWindowBounds(db), { x: 10, y: 20, width: 1100, height: 760 });

  saveWindowBounds(db, { x: 300, y: 40, width: 1280, height: 800 });
  assert.deepEqual(getWindowBounds(db), { x: 300, y: 40, width: 1280, height: 800 });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM window_bounds").get().n, 1);
});

test("window bounds: x and y may be null (position left to the OS)", async (t) => {
  const db = await freshDb(t);

  saveWindowBounds(db, { x: null, y: null, width: 900, height: 600 });

  assert.deepEqual(getWindowBounds(db), { x: null, y: null, width: 900, height: 600 });
});

// --- preferences -----------------------------------------------------------

test("preferences: a missing key reads as null", async (t) => {
  const db = await freshDb(t);
  assert.equal(getPreference(db, "styleProfile"), null);
});

test("preferences: set then get round-trips, and setting again overwrites", async (t) => {
  const db = await freshDb(t);
  const list = JSON.stringify([{ name: "Drake", persistent: true }]);

  setPreference(db, "doNotPlayList", list);
  setPreference(db, "styleProfile", "I favor remixes over radio versions");
  assert.equal(getPreference(db, "doNotPlayList"), list);
  assert.equal(getPreference(db, "styleProfile"), "I favor remixes over radio versions");

  setPreference(db, "styleProfile", "Extended mixes first");
  assert.equal(getPreference(db, "styleProfile"), "Extended mixes first");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM preferences").get().n, 2);
});

// --- history ---------------------------------------------------------------

// A cut-down entry in the CLAUDE.md 6.5 shape.
function entry(id, seedName, outcome = "shown") {
  return {
    id,
    ts: 1,
    sessionId: "s_1",
    seed: { name: seedName, bpm: "", key: "", genre: "", year: "" },
    trigger: "freshSeed",
    resultStatus: "ok",
    results: [{ name: "Rihanna - So Hard (Clean)", bpm: "88", key: "8A", genre: "R&B", year: "2007", outcome }]
  };
}

test("history: append then list round-trips the exact entry, newest first, within the limit", async (t) => {
  const db = await freshDb(t);
  appendHistoryEntry(db, entry("e1", "Seed One"));
  appendHistoryEntry(db, entry("e2", "Seed Two"));
  appendHistoryEntry(db, entry("e3", "Seed Three"));

  const rows = listHistory(db, 2);

  assert.deepEqual(
    rows.map((r) => r.entry),
    [entry("e3", "Seed Three"), entry("e2", "Seed Two")]
  );
  assert.ok(rows.every((r) => Number.isInteger(r.id) && r.timestamp > 0));
});

test("history: update replaces only the entry with that id", async (t) => {
  const db = await freshDb(t);
  appendHistoryEntry(db, entry("e1", "Seed One"));
  appendHistoryEntry(db, entry("e2", "Seed Two"));

  const dragged = { ...entry("e1", "Seed One", "dragged"), note: "packed the floor" };
  assert.equal(updateHistoryEntry(db, "e1", dragged), true);

  assert.deepEqual(
    listHistory(db, 10).map((r) => r.entry),
    [entry("e2", "Seed Two"), dragged]
  );
});

test("history: updating an unknown id returns false and changes nothing", async (t) => {
  const db = await freshDb(t);
  appendHistoryEntry(db, entry("e1", "Seed One"));

  assert.equal(updateHistoryEntry(db, "missing", entry("missing", "Other")), false);

  assert.deepEqual(listHistory(db, 10).map((r) => r.entry), [entry("e1", "Seed One")]);
});

// --- tracks ----------------------------------------------------------------

function track(location, overrides = {}) {
  return {
    displayName: location.split("/").pop().replace(/\.[^.]+$/, ""),
    artist: "Rihanna",
    title: "So Hard",
    bpm: 88,
    key: "8A",
    genre: "R&B",
    year: 2007,
    playcount: 3,
    durationSec: 244,
    location,
    extra: {},
    ...overrides
  };
}

test("trackId: same file, same ID; different files, different IDs", () => {
  const id = trackId("/Volumes/DJ/Music/So Hard (Clean).mp4");

  assert.match(id, /^t_[0-9a-f]{16}$/);
  assert.equal(trackId("/Volumes/DJ/Music/So Hard (Clean).mp4"), id);
  // Separators, letter case and surrounding spaces do not change it.
  assert.equal(trackId("\\Volumes\\DJ\\Music\\So Hard (Clean).mp4"), id);
  assert.equal(trackId("  /volumes/dj/music/so hard (CLEAN).MP4 "), id);
  // Composed "é" and decomposed "e" + accent are the same name.
  assert.equal(trackId("/Music/Beyoncé.mp3"), trackId("/Music/Beyoncé.mp3"));
  assert.notEqual(trackId("/Volumes/DJ/Music/So Hard (Dirty).mp4"), id);
});

test("tracks: a re-import keeps every track's ID", async (t) => {
  const db = await freshDb(t);
  const library = [track("/Volumes/DJ/a.mp4"), track("/Volumes/DJ/b.mp4"), track("/Volumes/DJ/c.mp4")];

  replaceAllTracks(db, library);
  const first = getAllTracksForLibrary(db).map((r) => r.id).sort();
  // Re-import in a different order, with one track's metadata changed.
  replaceAllTracks(db, [library[2], { ...library[0], playcount: 9 }, library[1]]);
  const second = getAllTracksForLibrary(db).map((r) => r.id).sort();

  assert.deepEqual(second, first);
  assert.deepEqual(first, library.map((tr) => trackId(tr.location)).sort());
  assert.equal(countTracks(db), 3);
});

test("tracks: location is found by ID, and an unknown ID gives null", async (t) => {
  const db = await freshDb(t);
  replaceAllTracks(db, [track("/Volumes/DJ/a.mp4")]);

  assert.equal(getTrackLocation(db, trackId("/Volumes/DJ/a.mp4")), "/Volumes/DJ/a.mp4");
  assert.equal(getTrackLocation(db, "t_0000000000000000"), null);
});

test("tracks: unknown bpm and year read back as null; a real 0 play count stays 0", async (t) => {
  const db = await freshDb(t);
  replaceAllTracks(db, [track("/Volumes/DJ/a.mp4", { bpm: null, year: null, playcount: 0 })]);

  const [row] = getAllTracksForLibrary(db);

  assert.equal(row.bpm, null);
  assert.equal(row.year, null);
  assert.equal(row.playcount, 0);
});

test("tracks: the library rows carry no file path", async (t) => {
  const db = await freshDb(t);
  replaceAllTracks(db, [track("/Volumes/DJ/a.mp4")]);

  const [row] = getAllTracksForLibrary(db);

  assert.deepEqual(Object.keys(row).sort(), [
    "artist", "bpm", "displayName", "genre", "id", "key", "playcount", "title", "year"
  ]);
});

test("tracks: a repeated location keeps the first row and is reported, not a crash", async (t) => {
  const db = await freshDb(t);

  const result = replaceAllTracks(db, [
    track("/Volumes/DJ/a.mp4", { title: "first" }),
    track("/Volumes/DJ/b.mp4"),
    track("\\Volumes\\DJ\\A.mp4", { title: "repeat" })
  ]);

  assert.deepEqual(result, { inserted: 2, duplicateLocations: ["\\Volumes\\DJ\\A.mp4"] });
  assert.equal(countTracks(db), 2);
  const a = getAllTracksForLibrary(db).find((r) => r.id === trackId("/Volumes/DJ/a.mp4"));
  assert.equal(a.title, "first");
});

// getTracksByIds tests adopted from Ranjish's tracks.test.js (step 5, piece 8:
// Export), with string IDs.
test("tracks: getTracksByIds returns export fields for known IDs and skips unknown ones", async (t) => {
  const db = await freshDb(t);
  replaceAllTracks(db, [track("/Volumes/DJ/a.mp4"), track("/Volumes/DJ/b.mp4", { bpm: null })]);
  const a = trackId("/Volumes/DJ/a.mp4");
  const b = trackId("/Volumes/DJ/b.mp4");

  const rows = getTracksByIds(db, [a, "t_0000000000000000", b]);

  assert.equal(rows.length, 2);
  const byId = new Map(rows.map((r) => [r.id, r]));
  assert.deepEqual(byId.get(a), {
    id: a, displayName: "a", artist: "Rihanna", bpm: 88, key: "8A", location: "/Volumes/DJ/a.mp4"
  });
  assert.equal(byId.get(b).bpm, null);
});

test("tracks: getTracksByIds with no IDs returns an empty list", async (t) => {
  const db = await freshDb(t);
  assert.deepEqual(getTracksByIds(db, []), []);
});

// Duplicate Finder tests adopted from Ranjish's tracks.test.js (step 5,
// piece 9), with string IDs.
test("tracks: getTracksForDuplicateScan includes durationSec and location", async (t) => {
  const db = await freshDb(t);
  replaceAllTracks(db, [track("/Volumes/DJ/a.mp4")]);

  const [row] = getTracksForDuplicateScan(db);

  assert.equal(row.id, trackId("/Volumes/DJ/a.mp4"));
  assert.equal(row.durationSec, 244);
  assert.equal(row.location, "/Volumes/DJ/a.mp4");
});

test("tracks: deleteTracksByIds removes exactly the given IDs and counts only real rows", async (t) => {
  const db = await freshDb(t);
  replaceAllTracks(db, [track("/Volumes/DJ/a.mp4"), track("/Volumes/DJ/b.mp4"), track("/Volumes/DJ/c.mp4")]);

  const deleted = deleteTracksByIds(db, [
    trackId("/Volumes/DJ/a.mp4"),
    trackId("/Volumes/DJ/c.mp4"),
    "t_0000000000000000"
  ]);

  assert.equal(deleted, 2);
  assert.deepEqual(getAllTracksForLibrary(db).map((r) => r.id), [trackId("/Volumes/DJ/b.mp4")]);
});

test("tracks: deleteTracksByIds with no IDs deletes nothing", async (t) => {
  const db = await freshDb(t);
  replaceAllTracks(db, [track("/Volumes/DJ/a.mp4")]);
  assert.equal(deleteTracksByIds(db, []), 0);
  assert.equal(countTracks(db), 1);
});

test("history: entries without an id can still be saved", async (t) => {
  const db = await freshDb(t);
  appendHistoryEntry(db, { note: "no id" });
  appendHistoryEntry(db, { note: "no id either" });

  assert.deepEqual(
    listHistory(db, 10).map((r) => r.entry),
    [{ note: "no id either" }, { note: "no id" }]
  );
});
