// Phase 5, step 5 piece 21 (2026-11-13) - regression test for the
// thumbs-up/handleLikeAsSeed race found in a real-window check of
// Piece A. Exercises the real resolveVotePatch/patchResultOutcome
// functions with realistic relative async timing (a fast local write
// racing a slower one), not a reimplementation of the logic.
//
// There is no React/jsdom test harness in this repo to render
// TrackCheatScreen directly (the existing suite only exercises plain
// functions and real SQLite - no component tests exist to extend).
// Rather than fake that out, these simulate functions mirror
// TrackCheatScreen's exact sequence against the exact same shared
// "refs" object and the real history-patch functions, so the race
// itself - and the fix - are exercised for real, not asserted from
// reading the code.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { resolveVotePatch } = require("../src/renderer/src/trackCheat/historyEntry.ts");

function makeRefs(entryId, results) {
  return { entryId, results };
}

// Mirrors handleVote: snapshot the refs synchronously, THEN await a
// slow step (the backend session-event HTTP round trip), THEN resolve
// the patch against whatever the refs say at that point.
async function simulateHandleVote(refs, trackId, outcome, networkDelayMs) {
  const snapshot = { entryId: refs.entryId, results: refs.results };
  await new Promise((resolve) => setTimeout(resolve, networkDelayMs));
  const patch = resolveVotePatch(snapshot, refs.entryId, refs.results, trackId, outcome);
  if (patch && patch.shouldWriteRef) refs.results = patch.results;
  return patch;
}

// Mirrors handleLikeAsSeed: its only async step is a local IPC write
// that then overwrites the shared refs to point at a brand-new entry.
async function simulateHandleLikeAsSeed(refs, newEntryId, newResults, localIpcDelayMs) {
  await new Promise((resolve) => setTimeout(resolve, localIpcDelayMs));
  refs.entryId = newEntryId;
  refs.results = newResults;
}

test("thumbs-up race: vote still patches the entry that was on screen, even though a faster concurrent reseed moves the refs first", async () => {
  const refs = makeRefs(100, [
    { trackId: 1, name: "A", bpm: 120, key: "1A", outcome: "shown" },
    { trackId: 2, name: "B", bpm: 128, key: "2A", outcome: "shown" }
  ]);

  // Real sequence: handleVote starts first (ResultRow calls onVote
  // before onLikeAsSeed), then handleLikeAsSeed runs right behind it -
  // but handleLikeAsSeed's local IPC write (5ms) resolves well before
  // handleVote's backend round trip (50ms), exactly like production.
  const votePromise = simulateHandleVote(refs, 1, "up", 50);
  const likeAsSeedPromise = simulateHandleLikeAsSeed(
    refs,
    999,
    [{ trackId: 50, name: "Other Version", bpm: 121, key: "1A", outcome: "shown" }],
    5
  );

  const [patch] = await Promise.all([votePromise, likeAsSeedPromise]);

  assert.ok(patch, "a snapshot existed when the vote started, so a patch must be produced");
  assert.equal(patch.entryId, 100, "must patch the ORIGINAL entry that was on screen, not the one created mid-vote");
  assert.equal(patch.shouldWriteRef, false, "must not claim to own the ref once the ref has moved on to a different entry");
  assert.equal(patch.results.find((r) => r.trackId === 1).outcome, "up");

  // The ref must end up reflecting the NEW entry untouched - the vote
  // must not clobber it with the old entry's data.
  assert.equal(refs.entryId, 999);
  assert.deepEqual(refs.results, [{ trackId: 50, name: "Other Version", bpm: 121, key: "1A", outcome: "shown" }]);
});

test("thumbs-down has no competing write (onLikeAsSeed is never called): patches the live entry and the ref stays in sync", async () => {
  const refs = makeRefs(100, [{ trackId: 1, name: "A", bpm: 120, key: "1A", outcome: "shown" }]);
  const patch = await simulateHandleVote(refs, 1, "down", 50);
  assert.equal(patch.entryId, 100);
  assert.equal(patch.shouldWriteRef, true, "nothing raced it, so it is safe to own the ref");
  assert.equal(refs.results[0].outcome, "down", "ref was updated since nothing else touched it");
});

test("two votes on the same entry in a row (no reseed in between) both land", async () => {
  const refs = makeRefs(100, [
    { trackId: 1, name: "A", bpm: 120, key: "1A", outcome: "shown" },
    { trackId: 2, name: "B", bpm: 128, key: "2A", outcome: "shown" }
  ]);
  await simulateHandleVote(refs, 1, "up", 10);
  await simulateHandleVote(refs, 2, "down", 10);
  assert.equal(refs.results.find((r) => r.trackId === 1).outcome, "up", "first vote's outcome must survive the second vote's patch");
  assert.equal(refs.results.find((r) => r.trackId === 2).outcome, "down");
});

test("resolveVotePatch: no current entry (nothing recorded yet) is a no-op, not a crash", () => {
  const patch = resolveVotePatch({ entryId: null, results: [] }, null, [], 1, "up");
  assert.equal(patch, null);
});
