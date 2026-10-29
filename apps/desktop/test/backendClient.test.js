// Phase 5, step 5 piece 1 - the pipe to the real backend. These test the
// REQUEST SHAPE (right URL, right header) with a stubbed global.fetch -
// not the real network, since that needs apps/server actually running.
// The real end-to-end proof is the real-window check (see
// docs/phase-reports/phase-5.md), same as every other Electron-specific
// piece in this project.

const { test } = require("node:test");
const assert = require("node:assert/strict");

// Must be async and actually AWAIT run(calls) before restoring fetch in
// the finally - otherwise, for a test that makes more than one
// sequential fetch call (e.g. recommendTrackCheatWithAutoSync's
// sync-then-recommend), the finally runs as soon as the first await
// inside `run` suspends, restoring the REAL fetch before the second call
// ever happens.
async function withStubbedFetch(responses, run) {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    const next = responses.shift();
    if (next.throws) throw next.throws;
    return {
      ok: next.ok,
      status: next.status ?? (next.ok ? 200 : 500),
      json: async () => next.json
    };
  };
  try {
    return await run(calls);
  } finally {
    global.fetch = originalFetch;
  }
}

test("checkBackendHealth: calls the real /healthz path and reports reachable on a 200", async () => {
  delete process.env.BACKEND_URL;
  const { checkBackendHealth } = require("../src/main/backendClient.ts");

  const result = await withStubbedFetch([{ ok: true }], async (calls) => {
    const r = await checkBackendHealth();
    assert.equal(calls[0].url, "http://localhost:8080/healthz");
    return r;
  });

  assert.deepEqual(result, { reachable: true });
});

test("checkBackendHealth: a network error is caught and reported, never thrown", async () => {
  const { checkBackendHealth } = require("../src/main/backendClient.ts");

  const result = await withStubbedFetch([{ throws: new Error("ECONNREFUSED") }], () => checkBackendHealth());

  assert.equal(result.reachable, false);
  assert.match(result.error, /ECONNREFUSED/);
});

test("createBackendSession: sends the dev-token Authorization header, never a raw path/secret", async () => {
  process.env.BACKEND_DEV_TOKEN = "test-token-123";
  const { createBackendSession } = require("../src/main/backendClient.ts");

  const result = await withStubbedFetch(
    [{ ok: true, json: { ok: true, data: { sessionId: "s_1", chainId: "c_1", stateVersion: 0 } } }],
    async (calls) => {
      const r = await createBackendSession();
      assert.equal(calls[0].url, "http://localhost:8080/v1/sessions");
      assert.equal(calls[0].options.method, "POST");
      assert.equal(calls[0].options.headers.authorization, "Bearer test-token-123");
      return r;
    }
  );
  delete process.env.BACKEND_DEV_TOKEN;

  assert.deepEqual(result, { ok: true, sessionId: "s_1", chainId: "c_1", stateVersion: 0 });
});

test("createBackendSession: a non-ok HTTP response is reported as a clear failure, not thrown", async () => {
  const { createBackendSession } = require("../src/main/backendClient.ts");

  const result = await withStubbedFetch([{ ok: false, status: 401 }], () => createBackendSession());

  assert.equal(result.ok, false);
  assert.equal(result.error, "HTTP 401");
});

test("BACKEND_URL is configurable via process.env, read at call time (not before .env loads)", async () => {
  process.env.BACKEND_URL = "http://example.test:9999";
  const { checkBackendHealth } = require("../src/main/backendClient.ts");

  await withStubbedFetch([{ ok: true }], async (calls) => {
    await checkBackendHealth();
    assert.equal(calls[0].url, "http://example.test:9999/healthz");
  });
  delete process.env.BACKEND_URL;
});

// docs/decisions/0009: recommendTrackCheat no longer sends the library
// inline (that's what produced the real 413 on Ranjish's ~38,484-track
// library) - it sends only a libraryRevision. The library itself goes
// through syncLibraryToBackend, once, on its own route.

