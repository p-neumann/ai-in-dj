// docs/decisions/0017. Shared by Track Cheat (routes/trackCheat.js) and
// Crate Cheat (engine/crateOrchestration.js) - one real AI call, watched
// for exactly two situations, each retried the same way:
//
//   1. The response comes back cut off (stop_reason: "max_tokens").
//   2. ~45 seconds pass with nothing back - cancelled rather than left to
//      run to whatever the full HTTP timeout would be (Ranjish's own
//      call: this is error recovery, not a change to Mike's recommendation
//      behavior, so it doesn't need his approval the way a ranking or
//      prompt change would).
//
// Either one gets exactly ONE retry, forced to effort "low" regardless of
// what effort the first attempt used. If the retry ALSO hits either
// situation, it is reported honestly as a real failure - no second retry,
// no silent loop. Any other kind of failure (rate limited, overloaded,
// network down, a genuinely malformed response) is NOT retried here and
// passes straight through unchanged - this only reacts to the two named
// situations, nothing else.
//
// Does not touch max_tokens ceilings, prompts, candidate selection, or
// ranking. The only thing a retry changes is `output_config.effort` on
// one repeated call.

const SOFT_TIMEOUT_MS = 45000;

// `timeoutMs` defaults to the real ~45s and is only ever overridden by
// this file's own tests (to prove the timeout path without a real test
// actually waiting 45 seconds) - every real call site (trackCheat.js,
// crateOrchestration.js) calls this with just (provider, requestBody).
export async function callWithEffortRetry(provider, requestBody, timeoutMs = SOFT_TIMEOUT_MS) {
  const firstEffort = (requestBody.output_config && requestBody.output_config.effort) || "default";
  const first = await attemptOnce(provider, requestBody, timeoutMs);

  if (!first.timedOut && first.response.stop_reason !== "max_tokens") {
    return { response: first.response, elapsedMs: first.elapsedMs, effortUsed: firstEffort, retried: false, retryReason: null };
  }

  const retryReason = first.timedOut ? "timeout" : "max_tokens";
  const retryBody = { ...requestBody, output_config: { effort: "low" } };
  const retry = await attemptOnce(provider, retryBody, timeoutMs);

  if (retry.timedOut) {
    // Unlike a cut-off response (below), a timeout leaves no response
    // object at all to hand back - there's nothing for a caller's own
    // parsing/error logic to reject, so this has to throw here.
    const err = new Error("Retry at low effort also passed " + timeoutMs / 1000 + "s with nothing back.");
    err.retryReason = "timeout";
    throw err;
  }

  // If the retry is ALSO cut off, this deliberately does NOT throw its
  // own error - it returns the still-truncated response exactly like a
  // non-retried cutoff would, so each caller's own existing, already-
  // tested "what to tell the DJ when the model got cut off" logic
  // handles it the same way either way, instead of this shared helper
  // inventing a second, slightly different error shape.
  return {
    response: retry.response,
    elapsedMs: retry.elapsedMs,
    effortUsed: "low",
    retried: true,
    retryReason,
    firstAttemptElapsedMs: first.elapsedMs
  };
}

async function attemptOnce(provider, requestBody, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await provider.call(requestBody, { signal: controller.signal });
    return { response, elapsedMs: Date.now() - startedAt, timedOut: false };
  } catch (err) {
    if (controller.signal.aborted) {
      return { response: null, elapsedMs: Date.now() - startedAt, timedOut: true };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
