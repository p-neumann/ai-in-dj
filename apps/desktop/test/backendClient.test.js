// Phase 5, step 5 piece 1 - the pipe to the real backend. These test the
// REQUEST SHAPE (right URL, right header) with a stubbed global.fetch -
// not the real network, since that needs apps/server actually running.
// The real end-to-end proof is the real-window check (see
// docs/phase-reports/phase-5.md), same as every other Electron-specific
// piece in this project.

const { test } = require("node:test");
const assert = require("node:assert/strict");

function withStubbedFetch(responses, run) {
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
    return run(calls);
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
