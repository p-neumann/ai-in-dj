// Phase 5, step 5 piece 22 (History panel readability fix, 2026-11-13).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { summarizeHistoryEntry, filterHistoryRows } = require("../src/renderer/src/settings/historySummary.ts");

test("summarizeHistoryEntry: pulls seed name, trigger, resultStatus, and tallies outcomes", () => {
  const entry = {
    seed: { name: "Daft Punk - One More Time" },
    trigger: "search",
    resultStatus: "ok",
    results: [
      { trackId: 1, outcome: "shown" },
      { trackId: 2, outcome: "up" },
      { trackId: 3, outcome: "down" },
      { trackId: 4, outcome: "up" }
    ]
  };
  const summary = summarizeHistoryEntry(entry);
  assert.equal(summary.seedName, "Daft Punk - One More Time");
  assert.equal(summary.trigger, "search");
  assert.equal(summary.resultStatus, "ok");
  assert.equal(summary.resultCount, 4);
  assert.equal(summary.shownCount, 1);
  assert.equal(summary.upCount, 2);
  assert.equal(summary.downCount, 1);
});

test("summarizeHistoryEntry: an empty results array (pending/empty entries) summarizes as zero counts, not a crash", () => {
  const summary = summarizeHistoryEntry({ seed: { name: "X" }, trigger: "freshSeed", resultStatus: "pending", results: [] });
  assert.equal(summary.resultCount, 0);
  assert.equal(summary.shownCount, 0);
  assert.equal(summary.upCount, 0);
  assert.equal(summary.downCount, 0);
});

test("summarizeHistoryEntry: a foreign/unrecognized entry shape gets honest fallbacks, not a crash", () => {
  assert.deepEqual(summarizeHistoryEntry(null), {
    seedName: "(unrecognized entry)",
    trigger: "-",
    resultStatus: "-",
    resultCount: 0,
    shownCount: 0,
    upCount: 0,
    downCount: 0
  });
  assert.deepEqual(summarizeHistoryEntry("just a string"), {
    seedName: "(unrecognized entry)",
    trigger: "-",
    resultStatus: "-",
    resultCount: 0,
    shownCount: 0,
    upCount: 0,
    downCount: 0
  });
  const summary = summarizeHistoryEntry({ n: 1 });
  assert.equal(summary.seedName, "(no seed)");
  assert.equal(summary.trigger, "-");
});

test("filterHistoryRows: an empty query returns every row untouched", () => {
  const rows = [
    { id: 1, timestamp: 0, entry: { seed: { name: "A" }, trigger: "search" } },
    { id: 2, timestamp: 0, entry: { seed: { name: "B" }, trigger: "daisyChain" } }
  ];
  assert.deepEqual(filterHistoryRows(rows, ""), rows);
  assert.deepEqual(filterHistoryRows(rows, "   "), rows);
});

test("filterHistoryRows: matches the seed name case-insensitively", () => {
  const rows = [
    { id: 1, timestamp: 0, entry: { seed: { name: "Kanye West - I Love It" }, trigger: "search" } },
    { id: 2, timestamp: 0, entry: { seed: { name: "Hanson - Mmm Bop" }, trigger: "search" } }
  ];
  const result = filterHistoryRows(rows, "kanye");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 1);
});

test("filterHistoryRows: matches the trigger too, so 'every search-triggered one' is findable", () => {
  const rows = [
    { id: 1, timestamp: 0, entry: { seed: { name: "A" }, trigger: "search" } },
    { id: 2, timestamp: 0, entry: { seed: { name: "B" }, trigger: "daisyChain" } }
  ];
  const result = filterHistoryRows(rows, "daisy");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 2);
});

test("filterHistoryRows: no matches returns an empty array, not an error", () => {
  const rows = [{ id: 1, timestamp: 0, entry: { seed: { name: "A" }, trigger: "search" } }];
  assert.deepEqual(filterHistoryRows(rows, "nonexistent"), []);
});
