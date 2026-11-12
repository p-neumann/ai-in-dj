// Phase 5, step 5 piece 12 (Stage 2a) - real sort behavior, confirmed
// directly against the source (handleSort/doSort), not guessed.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { handleSort, applySort, DEFAULT_SORT_STATE } = require("../src/renderer/src/shared/sortResults.ts");

function row(name, bpm, key) {
  return { name, bpm, key };
}

test("DEFAULT_SORT_STATE: starts unsorted - equally-strong matches aren't pre-ranked", () => {
  assert.equal(DEFAULT_SORT_STATE.field, "none");
  const rows = [row("Zebra", 100, "1A"), row("Apple", 200, "2A")];
  assert.deepEqual(applySort(rows, DEFAULT_SORT_STATE), rows);
});

test("handleSort: clicking a new column sorts it ascending", () => {
  const next = handleSort(DEFAULT_SORT_STATE, "bpm");
  assert.deepEqual(next, { field: "bpm", dir: "asc" });
});

test("handleSort: clicking the SAME column again toggles to descending, then back to ascending - never back to none", () => {
  let state = handleSort(DEFAULT_SORT_STATE, "name");
  assert.deepEqual(state, { field: "name", dir: "asc" });
  state = handleSort(state, "name");
  assert.deepEqual(state, { field: "name", dir: "desc" });
  state = handleSort(state, "name");
  assert.deepEqual(state, { field: "name", dir: "asc" }, "a third click toggles again, it never returns to unsorted");
});

test("applySort: name sorts lowercase-alphabetically", () => {
  const rows = [row("zebra", 1, "1A"), row("Apple", 1, "1A")];
  const sorted = applySort(rows, { field: "name", dir: "asc" });
  assert.deepEqual(sorted.map((r) => r.name), ["Apple", "zebra"]);
});

test("applySort: bpm sorts numerically, not as a string", () => {
  const rows = [row("a", 9, "1A"), row("b", 128, "1A"), row("c", 70, "1A")];
  const sorted = applySort(rows, { field: "bpm", dir: "asc" });
  assert.deepEqual(sorted.map((r) => r.bpm), [9, 70, 128], "a string sort would have put 128 before 70");
});

test("applySort: key sorts as a raw string, not Camelot-aware - ported exactly, not improved", () => {
  const rows = [row("a", 1, "10A"), row("b", 1, "2A")];
  const sorted = applySort(rows, { field: "key", dir: "asc" });
  assert.deepEqual(sorted.map((r) => r.key), ["10A", "2A"], "string comparison puts '10A' before '2A'");
});

test("applySort: desc reverses the comparison, not just the final array", () => {
  const rows = [row("a", 50, "1A"), row("b", 100, "1A"), row("c", 75, "1A")];
  const sorted = applySort(rows, { field: "bpm", dir: "desc" });
  assert.deepEqual(sorted.map((r) => r.bpm), [100, 75, 50]);
});
