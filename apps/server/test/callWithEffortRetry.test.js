// docs/decisions/0017. No real AI calls - fake providers simulate each
// situation directly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { callWithEffortRetry } from "../src/providers/callWithEffortRetry.js";

function neverResponds() {
  return {
    kind: "mock",
    call(_requestBody, options) {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }
  };
}

test("callWithEffortRetry: a normal successful call is returned as-is, no retry", async () => {
  const provider = {
    kind: "mock",
    async call() {
      return { stop_reason: "end_turn", content: [{ text: "[]" }], usage: {} };
    }
  };
  const result = await callWithEffortRetry(provider, { model: "claude-sonnet-5" });
  assert.equal(result.retried, false);
  assert.equal(result.retryReason, null);
  assert.equal(result.effortUsed, "default");
  assert.equal(result.response.stop_reason, "end_turn");
});

test("callWithEffortRetry: reports the request's own chosen effort when not retried", async () => {
  const provider = {
    kind: "mock",
    async call() {
      return { stop_reason: "end_turn", content: [{ text: "[]" }], usage: {} };
    }
  };
  const result = await callWithEffortRetry(provider, { model: "claude-sonnet-5", output_config: { effort: "high" } });
  assert.equal(result.effortUsed, "high");
  assert.equal(result.retried, false);
});

test("callWithEffortRetry: a cut-off response (stop_reason max_tokens) retries once at low effort", async () => {
  let calls = 0;
  const provider = {
    kind: "mock",
    async call(requestBody) {
      calls++;
      const effort = requestBody.output_config && requestBody.output_config.effort;
      if (effort === "low") return { stop_reason: "end_turn", content: [{ text: "[]" }], usage: {} };
      return { stop_reason: "max_tokens", content: [{ text: "[" }], usage: {} };
    }
  };
  const result = await callWithEffortRetry(provider, { model: "claude-sonnet-5" });
  assert.equal(calls, 2);
  assert.equal(result.retried, true);
  assert.equal(result.retryReason, "max_tokens");
  assert.equal(result.effortUsed, "low");
  assert.equal(result.response.stop_reason, "end_turn");
});

test("callWithEffortRetry: if the retry ALSO hits max_tokens, the still-truncated response is returned (not thrown here) so each caller's own existing cutoff handling applies, same as a non-retried cutoff would", async () => {
  let calls = 0;
  const provider = {
    kind: "mock",
    async call() {
      calls++;
      return { stop_reason: "max_tokens", content: [{ text: "[" }], usage: {} };
    }
  };
  const result = await callWithEffortRetry(provider, { model: "claude-sonnet-5" });
  assert.equal(calls, 2);
  assert.equal(result.retried, true);
  assert.equal(result.retryReason, "max_tokens");
  assert.equal(result.response.stop_reason, "max_tokens");
});

test("callWithEffortRetry: a call that never responds within the soft timeout is cancelled and retried at low effort", async () => {
  let secondCallEffort = null;
  const provider = {
    kind: "mock",
    async call(requestBody, options) {
      if (requestBody.output_config && requestBody.output_config.effort === "low") {
        secondCallEffort = "low";
        return { stop_reason: "end_turn", content: [{ text: "[]" }], usage: {} };
      }
      return neverResponds().call(requestBody, options);
    }
  };
  const result = await callWithEffortRetry(provider, { model: "claude-sonnet-5" }, 20);
  assert.equal(result.retried, true);
  assert.equal(result.retryReason, "timeout");
  assert.equal(result.effortUsed, "low");
  assert.equal(secondCallEffort, "low");
});

test("callWithEffortRetry: if the retry ALSO times out, it fails honestly - no second retry", async () => {
  const provider = neverResponds();
  await assert.rejects(() => callWithEffortRetry(provider, { model: "claude-sonnet-5" }, 20), /passed 0\.02s with nothing back/);
});

test("callWithEffortRetry: a different real failure (not max_tokens, not a timeout) is never retried", async () => {
  let calls = 0;
  const provider = {
    kind: "mock",
    async call() {
      calls++;
      const err = new Error("Rate limited");
      err.code = "RATE_LIMITED";
      throw err;
    }
  };
  await assert.rejects(() => callWithEffortRetry(provider, { model: "claude-sonnet-5" }), /Rate limited/);
  assert.equal(calls, 1);
});
