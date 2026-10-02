# 0003 - R13 recommendation cache: minimal re-validation fix applied

**Date:** 2026-09-30
**Owner/source:** CLAUDE.md Top Rule 5 / Section 1.7 ("defect against an explicit stated requirement" category) and Section 4.7's own stated minimal fix, applying Mike's already-stated requirement that excluded tracks must not reappear.
**Status:** Accepted

## Decision
Before a cached batch is ever returned (the fallback path when a live fetch throws), it is re-checked against the current session's exclusions and the current request's library, not returned as-is. Implemented in `apps/server/src/routes/trackCheat.js`'s catch branch: a cached batch is filtered to tracks that (a) still exist in `library` (by id) and (b) are not in the current `allEx` (shown/downvoted) name set, before being used.

## Why
The source's `_recCache` (keyed only `seed|vibe|energy`) was used as a fallback on fetch failure with no re-validation at all against exclusions, Do Not Play, or library contents at the moment it's served - a confirmed defect against the stated requirement that excluded tracks never reappear (CLAUDE.md R13/Section 4.7).

## Consequences
- This is the minimal fix only: re-validate against current exclusions and library membership. It does not add Do Not Play filtering to the cached path, since Do Not Play is not yet enforced on the Track Cheat live path either (R27 is still an open question for Mike) - extending the cached path further than the live path would be inconsistent, not minimal.
- The response marks a cache-served batch (`cached: true`) so a caller can label it, per Section 4.7.
