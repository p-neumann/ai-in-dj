// Phase 5 SQLite milestone: initDatabase(dir, BASE), the startup sequence's
// database step (docs/design-notes/startup-database-init.md sections 3, 4
// and 6). Every test works in its own temporary folder under the OS temp
// directory and deletes it afterwards — never the real user-data folder.
//
// Every connection is closed before its folder is deleted: on Windows an open
// handle makes the cleanup in t.after fail (EBUSY), which fails the test.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { DB_FILE_NAME, initDatabase } from "../src/main/db/init.ts";
import { MIGRATIONS } from "../src/main/db/migrations.ts";
import { readSchemaVersion, tableRowCounts } from "../src/main/db/schema.ts";

// --- helpers ---------------------------------------------------------------

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "ccdj-init-test-"));
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

// Runs fn on a "ready" result and always closes its connection.
function useReady(result, fn) {
  try {
    assert.equal(result.status, "ready", `expected ready, got ${JSON.stringify(result)}`);
    return fn(result.db);
  } finally {
    if (result.status === "ready") result.db.close();
  }
}

const versionOf = (path) => withDb(path, readSchemaVersion, { readonly: true });

const tablesOf = (path) =>
  withDb(path, (db) => Object.keys(tableRowCounts(db)), { readonly: true });

// As in test/db-migrate.test.mjs: these tests run on the first migration
// only, so adding a table to MIGRATIONS does not change them.
const BASE = MIGRATIONS.slice(0, 1);

// Same test-only v2 as test/db-migrate.test.mjs.
const addNotes = {
  version: 2,
  name: "test: add notes",
  up(db) {
    db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)");
  }
};

// --- tests -----------------------------------------------------------------

test("a new nested folder is created and the database is ready at v1", async (t) => {
  const dir = join(tempDir(t), "database");
  const dbPath = join(dir, DB_FILE_NAME);

  const result = await initDatabase(dir, BASE);

  useReady(result, () => {
    assert.equal(result.path, dbPath);
    assert.deepEqual(result.migration, { status: "migrated", from: 0, to: 1, backupPath: null });
    assert.match(result.sqliteVersion, /^\d+\.\d+\.\d+$/);
    assert.ok(existsSync(dbPath));
  });
  assert.equal(versionOf(dbPath), 1);
});

test("a second run finds the database up to date", async (t) => {
  const dir = tempDir(t);
  useReady(await initDatabase(dir, BASE), () => {});

  // The file is now in WAL mode, so this also covers migrate()'s read-only
  // open of a WAL database.
  const result = await initDatabase(dir, BASE);

  useReady(result, () => {
    assert.deepEqual(result.migration, { status: "upToDate", version: 1 });
  });
});

test("the returned connection has WAL, synchronous FULL, foreign keys and the busy timeout", async (t) => {
  const result = await initDatabase(tempDir(t), BASE);

  useReady(result, (db) => {
    assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
    assert.equal(db.pragma("synchronous", { simple: true }), 2);
    assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
    assert.equal(db.pragma("busy_timeout", { simple: true }), 5000);
  });
});

