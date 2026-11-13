// Phase 5, step 5 piece 15 (Playlist Cheat Vibe Prompt, 2026-11-12).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { getEditDescriptor, typeTokenMatches, detectStyleTypeLock, getSavedStyleProfile } = require("../src/renderer/src/playlistCheat/typeLock.ts");
const { buildCandidatePools } = require("../src/renderer/src/playlistCheat/buildCandidatePools.ts");

test("getEditDescriptor: pulls the bracketed edit tag, lowercased", () => {
  assert.equal(getEditDescriptor("Daft Punk - One More Time (Redrum)"), "(redrum)");
  assert.equal(getEditDescriptor("Blackstreet - No Diggity"), "");
});

test("typeTokenMatches: matches singular/plural either direction", () => {
  assert.equal(typeTokenMatches("(redrum)", "redrum"), true);
  assert.equal(typeTokenMatches("(redrums)", "redrum"), true);
  assert.equal(typeTokenMatches("(acapella)", "redrum"), false);
});

test("detectStyleTypeLock: 'only X' leading phrasing", () => {
  assert.deepEqual(detectStyleTypeLock("only play redrums"), ["redrums"]);
});

test("detectStyleTypeLock: 'X only' trailing phrasing", () => {
  // "redrums" itself isn't a generic type word (version/remix/edit), so
  // it's kept as typed, plural intact - typeTokenMatches (not detection)
  // is what handles singular/plural when comparing against edit tags.
  assert.deepEqual(detectStyleTypeLock("redrums only"), ["redrums"]);
});

test("detectStyleTypeLock: no type language returns null", () => {
  assert.equal(detectStyleTypeLock("give me more energy"), null);
});

test("getSavedStyleProfile: no DOM/localStorage in this test runner returns empty, not a crash", () => {
  assert.equal(getSavedStyleProfile(), "");
});

test("buildCandidatePools: with a type lock, a song with no matching edit returns zero matches honestly", () => {
  const library = [
    { id: 1, displayName: "Daft Punk - One More Time (Redrum)", artist: "Daft Punk", bpm: 123, key: "4A" },
    { id: 2, displayName: "Daft Punk - One More Time (Acapella)", artist: "Daft Punk", bpm: 123, key: "4A" }
  ];
  const sourceTracks = [{ artist: "Daft Punk", name: "One More Time" }];

  const noLock = buildCandidatePools(sourceTracks, library);
  assert.equal(noLock[0].dedupedCandidates.length, 2);

  const withLock = buildCandidatePools(sourceTracks, library, ["redrum"]);
  assert.deepEqual(withLock[0].dedupedCandidates.map((t) => t.id), [1]);

  const withNoMatchingLock = buildCandidatePools(sourceTracks, library, ["moombahton"]);
  assert.equal(withNoMatchingLock[0].dedupedCandidates.length, 0);
});
