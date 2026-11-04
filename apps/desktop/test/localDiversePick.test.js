// Phase 5, step 5 piece 6.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { localDiversePick } = require("../src/renderer/src/playlistCheat/localDiversePick.ts");

function track(id, displayName) {
  return { id, displayName };
}

test("localDiversePick: picks N items, preferring different version descriptors over repeats", () => {
  const cands = [
    track(1, "Song (Extended)"),
    track(2, "Song (Extended) [v2]"),
    track(3, "Song (Clean)"),
    track(4, "Song (Redrum)")
  ];
  const picked = localDiversePick(cands, 2);
  assert.equal(picked.length, 2);
  // The two "Extended" variants share a descriptor word - picking both
  // first would be the least diverse choice available, so at least one
  // non-Extended pick should appear among the top 2.
  const ids = picked.map((t) => t.id);
  assert.ok(ids.includes(3) || ids.includes(4));
});

test("localDiversePick: never returns more than the pool actually has", () => {
  const cands = [track(1, "Song (Clean)")];
  assert.equal(localDiversePick(cands, 5).length, 1);
});

test("localDiversePick: with no version-tag differences at all, falls back to remix-priority order", () => {
  const cands = [track(1, "Song (Redrum)"), track(2, "Song (Extended)")];
  const picked = localDiversePick(cands, 2);
  assert.equal(picked[0].id, 2); // "extended" ranks ahead of "redrum" in REMIX_KEYWORDS_ORDERED
});
