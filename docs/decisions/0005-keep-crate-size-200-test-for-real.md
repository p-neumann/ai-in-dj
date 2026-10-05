# 0005 - Keep crate size 200 as supported; test it for real instead of leaving it unverified

**Date:** 2026-10-05
**Owner/source:** Ranjish, this session. This is an engineering decision, not a Mike decision - it does not change what the prototype already offers or how it behaves.
**Status:** Accepted

## Decision
Keep all six crate sizes the prototype's own UI already offers (10, 25, 50, 100, 150, 200) as supported inputs to `POST /v1/crates/build`, and write real tests at every size - including 200 against the engine's actual ~100-track candidate pool - instead of leaving the large sizes unverified or guessing at their behavior.

## Why
The prototype already advertises all six sizes (`EXPORT_OPTIONS`/size menu, source). Keeping that range changes nothing about current behavior - the candidate pool size (~100), the ranking, the request-count and token formulas, and the actual on-the-ground shortfall at large sizes are exactly what the prototype already has. Testing it for real, rather than leaving it as an untested assumption, is normal engineering verification work, not a product decision - it doesn't widen the pool, add batching, or change what gets returned.

## Consequences
- The honest `requested`/`returned`/`candidatePoolSize`/`shortfallReason` reporting (already implemented, security/bounding category per CLAUDE.md Top Rule 5 - no approval needed for that part) is what a size-200 request will actually show: a real shortfall, reported truthfully, not padded and not silently hidden.
- **This decision does not resolve the open product question in `docs/QUESTIONS.md` ("Crate sizes 100-200: batching, bigger pool, or cap?").** It only means that question's current answer - "keep the prototype's existing behavior while it's being verified" - is itself now verified by real tests instead of assumed.
- Any actual change to this behavior - real batching, raising the candidate-pool cap, or removing/capping the offered sizes - is a musical-behavior change (CLAUDE.md Top Rule 5) and needs Mike's recorded approval before it ships. This decision does not grant that approval in advance, and must not be read as doing so.