test("recommendTrackCheat: posts a libraryRevision, never an inline library", async () => {
  const { recommendTrackCheat } = require("../src/main/backendClient.ts");

  const serverResponse = {
    ok: true,
    data: { results: [{ trackId: 1, name: "A - B", bpm: 120, key: "8A", camp: null, lane: "pure" }], candidatePoolSize: 1, requested: 20, returned: 1, fallbackDepth: 0, simulated: true }
  };

  const result = await withStubbedFetch([{ ok: true, json: serverResponse }], async (calls) => {
    const r = await recommendTrackCheat({ libraryRevision: 7, seedTrackId: 1, vibe: -3, energy: 0, playCountMode: "mix" });
    assert.equal(calls[0].url, "http://localhost:8080/v1/track-cheat/recommend");
    assert.equal(calls[0].options.method, "POST");
    const sentBody = JSON.parse(calls[0].options.body);
    assert.deepEqual(sentBody, { libraryRevision: 7, seedTrackId: 1, vibe: -3, energy: 0, playCountMode: "mix" });
    assert.equal(sentBody.library, undefined, "the request must never carry an inline library array");
    return r;
  });

  assert.equal(result.ok, true);
  assert.equal(result.simulated, true);
  assert.equal(result.results.length, 1);
});

test("recommendTrackCheat: a server-reported failure (ok:false) is returned as a clear error, not thrown", async () => {
  const { recommendTrackCheat } = require("../src/main/backendClient.ts");

  const result = await withStubbedFetch(
    [{ ok: false, status: 400, json: { ok: false, error: { message: "library must be a non-empty array" } } }],
    () => recommendTrackCheat({ libraryRevision: 1, seedTrackId: 1, vibe: 0, energy: 0, playCountMode: "mix" })
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "library must be a non-empty array");
});

test("recommendTrackCheat: a LIBRARY_OUT_OF_SYNC failure carries its error code through, not just a message", async () => {
  const { recommendTrackCheat } = require("../src/main/backendClient.ts");

  const result = await withStubbedFetch(
    [{ ok: false, status: 409, json: { ok: false, error: { code: "LIBRARY_OUT_OF_SYNC", message: "libraryRevision 999 is stale or was never synced" } } }],
    () => recommendTrackCheat({ libraryRevision: 999, seedTrackId: 1, vibe: 0, energy: 0, playCountMode: "mix" })
  );

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "LIBRARY_OUT_OF_SYNC");
});

test("recommendTrackCheat: a network error is caught and reported, never thrown", async () => {
  const { recommendTrackCheat } = require("../src/main/backendClient.ts");

  const result = await withStubbedFetch([{ throws: new Error("ECONNREFUSED") }], () =>
    recommendTrackCheat({ libraryRevision: 1, seedTrackId: 1, vibe: 0, energy: 0, playCountMode: "mix" })
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /ECONNREFUSED/);
});

// Step 5, piece 4 (daisy-chain/votes): sessionId/clientSeq/expectedStateVersion
// are forwarded when the caller supplies them, and the response's chain/
// trigger/stateVersion fields come straight through - this is what lets the
// screen show chain depth and lets the next call carry the right clientSeq.

test("recommendTrackCheat: forwards sessionId/clientSeq/expectedStateVersion, and returns chain/trigger/stateVersion", async () => {
  const { recommendTrackCheat } = require("../src/main/backendClient.ts");

  const serverResponse = {
    ok: true,
    data: {
      results: [], candidatePoolSize: 1, requested: 20, returned: 0, fallbackDepth: 0, simulated: true,
      chain: { chainId: "c_1", depth: 2 }, trigger: "daisyChain", mode: "none", stateVersion: 5, superseded: false
    }
  };

  const result = await withStubbedFetch([{ ok: true, json: serverResponse }], async (calls) => {
    const r = await recommendTrackCheat({
      libraryRevision: 7, seedTrackId: 1, vibe: -3, energy: 0, playCountMode: "mix",
      sessionId: "s_1", clientSeq: 3, expectedStateVersion: 4
    });
    const sentBody = JSON.parse(calls[0].options.body);
    assert.equal(sentBody.sessionId, "s_1");
    assert.equal(sentBody.clientSeq, 3);
    assert.equal(sentBody.expectedStateVersion, 4);
    return r;
  });

  assert.deepEqual(result.chain, { chainId: "c_1", depth: 2 });
  assert.equal(result.trigger, "daisyChain");
  assert.equal(result.stateVersion, 5);
});

