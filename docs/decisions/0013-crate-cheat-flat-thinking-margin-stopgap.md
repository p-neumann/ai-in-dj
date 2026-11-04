# 0013 — Crate Cheat max_tokens: flat thinking margin (STOPGAP, 3rd time for this failure)

**Status:** Stopgap applied. Explicitly NOT a real fix — see "What this doesn't solve" below.
**Date:** 2026-10-30

## This is the third time this exact failure has been patched

- `0008` (2026-10-07 root cause, fixed 10-12, commit `0de72f9`): `requestCount` 15, old formula gave 5200, thinking used 4522, only 678 left — cut off. Raised to `min(16000, 6000 + requestCount*180)`.
- **This document (2026-10-30):** the *same* `requestCount` 15, the *raised* formula gave 8700, thinking used 5654 — succeeded, but with only 2099 tokens left (24% margin). One unlucky thinking draw away from failing again.

Both real failures happened at the **same, small** `requestCount` (15 — a size-10 crate). That's not a coincidence worth ignoring.

## What the new data showed (full numbers in docs/QUESTIONS.md)

Three real calls the same day:

| Prompt | Pool | Thinking tokens | Visible answer tokens |
|---|---|---|---|
| "hip hop song" | 327 | 5,654 | 947 |
| "club bangers" | 758 | 2,898 | 1,002 |
| "late night vibes" | 664 | 1,869 | 846 |

Thinking does **not** scale with candidate-pool size or (as far as we can tell) with `requestCount` — the smallest pool produced the most thinking. The old formula's single blended term (`base + requestCount*180`) implicitly assumed thinking scales with how many tracks are requested. It doesn't, on this evidence. That assumption is why small crates (low `requestCount` → low ceiling) are the ones that keep failing: they get the least room precisely where thinking's real variance doesn't care how small the request is.

Visible answer size, by contrast, *is* stable and request-size-dependent — 846–1002 tokens across these calls, and separately, 947 tokens for the one call where we also know `requestCount` (15) → 63.1 tokens/track.

## The fix: split one blended term into two independent ones

```js
const CRATE_THINKING_MARGIN = 12000;       // flat - does NOT shrink as requestCount shrinks
const CRATE_ANSWER_TOKENS_PER_TRACK = 70;  // scales with requestCount - this part legitimately does
const dynamicMaxTokens = Math.min(16000, CRATE_THINKING_MARGIN + requestCount * CRATE_ANSWER_TOKENS_PER_TRACK);
```

**How `12000` was picked:** the worst real Crate Cheat thinking draw seen so far is 5,654. The worst thinking draw seen on *any* real call against this model/effort in this codebase is 7,711 (Track Cheat's own A/B/C/D comparison, `docs/QUESTIONS.md`) — used as the baseline instead of Crate Cheat's own smaller number, since nothing supports an assumption that Crate Cheat's thinking is capped below what the same model/effort has already produced elsewhere. `12000` is ~1.5x that number — real headroom on top of the highest real figure we have, not just enough to barely clear it.

**How `70`/track was picked:** rounded up from the one real data point where both `requestCount` and the actual visible-answer size are known (947 ÷ 15 = 63.1/track). One data point, so rounded up generously rather than trusted precisely.

**The outer cap (16000) is unchanged.** Both real failures happened at the small end. Nothing in the new data suggests large crates need more room, so that number wasn't touched.

**Effect on the actual failing case** (requestCount 15): old ceiling 8700 (2099 margin after the real 6601 used). New ceiling: `min(16000, 12000 + 15*70) = 13050` (6449 margin after that same 6601 — triple the old margin).

## What this doesn't solve

This is a stopgap, not a fix, for two reasons:

1. **We still don't know what actually causes thinking to spike**, only that it isn't pool size or (apparently) request size. A bigger flat margin tolerates the variance; it doesn't explain or reduce it.
2. **This is the second time *this specific formula* has needed a structural change**, not just a bigger number. If a fourth real failure happens, the next question shouldn't be "raise it again" — it should be whether a fixed ceiling is the right approach at all for a thinking budget that varies this much.

The real lever for *reducing* thinking (rather than tolerating more of it) is the `effort` parameter, which Crate Cheat doesn't use at all today. That decision — raise-or-lower, same question Track Cheat already has open — is written up for Mike in `docs/QUESTIONS.md`, combined with this one, rather than decided here.

## Also closed in this change: the knowledge-call logging gap

`resolveCuratedTracks` (`knowledgeCalls.js`) makes a real, separately billed AI call whenever `buildCrate`'s gating can't match a genre/artist/tropical/old-school/remix/style keyword (e.g. "late night vibes") — and until now it logged nothing. Its real token usage was invisible the same way the main build call's was before `0012`. Added the same unconditional, logged-before-any-branch diagnostics (`model`, `elapsedMs`, `maxTokensAllowed`, `inputTokens`, `outputTokens`, `thinkingTokens`, `stopReason`) as a `[crate-cheat] knowledge call (curatedTracks): ...` console line. The other three knowledge-call functions in the same file (`resolveStyleProfileEnrichment`, `resolveSeedYearFromKnowledge`, `resolveEraFromKnowledge`) have the identical gap and were **not** touched here — out of scope for this change, left as a known follow-up if it matters later.

130/130 server tests pass. No ranking, pool-selection, or result logic changed.
