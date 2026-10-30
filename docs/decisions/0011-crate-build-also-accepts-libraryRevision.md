# 0011 - Crate Cheat's build route also accepts libraryRevision, same as Track Cheat

**Date:** 2026-10-30
**Owner/source:** Ranjish, starting Phase 5 step 5 piece 5 (Crate Cheat). Direct extension of `docs/decisions/0009`, not a new decision about selection logic.
**Status:** Accepted

## Problem
`POST /v1/crates/build` only ever accepted the DJ's whole library inline on every call. This is the exact same shape that produced a real HTTP 413 on `POST /v1/track-cheat/recommend` against Ranjish's real ~38,484-track library (`docs/decisions/0009`). Building the new Crate Cheat desktop screen against the crate route as it stood would have reintroduced that same bug the moment it was tested against the real library, not a hypothetical one.

## Decision
Extend `docs/decisions/0009`'s fix to `/v1/crates/build`:
1. `registerCrateRoutes` (`apps/server/src/routes/crates.js`) now accepts an optional `libraryRevision` the same way `recommendTrackCheat` does: an inline `library` array still works unchanged (every existing fixture/test), and when none is given, the route looks up the already-synced library by revision (`library/libraryStore.js`'s `getLibraryForRevision` - the same store Track Cheat already syncs into; there is only one synced library per server process, not one per feature).
2. `LibraryOutOfSyncError` moved from `routes/trackCheat.js` into `library/libraryStore.js` itself, since it's a property of the shared store, not of one route. `trackCheat.js` re-exports it so `app.js`'s existing import keeps working unchanged.
3. The desktop Crate Cheat screen reuses the exact same cached-revision/auto-resync mechanism the Track Cheat screen already has (`apps/desktop/src/main/backendClient.ts`'s `buildCrateWithAutoSync`, mirroring `recommendTrackCheatWithAutoSync`) - one sync, shared across both features, not a second independent sync path.

## Why this didn't need Mike's sign-off
This is a transport-layer fix (how the library data reaches the server), not a change to anything CLAUDE.md Top Rule 5 classifies as musical behavior - crate selection, ranking, prompts, and counts in `engine/crateOrchestration.js` are completely untouched. It's the same category as 0009 itself: "security/data protection" (bounded requests), mandatory without waiting for approval, explicitly required not to alter ranking/prompts/counts while doing it - and it doesn't.

## Verified
`apps/server/test/crateLibrarySync.test.js` (6 new tests, HTTP-layer via `app.inject`, same style as `librarySync.test.js`): crate build works with only a `libraryRevision`; stays small-bodied even with a real ~38,484-track synced library; still 413s on an oversized *inline* library (confirming the route's own limit was never raised, same as 0009's own proof); `LIBRARY_OUT_OF_SYNC` on an unsynced or stale revision; and the original inline-library path still works unchanged for every existing small-fixture test. 130/130 server tests pass.
