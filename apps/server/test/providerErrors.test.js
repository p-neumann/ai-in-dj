// CLAUDE.md Section 6.3's error contract distinguishes RATE_LIMITED (429),
// PROVIDER_OVERLOADED (529), and MODEL_OUTPUT_INVALID (bad/truncated model
// JSON) from a generic PROVIDER_ERROR - a client needs to know "wait and
// retry" from "something else broke". No network, no API key: these
// tests use a provider that throws a tagged ProviderError directly,
// exactly simulating what providers/anthropicProvider.js now does for a
// real 429/529/network failure, without ever making a real HTTP call.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { ProviderError } from "../src/providers/providerErrors.js";
import { _resetAllSessionsForTests } from "../src/session/sessionStore.js";
import { DEV_TOKEN } from "./helpers.js";

beforeEach(() => {
  _resetAllSessionsForTests();
});

function throwingProvider(err) {
  return { kind: "mock", async call() { throw err; } };
}

const library = [
  { id: "t1", artist: "Artist", title: "Song", bpm: "120", key: "8A", genre: "pop", year: "2020", playcount: "1" }
];

test("Track Cheat: a 429 from the provider maps to RATE_LIMITED with retryAfterMs passed through", async () => {
  const provider = throwingProvider(new ProviderError("Rate limited", "RATE_LIMITED", { retryAfterMs: 2000 }));
  const app = buildApp({ devTokens: [DEV_TOKEN], provider });
  const res = await app.inject({
    method: "POST", url: "/v1/track-cheat/recommend",
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
    payload: { library, seedTrackId: "t1" }
  });
  assert.equal(res.statusCode, 429);
  const body = res.json();
  assert.equal(body.error.code, "RATE_LIMITED");
  assert.equal(body.error.retryAfterMs, 2000);
});

test("Track Cheat: a 529 from the provider maps to PROVIDER_OVERLOADED", async () => {
  const provider = throwingProvider(new ProviderError("Overloaded", "PROVIDER_OVERLOADED"));
  const app = buildApp({ devTokens: [DEV_TOKEN], provider });
  const res = await app.inject({
    method: "POST", url: "/v1/track-cheat/recommend",
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
    payload: { library, seedTrackId: "t1" }
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error.code, "PROVIDER_OVERLOADED");
});

test("Track Cheat: a plain unexpected error still maps to the pre-existing PROVIDER_ERROR/502 fallback", async () => {
  const provider = throwingProvider(new Error("boom"));
  const app = buildApp({ devTokens: [DEV_TOKEN], provider });
  const res = await app.inject({
    method: "POST", url: "/v1/track-cheat/recommend",
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
    payload: { library, seedTrackId: "t1" }
  });
  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error.code, "PROVIDER_ERROR");
});

test("Track Cheat: a provider returning unparseable JSON maps to MODEL_OUTPUT_INVALID, not a generic PROVIDER_ERROR", async () => {
  const provider = { kind: "mock", async call() { return { content: [{ text: "not json at all" }] }; } };
  const app = buildApp({ devTokens: [DEV_TOKEN], provider });
  const res = await app.inject({
    method: "POST", url: "/v1/track-cheat/recommend",
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
    payload: { library, seedTrackId: "t1" }
  });
  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error.code, "MODEL_OUTPUT_INVALID");
});

test("Crate Cheat: a 429 from the provider maps to RATE_LIMITED", async () => {
  const provider = throwingProvider(new ProviderError("Rate limited", "RATE_LIMITED", { retryAfterMs: 5000 }));
  const app = buildApp({ devTokens: [DEV_TOKEN], provider });
  const res = await app.inject({
    method: "POST", url: "/v1/crates/build",
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
    payload: { library, prompt: "a chill pop mix", size: 5 }
  });
  assert.equal(res.statusCode, 429);
  const body = res.json();
  assert.equal(body.error.code, "RATE_LIMITED");
  assert.equal(body.error.retryAfterMs, 5000);
});

test("Crate Cheat: the model hitting max_tokens maps to MODEL_OUTPUT_INVALID", async () => {
  const provider = { kind: "mock", async call() { return { content: [{ text: "[" }], stop_reason: "max_tokens" }; } };
  const app = buildApp({ devTokens: [DEV_TOKEN], provider });
  const res = await app.inject({
    method: "POST", url: "/v1/crates/build",
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
    payload: { library, prompt: "a chill pop mix", size: 5 }
  });
  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error.code, "MODEL_OUTPUT_INVALID");
});
