// Phase 5 SQLite milestone: migration runner and pre-migration backup
// (CLAUDE.md Section 6.2). Every test works in its own temporary folder under
// the OS temp directory and deletes it afterwards — never the real user
// database, which is not created by this step at all.
//
// Runs under plain Node with --experimental-strip-types (see package.json),
// loading the TypeScript source directly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { migrate, assertValidMigrations } from "../src/main/db/migrate.ts";
import { MIGRATIONS } from "../src/main/db/migrations.ts";
import { backupPathFor, createVerifiedBackup, verifyBackup } from "../src/main/db/backup.ts";
import { readSchemaVersion, tableRowCounts } from "../src/main/db/schema.ts";

// --- helpers ---------------------------------------------------------------

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "ccdj-migrate-test-"));
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

const versionOf = (path) => withDb(path, readSchemaVersion, { readonly: true });

const tablesOf = (path) =>
  withDb(path, (db) => Object.keys(tableRowCounts(db)), { readonly: true });

// A test-only v2 that adds a table, so upgrades can be exercised before the
// app has a real second migration.
const addNotes = {
  version: 2,
  name: "test: add notes",
  up(db) {
    db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)");
  }
};

// Builds a database at v1 holding three rows of data in a "sample" table.
async function v1WithData(dir) {
  const dbPath = join(dir, "ccdj-db.sqlite");
  const result = await migrate(dbPath, MIGRATIONS);
  assert.equal(result.status, "migrated");
  withDb(dbPath, (db) => {
    db.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT)");
    const insert = db.prepare("INSERT INTO sample (value) VALUES (?)");
    for (const v of ["a", "b", "c"]) insert.run(v);
  });
  return dbPath;
}

// --- tests -----------------------------------------------------------------

test("a new database is created and migrated to the current version", async (t) => {
  const dbPath = join(tempDir(t), "ccdj-db.sqlite");

  const result = await migrate(dbPath);

  assert.deepEqual(result, { status: "migrated", from: 0, to: 1, backupPath: null });
  assert.equal(versionOf(dbPath), 1);
  const rows = withDb(dbPath, (db) => db.prepare("SELECT version, name FROM schema_migrations").all());
  assert.deepEqual(rows, [{ version: 1, name: "create schema_migrations" }]);
});

test("running again on a current database changes nothing", async (t) => {
  const dir = tempDir(t);
  const dbPath = join(dir, "ccdj-db.sqlite");
  await migrate(dbPath);
  const before = readFileSync(dbPath);
  const filesBefore = readdirSync(dir);

  const result = await migrate(dbPath);

  assert.deepEqual(result, { status: "upToDate", version: 1 });
  assert.ok(readFileSync(dbPath).equals(before), "database file bytes changed");
  assert.deepEqual(readdirSync(dir), filesBefore);
});

test("an upgrade makes a verified backup of the old version first", async (t) => {
  const dir = tempDir(t);
  const dbPath = await v1WithData(dir);

  const result = await migrate(dbPath, [...MIGRATIONS, addNotes]);

  const expectedBackup = join(dir, "ccdj-db.v1.bak");
  assert.deepEqual(result, { status: "migrated", from: 1, to: 2, backupPath: expectedBackup });
  assert.equal(versionOf(dbPath), 2);
  assert.ok(tablesOf(dbPath).includes("notes"));

  // The backup is the v1 database, data included, without the v2 change.
  assert.equal(versionOf(expectedBackup), 1);
  assert.deepEqual(
    withDb(expectedBackup, (db) => db.prepare("SELECT value FROM sample ORDER BY id").all(), {
      readonly: true
    }),
    [{ value: "a" }, { value: "b" }, { value: "c" }]
  );
  assert.ok(!tablesOf(expectedBackup).includes("notes"));
  assert.ok(!readdirSync(dir).some((f) => f.endsWith(".tmp")), "temporary backup left behind");
});

test("a database newer than this build is refused and not written", async (t) => {
  const dir = tempDir(t);
  const dbPath = join(dir, "ccdj-db.sqlite");
  await migrate(dbPath, [...MIGRATIONS, addNotes]); // written by a "newer build"
  const before = readFileSync(dbPath);
  const filesBefore = readdirSync(dir);

  const result = await migrate(dbPath, MIGRATIONS); // opened by an "older build"

  assert.deepEqual(result, { status: "tooNew", version: 2, maxReadable: 1 });
  assert.ok(readFileSync(dbPath).equals(before), "database file bytes changed");
  assert.deepEqual(readdirSync(dir), filesBefore, "files were added or removed");
});

