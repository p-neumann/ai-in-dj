// Type lock and hybrid-mode (Bridge / Style Drift / Vibe Slider Drift)
// tests. No network, no API key. Hybrid modes are now DERIVED server-side
// from a real sequence of session events (CLAUDE.md Section 4.1/4.3/6.4) -
// these tests drive the DJ actions that should produce each mode, rather
// than injecting bridgeContext/driftContext/vibeDriftContext directly.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { createMockProvider } from "../src/providers/mockProvider.js";
import { _resetAllSessionsForTests } from "../src/session/sessionStore.js";
import { createSession, sendEventOk, recommendOk, DEV_TOKEN } from "./helpers.js";

function makeApp() {
  return buildApp({ devTokens: [DEV_TOKEN], provider: createMockProvider() });
}

beforeEach(() => {
  _resetAllSessionsForTests();
});

const typeLockLibrary = [
  { id: "seed", artist: "Artist", title: "Seed Song", bpm: "100", key: "8A", genre: "hip hop", year: "2020", playcount: "5" },
  { id: "f1", artist: "Artist", title: "Other One (Funk Edit)", bpm: "101", key: "8A", genre: "funk", year: "2019", playcount: "2" },
  { id: "f2", artist: "Artist", title: "Other Two (Funk Redrum)", bpm: "99", key: "8A", genre: "funk", year: "2018", playcount: "1" },
  { id: "m1", artist: "Artist", title: "Other Three (Moombahton Edit)", bpm: "102", key: "9A", genre: "latin", year: "2021", playcount: "3" },
  { id: "p1", artist: "Artist", title: "Plain Track No Edit", bpm: "100", key: "8A", genre: "hip hop", year: "2020", playcount: "4" },
  { id: "p2", artist: "Artist", title: "Another Plain Track", bpm: "103", key: "8A", genre: "hip hop", year: "2020", playcount: "4" }
];

test("type lock: 'only funk and moombahton remixes' hard-filters to matching edit descriptors", async () => {
  const app = makeApp();
  const data = await recommendOk(app, {
    library: typeLockLibrary,
    seedTrackId: "seed",
    vibePromptText: "only show funk and moombahton remixes"
  });
  assert.ok(data.results.length > 0, "expected at least one type-locked result");
  for (const r of data.results) {
    assert.ok(/funk|moombahton/i.test(r.name), `${r.name} does not indicate a funk or moombahton edit`);
  }
  const names = data.results.map((r) => r.name);
  assert.ok(!names.some((n) => n.includes("Plain Track")));
});

test("no type lock when the vibe prompt doesn't ask for one", async () => {
  const app = makeApp();
  const data = await recommendOk(app, { library: typeLockLibrary, seedTrackId: "seed", vibePromptText: "give me something fun" });
  assert.ok(data.results.length > 0);
});

// Deliberately large, clustered, AND deliberately unique-titled.
// - Large + clustered BPM/era: R12 excludes every shown track for the rest
//   of the session (correctly), and BPM/era/genre filters narrow the pool
//   further on top of that (also correct) - a multi-step chain test needs
//   headroom so repeated fetches don't run the pool dry.
// - Uniqueness matters for a subtler reason: extractCore (used by
//   isSameSong, ported verbatim) discards ALL-DIGIT words entirely, and
//   isSameSong matches on SUBSTRING overlap of whatever words remain. A
//   naming scheme like "Track 0".."Track 149" reduces every track to the
//   same core ("edm edm track"); even a two-word-combination scheme still
//   collides because isSameSong only needs ~2 shared words to match, and
//   reused words (even in different combinations) supply that. The fix:
//   one unique alphanumeric token per track ("TrackQ7") - not purely
//   numeric, so extractCore keeps it, and never reused, so it never
//   overlaps with any other track's title. Real libraries don't hit this
//   because real song titles vary far more than a trailing number.
const chainLibrary = [
  { id: "old", artist: "Old", title: "Foundation", bpm: "90", key: "8A", genre: "hip hop", year: "2015", playcount: "5" },
  { id: "new", artist: "New", title: "Ignition", bpm: "126", key: "6A", genre: "edm", year: "2020", playcount: "5" },
  ...Array.from({ length: 400 }, (_, i) => ({
    id: "edm" + i,
    artist: "EDM Artist " + i,
    title: "TrackQ" + i,
    bpm: String(122 + (i % 8)), // tight 122-129 cluster - within range of any reasonable seed BPM window
    key: ["6A", "7A", "8A", "9A"][i % 4],
    genre: "edm",
    year: "2020", // same era as the seed - never strictEra-filtered out
    playcount: String(i % 5)
  })),
  { id: "e", artist: "Echo", title: "Wavelength", bpm: "91", key: "8A", genre: "hip hop", year: "2017", playcount: "1" }
];

