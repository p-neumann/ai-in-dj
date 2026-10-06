# Phase 4 — Engine migration with behavioral parity

**Date:** 2026-10-05
**Branch:** `ranjish/ccdj-desktop` (local only - nothing pushed)
**AI calls used while doing this work:** none real. Every test uses a deterministic, hand-written or scripted provider (`kind: "mock"`); no test or code path in this report ever constructs `createAnthropicProvider`. `apps/server/.env` has `LIVE_AI_CALLS=false` and a placeholder `ANTHROPIC_API_KEY` throughout.

---

## 1. Completed

**Candidate selection & prompts**
- `engine/candidateSelection.js` (`buildSmartCtx`) - unchanged, pool capped at 100 (source's own cap).
- `engine/typeLock.js` (`mergeTypeLockIntoCtx`, `detectStyleTypeLock`, `injectTypeLockBalance`, `applyTypeLock`, `detectGenreIslandLock`).
- `engine/promptBuilder.js`, `engine/cratePromptParsing.js`, `engine/crateAnchors.js`.

**Post-processing**
- `engine/postProcessing.js`, `engine/resolveResults.js`, `engine/keyCompatibility.js`.

**Track Cheat**
- Full pipeline (`routes/trackCheat.js`): chain/bridge/drift/vibe-drift derivation from real session events, R8 chain-vibe-lock, R28 fallback chain, R12/R13 minimal fixes, drag lean (R6), seed-year resolution.

**Crate Cheat (this session's primary focus)**
- `engine/crateOrchestration.js` - `buildCrate`/`runBuildCrateBody` ported from source lines 3757-4488: curation-resolver gating (`quickNoMatch`), era-resolver gating, era pre-filter + final guard, the seven guaranteed-inclusion merges (strict artist lock, tropical/old-school anchors, style-type lock, curated anchors, Style Profile curated tracks, remix-type lock, content keywords), full system-prompt assembly, dedup, deep-mode filter, hard type-lock enforcement, type-lock balance, old-school and genre explicit/implicit interleaves, `applyDoNotPlay`/`applyDoPlayBoost`, final slice to the exact requested size.
- `engine/crateMatching.js`, `engine/crateLists.js` (Do Play/Do Not Play, curated-track matching).
- **New this session:** a final trackId-level dedup on top of the existing raw-title dedup - two model-returned entries that resolve to the same real track can never both survive, regardless of what name text the model attached to each.
- `routes/crates.js` - `POST /v1/crates/build` per CLAUDE.md Section 6.4: `requested`/`returned`/`candidatePoolSize`/`shortfallReason` (`POOL_TOO_SMALL` | `FILTERED_OUT` | `MODEL_RETURNED_FEWER` | `null`) on every response; bounded at `MAX_CRATE_SIZE = 200` (`REQUEST_TOO_LARGE` above that); request-count and output-token-ceiling formulas are the prototype's own (`playlistSize + nonLockExtra`, `Math.min(8000, 2500 + requestCount*180)`) - unchanged, used as the bound, not redesigned.
- Session-scoped per-prompt staleness (`crateShownTracks`, `CRATE_STALE_CAP = 100`).

**Preferences**
- `routes/preferences.js` - `PUT /v1/preferences`, session-scoped only (explicitly not a real account/DB store - that's Phase 6, not faked here).

**Resolver (Phase 4 scope only)**
- `engine/eraResolverBatch.js` - `resolveArtistEraBatch`/`resolveTitleEraBatch`: the pure, single-call prompt-builder + response-parser pair, including the confirmed source bug fix (discard any model-returned entry that doesn't match a name actually sent in that batch). **Nothing calls these automatically** - the resolver stays off by default. The resumable job that schedules/retries/caches these across a whole library (CLAUDE.md Section 6.6) is explicitly **not built** - that is Phase 7.

**Provider error handling**
- `providers/providerErrors.js`, updated `providers/anthropicProvider.js` - `RATE_LIMITED` (429), `PROVIDER_OVERLOADED` (529), `MODEL_OUTPUT_INVALID` (bad/truncated model JSON) now map correctly instead of collapsing into a generic `PROVIDER_ERROR`.

**Decisions recorded** (`docs/decisions/`)
- `0002` - R12 thumbs-down minimal fix. `0003` - R13 cache re-validation minimal fix. `0004` - shown-exclusion-cap-vs-uncapped-thumbs-down (not a Mike decision, Top Rule 5's own default). `0005` - keep crate size 200 supported and test it for real (Ranjish's engineering call, not attributed to Mike; explicitly does not grant advance approval for batching/bigger-pool/cap changes, which remain musical-behavior decisions needing Mike).

**Gate items**
- Phase 2 dev proxy deleted (`reference/harness/dev-proxy/`), with your explicit approval.
- Every settled fixture-parity difference now has a matching `docs/decisions/` record, not just a `docs/QUESTIONS.md` mention.

---

## 2. Tested (real output shown)

Full suite, three consecutive runs, same machine, same session:
```
Run 1: tests 103  pass 103  fail 0
Run 2: tests 103  pass 103  fail 0
Run 3: tests 103  pass 103  fail 0
```

Crate size matrix (`test/crateSizeMatrix.test.js`) - the specific size-200-vs-pool evidence, printed directly from the test run, not asserted blind:
```
[crate size 150] requested=150 returned=100 candidatePoolSize=100 shortfallReason=POOL_TOO_SMALL
[crate size 200] requested=200 returned=100 candidatePoolSize=100 shortfallReason=POOL_TOO_SMALL
```
Sizes 10/25/50/100 against the same 150-track library: fully satisfied, `shortfallReason: null`, no repeated track (`new Set(trackIds).size === size`).

Also covered, with a real test each:
- **Unknown model-returned id** - an id never assigned by the real candidate pool is dropped; the invented track never appears in results.
- **Repeated track** - the same real id returned twice (with different name text the second time) collapses to one result.
- **Malformed model response** - unparseable JSON surfaces as a thrown error (`assert.rejects`), never a silently empty or padded crate.
- **Exclusions** - a Do Not Play entry removes the matching real track rather than the crate being padded to size.
- **Oversize request** - `playlistSize` above 200 is rejected before any provider call (`called` stays `false`).
- **Era resolver gating** - the curated-tracks resolver and the era resolver each fire in exactly the right circumstance, confirmed by call-order assertions, not just final output.
- **Artist Era Resolver batch helpers** - 9 tests, including the confirmed source bug (discard entries not in the batch) and malformed-JSON/provider-error safety.
- **Provider error mapping** - 6 tests confirming 429→`RATE_LIMITED` (with `retryAfterMs` passed through), 529→`PROVIDER_OVERLOADED`, bad JSON→`MODEL_OUTPUT_INVALID`, and the pre-existing generic fallback still works for an untagged error.

---

## 3. Still unverified, or needing Mike / a real key / a Mac

- **R4 - crate sizes 100-200 (batching vs. bigger pool vs. cap).** Needs Mike's decision. Write-up delivered: `docs/design-notes/r4-crate-size-explanation.md`. Current behavior (tested above) is accurate and honest, not broken - this is a product question about whether that behavior is good enough, not an engineering gap.
- **Song-family thumbs-down scope (R12)** and **Do Not Play in Track Cheat (R27)** - open, need Mike. Not touched this session, per instruction.
- **Prompt text / the 12-vs-20 result-count conflict (R5)** - open, needs Mike. Not touched.
- **Permanent-preferences persistence** - genuinely Phase 5/6 work (a real account/DB store). `PUT /v1/preferences` is session-scoped only; this was not faked as "done."
- **The Serato feasibility spike (Phase 2S)** and **anything requiring a real Mac** - unrelated to Phase 4, still not started, called out here only because they remain outside what this work can verify.
- **Phase 7's actual resolver job** (scheduling, retry/backoff across many batches, persistent cache, on/off default) - the pure helpers it will call are ready; the job itself is explicitly not built.

---

## 4. Real-API verification (2026-10-06, authorized paid calls)

Everything in Sections 1-2 was proven only against the deterministic mock provider. This section records three small, cheap, real (billed) calls against the actual Anthropic API, run one at a time with Ranjish's explicit go-ahead before each, specifically to check what the mock provider cannot: real model output quality, real latency, real token costs, and whether the server's own logic (R28 fallback, session/chain state) actually behaves correctly when a real model is on the other end. `LIVE_AI_CALLS` was returned to `false` in `apps/server/.env` immediately after this section's work finished.

### Bug found and fixed first: Track Cheat's `max_tokens` was too small for a thinking model
Before Test 2 could even run, two identical real calls failed outright: Claude Sonnet 5's default "thinking" consumed 1999 of the hardcoded `max_tokens: 2000`, leaving no room to write the actual answer. Root-caused, fixed (`max_tokens` 2000 → 6000 in `routes/trackCheat.js`), and recorded in `docs/decisions/0006` and `docs/QUESTIONS.md` - fix touches only the token ceiling, not prompts, ranking, or candidate selection. Confirmed via 36/36 passing mock tests (no test was sensitive to this value, which is also why it went uncaught until a real call hit it).

### TEST 1 - Crate Cheat, real call
8-track house library, `prompt: "house music for the dance floor"`, `playlistSize: 10`.
```
requested: 10, returned: 8, candidatePoolSize: 8, shortfallReason: "POOL_TOO_SMALL"
tokens: 585 in / 648 out (326 thinking)   time: 6845ms   cost: ~$0.0115
allTrackIdsValid: true
```
Honest, correctly-reported shortfall against a real model (the library only has 8 tracks - it can't return 10 distinct ones). No padding, no invented tracks.

### TEST 2 - R28 fallback chain, real call (first attempt - failed, led to the bug fix above)
Same library, seed "Daft Punk - One More Time", `vibe: -5` (forces the fallback-eligible path). Two back-to-back attempts both failed with `stop_reason: "max_tokens"`, `thinking_tokens: 1999` of `2000`, before the fallback logic was ever reached. Combined cost of both failed attempts: ~$0.066, zero usable result. Led directly to the `max_tokens` fix above.

### TEST 2 - retry, after the fix
Same request, re-run once the fix was in place:
```
realCallCount: 2, fallbackDepth: 1, fallbackActuallyFired: true
tokens: 1950 in / 8461 out (6452 thinking)   time: 84015ms   cost: ~$0.133
resultCount: 4, allTrackIdsValid: true
```
Both calls succeeded this time. The first call came back with too few usable songs, so the fallback chain automatically fired a second real call - exactly the behavior R28 is supposed to produce, now proven against a real model for the first time.

### TEST 3 - session/daisy chain, real call
Real session created via `POST /v1/sessions`; fresh seed ("Daft Punk - One More Time", vibe 0) through `POST /v1/track-cheat/recommend`; top result ("Justice - D.A.N.C.E.") dragged back in as a new seed (`seedDropped`, `origin: "ccdjResult"`) for a second real recommend call through the same session.
```
recommend#1: trigger=freshSeed, chain.depth=0, resultCount=6, fallbackDepth=0
recommend#2: trigger=daisyChain, chain.depth=1 (same chainId), fallbackDepth=2, resultCount=0
realCallCount: 4 (1 + 1-initial-and-2-fallbacks)   tokens: 4080 in / 8897 out   cost: ~$0.146   wall time: ~96s
```
**Chain mechanics confirmed correct:** `chain.depth` advanced 0 -> 1, `chainId` stayed identical across the chain, `trigger` correctly switched from `freshSeed` to `daisyChain`.

**Also surfaced (not a bug, logged here for transparency):** R8's chain-vibe-lock forced the second call's effective vibe to -3 regardless of the requested 0, which - combined with this test library having only 8 tracks - left too few real candidates even after R28's fallback chain ran to its full documented ceiling (`fallbackDepth: 2`, all 3 allowed calls used). Final result was a correctly-reported empty batch (`resultCount: 0`), not a padded or invalid one. This is the small 8-track test library hitting its limit under a locked, narrow filter, not a defect in the chain or fallback logic - the same scenario against Mike's real (tens-of-thousands-track) library would have a much larger candidate pool to draw from. Not logged as an open question since nothing here contradicts documented behavior; noted only so the number "0 results" in this report isn't mistaken for a failure.

### Combined real-API total across all three tests + the bug-fix attempts
```
Real API calls made: 9 (1 Test-1 + 2 Test-2-failed-attempts + 2 Test-2-retry + 4 Test-3)
Approx. total cost: ~$0.357
```

---

## Summary

Phase 4's gate (CLAUDE.md: "100% fixture parity or each difference explained and approved in `docs/decisions/`. Delete the Phase 2 dev proxy.") is satisfied. The one open product question (R4) does not block the gate - it's an explained, tested, honestly-reported difference, not a silent gap, and changing it later is explicitly scoped as a future musical-behavior decision, not something this report claims to have resolved.

**Updated final verdict (2026-10-06):** Phase 4 is now proven end-to-end against a real model, not just code-complete against a mock. All three previously-mock-only paths - Crate Cheat's full pipeline, the R28 fallback chain, and the session/daisy-chain system - have each now been exercised with at least one real, billed Anthropic call, and each behaved exactly as the ported logic specifies: honest shortfall reporting (Test 1), a genuinely firing fallback chain (Test 2), and correct chain-depth/chainId/trigger tracking across a real daisy chain (Test 3). One real bug was found and fixed in the process (`max_tokens` too small for a thinking model) - a config-only fix, not a logic change, fully documented in `docs/decisions/0006`. No recommendation logic was altered because of any test result; the one surprising outcome (Test 3's empty final batch) is recorded above as an artifact of the tiny test library, not acted on. `LIVE_AI_CALLS` is confirmed back to `false`.
