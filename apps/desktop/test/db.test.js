// Phase 5, step 2 - the real local database. These run against a REAL
// better-sqlite3 database (temp files on disk, cleaned up after), not a
// mock - CLAUDE.md's own Phase 5 tests explicitly call for "migrations up
// from empty" and "corrupt-DB recovery," both exercised for real here.
//
// Pure data-layer logic (no Electron import anywhere in src/main/db/), so
// this runs under plain Node, same as every other test in this repo.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync, existsSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const Database = require("better-sqlite3");

const { runMigrations, getSchemaVersion } = require("../src/main/db/migrate.ts");
const { openDatabase } = require("../src/main/db/openDatabase.ts");
const { getWindowBounds, saveWindowBounds } = require("../src/main/db/windowBounds.ts");
const { getPreference, setPreference } = require("../src/main/db/preferences.ts");
const { migrations } = require("../src/main/db/migrations.ts");

// Checked against the real migrations list, not a hardcoded number - this
// file only cares that ALL migrations ran, not how many exist right now.
// (It was "1" when this file was written in step 2; step 3 legitimately
// added a 2nd migration, which is exactly why this isn't hardcoded.)
const LATEST_VERSION = migrations[migrations.length - 1].version;

function tempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "ccdj-db-test-"));
  return join(dir, "test.sqlite");
}

test("migrations run cleanly starting from a brand-new, empty database", () => {
  const db = new Database(":memory:");
  assert.equal(getSchemaVersion(db), 0, "a fresh db starts at version 0");

  runMigrations(db);

  assert.equal(getSchemaVersion(db), LATEST_VERSION, "every migration up to the latest is applied");
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name);
  assert.ok(tables.includes("window_bounds"));
  assert.ok(tables.includes("preferences"));
  db.close();
});

test("running migrations twice is safe (already-applied migrations are not re-run)", () => {
  const db = new Database(":memory:");
  runMigrations(db);
  runMigrations(db); // must not throw (e.g. "table already exists")
  assert.equal(getSchemaVersion(db), LATEST_VERSION);
  db.close();
});

test("window bounds: save then load returns exactly what was saved", () => {
  const db = new Database(":memory:");
  runMigrations(db);

  assert.equal(getWindowBounds(db), null, "nothing saved yet");

  saveWindowBounds(db, { x: 120, y: 80, width: 1300, height: 900 });
  assert.deepEqual(getWindowBounds(db), { x: 120, y: 80, width: 1300, height: 900 });

  // A later save overwrites, it doesn't add a second row.
  saveWindowBounds(db, { x: 0, y: 0, width: 1000, height: 700 });
  assert.deepEqual(getWindowBounds(db), { x: 0, y: 0, width: 1000, height: 700 });
  const rowCount = db.prepare("SELECT COUNT(*) AS n FROM window_bounds").get().n;
  assert.equal(rowCount, 1);
  db.close();
});

test("preferences: set then get round-trips, and overwriting a key doesn't duplicate it", () => {
  const db = new Database(":memory:");
  runMigrations(db);

  assert.equal(getPreference(db, "theme"), null);
  setPreference(db, "theme", "dark");
  assert.equal(getPreference(db, "theme"), "dark");
  setPreference(db, "theme", "light");
  assert.equal(getPreference(db, "theme"), "light");
  const rowCount = db.prepare("SELECT COUNT(*) AS n FROM preferences").get().n;
  assert.equal(rowCount, 1);
  db.close();
});

test("openDatabase: a real file path runs migrations and reports no corruption", () => {
  const filePath = tempDbPath();
  const result = openDatabase(filePath);
  assert.equal(result.recoveredFromCorruption, false);
  assert.equal(result.backupPath, null);
  assert.equal(getSchemaVersion(result.db), LATEST_VERSION);
  result.db.close();
  rmSync(filePath, { force: true });
});

test("openDatabase: a genuinely corrupt file is backed up and replaced with a fresh, working database", () => {
  const filePath = tempDbPath();
  // Not a valid SQLite file at all - real corruption, not simulated.
  writeFileSync(filePath, "this is not a sqlite database\0\0\0garbage");

  const result = openDatabase(filePath);

  assert.equal(result.recoveredFromCorruption, true, "corruption must be detected, not silently ignored");
  assert.ok(result.backupPath, "the broken file must be kept, not deleted");
  assert.ok(existsSync(result.backupPath), "the backup file must actually exist on disk");
  assert.ok(existsSync(filePath), "a fresh database file must exist at the original path");

  // The fresh database must be genuinely usable, not just present.
  assert.equal(getSchemaVersion(result.db), LATEST_VERSION);
  saveWindowBounds(result.db, { x: 1, y: 2, width: 800, height: 600 });
  assert.deepEqual(getWindowBounds(result.db), { x: 1, y: 2, width: 800, height: 600 });

  result.db.close();
  rmSync(filePath, { force: true });
  rmSync(result.backupPath, { force: true });
});
