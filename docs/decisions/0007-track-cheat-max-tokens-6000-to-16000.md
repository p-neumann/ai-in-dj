# 0007 - Raise Track Cheat's response size limit from 6000 to 16000 (supersedes part of 0006)

**Date:** 2026-10-07
**Owner/source:** Ranjish, this session - approved after real (billed) API calls against the real ~38,486-track library reproduced the same symptom 0006 fixed, at a higher ceiling.
**Status:** Accepted
**Supersedes:** docs/decisions/0006 (that record stays as a true account of what was decided and why on 2026-10-06; this one documents why the number it picked turned out insufficient for a harder real-world case, and what changed)

## Decision
0006 raised Track Cheat's `max_tokens` from 2000 to 6000 after thinking exhausted the original 2000-token ceiling on a tiny 8-track test library. That fix was correct as far as it went, but 6000 was only ever validated against that tiny library's worst case.

Testing against the real, full-size library surfaced the identical symptom at the new ceiling: a daisy-chain Track Cheat call (Style Drift hybrid mode, ~100 real candidate tracks) failed with "Model response was not valid JSON: No JSON" - same error, same code path (`buildRequestBody` in `apps/server/src/routes/trackCheat.js`), same root cause (thinking using up the entire token budget, leaving none to write the answer).

Fix: increased `max_tokens` from 6000 to 16000, in the same one place. Nothing about the prompt text, the candidate list, or how songs get picked or ranked was touched - only the response-size ceiling, exactly like 0006.

## Why this needed a second look instead of just confirming 0006
0006's fix was tested and confirmed working, but only against a deliberately tiny 8-track test library. Nobody had yet tried a Track Cheat call against Mike's real-sized library with a hybrid mode (Style Drift) active. That combination produces a much longer, more complex prompt (a full ~100-track candidate list plus extra hybrid-mode instructions), and the model's "thinking" scaled up accordingly - far past what 6000 could hold.

## The real evidence
Three consecutive real, billed API calls - the daisy-chain fetch itself, then both of R28's automatic fallback attempts - each came back as:
```
stop_reason: "max_tokens"
usage.output_tokens: 6000
usage.output_tokens_details.thinking_tokens: 5999
```
All three times, the model used 5999 of its 6000-token allowance just thinking, leaving a single token for the actual answer - so all three produced an empty response, and the real raw answer text logged for each was literally blank. This is not a one-off: it happened on the initial call and on both fallback retries, back to back.

## Why 16000, specifically
Checked against Anthropic's current published limits (via the project's claude-api reference): Claude Sonnet 5's own output ceiling is 128,000 tokens, so there was no technical reason to stay anywhere near 6000 once it was shown to be too tight. 16000 was chosen as a deliberately large step up - roughly 2.7x the 5999 thinking tokens actually observed in the failing calls - rather than a small nudge, since this is now the second time an arbitrary-feeling number proved too tight on a harder real-world case. The real answer itself (a 20-track JSON list) only ever needs about 400-500 tokens, so even if this harder prompt's thinking runs up near 15,000 tokens, there's still room to actually answer.

## Why this is safe
- **Only one thing changed again:** the number passed as `max_tokens`. No prompt text, candidate list, filtering, or ranking logic was touched.
- This is a config-only change, approved the same way as 0006: real evidence first, plain-English write-up, explicit sign-off, before touching code.

## Consequences
- 16000 is a considered, generous step, not a guarantee. If a future real call against an even larger or more complex prompt (e.g. several merged type-locks per R3, or a very large crossover/native hybrid batch) exhausts 16000 the same way, that should be logged with the same real evidence (stop_reason, thinking_tokens, raw answer text) rather than silently bumped again.
- A higher ceiling means a higher *possible* cost and latency per call if the model ever genuinely uses most of it - in practice this only applies to calls that would have failed outright before, so it is not a new cost on anything that previously worked. The three failing real calls that led to this fix cost ≈$0.33 combined for zero usable results - a cost this fix is intended to stop recurring.
- If thinking usage keeps climbing with larger real libraries, the better long-term fix may not be an ever-larger `max_tokens` but switching this call to streaming (already named as option (c) in 0006/docs/QUESTIONS.md) to avoid any request-timeout risk at a high ceiling - not needed yet, but worth revisiting if 16000 is ever exhausted too.
