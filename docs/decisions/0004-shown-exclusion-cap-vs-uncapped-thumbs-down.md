# 0004 - Shown-exclusion cap (20) vs. uncapped thumbs-down exclusion

**Date:** 2026-09-30
**Owner/source:** Not a Mike decision - no product approval was sought or given for this item, and none should be implied. This is CLAUDE.md Top Rule 5's own default rule ("preserve the prototype's behavior absent an explicit authorization") applied to a confirmed drift, per `docs/QUESTIONS.md` ("Shown-exclusion cap: resolved by preserving the prototype's default (not asking Mike, since this needed no new approval)").
**Status:** Accepted

## Decision
Two distinct exclusion mechanisms, kept separate on purpose:
- `shownTrackIds` (every track returned in a committed batch) is enforced as a hard exclusion only for the **most recently shown 20** per request (`apps/server/src/routes/trackCheat.js`: `shownNamesCapped = namesFor(session.shownTrackIds).slice(-20)`), matching the source's own `allEx=(exclude||[]).slice(-20)` (source ~L3512) exactly. The underlying set itself still grows unbounded as session state - only what's *enforced per request* is capped.
- `downvotedTrackIds` (thumbs-down) stays fully uncapped on every path, per R12's actual, already-authorized scope (`docs/decisions/0002`).

## Why
CLAUDE.md's R12 instruction ("no 20-item limit") is specifically about the thumbs-down list (the source's `globalExcluded`, which the prototype wrote but never read - the actual defect R12 fixes). It never authorized widening the separate, pre-existing shown-track cap, which the source already enforces deliberately. Earlier Phase 4 work had drifted from this (shown-exclusion was left fully uncapped); this reverted that drift back to the source's documented behavior. No new product decision was made here - this is the default CLAUDE.md Top Rule 5 itself specifies when no explicit authorization to change behavior exists, so proceeding did not require - and did not receive - Mike's approval.

## Consequences
- A track shown 21+ fetches ago becomes recommendable again even without a thumbs-up, matching the prototype exactly (verified in `apps/server/test/sessions.test.js`: after 24 cumulative shown tracks, the earliest group ages out of the 20-item window and reappears).
- If Mike would rather the shown list never expire during a gig, that is a real, separate product ask for him to raise - not something this port decided on his behalf. No such ask has been made; this decision record does not claim one was.
