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
const {
  openDatabase,
  DatabaseTooNewError,
  MigrationFailedError
} = require("../src/main/db/openDatabase.ts");
const { restoreFromBackup } = require("../src/main/db/backup.ts");
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

test("openDatabase: a real file path runs migrations and reports no corruption", async () => {
  const filePath = tempDbPath();
  const result = await openDatabase(filePath);
  assert.equal(result.recoveredFromCorruption, false);
  assert.equal(result.backupPath, null);
  // A brand-new, empty database has nothing worth protecting yet, so no
  // pre-migration backup should be taken for it.
  assert.equal(result.preMigrationBackupPath, null);
  assert.equal(getSchemaVersion(result.db), LATEST_VERSION);
  result.db.close();
  rmSync(filePath, { force: true });
});

test("openDatabase: a genuinely corrupt file is backed up and replaced with a fresh, working database", async () => {
  const filePath = tempDbPath();
  // Not a valid SQLite file at all - real corruption, not simulated.
  writeFileSync(filePath, "this is not a sqlite database\0\0\0garbage");

  const result = await openDatabase(filePath);

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

test("openDatabase: connection pragmas are actually applied, not just intended (WAL, synchronous=FULL, foreign_keys=ON)", async () => {
  const filePath = tempDbPath();
  const result = await openDatabase(filePath);

  assert.equal(result.db.pragma("journal_mode", { simple: true }), "wal");
  assert.equal(result.db.pragma("synchronous", { simple: true }), 2, "2 = FULL in SQLite's own pragma encoding");
  assert.equal(result.db.pragma("foreign_keys", { simple: true }), 1, "1 = ON");

  result.db.close();
  rmSync(filePath, { force: true });
});

test("openDatabase: refuses to open (and never touches) a database newer than this build understands", async () => {
  const filePath = tempDbPath();
  const seedDb = new Database(filePath);
  runMigrations(seedDb);
  // Simulate a database a future build already migrated further than
  // this build's migrations.ts knows about.
  seedDb.prepare("UPDATE schema_meta SET version = ? WHERE id = 1").run(LATEST_VERSION + 1);
  seedDb.close();

  let caughtErr;
  try {
    await openDatabase(filePath);
    assert.fail("expected openDatabase to throw for a too-new database");
  } catch (err) {
    caughtErr = err;
  }
  assert.ok(caughtErr instanceof DatabaseTooNewError, "must throw the specific tooNew error, not a generic one");
  assert.equal(caughtErr.version, LATEST_VERSION + 1);
  assert.equal(caughtErr.maxReadable, LATEST_VERSION);

  // Confirm it genuinely never wrote anything: the version is still the
  // "too new" one, not silently migrated or reset.
  const check = new Database(filePath, { readonly: true });
  assert.equal(getSchemaVersion(check), LATEST_VERSION + 1);
  check.close();
  rmSync(filePath, { force: true });
});

test("openDatabase: takes a verified backup before migrating a database that already has real data", async () => {
  const filePath = tempDbPath();
  const seedDb = new Database(filePath);
  runMigrations(seedDb, [migrations[0]]); // seed at version 1 only
  saveWindowBounds(seedDb, { x: 5, y: 6, width: 1000, height: 700 });
  seedDb.close();

  // Migrating from version 1 up to the real latest version.
  const result = await openDatabase(filePath, migrations);

  assert.ok(result.preMigrationBackupPath, "a backup must be taken before migrating existing data");
  assert.ok(existsSync(result.preMigrationBackupPath));
  assert.match(result.preMigrationBackupPath, /\.v1\.bak$/);

  // The backup must be a real, independently-openable snapshot of the
  // pre-migration state, not just a file that happens to exist.
  const backupDb = new Database(result.preMigrationBackupPath, { readonly: true });
  assert.equal(getSchemaVersion(backupDb), 1);
  assert.deepEqual(getWindowBounds(backupDb), { x: 5, y: 6, width: 1000, height: 700 });
  backupDb.close();

  result.db.close();
  rmSync(filePath, { force: true });
  rmSync(result.preMigrationBackupPath, { force: true });
});

test("openDatabase: a failed migration rolls back completely, and the pre-migration backup can independently restore the same data", async () => {
  const filePath = tempDbPath();

  // Seed a real file at version 1 with one real row - like a DJ's saved
  // window position.
  const seedDb = new Database(filePath);
  runMigrations(seedDb, [migrations[0]]);
  saveWindowBounds(seedDb, { x: 10, y: 20, width: 1200, height: 800 });
  seedDb.close();

  // A migration 2 that creates a table and THEN throws, so a successful
  // rollback has to undo real work, not just skip a no-op.
  const brokenMigrations = [
    migrations[0],
    {
      version: 2,
      up(db) {
        db.exec("CREATE TABLE half_done (id INTEGER)");
        throw new Error("simulated failure partway through migration 2");
      }
    }
  ];

  let caughtErr;
  try {
    await openDatabase(filePath, brokenMigrations);
    assert.fail("expected openDatabase to throw for a failed migration");
  } catch (err) {
    caughtErr = err;
  }
  assert.ok(caughtErr instanceof MigrationFailedError);
  assert.ok(caughtErr.preMigrationBackupPath, "existing data must have been backed up before the attempt");
  assert.ok(existsSync(caughtErr.preMigrationBackupPath));

  // Rolled back for real: the file is still at version 1, the real row is
  // untouched, and the failing migration's own table did not survive.
  const after = new Database(filePath, { readonly: true });
  assert.equal(getSchemaVersion(after), 1);
  assert.deepEqual(getWindowBounds(after), { x: 10, y: 20, width: 1200, height: 800 });
  const halfDone = after
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'half_done'")
    .get();
  assert.equal(halfDone, undefined, "the failing migration's own table must not survive the rollback");
  after.close();

  // Independent of the transaction rollback above: the verified backup
  // taken before the attempt can ALSO restore this exact data on its own -
  // proving the backup is a real, working recovery path, not just a file
  // that happened to not matter this time.
  restoreFromBackup(caughtErr.preMigrationBackupPath, filePath);
  const restored = new Database(filePath, { readonly: true });
  assert.equal(getSchemaVersion(restored), 1);
  assert.deepEqual(getWindowBounds(restored), { x: 10, y: 20, width: 1200, height: 800 });
  restored.close();

  rmSync(filePath, { force: true });
  rmSync(caughtErr.preMigrationBackupPath, { force: true });
});