test("an upgrade backs up rows that exist only in the -wal file", async (t) => {
  const dir = tempDir(t);
  const dbPath = join(dir, DB_FILE_NAME);
  useReady(await initDatabase(dir, BASE), () => {}); // v1, WAL

  // A second connection writes rows and stays open with automatic
  // checkpoints off, so the rows stay in -wal and out of the main file.
  const writer = new Database(dbPath);
  try {
    writer.pragma("wal_autocheckpoint = 0");
    writer.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT)");
    const insert = writer.prepare("INSERT INTO sample (value) VALUES (?)");
    for (const v of ["a", "b", "c"]) insert.run(v);

    const walSize = statSync(`${dbPath}-wal`).size;
    t.diagnostic(`-wal size before initDatabase: ${walSize} bytes`);
    assert.ok(walSize > 0, "-wal is empty: SQLite checkpointed the rows");

    // A copy of the main file alone, in its own folder, lacks the rows.
    const copyDir = join(dir, "main-file-only");
    mkdirSync(copyDir);
    const copyPath = join(copyDir, DB_FILE_NAME);
    copyFileSync(dbPath, copyPath);
    assert.ok(!tablesOf(copyPath).includes("sample"), "rows already reached the main file");

    const result = await initDatabase(dir, [...BASE, addNotes]);

    const backupPath = join(dir, "ccdj-db.v1.bak");
    useReady(result, (db) => {
      assert.deepEqual(result.migration, { status: "migrated", from: 1, to: 2, backupPath });
      assert.ok(Object.keys(tableRowCounts(db)).includes("notes"));
    });

    // The backup is v1 with the -wal rows, without the v2 change.
    assert.equal(versionOf(backupPath), 1);
    assert.deepEqual(
      withDb(backupPath, (db) => db.prepare("SELECT value FROM sample ORDER BY id").all(), {
        readonly: true
      }),
      [{ value: "a" }, { value: "b" }, { value: "c" }]
    );
    assert.ok(!tablesOf(backupPath).includes("notes"));

    // The backup is one self-contained file: no -wal/-shm beside it or its temp name.
    assert.deepEqual(
      readdirSync(dir).filter((f) => f.startsWith("ccdj-db.v1.bak")),
      ["ccdj-db.v1.bak"]
    );
    assert.equal(
      withDb(backupPath, (db) => db.pragma("journal_mode", { simple: true }), { readonly: true }),
      "delete"
    );
  } finally {
    writer.close();
  }
});

test("a database newer than this build is passed through as tooNew, unchanged", async (t) => {
  const dir = tempDir(t);
  const dbPath = join(dir, DB_FILE_NAME);
  useReady(await initDatabase(dir, [...BASE, addNotes]), () => {}); // a "newer build"
  const before = readFileSync(dbPath);
  const filesBefore = readdirSync(dir);

  const result = await initDatabase(dir, BASE); // an "older build"

  // deepEqual also proves no connection (db) is returned.
  assert.deepEqual(result, {
    status: "tooNew",
    path: dbPath,
    migration: { status: "tooNew", version: 2, maxReadable: 1 }
  });
  assert.ok(readFileSync(dbPath).equals(before), "database file bytes changed");
  // A read-only open of a WAL database may create -wal/-shm (design note
  // section 6), so the side files are recorded, not asserted.
  t.diagnostic(`files before: ${filesBefore.join(", ")}`);
  t.diagnostic(`files after:  ${readdirSync(dir).join(", ")}`);
  assert.equal(versionOf(dbPath), 2);
  assert.ok(tablesOf(dbPath).includes("notes"));
});

test("a damaged file is an error at the migrate stage, left unchanged", async (t) => {
  const dir = tempDir(t);
  const dbPath = join(dir, DB_FILE_NAME);
  writeFileSync(dbPath, "this is not a sqlite database, just some bytes ".repeat(100));
  const before = readFileSync(dbPath);

  const result = await initDatabase(dir, BASE);

  assert.equal(result.status, "error");
  assert.equal(result.stage, "migrate");
  assert.equal(result.path, dbPath);
  assert.match(result.error, /not a database/);
  assert.ok(!("db" in result));
  assert.ok(readFileSync(dbPath).equals(before), "file bytes changed");
  t.diagnostic(`files after: ${readdirSync(dir).join(", ")}`);
  // On Windows, deleting a file that a connection still holds open fails
  // (EBUSY), so this proves no handle was left behind.
  assert.doesNotThrow(() => rmSync(dbPath));
});

test("a folder path that is an existing file is an error at the createFolder stage", async (t) => {
  const notAFolder = join(tempDir(t), "database");
  writeFileSync(notAFolder, "a file where the folder should be");

  const result = await initDatabase(notAFolder);

  assert.equal(result.status, "error");
  assert.equal(result.stage, "createFolder");
  assert.equal(result.path, join(notAFolder, DB_FILE_NAME));
  assert.ok(result.error.length > 0);
  assert.equal(readFileSync(notAFolder, "utf8"), "a file where the folder should be");
});