test("sendSessionEvent: posts the event to the real per-session events path and returns the server's accepted/stateVersion", async () => {
  const { sendSessionEvent } = require("../src/main/backendClient.ts");

  const result = await withStubbedFetch(
    [{ ok: true, json: { ok: true, data: { accepted: true, stateVersion: 6, duplicate: false } } }],
    async (calls) => {
      const r = await sendSessionEvent("s_1", { type: "vote", trackId: 42, value: "down", clientSeq: 9 });
      assert.equal(calls[0].url, "http://localhost:8080/v1/sessions/s_1/events");
      assert.equal(calls[0].options.method, "POST");
      const sentBody = JSON.parse(calls[0].options.body);
      assert.deepEqual(sentBody, { type: "vote", trackId: 42, value: "down", clientSeq: 9 });
      return r;
    }
  );

  assert.deepEqual(result, { ok: true, accepted: true, stateVersion: 6, duplicate: false });
});

test("sendSessionEvent: a STALE_EVENT response carries its error code through, not just a message", async () => {
  const { sendSessionEvent } = require("../src/main/backendClient.ts");

  const result = await withStubbedFetch(
    [{ ok: false, status: 409, json: { ok: false, error: { code: "STALE_EVENT" } } }],
    () => sendSessionEvent("s_1", { type: "vote", trackId: 1, value: "up", clientSeq: 1 })
  );

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "STALE_EVENT");
});

test("sendSessionEvent: a network error is caught and reported, never thrown", async () => {
  const { sendSessionEvent } = require("../src/main/backendClient.ts");

  const result = await withStubbedFetch([{ throws: new Error("ECONNREFUSED") }], () =>
    sendSessionEvent("s_1", { type: "vote", trackId: 1, value: "up", clientSeq: 1 })
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /ECONNREFUSED/);
});

test("syncLibraryToBackend: posts the lean track shape to /v1/library/sync and returns the revision", async () => {
  const { syncLibraryToBackend } = require("../src/main/backendClient.ts");
  const tracks = [{ id: 1, displayName: "A - B", artist: "A", title: "B", bpm: 120, key: "8A", genre: "house", year: 2020, playcount: 0 }];

  const result = await withStubbedFetch(
    [{ ok: true, json: { ok: true, data: { libraryRevision: 1, trackCount: 1 } } }],
    async (calls) => {
      const r = await syncLibraryToBackend(tracks);
      assert.equal(calls[0].url, "http://localhost:8080/v1/library/sync");
      assert.equal(calls[0].options.method, "POST");
      const sentBody = JSON.parse(calls[0].options.body);
      assert.deepEqual(sentBody, { tracks });
      assert.equal(sentBody.tracks[0].location, undefined, "CLAUDE.md 5.4: never send a location/path");
      return r;
    }
  );

  assert.deepEqual(result, { ok: true, libraryRevision: 1, trackCount: 1 });
});

test("syncLibraryToBackend: a server-reported failure is returned as a clear error, not thrown", async () => {
  const { syncLibraryToBackend } = require("../src/main/backendClient.ts");

  const result = await withStubbedFetch(
    [{ ok: false, status: 413, json: { ok: false, error: { message: "payload too large" } } }],
    () => syncLibraryToBackend([])
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "payload too large");
});

// docs/decisions/0009: the full sync-if-needed / resync-and-retry-once
// orchestration, tested as the plain function it is (no Electron/IPC
// needed) - this is what ipc.ts's backend:recommendTrackCheat handler
// actually calls.

