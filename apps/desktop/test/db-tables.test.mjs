// Phase 5 SQLite milestone: the real migration list and the tables it creates
// (window_bounds, preferences). Every test works in its own temporary folder
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
      for (const table of ["schema_migrations", "window_bounds", "preferences"]) {
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