test("a failing migration leaves the database at its old version, data intact", async (t) => {
  const dir = tempDir(t);
  const dbPath = await v1WithData(dir);
  const explode = {
    version: 3,
    name: "test: fails",
    up() {
      throw new Error("boom");
    }
  };

  const result = await migrate(dbPath, [...MIGRATIONS, addNotes, explode]);

  assert.equal(result.status, "migrationFailed");
  assert.equal(result.version, 1);
  assert.equal(result.failedAt, 3);
  assert.match(result.error, /boom/);
  // Migration 2 ran before 3 failed; one transaction means it was rolled back too.
  assert.equal(versionOf(dbPath), 1);
  assert.ok(!tablesOf(dbPath).includes("notes"));
  assert.deepEqual(
    withDb(dbPath, (db) => tableRowCounts(db), { readonly: true }),
    { sample: 3, schema_migrations: 1 }
  );
  // The backup taken beforehand is still there and verified.
  assert.equal(result.backupPath, join(dir, "ccdj-db.v1.bak"));
  assert.equal(versionOf(result.backupPath), 1);
});

test("a failing first migration on a new file leaves no file behind", async (t) => {
  const dir = tempDir(t);
  const dbPath = join(dir, "ccdj-db.sqlite");
  const broken = [{ version: 1, name: "test: fails", up() { throw new Error("boom"); } }];

  const result = await migrate(dbPath, broken);

  assert.equal(result.status, "migrationFailed");
  assert.equal(result.backupPath, null);
  assert.ok(!existsSync(dbPath));
});

test("a backup that fails blocks the migration", async (t) => {
  const dir = tempDir(t);
  const dbPath = await v1WithData(dir);
  const before = readFileSync(dbPath);

  const result = await migrate(dbPath, [...MIGRATIONS, addNotes], {
    backup: async () => {
      throw new Error("disk full");
    }
  });

  assert.deepEqual(result, { status: "backupFailed", version: 1, error: "disk full" });
  assert.equal(versionOf(dbPath), 1);
  assert.ok(!tablesOf(dbPath).includes("notes"));
  assert.ok(readFileSync(dbPath).equals(before), "database file bytes changed");
});

test("verification rejects a copy whose rows differ from the source", async (t) => {
  const dir = tempDir(t);
  const dbPath = await v1WithData(dir);
  const source = new Database(dbPath, { readonly: true });
  let backupPath;
  try {
    backupPath = await createVerifiedBackup(source, dbPath, 1);
  } finally {
    source.close();
  }
  withDb(backupPath, (db) => db.exec("DELETE FROM sample WHERE value = 'c'"));

  assert.throws(
    () => verifyBackup(backupPath, { version: 1, rowCounts: { sample: 3, schema_migrations: 1 } }),
    /row count mismatch in "sample": 2 vs 3/
  );
  assert.throws(
    () => verifyBackup(backupPath, { version: 2, rowCounts: { sample: 2, schema_migrations: 1 } }),
    /schema version 1, expected 2/
  );
});

test("verification rejects a file that is not a database", (t) => {
  const path = join(tempDir(t), "garbage.bak");
  writeFileSync(path, "this is not a sqlite database, just some bytes ".repeat(100));

  assert.throws(() => verifyBackup(path, { version: 1, rowCounts: {} }));
});

test("backup names follow CLAUDE.md 6.2 (ccdj-db.v<old-schema>.bak)", () => {
  assert.equal(backupPathFor(join("x", "ccdj-db.sqlite"), 4), join("x", "ccdj-db.v4.bak"));
});

test("the migration list must be contiguous from 1 and named", () => {
  assert.doesNotThrow(() => assertValidMigrations(MIGRATIONS));
  assert.throws(() => assertValidMigrations([]), /empty/);
  assert.throws(() => assertValidMigrations([addNotes]), /contiguous/);
  assert.throws(
    () => assertValidMigrations([{ ...MIGRATIONS[0], name: " " }]),
    /no name/
  );
});