// Builds a REAL chain of depth 1 (old -> new -> one of new's own results,
// via an actual ccdjResult event) and returns the resulting batch, so tests
// start from a genuinely active chain instead of two independent fresh
// seeds that never chained at all.
async function establishChain(app, session) {
  let seq = 1;
  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: "old", origin: "external", clientSeq: seq++ });
  await recommendOk(app, { library: chainLibrary, seedTrackId: "old", sessionId: session.sessionId, clientSeq: seq++ });
  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: "new", origin: "external", clientSeq: seq++ });
  const firstBatch = await recommendOk(app, { library: chainLibrary, seedTrackId: "new", sessionId: session.sessionId, clientSeq: seq++ });
  // Passive lane tagging is always on (even for a fresh, non-chained
  // batch), so a non-"pure" pick here would immediately trigger Style
  // Drift on this very first chain link. Pick "pure" deliberately so
  // establishChain reliably produces a clean, mode:none baseline that
  // individual tests can then push into whichever hybrid mode they want.
  const picked = firstBatch.results.find((r) => r.lane === "pure") || firstBatch.results[0];
  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: picked.trackId, origin: "ccdjResult", clientSeq: seq++ });
  const batch = await recommendOk(app, { library: chainLibrary, seedTrackId: picked.trackId, sessionId: session.sessionId, clientSeq: seq++ });
  return { batch, lastSeedTrackId: picked.trackId, seq };
}

test("Bridge Mode: an external swerve mid-chain tags results new/bridge and reports mode:bridge", async () => {
  const app = makeApp();
  const session = await createSession(app);
  const { seq: seq0 } = await establishChain(app, session);
  let seq = seq0;

  // External swerve: DJ drops a track that did NOT come from CCDJ's own results.
  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: "edm29", origin: "external", clientSeq: seq++ });
  const data = await recommendOk(app, { library: chainLibrary, seedTrackId: "edm29", sessionId: session.sessionId, clientSeq: seq++ });

  assert.equal(data.mode, "bridge");
  assert.equal(data.trigger, "bridgeSwerve");
  assert.ok(data.results.length > 0);
  for (const r of data.results) {
    assert.ok(["new", "bridge"].includes(r.camp), `expected camp new/bridge, got ${r.camp}`);
  }
});

test("Bridge Mode phases: dragging a 'bridge' pick continues it, dragging a 'new' pick resolves it", async () => {
  const app = makeApp();
  const session = await createSession(app);
  const { seq: seq0 } = await establishChain(app, session);
  let seq = seq0;
  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: "edm29", origin: "external", clientSeq: seq++ });
  const bridgeBatch = await recommendOk(app, { library: chainLibrary, seedTrackId: "edm29", sessionId: session.sessionId, clientSeq: seq++ });
  assert.equal(bridgeBatch.mode, "bridge");

  const bridgePick = bridgeBatch.results.find((r) => r.camp === "bridge");
  const newPick = bridgeBatch.results.find((r) => r.camp === "new");
  assert.ok(bridgePick && newPick, "mock provider should have tagged at least one of each camp");

  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: bridgePick.trackId, origin: "ccdjResult", clientSeq: seq++ });
  const continuing = await recommendOk(app, { library: chainLibrary, seedTrackId: bridgePick.trackId, sessionId: session.sessionId, clientSeq: seq++ });
  assert.equal(continuing.mode, "bridge", "dragging a 'bridge' pick should keep bridge mode active");

  const nextNewPick = continuing.results.find((r) => r.camp === "new") || newPick;
  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: nextNewPick.trackId, origin: "ccdjResult", clientSeq: seq++ });
  const resolved = await recommendOk(app, { library: chainLibrary, seedTrackId: nextNewPick.trackId, sessionId: session.sessionId, clientSeq: seq++ });
  assert.equal(resolved.mode, "none", "dragging a 'new' pick should resolve bridge mode");
  assert.equal(resolved.trigger, "daisyChain");
});

test("Style Drift: chaining a non-pure lane result reports mode:styleDrift and tags lanes", async () => {
  const app = makeApp();
  const session = await createSession(app);
  const { batch, seq: seq0 } = await establishChain(app, session);
  let seq = seq0;

  const nonPure = batch.results.find((r) => r.lane && r.lane !== "pure");
  assert.ok(nonPure, "mock provider should have tagged at least one non-pure lane in the passive-tagging default");

  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: nonPure.trackId, origin: "ccdjResult", clientSeq: seq++ });
  const data = await recommendOk(app, { library: chainLibrary, seedTrackId: nonPure.trackId, sessionId: session.sessionId, clientSeq: seq++ });

  assert.equal(data.mode, "styleDrift");
  assert.equal(data.trigger, "styleDrift");
  assert.ok(data.results.length > 0);
  for (const r of data.results) {
    assert.ok(["pure", "crossover", "native"].includes(r.lane), `expected a lane tag, got ${r.lane}`);
  }
});

