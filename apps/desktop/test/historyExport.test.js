// Phase 5, step 5 piece 7 (Settings).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { formatHistoryAsJson, formatHistoryAsCsv } = require("../src/renderer/src/settings/historyExport.ts");

const ROWS = [
  { id: 1, timestamp: 1700000000000, entry: { seedName: "Song A", trigger: "freshSeed", resultCount: 10 } },
  { id: 2, timestamp: 1700000100000, entry: { seedName: 'Has, a comma "and quotes"', trigger: "daisyChain", resultCount: 3 } }
];

test("formatHistoryAsJson: valid JSON that parses back to the same rows", () => {
  assert.deepEqual(JSON.parse(formatHistoryAsJson(ROWS)), ROWS);
});

test("formatHistoryAsJson: an empty list is a valid empty JSON array", () => {
  assert.equal(formatHistoryAsJson([]), "[]");
});

test("formatHistoryAsCsv: one header row plus one row per entry", () => {
  const lines = formatHistoryAsCsv(ROWS).split("\n");
  assert.equal(lines[0], "id,timestamp,entry");
  assert.equal(lines.length, 3);
});

test("formatHistoryAsCsv: a field containing a comma and quotes is wrapped and its quotes doubled, per CSV quoting", () => {
  const csv = formatHistoryAsCsv(ROWS);
  const lastLine = csv.split("\n")[2];
  // Confirmed directly against the real output before writing this
  // expectation, not assumed: the field is wrapped in quotes (because it
  // contains a comma), and every literal double-quote inside it -
  // including the backslash-quote pairs JSON.stringify itself produced -
  // is doubled, which is what makes it safe to re-parse as one field.
  assert.ok(lastLine.startsWith('2,2023-11-14T22:15:00.000Z,"'));
  assert.ok(lastLine.endsWith('"'));
  assert.ok(lastLine.includes('\\""and quotes\\""'));
});

test("formatHistoryAsCsv: an empty list is just the header", () => {
  assert.equal(formatHistoryAsCsv([]), "id,timestamp,entry");
});
