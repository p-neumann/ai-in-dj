// Phase 5, step 5 piece 20 (History panel, Piece A - recording,
// 2026-11-14).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { buildHistorySeedEntry, patchResultOutcome } = require("../src/renderer/src/trackCheat/historyEntry.ts");

test("buildHistorySeedEntry: pulls bpm/key/genre/year from the real library row when one was resolved", () => {
  const seedTrack = { displayName: "Daft Punk - One More Time", bpm: 123, key: "4A", genre: "house", year: 2000 };
  const entry = buildHistorySeedEntry(seedTrack, "fallback name", -3, 0, "search");
  assert.deepEqual(entry.seed, { name: "Daft Punk - One More Time", bpm: 123, key: "4A", genre: "house", year: 2000 });
  assert.equal(entry.vibeOffset, -3);
  assert.equal(entry.energyOffset, 0);
  assert.equal(entry.trigger, "search");
  assert.equal(entry.resultStatus, "pending");
  assert.deepEqual(entry.results, []);
  assert.equal(entry.note, null);
});

test("buildHistorySeedEntry: no resolved seed track falls back to the given name, nulls for the rest", () => {
  const entry = buildHistorySeedEntry(null, "track 42", 0, 5, "freshSeed");
  assert.deepEqual(entry.seed, { name: "track 42", bpm: null, key: null, genre: null, year: null });
});

test("patchResultOutcome: updates only the matching trackId's outcome, leaves the rest alone", () => {
  const results = [
    { trackId: 1, name: "A", bpm: 120, key: "1A", outcome: "shown" },
    { trackId: 2, name: "B", bpm: 128, key: "2A", outcome: "shown" }
  ];
  const next = patchResultOutcome(results, 2, "up");
  assert.equal(next[0].outcome, "shown");
  assert.equal(next[1].outcome, "up");
  assert.notEqual(next, results, "returns a new array, doesn't mutate in place");
});

test("patchResultOutcome: an un-vote (nextValue null -> caller passes 'shown') resets the outcome back to shown", () => {
  const results = [{ trackId: 1, name: "A", bpm: 120, key: "1A", outcome: "up" }];
  const next = patchResultOutcome(results, 1, "shown");
  assert.equal(next[0].outcome, "shown");
});

test("patchResultOutcome: an unknown trackId changes nothing", () => {
  const results = [{ trackId: 1, name: "A", bpm: 120, key: "1A", outcome: "shown" }];
  const next = patchResultOutcome(results, 999, "up");
  assert.deepEqual(next, results);
});
