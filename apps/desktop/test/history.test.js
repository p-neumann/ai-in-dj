// Phase 5, step 4 - the generic history log. Real better-sqlite3, same
// pattern as the rest of this test suite.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { runMigrations } = require("../src/main/db/migrate.ts");
const { appendHistoryEntry, listHistory } = require("../src/main/db/history.ts");

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
