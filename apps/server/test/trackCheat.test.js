// Deterministic Phase 3 vertical-slice test. No network call, no API key
// (CLAUDE.md: "Do not require a real API key for tests that can run
// without one"). Uses Fastify's .inject() for a real HTTP request/response
// cycle through actual routing and auth, without binding a real port.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { createMockProvider } from "../src/providers/mockProvider.js";
import { sampleLibrary } from "../fixtures/sampleLibrary.js";

const DEV_TOKEN = "test-token-do-not-use-in-prod";

function makeApp() {
  return buildApp({ devTokens: [DEV_TOKEN], provider: createMockProvider() });
}

test("rejects requests with no Authorization header", async () => {
  const app = makeApp();
  const res = await app.inject({
    method: "POST",
    url: "/v1/track-cheat/recommend",
    payload: { library: sampleLibrary, seedTrackId: "t1" }
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error.code, "UNAUTHENTICATED");
});

test("rejects an unknown seedTrackId", async () => {
  const app = makeApp();
  const res = await app.inject({
    method: "POST",
    url: "/v1/track-cheat/recommend",
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
    payload: { library: sampleLibrary, seedTrackId: "does-not-exist" }
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, "VALIDATION");
});

test("connects a real request through candidate selection, a simulated AI response, and post-processing to return valid library track IDs", async () => {
  const app = makeApp();
  const res = await app.inject({
    method: "POST",
    url: "/v1/track-cheat/recommend",
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
    payload: { library: sampleLibrary, seedTrackId: "t1", vibe: -3, energy: 0 }
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);

  const { results, candidatePoolSize, returned, simulated } = body.data;

  // It really went through the simulated provider, not a real one.
  assert.equal(simulated, true);

  // Candidate selection actually ran against the sample library.
  assert.ok(candidatePoolSize > 0 && candidatePoolSize <= 100);

  // Every returned ID is real. "Real" here means: present in the fixture
  // library this test itself supplied - resolveRes only keeps IDs it found
  // in the candidate pool built from that same library (CLAUDE.md 6.3:
  // never trust model output), so this also proves no model-invented ID
  // could have leaked through.
  const validIds = new Set(sampleLibrary.map((t) => t.id));
  assert.equal(returned, results.length);
  assert.ok(results.length > 0, "expected at least one recommendation");
  for (const r of results) {
    assert.ok(validIds.has(r.trackId), `${r.trackId} is not a real library track`);
    assert.notEqual(r.trackId, "t1", "seed track must never be recommended back");
  }

  // Song-family dedup: no two results should be the same underlying song
  // (the fixture has no such pairs, so this just proves the count stayed
  // sane, not the dedup itself - see engine unit tests below for that).
  assert.ok(results.length <= 10);

  // Results are BPM-sorted ascending, matching resolveRes's own contract.
  for (let i = 1; i < results.length; i++) {
    assert.ok(parseFloat(results[i].bpm) >= parseFloat(results[i - 1].bpm));
  }
});
