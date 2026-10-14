// Phase 5 SQLite milestone: the long-lived connection's settings
// (docs/decisions/0007 item 5). Every test works in its own temporary folder
// under the OS temp directory and deletes it afterwards — never the real
// user-data folder.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { BUSY_TIMEOUT_MS, openDatabase } from "../src/main/db/connection.ts";

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "ccdj-connection-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function withOpen(path, fn) {
  const db = openDatabase(path);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

test("a new database opens in WAL mode", (t) => {
  const dbPath = join(tempDir(t), "ccdj-db.sqlite");
  withOpen(dbPath, (db) => {
    assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
  });
});

test("synchronous is FULL (2)", (t) => {
  const dbPath = join(tempDir(t), "ccdj-db.sqlite");
  withOpen(dbPath, (db) => {
    assert.equal(db.pragma("synchronous", { simple: true }), 2);
  });
});

test("the busy timeout is 5000 ms", (t) => {
  const dbPath = join(tempDir(t), "ccdj-db.sqlite");
  assert.equal(BUSY_TIMEOUT_MS, 5000);
  withOpen(dbPath, (db) => {
    assert.equal(db.pragma("busy_timeout", { simple: true }), 5000);
  });
});

test("foreign keys are on and actually enforced", (t) => {
  const dbPath = join(tempDir(t), "ccdj-db.sqlite");
  withOpen(dbPath, (db) => {
    assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id));
    `);
    db.prepare("INSERT INTO parent (id) VALUES (1)").run();
    db.prepare("INSERT INTO child (parent_id) VALUES (1)").run();
    assert.throws(
      () => db.prepare("INSERT INTO child (parent_id) VALUES (99)").run(),
      /FOREIGN KEY constraint failed/
    );
  });
});

test("WAL persists after closing, but synchronous=FULL must be set on every open", (t) => {
  const dbPath = join(tempDir(t), "ccdj-db.sqlite");
  withOpen(dbPath, () => {});

  // A plain connection that skips openDatabase(). The journal mode is stored
  // in the file, so it is still WAL. The other settings come from this
  // better-sqlite3 build's compile-time defaults (docs/compilation.md:
  // SQLITE_DEFAULT_WAL_SYNCHRONOUS=1, SQLITE_DEFAULT_FOREIGN_KEYS=1), which
  // differ from plain SQLite's: synchronous falls back to NORMAL (1) in WAL
  // mode, and foreign keys are on.
  const plain = new Database(dbPath);
  try {
    assert.equal(plain.pragma("journal_mode", { simple: true }), "wal");
    assert.equal(plain.pragma("synchronous", { simple: true }), 1);
    assert.equal(plain.pragma("foreign_keys", { simple: true }), 1);
  } finally {
    plain.close();
  }

  // Reopening through openDatabase() restores the intended settings.
  withOpen(dbPath, (db) => {
    assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
    assert.equal(db.pragma("synchronous", { simple: true }), 2);
    assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
    assert.equal(db.pragma("busy_timeout", { simple: true }), 5000);
  });
});

test("a file that is not a database is rejected and left unchanged", (t) => {
  const path = join(tempDir(t), "garbage.sqlite");
  writeFileSync(path, "this is not a sqlite database, just some bytes ".repeat(100));
  const before = readFileSync(path);

  assert.throws(() => openDatabase(path));
  assert.ok(readFileSync(path).equals(before), "file bytes changed");
  // If the failed open had left the file open, the temp-folder cleanup in
  // t.after would fail on Windows (EBUSY).
});
