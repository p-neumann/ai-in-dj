// docs/decisions/0010: real per-call timing/token-usage diagnostics, and a
// test-only model/effort override for Ranjish's blind Sonnet-5-vs-lower-
// effort-vs-Haiku comparison (real 2-minute single-call latency report had
// no data to diagnose it from). Pure observability plus a request field the
// real desktop app's normal Track Cheat path never sends - neither changes
// which songs get picked.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { sampleLibrary } from "../fixtures/sampleLibrary.js";
import { recommend, recommendOk, DEV_TOKEN } from "./helpers.js";

function makeApp(provider) {
  return buildApp({ devTokens: [DEV_TOKEN], provider });
}

function capturingProvider(response = { content: [{ text: "[]" }] }) {
  const calls = [];
  return {
    provider: {
      kind: "mock",
      async call(body) {
        calls.push(body);
        return response;
      }
    },
    calls
  };
}

test("default request: no debugOverride means the request sent to the provider is unchanged - still claude-sonnet-5, no output_config.effort", async () => {
  const { provider, calls } = capturingProvider();
  const app = makeApp(provider);

  // vibe:0 (not the default -3) - R28's fallback chain only fires at a
  // negative vibe with a thin result count; at 0 the empty mock response
  // still produces exactly one call, which is what this test is about.
  await recommendOk(app, { library: sampleLibrary, seedTrackId: "t1", vibe: 0 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "claude-sonnet-5");
  assert.equal(calls[0].output_config, undefined, "no debugOverride means no output_config.effort is sent - behavior is byte-for-byte what shipped before");
});

test("debugOverride.model and debugOverride.effort are forwarded to the provider's request body", async () => {
  const { provider, calls } = capturingProvider();
  const app = makeApp(provider);

  await recommendOk(app, {
    library: sampleLibrary, seedTrackId: "t1", vibe: 0,
    debugOverride: { model: "claude-haiku-4-5", effort: "low" }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "claude-haiku-4-5");
  assert.deepEqual(calls[0].output_config, { effort: "low" });
});

test("a debugOverride with only effort (no model) keeps the real model but still sets output_config.effort", async () => {
  const { provider, calls } = capturingProvider();
  const app = makeApp(provider);

  await recommendOk(app, {
    library: sampleLibrary, seedTrackId: "t1", vibe: 0,
    debugOverride: { effort: "medium" }
  });

  assert.equal(calls[0].model, "claude-sonnet-5");
  assert.deepEqual(calls[0].output_config, { effort: "medium" });
});

test("the response carries aiCalls with real per-call model/effort/latency/token-usage diagnostics", async () => {
  const { provider } = capturingProvider({
    content: [{ text: "[]" }],
    usage: { input_tokens: 1234, output_tokens: 567, output_tokens_details: { thinking_tokens: 400 } }
  });
  const app = makeApp(provider);

  const data = await recommendOk(app, { library: sampleLibrary, seedTrackId: "t1", vibe: 0 });

  assert.ok(Array.isArray(data.aiCalls), "expected an aiCalls array on the response");
  assert.equal(data.aiCalls.length, 1);
  const call = data.aiCalls[0];
  assert.equal(call.model, "claude-sonnet-5");
  assert.equal(call.effort, "default");
  assert.equal(call.inputTokens, 1234);
  assert.equal(call.outputTokens, 567);
  assert.equal(call.thinkingTokens, 400);
  assert.equal(typeof call.elapsedMs, "number");
  assert.equal(call.simulated, true, "the mock provider's kind is 'mock', not 'anthropic' - this must read as simulated");
  assert.equal(typeof data.timingsMs.ai, "number", "timingsMs.ai (CLAUDE.md 6.4's own named field) must still be present");
});

test("aiCalls accumulates one entry per real AI call, including R28 fallback attempts - not just the first", async () => {
  // A library too small/odd to produce >=10 results on the first try at a
  // negative vibe triggers R28's fallback chain (trackCheatPhase4.test.js
  // already proves the chain itself fires correctly; this test only checks
  // that every attempt's diagnostics land in aiCalls, not just the first).
  const smallLibrary = [
    { id: "seed", artist: "Seed", title: "Origin", bpm: "120", key: "8A", genre: "hip hop", year: "2020", playcount: "5" },
    { id: "one", artist: "A", title: "One", bpm: "120", key: "8A", genre: "hip hop", year: "2020", playcount: "1" }
  ];
  const { provider } = capturingProvider({ content: [{ text: "[]" }] });
  const app = makeApp(provider);

  const data = await recommendOk(app, { library: smallLibrary, seedTrackId: "seed", vibe: -3 });

  assert.ok(data.aiCalls.length >= 2, `expected the fallback chain to produce at least 2 logged AI calls, got ${data.aiCalls.length}`);
  assert.equal(data.aiCalls.length, data.fallbackDepth + 1, "one aiCalls entry per attempt actually made, including fetch #1");
});
