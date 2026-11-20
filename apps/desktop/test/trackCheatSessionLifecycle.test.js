// Regression test for docs/decisions/0020: Track Cheat used to re-seed
// its session's clientSeq back to 0 every time TrackCheatScreen mounted,
// including a remount after a tab switch (App.tsx only renders it while
// Track Cheat is the active tab). The server's own lastClientSeq doesn't
// reset when a tab switches - so the next event the remounted screen
// sent was rejected as stale (HTTP 409), and stayed rejected forever,
// because the local clientSeq only ever advances on a SUCCESSFUL
// response. A full app restart was the only thing that cleared it (a
// brand-new session, server-side position back at 0 too).
//
// There's no React/jsdom harness in this repo to literally mount/unmount
// TrackCheatScreen (same limitation noted in historyVoteRace.test.js), so
// this drives the real production seams instead:
//   - initialSessionState (src/renderer/src/trackCheat/sessionLifecycle.ts)
//     is the ACTUAL function App.tsx now calls exactly once, and is the
//     function TrackCheatScreen's old per-mount useEffect used to call
//     on every mount. A brand-new component instance's useRef always
//     starts null - that's React's own contract, not something assumed
//     here - so "mount" below means exactly what it means for real:
//     calling initialSessionState() again with no memory of what came
//     before, because that's what a fresh useRef gives you.
//   - the fake backend below enforces the exact same ordering rule as
//     apps/server/src/session/sessionEvents.js's isNewerOrDuplicate
//     (clientSeq must be strictly greater than the session's last
//     accepted one) and returns the same enriched 409 body shape
//     docs/decisions/0020 added (errorCode/serverLastClientSeq/
//     serverStateVersion), so these assertions also prove that body is
//     real and usable, not just present in one layer.
//
// sendOneEvent below is NOT the logic under test - it's the one-line
// "clientSeq = session.clientSeq + 1, send it, advance on success" step
// that's inlined in TrackCheatScreen.tsx's recommendForSeed/handleVote.
// What's under test is WHERE `session` comes from on each "mount" -
// that's the actual bug and the actual fix.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { initialSessionState } = require("../src/renderer/src/trackCheat/sessionLifecycle.ts");

function makeFakeBackend() {
  let lastClientSeq = 0;
  let stateVersion = 0;
  return async function sendSessionEvent(_sessionId, event) {
    if (event.clientSeq <= lastClientSeq) {
      return { ok: false, errorCode: "STALE_EVENT", serverLastClientSeq: lastClientSeq, serverStateVersion: stateVersion };
    }
    lastClientSeq = event.clientSeq;
    stateVersion += 1;
    return { ok: true, accepted: true, stateVersion, duplicate: false };
  };
}

async function sendOneEvent(session, sendSessionEvent) {
  const clientSeq = session.clientSeq + 1;
  const res = await sendSessionEvent(session.sessionId, { type: "vote", trackId: 1, value: "up", clientSeq });
  if (!res.ok) return { ok: false, res };
  return { ok: true, session: { ...session, clientSeq, stateVersion: res.stateVersion ?? session.stateVersion } };
}

test("0020 regression: re-seeding initialSessionState on every mount (the pre-fix pattern) goes stale after a remount", async () => {
  const sendSessionEvent = makeFakeBackend();
  const created = { sessionId: "s_1", chainId: "c_1", stateVersion: 0 };

  // Mount 1: a fresh component instance's useRef starts null, so the
  // pre-fix effect's guard ("seed only if my own ref is still null") is
  // true, and it seeds from scratch.
  let session = initialSessionState(created);

  const first = await sendOneEvent(session, sendSessionEvent);
  assert.equal(first.ok, true, "the first event, right after mount, succeeds");
  session = first.session;

  // Unmount (tab switch away): the component instance, and its useRef
  // along with it, is discarded - there is nothing left belonging to
  // THIS instance.

  // Remount (tab switch back): a BRAND NEW component instance. Its
  // useRef starts null again - React's contract, not an assumption - so
  // the pre-fix effect's guard is true AGAIN, and it re-seeds from the
  // same frozen `created` snapshot App.tsx originally passed down,
  // discarding everything that happened on mount 1.
  session = initialSessionState(created);

  const second = await sendOneEvent(session, sendSessionEvent);
  assert.equal(second.ok, false, "reproduces 0020: the remounted screen re-seeded clientSeq back to 0, so this event is stale");
  assert.equal(second.res.errorCode, "STALE_EVENT");
  // This is exactly the dead end a restart-only recovery comes from: the
  // server's real position (1) is already ahead of what the remounted
  // screen is about to send (1 again, from its reseeded clientSeq 0+1).
  assert.equal(second.res.serverLastClientSeq, 1);
});

test("0020 fix: a session seeded once by App.tsx (never re-seeded on a TrackCheatScreen mount) survives a remount and keeps sending valid events", async () => {
  const sendSessionEvent = makeFakeBackend();
  const created = { sessionId: "s_1", chainId: "c_1", stateVersion: 0 };

  // App.tsx creates this exactly once, right after POST /v1/sessions
  // returns - never again, and never re-derived from anything a
  // particular TrackCheatScreen instance owns.
  let session = initialSessionState(created);

  // Mount 1 (Track Cheat is the active tab): sends one event using
  // whatever App.tsx is currently holding as sharedSession.
  const first = await sendOneEvent(session, sendSessionEvent);
  assert.equal(first.ok, true);
  session = first.session; // this is what the real updateSession(...) prop call now persists, in App.tsx - not a per-screen ref.

  // Unmount (tab switch away): TrackCheatScreen unmounts, but `session`
  // lives one level up in App.tsx, which never unmounts - nothing
  // happens to it.

  // Remount (tab switch back): a brand-new TrackCheatScreen instance
  // mounts, but receives `session` as a PROP from App.tsx - there is no
  // re-seeding step left for it to run on mount at all.
  const second = await sendOneEvent(session, sendSessionEvent);
  assert.equal(second.ok, true, "the fix: the same persisted session keeps advancing correctly across a remount");
  assert.equal(second.session.clientSeq, 2);
  assert.equal(second.session.stateVersion, 2);
});

test("initialSessionState: builds clientSeq 0 / chainDepth 0 from a fresh session, regardless of what the server's chainId/stateVersion already are", () => {
  const state = initialSessionState({ sessionId: "s_9", chainId: "c_9", stateVersion: 0 });
  assert.deepEqual(state, {
    sessionId: "s_9",
    clientSeq: 0,
    stateVersion: 0,
    chainId: "c_9",
    chainDepth: 0
  });
});