test("Style Drift phases: another non-pure pick continues it, a pure pick resolves it", async () => {
  const app = makeApp();
  const session = await createSession(app);
  const { batch, seq: seq0 } = await establishChain(app, session);
  let seq = seq0;
  const nonPure = batch.results.find((r) => r.lane && r.lane !== "pure");

  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: nonPure.trackId, origin: "ccdjResult", clientSeq: seq++ });
  const driftBatch = await recommendOk(app, { library: chainLibrary, seedTrackId: nonPure.trackId, sessionId: session.sessionId, clientSeq: seq++ });
  assert.equal(driftBatch.mode, "styleDrift");

  const anotherNonPure = driftBatch.results.find((r) => r.lane && r.lane !== "pure");
  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: anotherNonPure.trackId, origin: "ccdjResult", clientSeq: seq++ });
  let continuing = await recommendOk(app, { library: chainLibrary, seedTrackId: anotherNonPure.trackId, sessionId: session.sessionId, clientSeq: seq++ });
  assert.equal(continuing.mode, "styleDrift", "another non-pure pick should keep drift active");

  // The simulated provider tags lanes pure/crossover/native by rotating
  // position in ITS OWN candidate ordering - a "pure" tag is always
  // proposed somewhere, but with a shrinking (R12-excluded) pool a given
  // batch can occasionally come back without one surviving. Retry a bounded
  // number of times (staying in "continuing" via another non-pure pick)
  // rather than accept a flaky assert on what is genuine randomness.
  let purePick = continuing.results.find((r) => r.lane === "pure");
  for (let attempt = 0; !purePick && attempt < 5; attempt++) {
    const nextNonPure = continuing.results.find((r) => r.lane && r.lane !== "pure");
    assert.ok(nextNonPure, "expected at least a non-pure result to keep retrying with");
    await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: nextNonPure.trackId, origin: "ccdjResult", clientSeq: seq++ });
    continuing = await recommendOk(app, { library: chainLibrary, seedTrackId: nextNonPure.trackId, sessionId: session.sessionId, clientSeq: seq++ });
    assert.equal(continuing.mode, "styleDrift", "still expected to be in styleDrift while retrying for a pure pick");
    purePick = continuing.results.find((r) => r.lane === "pure");
  }
  assert.ok(purePick, "mock provider should have tagged at least one pure result across retries");

  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: purePick.trackId, origin: "ccdjResult", clientSeq: seq++ });
  const resolved = await recommendOk(app, { library: chainLibrary, seedTrackId: purePick.trackId, sessionId: session.sessionId, clientSeq: seq++ });
  assert.equal(resolved.mode, "none", "a pure pick should resolve drift");
});

test("Vibe Slider Drift: a sliderChanged event before a chain pick triggers a one-shot vibeDrift batch", async () => {
  const app = makeApp();
  const session = await createSession(app);
  const { batch, seq: seq0 } = await establishChain(app, session);
  let seq = seq0;

  // Pick a "pure"-tagged result specifically: Style Drift takes priority
  // over Vibe Drift (both derive from the same seedDropped event), so a
  // non-pure pick here would trigger drift instead and this test would be
  // testing the wrong thing.
  const purePick = batch.results.find((r) => r.lane === "pure") || batch.results[0];
  await sendEventOk(app, session.sessionId, { type: "sliderChanged", vibe: 4, energy: 0, clientSeq: seq++ });
  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: purePick.trackId, origin: "ccdjResult", clientSeq: seq++ });
  const data = await recommendOk(app, { library: chainLibrary, seedTrackId: purePick.trackId, vibe: 4, sessionId: session.sessionId, clientSeq: seq++ });

  assert.equal(data.mode, "vibeDrift");
  assert.equal(data.trigger, "vibeDrift");
  assert.ok(data.results.length > 0);
  // Positive vibe (4) also triggers injectGenreDiversity, which can splice
  // in guaranteed-diverse library tracks the model never tagged - those
  // legitimately carry camp:null, matching the source's own behavior.
  assert.ok(data.results.some((r) => ["chain", "vibe"].includes(r.camp)));
  for (const r of data.results) {
    assert.ok(r.camp === null || ["chain", "vibe"].includes(r.camp), `unexpected camp value: ${r.camp}`);
  }

  // One-shot (R8): the very next chain pick, with no further sliderChanged
  // event, must NOT still be in vibeDrift.
  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: data.results[0].trackId, origin: "ccdjResult", clientSeq: seq++ });
  const after = await recommendOk(app, { library: chainLibrary, seedTrackId: data.results[0].trackId, sessionId: session.sessionId, clientSeq: seq++ });
  assert.equal(after.mode, "none", "vibe drift must not persist past the one fetch it was detected for");
});

test("Bridge takes priority over an in-progress Style Drift", async () => {
  const app = makeApp();
  const session = await createSession(app);
  const { batch, seq: seq0 } = await establishChain(app, session);
  let seq = seq0;
  const nonPure = batch.results.find((r) => r.lane && r.lane !== "pure");

  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: nonPure.trackId, origin: "ccdjResult", clientSeq: seq++ });
  const driftBatch = await recommendOk(app, { library: chainLibrary, seedTrackId: nonPure.trackId, sessionId: session.sessionId, clientSeq: seq++ });
  assert.equal(driftBatch.mode, "styleDrift");

  // Now an external swerve happens on top of the active drift.
  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: "e", origin: "external", clientSeq: seq++ });
  const data = await recommendOk(app, { library: chainLibrary, seedTrackId: "e", sessionId: session.sessionId, clientSeq: seq++ });
  assert.equal(data.mode, "bridge", "an external swerve must override an in-progress style drift");
});
