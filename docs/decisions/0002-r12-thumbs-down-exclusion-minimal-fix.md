# 0002 - R12 thumbs-down exclusion: minimal fix applied

**Date:** 2026-09-30
**Owner/source:** CLAUDE.md Top Rule 5 / Section 1.7 ("defect against an explicit stated requirement" category), applying Mike's already-stated requirement ("never see it again this gig") to the source's own confirmed gap (R12 in CLAUDE.md Section 2: `globalExcluded` was written but never read).
**Status:** Accepted

## Decision
The exact thumbs-downed track stays excluded for the rest of the session on every path (fetch, R28 fallbacks, Try Again, search, cache fallback), with no 20-item cap. This is implemented server-side as `session.downvotedTrackIds` (`apps/server/src/session/sessionStore.js`), consulted on every `recommendTrackCheat` path via the `allEx` list (`apps/server/src/routes/trackCheat.js`).

## Why
Mike's stated requirement ("don't show that in my results the rest of the night") has one minimal, unambiguous reading: the exact file the DJ voted down stays excluded, full stop, for the rest of the session. The source's own `globalExcluded` bookkeeping already existed for exactly this but was never consulted anywhere (confirmed directly in the sanitized reference file) - this is reading it, not inventing new scope.

## Consequences
- Scoped to the exact track only (exact display-name match), not other edits/remixes of the same song - extending it to the whole song family is a separate, still-open musical-behavior question for Mike (`docs/QUESTIONS.md`, "Thumbs-down exclusion scope (R12)").
- Kept deliberately separate from `shownTrackIds` (which IS capped at the most-recently-shown 20, matching the source's own `bangerExcluded` usage) - un-voting a thumbs-down only shrinks `downvotedTrackIds`; it does not un-exclude a track that's also still within the shown-cap window. Tested in `apps/server/test/sessions.test.js`.
