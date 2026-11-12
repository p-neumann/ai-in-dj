// Phase 5, step 5 piece 9 - Duplicate Finder core.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  extractCore,
  getVersionTags,
  sigsCompatible,
  findDuplicateGroups
} = require("../src/renderer/src/duplicateFinder/findDuplicates.ts");

function track(id, displayName, opts = {}) {
  return {
    id,
    displayName,
    bpm: opts.bpm ?? 128,
    key: opts.key ?? "8A",
    playcount: opts.playcount ?? 0,
    durationSec: opts.durationSec ?? 240,
    location: opts.location ?? `/Music/${id}.mp3`
  };
}

test("extractCore: strips version keywords and parentheticals, keeps artist + up to 4 title words", () => {
  assert.equal(extractCore("Daft Punk - One More Time (Radio Edit)"), "daft one more time");
});

test("getVersionTags: Dirty and Clean share a family, Redrum and a plain Remix do not", () => {
  assert.deepEqual(getVersionTags("song (dirty)"), getVersionTags("song (clean)"));
  assert.notDeepEqual(getVersionTags("song (redrum)"), getVersionTags("song (remix)"));
});

test("sigsCompatible: two untagged tracks are compatible; one tagged and one untagged are not", () => {
  assert.equal(sigsCompatible([], []), true);
  assert.equal(sigsCompatible([8], []), false);
  assert.equal(sigsCompatible([8], [8]), true);
});

test("findDuplicateGroups: near-identical name and duration (<=1s) is a Likely duplicate", () => {
  const a = track(1, "Daft Punk - One More Time", { durationSec: 240, playcount: 5 });
  const b = track(2, "Daft Punk - One More Time", { durationSec: 241, playcount: 1 });
  const groups = findDuplicateGroups([a, b]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].confidence, "likely");
  assert.equal(groups[0].tracks.length, 2);
  assert.equal(groups[0].tracks[0].track.id, 1, "higher play count sorts first (the kept copy)");
});

test("findDuplicateGroups: identical name but duration 2-4s apart (not within 1s) is a Possible duplicate, not Likely", () => {
  // Deliberately NOT "Club Mix" vs "Edit" - those are different version
  // families (club=radio/club tag, edit=remix/edit tag), so sigsCompatible
  // would correctly refuse to compare them at all: a DJ who kept both a
  // Club Mix and an Edit of the same song kept them on purpose, and the
  // source's own version-family check (confirmed above) is what protects
  // that. A real "Possible" case needs the SAME name but a duration gap
  // too big to be "Likely" - not a different edit.
  const a = track(1, "Daft Punk - One More Time", { durationSec: 240, bpm: 123 });
  const b = track(2, "Daft Punk - One More Time", { durationSec: 243, bpm: 124 });
  const groups = findDuplicateGroups([a, b]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].confidence, "possible");
});

test("findDuplicateGroups: a Redrum and a plain Remix of the same song are never flagged, even with identical duration/BPM", () => {
  const a = track(1, "Daft Punk - One More Time (Redrum)", { durationSec: 240, bpm: 123 });
  const b = track(2, "Daft Punk - One More Time (Remix)", { durationSec: 240, bpm: 123 });
  assert.deepEqual(findDuplicateGroups([a, b]), []);
});

test("findDuplicateGroups: the exact same real file path appearing twice is not flagged (one file, not two)", () => {
  const a = track(1, "Daft Punk - One More Time", { location: "/Music/same.mp3" });
  const b = track(2, "Daft Punk - One More Time", { location: "/Music/same.mp3" });
  assert.deepEqual(findDuplicateGroups([a, b]), []);
});

test("findDuplicateGroups: a blank location never collides with another blank location", () => {
  const a = track(1, "Daft Punk - One More Time", { location: "", durationSec: 240 });
  const b = track(2, "Rihanna - So Hard", { location: "", durationSec: 180 });
  const groups = findDuplicateGroups([a, b]);
  assert.deepEqual(groups, [], "two unrelated tracks with no location at all still aren't duplicates of each other");
});

test("findDuplicateGroups: unrelated tracks produce no groups", () => {
  const a = track(1, "Daft Punk - One More Time", { durationSec: 240 });
  const b = track(2, "Rihanna - So Hard", { durationSec: 180 });
  assert.deepEqual(findDuplicateGroups([a, b]), []);
});

test("findDuplicateGroups: Likely groups sort before Possible groups", () => {
  const likelyA = track(1, "Song One", { durationSec: 200 });
  const likelyB = track(2, "Song One", { durationSec: 200 });
  // Same name as each other, but a duration gap too big for "Likely"
  // (>1s) - not a different version family, which is the only other
  // way "Possible" is reachable (see the "identical name but duration
  // 2-4s apart" test above for why).
  const possibleA = track(3, "Song Two", { durationSec: 200, bpm: 120 });
  const possibleB = track(4, "Song Two", { durationSec: 203, bpm: 121 });
  const groups = findDuplicateGroups([possibleA, possibleB, likelyA, likelyB]);
  assert.equal(groups[0].confidence, "likely");
  assert.equal(groups[1].confidence, "possible");
});
