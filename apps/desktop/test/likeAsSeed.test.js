// Phase 5, step 5 piece 17 (👍 thumbs-up reseed, 2026-11-13). Ported
// from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx's handleLikeAsSeed
// (source 2489-2546). Verifies the real, confirmed behavior: exact
// title-only match, BPM window, genre priority by vibe sign, the
// 10-cap sorted by BPM, and the empty case.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { buildLikeAsSeedMatches } = require("../src/renderer/src/trackCheat/likeAsSeed.ts");

function track(id, displayName, bpm, key, genre) {
  return { id, displayName, artist: "", title: "", bpm, key, genre: genre || "", year: 0, playcount: 0 };
}

test("title match is exact (minus version tags), artist credit on the match is irrelevant", () => {
  const library = [
    track(1, "Daft Punk - One More Time", 123, "4A", "house"),
    track(2, "Daft Punk - One More Time (Redrum)", 123, "4A", "house"),
    track(3, "Will.i.am & Britney Spears - Scream & Shout", 130, "5A", "pop"),
    track(4, "will.i.am, Britney Spears, Diddy & Waka Flocka - Scream & Shout (Remix)", 128, "5A", "pop")
  ];
  const matches = buildLikeAsSeedMatches("Daft Punk - One More Time", library, 0, 0);
  assert.deepEqual(matches.map((m) => m.trackId), [2]);

  // Different artist credits on a remix of the SAME title still match.
  const matches2 = buildLikeAsSeedMatches("Will.i.am & Britney Spears - Scream & Shout", library, 0, 0);
  assert.deepEqual(matches2.map((m) => m.trackId), [4]);
});

test("the seed track itself is never included in its own matches", () => {
  const library = [track(1, "Song - Title", 120, "1A", "house"), track(2, "Song - Title (Extended)", 120, "1A", "house")];
  const matches = buildLikeAsSeedMatches("Song - Title", library, 0, 0);
  assert.equal(matches.some((m) => m.trackId === 1), false);
});

test("no other versions in the library returns an empty array (screen shows the literal text for this)", () => {
  const library = [track(1, "Only One Version - Here", 120, "1A", "house")];
  assert.deepEqual(buildLikeAsSeedMatches("Only One Version - Here", library, 0, 0), []);
});

test("BPM window from getBpmRange still applies among same-title matches", () => {
  const library = [
    track(1, "Seed - Title", 120, "1A", "house"),
    track(2, "Seed - Title (Slow Edit)", 90, "1A", "house"), // outside vibe 0's +-8 window
    track(3, "Seed - Title (Club Mix)", 124, "1A", "house") // inside the window
  ];
  const matches = buildLikeAsSeedMatches("Seed - Title", library, 0, 0);
  assert.deepEqual(matches.map((m) => m.trackId), [3]);
});

test("negative vibe hard-locks toward the seed's genre family among same-title matches", () => {
  // Needs >=3 genre-matching candidates for the hard lock to actually
  // apply - his own code has a real safety valve (source ~2297-2333,
  // ported in applyGenreWall.ts) that gives up and returns everything
  // unfiltered if fewer than 3 candidates would match even a broadened
  // genre net, so a too-small candidate set can't tell this case apart
  // from "did nothing."
  const library = [
    track(1, "Seed - Title", 120, "1A", "house"),
    track(2, "Seed - Title (House Mix A)", 121, "1A", "house"),
    track(3, "Seed - Title (House Mix B)", 122, "1A", "house"),
    track(4, "Seed - Title (House Mix C)", 123, "1A", "house"),
    track(5, "Seed - Title (Country Mix)", 121, "1A", "country")
  ];
  const matches = buildLikeAsSeedMatches("Seed - Title", library, -5, 0);
  assert.deepEqual(matches.map((m) => m.trackId).sort(), [2, 3, 4]);
});

test("positive vibe sorts genre-DIFFERENT versions of the SAME song first, never crosses into a different song", () => {
  const library = [
    track(1, "Seed - Title", 120, "1A", "house"),
    track(2, "Seed - Title (House Mix)", 121, "1A", "house"),
    track(3, "Seed - Title (Trap Remix)", 128, "1A", "trap"),
    track(4, "A Totally Different Song - Chorus", 120, "1A", "trap")
  ];
  const matches = buildLikeAsSeedMatches("Seed - Title", library, 5, 0);
  // Both same-title versions present, final sort is by BPM ascending
  // (source's own last step) - never the unrelated different-song track,
  // even though it shares the trap genre the positive-vibe sort favors.
  assert.deepEqual(matches.map((m) => m.trackId).sort(), [2, 3]);
  assert.equal(matches.some((m) => m.trackId === 4), false);
});

test("capped at 10, sorted by BPM ascending as the final step", () => {
  const library = [track(0, "Seed - Title", 100, "1A", "house")];
  for (let i = 1; i <= 15; i++) library.push(track(i, `Seed - Title (Mix ${i})`, 100 + (15 - i), "1A", "house"));
  const matches = buildLikeAsSeedMatches("Seed - Title", library, 5, 0);
  assert.equal(matches.length, 10);
  const bpms = matches.map((m) => m.bpm);
  assert.deepEqual(bpms, [...bpms].sort((a, b) => a - b));
});