test("recommendTrackCheatWithAutoSync: syncs first when there's no cached revision yet, then recommends with it", async () => {
  const { recommendTrackCheatWithAutoSync } = require("../src/main/backendClient.ts");
  const tracks = [{ id: 1, displayName: "A - B", artist: "A", title: "B", bpm: 120, key: "8A", genre: "house", year: 2020, playcount: 0 }];

  const { result, revision } = await withStubbedFetch(
    [
      { ok: true, json: { ok: true, data: { libraryRevision: 5, trackCount: 1 } } },
      { ok: true, json: { ok: true, data: { results: [], candidatePoolSize: 1, requested: 10, returned: 0, fallbackDepth: 0, simulated: true } } }
    ],
    async (calls) => {
      const r = await recommendTrackCheatWithAutoSync(() => tracks, null, { seedTrackId: 1, vibe: 0, energy: 0, playCountMode: "mix" });
      assert.equal(calls[0].url, "http://localhost:8080/v1/library/sync", "must sync first when there's no cached revision");
      assert.equal(calls[1].url, "http://localhost:8080/v1/track-cheat/recommend");
      assert.equal(JSON.parse(calls[1].options.body).libraryRevision, 5);
      return r;
    }
  );

  assert.equal(result.ok, true);
  assert.equal(revision, 5);
});

test("recommendTrackCheatWithAutoSync: skips the sync call entirely when a revision is already cached", async () => {
  const { recommendTrackCheatWithAutoSync } = require("../src/main/backendClient.ts");

  const { result, revision } = await withStubbedFetch(
    [{ ok: true, json: { ok: true, data: { results: [], candidatePoolSize: 1, requested: 10, returned: 0, fallbackDepth: 0, simulated: true } } }],
    async (calls) => {
      const r = await recommendTrackCheatWithAutoSync(() => [], 9, { seedTrackId: 1, vibe: 0, energy: 0, playCountMode: "mix" });
      assert.equal(calls.length, 1, "no sync call should happen when a revision is already cached");
      assert.equal(calls[0].url, "http://localhost:8080/v1/track-cheat/recommend");
      return r;
    }
  );

  assert.equal(result.ok, true);
  assert.equal(revision, 9);
});

test("recommendTrackCheatWithAutoSync: on LIBRARY_OUT_OF_SYNC, resyncs once and retries automatically - the caller never sees the raw error", async () => {
  const { recommendTrackCheatWithAutoSync } = require("../src/main/backendClient.ts");

  const { result, revision } = await withStubbedFetch(
    [
      { ok: false, status: 409, json: { ok: false, error: { code: "LIBRARY_OUT_OF_SYNC", message: "stale" } } },
      { ok: true, json: { ok: true, data: { libraryRevision: 12, trackCount: 1 } } },
      { ok: true, json: { ok: true, data: { results: [], candidatePoolSize: 1, requested: 10, returned: 0, fallbackDepth: 0, simulated: true } } }
    ],
    async (calls) => {
      const r = await recommendTrackCheatWithAutoSync(() => [], 9, { seedTrackId: 1, vibe: 0, energy: 0, playCountMode: "mix" });
      assert.equal(calls[0].url, "http://localhost:8080/v1/track-cheat/recommend", "first attempt uses the stale cached revision");
      assert.equal(calls[1].url, "http://localhost:8080/v1/library/sync", "resyncs automatically after LIBRARY_OUT_OF_SYNC");
      assert.equal(calls[2].url, "http://localhost:8080/v1/track-cheat/recommend");
      assert.equal(JSON.parse(calls[2].options.body).libraryRevision, 12, "retries with the FRESH revision, not the stale one");
      return r;
    }
  );

  assert.equal(result.ok, true, "the DJ sees a successful result, never the raw LIBRARY_OUT_OF_SYNC error");
  assert.equal(revision, 12, "the caller's cached revision is updated to the fresh one");
});

test("recommendTrackCheatWithAutoSync: if the resync itself fails, reports that failure instead of retrying forever", async () => {
  const { recommendTrackCheatWithAutoSync } = require("../src/main/backendClient.ts");

  const { result } = await withStubbedFetch(
    [
      { ok: false, status: 409, json: { ok: false, error: { code: "LIBRARY_OUT_OF_SYNC", message: "stale" } } },
      { ok: false, status: 500, json: { ok: false, error: { message: "server exploded" } } }
    ],
    async (calls) => {
      const r = await recommendTrackCheatWithAutoSync(() => [], 9, { seedTrackId: 1, vibe: 0, energy: 0, playCountMode: "mix" });
      assert.equal(calls.length, 2, "must not retry recommend again after the resync itself failed");
      return r;
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "server exploded");
});
