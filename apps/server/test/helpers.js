// Shared test helpers for driving the session-event API + recommend
// endpoint the way a real client would (create session -> send events in
// order -> recommend), instead of injecting mode context directly.

import assert from "node:assert/strict";

export const DEV_TOKEN = "test-token-do-not-use-in-prod";

// Deterministic test randomness. Production code (candidateSelection.js,
// typeLock.js's shuffleArr) is untouched - it calls the global Math.random
// exactly as before. This only swaps what that global points to, for the
// duration of one test, so the same seed reproduces the same shuffle/tag
// outcome on every run. Always restore in a `finally` block.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedRandom(seed) {
  const original = Math.random;
  Math.random = mulberry32(seed);
  return function restore() {
    Math.random = original;
  };
}

export async function createSession(app) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/sessions",
    headers: { authorization: `Bearer ${DEV_TOKEN}` }
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
  return res.json().data; // { sessionId, chainId, stateVersion }
}

export async function sendEvent(app, sessionId, event, { idempotencyKey } = {}) {
  const headers = { authorization: `Bearer ${DEV_TOKEN}` };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  return app.inject({
    method: "POST",
    url: `/v1/sessions/${sessionId}/events`,
    headers,
    payload: event
  });
}

export async function sendEventOk(app, sessionId, event, opts) {
  const res = await sendEvent(app, sessionId, event, opts);
  assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
  return res.json().data;
}

export async function recommend(app, body) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/track-cheat/recommend",
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
    payload: body
  });
  return res;
}

export async function recommendOk(app, body) {
  const res = await recommend(app, body);
  assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
  return res.json().data;
}
