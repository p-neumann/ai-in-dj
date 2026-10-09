# 0008 - Raise Crate Cheat's dynamic max_tokens formula

**Date:** 2026-10-07
**Owner/source:** Ranjish, this session - approved after a real (billed) API call against the real ~38,486-track library reproduced the same symptom already fixed for Track Cheat (0006, 0007), this time in Crate Cheat's own, separate code path.
**Status:** Accepted

## Decision
Crate Cheat computes its own `max_tokens` with a formula (`crateOrchestration.js`), entirely separate from Track Cheat's fixed value - the Track Cheat fixes in 0006/0007 never touched this code.

Fix: raised the formula from `Math.min(8000, 2500 + requestCount*180)` to `Math.min(16000, 6000 + requestCount*180)`. Only the two constants changed; the formula still scales with `requestCount` exactly as before, and nothing about the prompt, candidate selection, or ranking was touched.

## The real evidence
A real, billed call - "house music for the dance floor," size 10 - computed `requestCount = 15` (size 10 + the formula's own +5 buffer), which under the old formula gave `max_tokens = 5200`. The logged real response:
```
in=148879   out=5200 (thinking=4522)
```
Thinking alone used 4,522 of the 5,200-token ceiling, leaving only 678 tokens for the actual answer. The raw answer text (captured directly from the server log, not reproduced) is valid, readable JSON - but it stops mid-array after exactly 10 of the 15 requested tracks, never reaching the closing bracket. The app's own `crateOrchestration.js` already had a specific check for this (`stop_reason === "max_tokens"` → `"Response cut off — hit the token limit before finishing"`), which is exactly what the user saw.

## Why this is the same root cause as 0006/0007, not a new bug
Same mechanism: Claude Sonnet 5's default thinking bills against the same `max_tokens` ceiling as the answer. Crate Cheat already had a *dynamic* formula (unlike Track Cheat's old flat constant), which is more thoughtful in principle, but its base (2500) and per-track slope (180) were sized before this model's thinking behavior existed, same as Track Cheat's original 2000.

## Why these specific numbers
For the exact failing request, the new formula gives `min(16000, 6000 + 15*180) = 8700` - about 4,200 tokens of headroom above the 4,522 thinking tokens actually observed, versus the old formula's 678 tokens of headroom (which failed). The new outer cap of 16000 matches Track Cheat's already-proven-safe ceiling (0007) against a similarly real-library-sized prompt. The formula's shape (scales with `requestCount`) is preserved so larger crate requests still get proportionally more room, same as before.

## Why this is safe
- Only the two constants in one line changed. No prompt text, candidate selection, ranking, or dedup logic was touched.
- Confirmed via the full Crate Cheat test suite (33 tests across `crateEngine.test.js`, `crateOrchestration.test.js`, `crateSizeMatrix.test.js`) - all still pass, no test needed updating. Expected, same reason as 0006/0007: the mock provider never generates thinking tokens, so no test was ever sensitive to this value - which is also why this went uncaught until a real call hit it.

## Consequences
- Same caveat as 0007: 16000 is a considered, generous step, not a guarantee. A future real call against an even larger/more complex crate request that exhausts this too should be logged with the same real evidence (stop_reason, thinking_tokens, raw answer text), not silently bumped again.
- Slightly higher *possible* cost/latency per call if the model genuinely uses more of the new ceiling - only applies to calls that would have failed outright before.
- The real evidence also showed `in=148879` for this one Crate Cheat call - a much larger input than anything seen in Track Cheat's real testing. That's a separate, already-documented concern (R3 in CLAUDE.md: Crate Cheat's context size is not capped the way Track Cheat's is) - not something this fix addresses, flagged here only because it's visible in the same evidence.
