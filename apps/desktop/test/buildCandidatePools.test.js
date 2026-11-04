// Phase 5, step 5 piece 6.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { buildCandidatePools } = require("../src/renderer/src/playlistCheat/buildCandidatePools.ts");

function track(overrides) {
  return { id: 1, displayName: "", artist: "", title: "", bpm: 0, key: "", genre: "", year: 0, playcount: null, ...overrides };
}

test("buildCandidatePools: matches by title and artist words, case/accent-insensitive", () => {
  const lib = [track({ id: 1, displayName: "Beyonce - Crazy In Love (Clean)", artist: "Beyonce" })];
  const pools = buildCandidatePools([{ artist: "Beyoncé", name: "Crazy In Love" }], lib);
  assert.equal(pools[0].dedupedCandidates.length, 1);
  assert.equal(pools[0].dedupedCandidates[0].id, 1);
});

test("buildCandidatePools: rejects a title match when the artist does not match", () => {
  const lib = [track({ id: 1, displayName: "Someone Else - Crazy In Love", artist: "Someone Else" })];
  const pools = buildCandidatePools([{ artist: "Beyonce", name: "Crazy In Love" }], lib);
  assert.equal(pools[0].dedupedCandidates.length, 0);
});

test("buildCandidatePools: dedupes version-tag variants of the same underlying edit down to one", () => {
  const lib = [
    track({ id: 1, displayName: "Beyonce - Crazy In Love [Clean]", artist: "Beyonce" }),
    track({ id: 2, displayName: "Beyonce - Crazy In Love [Clean] [Short Edit]", artist: "Beyonce" }),
    // "Redrum" is not one of normalizeForDedup's recognized tags, so this
    // one is NOT stripped and stays distinct from the two above -
    // confirmed directly against the real regex before writing this
    // expectation, not assumed.
    track({ id: 3, displayName: "Beyonce - Crazy In Love [Redrum]", artist: "Beyonce" })
  ];
  const pools = buildCandidatePools([{ artist: "Beyonce", name: "Crazy In Love" }], lib);
  // id 1 and 2 collapse to the same normalized-for-dedup name; id 3 (a
  // different, unrecognized-tag edit) survives as a distinct candidate.
  assert.equal(pools[0].dedupedCandidates.length, 2);
  assert.deepEqual(pools[0].dedupedCandidates.map((t) => t.id), [1, 3]);
});

test("buildCandidatePools: concatenated-title fallback matches split-word vs. merged-word conventions", () => {
  const lib = [track({ id: 1, displayName: "Lady Gaga - LoveGame", artist: "Lady Gaga" })];
  const pools = buildCandidatePools([{ artist: "Lady Gaga", name: "Love Game" }], lib);
  assert.equal(pools[0].dedupedCandidates.length, 1);
});

test("buildCandidatePools: alternate-title-in-parens fallback matches a song filed under its subtitle", () => {
  const lib = [track({ id: 1, displayName: "Pitbull - Calle Ocho", artist: "Pitbull" })];
  const pools = buildCandidatePools([{ artist: "Pitbull", name: "I Know You Want Me (Calle Ocho)" }], lib);
  assert.equal(pools[0].dedupedCandidates.length, 1);
});

test("buildCandidatePools: a multi-word artist must match ALL words, not just one", () => {
  const lib = [
    track({ id: 1, displayName: "Jay-Z - Title Match Song", artist: "Jay-Z" }),
    track({ id: 2, displayName: "Jay Sean - Title Match Song", artist: "Jay Sean" })
  ];
  const pools = buildCandidatePools([{ artist: "Jay Sean", name: "Title Match Song" }], lib);
  assert.deepEqual(pools[0].dedupedCandidates.map((t) => t.id), [2]);
});

test("buildCandidatePools: a source track with no usable title words returns zero candidates, no crash", () => {
  const lib = [track({ id: 1, displayName: "Someone - The It Is", artist: "Someone" })];
  const pools = buildCandidatePools([{ artist: "", name: "" }], lib);
  assert.equal(pools[0].dedupedCandidates.length, 0);
});

test("buildCandidatePools: an empty library returns zero candidates for every source track", () => {
  const pools = buildCandidatePools([{ artist: "Beyonce", name: "Crazy In Love" }], []);
  assert.equal(pools[0].dedupedCandidates.length, 0);
});
