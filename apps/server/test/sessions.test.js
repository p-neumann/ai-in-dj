// Session-event mechanics (CLAUDE.md Section 6.3/6.4): ordering, duplicate
// detection, staleness, and session isolation. No network, no API key.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { createMockProvider } from "../src/providers/mockProvider.js";
import { _resetAllSessionsForTests, getSession } from "../src/session/sessionStore.js";
import { createSession, sendEvent, sendEventOk, recommendOk, seedRandom, DEV_TOKEN } from "./helpers.js";
import { sampleLibrary } from "../fixtures/sampleLibrary.js";

function makeApp() {
  return buildApp({ devTokens: [DEV_TOKEN], provider: createMockProvider() });
}

test.beforeEach(() => {
  _resetAllSessionsForTests();
});

test("POST /v1/sessions creates a fresh session at stateVersion 0", async () => {
  const app = makeApp();
  const session = await createSession(app);
  assert.ok(session.sessionId.startsWith("s_"));
  assert.ok(session.chainId.startsWith("c_"));
  assert.equal(session.stateVersion, 0);
});

test("an event with clientSeq 1 is accepted and advances stateVersion", async () => {
  const app = makeApp();
  const session = await createSession(app);
  const data = await sendEventOk(app, session.sessionId, { type: "sliderChanged", vibe: 2, energy: 0, clientSeq: 1 });
  assert.equal(data.accepted, true);
  assert.equal(data.duplicate, false);
  assert.equal(data.stateVersion, 1);
});

test("event ordering: a clientSeq that is not newer than the last accepted one is rejected as STALE_EVENT", async () => {
  const app = makeApp();
  const session = await createSession(app);
  await sendEventOk(app, session.sessionId, { type: "sliderChanged", vibe: 2, energy: 0, clientSeq: 5 });

  const staleEqual = await sendEvent(app, session.sessionId, { type: "sliderChanged", vibe: 3, energy: 0, clientSeq: 5 });
  assert.equal(staleEqual.statusCode, 409);
  assert.equal(staleEqual.json().error.code, "STALE_EVENT");

  const staleLower = await sendEvent(app, session.sessionId, { type: "sliderChanged", vibe: 3, energy: 0, clientSeq: 4 });
  assert.equal(staleLower.statusCode, 409);

  // State must be unchanged by either rejected attempt.
  const after = await sendEventOk(app, session.sessionId, { type: "sliderChanged", vibe: 9, energy: 0, clientSeq: 6 });
  assert.equal(after.stateVersion, 2, "only the two accepted events (5 and 6) should have advanced state");
});

test("duplicate events: same clientSeq + same Idempotency-Key returns the stored result without reprocessing", async () => {
  const app = makeApp();
  const session = await createSession(app);
  const key = "idem-key-1";

  const first = await sendEventOk(app, session.sessionId, { type: "vote", trackId: "t1", value: "down", clientSeq: 1 }, { idempotencyKey: key });
  assert.equal(first.duplicate, false);
  assert.equal(first.stateVersion, 1);

  const retry = await sendEventOk(app, session.sessionId, { type: "vote", trackId: "t1", value: "down", clientSeq: 1 }, { idempotencyKey: key });
  assert.equal(retry.duplicate, true);
  assert.equal(retry.stateVersion, 1, "a duplicate must not advance stateVersion again");
});

