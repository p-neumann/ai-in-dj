# 0012 — Crate Cheat: per-call token diagnostics, and an honest cutoff message

**Status:** Done (logging + message only — no limit or formula changed)
**Date:** 2026-10-30
**Source:** Ranjish, real failed call: prompt "music for the hip hop", size 10 (smallest menu option), play-count mix, real AI on. Error shown: "Response cut off, hit the token limit before finishing. Try a smaller track count."

## What happened

The Oct 12 max_tokens fix (`0008`, commit `0de72f9`) is confirmed present and unmodified. Tracing the actual request through `buildCrate`/`runBuildCrateBody` showed:

- `extractGenreFromPrompt("music for the hip hop")` matches the `"hip hop"` keyword directly, so `quickNoMatch` is `false` — no knowledge-resolver call ran first.
- No other `nonLockExtra` bump applied (not deep mode, no old-school/remix/style-lock/doNotPlay/unknown-genre-anchors).
- `requestCount = 10 + 5 = 15`, `dynamicMaxTokens = min(16000, 6000 + 15*180) = 8700` — the *exact same numbers* as the scenario `0008` tested and declared fixed.

So the formula did not regress and was not bypassed. It failed anyway, and there was no way to tell why: `runBuildCrateBody` threw on `stop_reason === "max_tokens"` without ever reading `data.usage` first, so the real input/output/thinking token counts for that call were discarded the instant it failed. `Fastify({ logger: false })` means the route's own `request.log?.error?.(err)` call is a no-op, and `anthropicProvider.js` logs nothing on its own either. No real evidence of the actual token split for that call exists anywhere.

## What this change does

1. **Diagnostics (mirrors Track Cheat's existing `callAndResolve` logging, `0010`):** immediately after `provider.call(requestBody)` returns — before the success/failure branches — log `model`, `elapsedMs`, `maxTokensAllowed`, `inputTokens`, `outputTokens`, `thinkingTokens`, and `stopReason` to the console as `[crate-cheat] AI call: ...`. This fires on every call, success or failure, so a future cutoff prints real numbers instead of nothing.
2. **Honest error message:** the max_tokens cutoff message no longer says "Try a smaller track count" — that line is not just unhelpful at size 10 (the smallest menu option), it's not even true: the same ceiling applies at size 10 as at size 25. The new message reports the real `outputTokens`/`maxTokensAllowed`/`thinkingTokens` for that call and tells the DJ this isn't caused by the size they picked.

## What this change does NOT do

- No `max_tokens` ceiling, `requestCount` formula, or any other musical-behavior number changed.
- No new AI call added, no change to candidate selection, ranking, or prompts.
- Diagnostics are server console output only — not returned to the client, not shown in the UI (same scope as Track Cheat's existing logging).

## Next step

Re-run the exact same failing request ("music for the hip hop", size 10, mix) with this logging in place and read the real `outputTokens`/`thinkingTokens`/`stopReason` from the server console before deciding whether to raise anything.
