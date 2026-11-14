// Phase 5, step 4 - the generic history log. Real better-sqlite3, same
// pattern as the rest of this test suite.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { runMigrations } = require("../src/main/db/migrate.ts");
const { appendHistoryEntry, updateHistoryEntry, listHistory } = require("../src/main/db/history.ts");

test("history: an appended entry round-trips with the exact same shape, not just a string", () => {
  const db = new Database(":memory:");
  runMigrations(db);

  appendHistoryEntry(db, { note: "hello", nested: { a: 1, b: [1, 2, 3] } });
  const rows = listHistory(db, 10);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].entry, { note: "hello", nested: { a: 1, b: [1, 2, 3] } });
  assert.equal(typeof rows[0].timestamp, "number");
  db.close();
});

test("history: listHistory returns newest first, and respects the limit", () => {
  const db = new Database(":memory:");
  runMigrations(db);

  appendHistoryEntry(db, { n: 1 });
  appendHistoryEntry(db, { n: 2 });
  appendHistoryEntry(db, { n: 3 });

  const rows = listHistory(db, 2);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].entry, { n: 3 }, "most recent entry comes first");
  assert.deepEqual(rows[1].entry, { n: 2 });
  db.close();
});

// Piece 20 (History panel, Piece A, 2026-11-14).
test("appendHistoryEntry: returns the new row's real id", () => {
  const db = new Database(":memory:");
  runMigrations(db);

  const id1 = appendHistoryEntry(db, { n: "first" });
  const id2 = appendHistoryEntry(db, { n: "second" });
  assert.equal(typeof id1, "number");
  assert.ok(id2 > id1, "ids increase, so a later append can never collide with an earlier one");
  db.close();
});

test("updateHistoryEntry: shallow-merges the patch into the existing entry, leaving untouched fields alone", () => {
  const db = new Database(":memory:");
  runMigrations(db);

  const id = appendHistoryEntry(db, { seedName: "Song A", resultStatus: "pending", results: [] });
  const ok = updateHistoryEntry(db, id, { resultStatus: "ok", results: [{ trackId: 1, outcome: "shown" }] });
  assert.equal(ok, true);

  const [row] = listHistory(db, 1);
  assert.equal(row.entry.seedName, "Song A", "a field not in the patch survives untouched");
  assert.equal(row.entry.resultStatus, "ok");
  assert.deepEqual(row.entry.results, [{ trackId: 1, outcome: "shown" }]);
  db.close();
});

test("updateHistoryEntry: a second patch only overwrites the keys it names, not the whole entry", () => {
  const db = new Database(":memory:");
  runMigrations(db);

  const id = appendHistoryEntry(db, { seedName: "Song A", note: null, results: [{ trackId: 1, outcome: "shown" }] });
  updateHistoryEntry(db, id, { note: "crowd loved this one" });

  const [row] = listHistory(db, 1);
  assert.equal(row.entry.note, "crowd loved this one");
  assert.deepEqual(row.entry.results, [{ trackId: 1, outcome: "shown" }], "patching note alone must not drop results");
  db.close();
});

test("updateHistoryEntry: an unknown id is a no-op, reported honestly as false, not a crash", () => {
  const db = new Database(":memory:");
  runMigrations(db);

  const ok = updateHistoryEntry(db, 9999, { note: "x" });
  assert.equal(ok, false);
  db.close();
});