test("session isolation: excludedTrackIds and chain state in one session never leak into another", async () => {
  const app = makeApp();
  const sessionA = await createSession(app);
  const sessionB = await createSession(app);

  // Session A votes t1 down (excluded), then builds an active chain.
  await sendEventOk(app, sessionA.sessionId, { type: "vote", trackId: "t1", value: "down", clientSeq: 1 });
  await sendEventOk(app, sessionA.sessionId, { type: "seedDropped", trackId: "t2", origin: "external", clientSeq: 2 });
  const batchA = await recommendOk(app, { library: sampleLibrary, seedTrackId: "t2", sessionId: sessionA.sessionId, clientSeq: 3 });
  assert.ok(!batchA.results.some((r) => r.trackId === "t1"), "t1 must be excluded in session A (voted down there)");
  await sendEventOk(app, sessionA.sessionId, { type: "seedDropped", trackId: batchA.results[0].trackId, origin: "ccdjResult", clientSeq: 4 });
  const afterChainA = await recommendOk(app, { library: sampleLibrary, seedTrackId: batchA.results[0].trackId, sessionId: sessionA.sessionId, clientSeq: 5 });
  assert.equal(afterChainA.chain.depth, 1, "session A's chain should now be active");

  // Session B never voted anything down and never dropped a seed - its
  // exclusion set and chain depth must be untouched by A's activity.
  const batchB = await recommendOk(app, { library: sampleLibrary, seedTrackId: "t2", sessionId: sessionB.sessionId, clientSeq: 1 });
  assert.ok(batchB.results.some((r) => r.trackId === "t1"), "t1 must still be eligible in session B - A's vote must not leak");
  assert.equal(batchB.chain.depth, 0, "session B's own chain must start independent of session A's activity");
});

test("R12 via real events: a track shown in one recommend is excluded from the next, scoped per session", async () => {
  const app = makeApp();
  const session = await createSession(app);

  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: "t1", origin: "external", clientSeq: 1 });
  const first = await recommendOk(app, { library: sampleLibrary, seedTrackId: "t1", sessionId: session.sessionId, clientSeq: 2 });
  assert.ok(first.results.length > 0);
  const shownNames = new Set(first.results.map((r) => r.name));

  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: "t1", origin: "search", clientSeq: 3 });
  const second = await recommendOk(app, { library: sampleLibrary, seedTrackId: "t1", sessionId: session.sessionId, clientSeq: 4 });
  for (const r of second.results) {
    assert.ok(!shownNames.has(r.name), `${r.name} was already shown this session`);
  }
});

test("stale recommend: a clientSeq not newer than the session's last accepted one is rejected before any provider work, with no side effects", async () => {
  const app = makeApp();
  const session = await createSession(app);
  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: "t1", origin: "external", clientSeq: 1 });

  const ok = await recommendOk(app, { library: sampleLibrary, seedTrackId: "t1", sessionId: session.sessionId, clientSeq: 2 });
  assert.equal(ok.superseded, false);
  const stateAfterFirst = ok.stateVersion;

  const stale = await recommendOk(app, { library: sampleLibrary, seedTrackId: "t1", sessionId: session.sessionId, clientSeq: 2 });
  assert.equal(stale.superseded, true);
  assert.equal(stale.results.length, 0);

  // Confirm no side effects: sending a fresh event afterward shows state
  // only advanced by the events/recommend that actually committed.
  const probe = await sendEventOk(app, session.sessionId, { type: "sliderChanged", vibe: 0, energy: 0, clientSeq: 3 });
  assert.equal(probe.stateVersion, stateAfterFirst + 1, "the stale recommend must not have advanced stateVersion");
});

test("superseded mid-flight: a recommend overtaken by a newer accepted change commits nothing", async () => {
  // A real "was I overtaken while awaiting the provider" race needs A's
  // provider call to still be pending when B's completes. Rather than
  // relying on incidental microtask ordering (fragile and not actually
  // proving anything), this provider deliberately holds A's response
  // until a signal fires, so the interleaving is explicit and deterministic.
  const base = createMockProvider();
  let releaseA;
  const aHeld = new Promise((resolve) => { releaseA = resolve; });
  let callCount = 0;
  const controllableProvider = {
    kind: "mock",
    async call(requestBody) {
      const isA = ++callCount === 1;
      if (isA) await aHeld;
      return base.call(requestBody);
    }
  };

  const app = buildApp({ devTokens: [DEV_TOKEN], provider: controllableProvider });
  const session = await createSession(app);
  await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: "t1", origin: "external", clientSeq: 1 });

  // Start A (clientSeq 2) - its provider call will block until released.
  const pendingA = recommendOk(app, { library: sampleLibrary, seedTrackId: "t1", sessionId: session.sessionId, clientSeq: 2 });
  // B (clientSeq 3) runs and completes fully while A is still blocked.
  const b = await recommendOk(app, { library: sampleLibrary, seedTrackId: "t1", sessionId: session.sessionId, clientSeq: 3 });
  assert.equal(b.superseded, false);

  // Now let A's provider call resolve and see what it discovers.
  releaseA();
  const a = await pendingA;
  assert.equal(a.superseded, true, "A should discover it was overtaken by B once it resumes");
});

test("shown-exclusion and thumbs-down exclusion are independent: un-voting doesn't un-exclude an already-shown track, and a never-shown down-vote is excluded on every path and reversible on its own", async () => {
  const restore = seedRandom(1);
  try {
    const app = makeApp();
    const session = await createSession(app);

    await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: "t1", origin: "external", clientSeq: 1 });
    const batch1 = await recommendOk(app, { library: sampleLibrary, seedTrackId: "t1", sessionId: session.sessionId, clientSeq: 2 });
    assert.ok(batch1.results.length > 0);
    const shown = batch1.results[0].trackId;

    // shown must now be recorded as shown (exact-match exclusion), not as a vote.
    let raw = getSession(session.sessionId);
    assert.ok(raw.shownTrackIds.has(shown));
    assert.ok(!raw.downvotedTrackIds.has(shown));

    // Down-vote it, then un-vote it.
    await sendEventOk(app, session.sessionId, { type: "vote", trackId: shown, value: "down", clientSeq: 3 });
    raw = getSession(session.sessionId);
    assert.ok(raw.downvotedTrackIds.has(shown), "voting down must add to downvotedTrackIds");

    await sendEventOk(app, session.sessionId, { type: "vote", trackId: shown, value: null, clientSeq: 4 });
    raw = getSession(session.sessionId);
    assert.ok(!raw.downvotedTrackIds.has(shown), "un-voting must remove from downvotedTrackIds");
    assert.ok(raw.shownTrackIds.has(shown), "un-voting must NOT remove from shownTrackIds - this is the bug the split fixes");

    // Confirm the effect at the HTTP level too: `shown` still never comes
    // back, purely because it was shown, independent of vote state.
    await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: "t1", origin: "search", clientSeq: 5 });
    const batch2 = await recommendOk(app, { library: sampleLibrary, seedTrackId: "t1", sessionId: session.sessionId, clientSeq: 6 });
    assert.ok(!batch2.results.some((r) => r.trackId === shown), `${shown} was shown earlier and must stay excluded regardless of vote state`);

    // Now the other half: a track that was NEVER shown, down-voted directly.
    const neverShownIds = new Set(sampleLibrary.map((t) => t.id));
    neverShownIds.delete("t1");
    for (const id of raw.shownTrackIds) neverShownIds.delete(id);
    for (const r of batch2.results) neverShownIds.delete(r.trackId);
    const neverShown = [...neverShownIds][0];
    assert.ok(neverShown, "expected at least one library track never shown in either batch");

    await sendEventOk(app, session.sessionId, { type: "vote", trackId: neverShown, value: "down", clientSeq: 7 });
    raw = getSession(session.sessionId);
    assert.ok(raw.downvotedTrackIds.has(neverShown));
    assert.ok(!raw.shownTrackIds.has(neverShown), "a direct down-vote on an unshown track must not mark it as shown");

    // R12 minimal fix in action: excluded on every path (here, a plain
    // fetch), uncapped, purely via downvotedTrackIds - it was never shown.
    await sendEventOk(app, session.sessionId, { type: "seedDropped", trackId: "t1", origin: "search", clientSeq: 8 });
    const batch3 = await recommendOk(app, { library: sampleLibrary, seedTrackId: "t1", sessionId: session.sessionId, clientSeq: 9 });
    assert.ok(!batch3.results.some((r) => r.trackId === neverShown), `${neverShown} was thumbs-downed and must be excluded even though it was never shown`);

    // Un-voting it removes the ONLY exclusion reason it had - it becomes
    // eligible again (unlike `shown`, which stayed excluded above).
    await sendEventOk(app, session.sessionId, { type: "vote", trackId: neverShown, value: null, clientSeq: 10 });
    raw = getSession(session.sessionId);
    assert.ok(!raw.downvotedTrackIds.has(neverShown));
    assert.ok(!raw.shownTrackIds.has(neverShown), "still correctly never marked as shown");
  } finally {
    restore();
  }
});
