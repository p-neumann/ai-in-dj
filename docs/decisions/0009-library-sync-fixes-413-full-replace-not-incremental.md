# 0009 - Library sync replaces inline library-per-request; full replace, not incremental diffing

**Date:** 2026-10-11
**Owner/source:** Ranjish, after testing Phase 5 step 5 piece 3 against his real ~38,484-track library and hitting a real HTTP 413. CLAUDE.md Phase 5's own file list ("sync client") and Section 6.3 ("max request body... 1MB for recommend; larger for sync chunks").
**Status:** Accepted

## Problem
`POST /v1/track-cheat/recommend` required the DJ's whole library inline on every call. Against a small test library this never surfaced; against Ranjish's real ~38,484-track library the request body exceeded Fastify's default ~1MB limit and every recommend call failed with HTTP 413. Explicit instruction: "Don't just raise the limit" - raising `recommend`'s own limit would have hidden the real problem (an unbounded request growing with library size) rather than fixing it.

## Decision
1. A new route, `POST /v1/library/sync` (`apps/server/src/routes/library.js`), accepts the full library once and stores it in a new in-memory module, `apps/server/src/library/libraryStore.js`. This route has its own, larger `bodyLimit` (30MB) - `recommend`'s own limit is never touched.
2. `recommendTrackCheat` (`apps/server/src/routes/trackCheat.js`) is changed additively: it still accepts an inline `library` array (existing tests/behavior unchanged), but now also accepts a `libraryRevision` number. If no inline library is given, it looks up the synced library by that revision.
3. The sync is a **full replace** on every call, not true incremental upsert/delete diffing. CLAUDE.md's own contract (Section 6.4) describes `upserts`/`deletes` against a `lastRevision` - that is real, separate work this does not build. This is the minimal, honest fix for the actual problem (one oversized request), not the full aspirational sync design.
4. The library store is in-memory only, same durability category as `apps/server/src/session/sessionStore.js` - it forgets everything on server restart. A client holding a `libraryRevision` from before a restart is rejected, not served silently-wrong results: a new error, `LIBRARY_OUT_OF_SYNC` (HTTP 409), using a code CLAUDE.md Section 6.3 already documents for exactly this case.
5. Privacy (CLAUDE.md Section 5.4): the sync payload shape (`apps/desktop/src/main/db/tracks.ts`'s `getAllTracksForLibrary`, already built for the Library screen in piece 2) carries `id, displayName, artist, title, bpm, key, genre, year, playcount` - never `location`. The server strips any `location` field from a synced payload anyway, as defense in depth, in case a future caller sends one by mistake (`libraryStore.js`'s `syncLibrary`, tested directly in `libraryStore.test.js`).
6. The desktop app (`apps/desktop/src/main/backendClient.ts`'s `recommendTrackCheatWithAutoSync`) syncs once (on first use, or after a fresh import invalidates the cached revision), then sends only `libraryRevision` on every recommend call. If the server responds `LIBRARY_OUT_OF_SYNC`, the desktop app resyncs once automatically and retries - the DJ never sees a raw error for something the app can self-heal. `apps/desktop/src/main/ipc.ts` only owns where the cached revision lives (module state tied to the running app); the sync/retry logic itself is a plain, unit-tested function, not inline IPC-handler code.

## Why
- Matches CLAUDE.md's own stated architecture (a "sync client" in the Phase 5 file list; a documented 1MB/larger-sync-chunk body-size split in Section 6.3) rather than papering over the symptom with a bigger limit on `recommend`.
- Full replace (not incremental) was chosen because the desktop app already holds the complete, current library locally (SQLite) at all times - computing and sending only a diff would add real complexity (tracking what the server last saw) for a sync operation that currently only needs to happen rarely (startup, or after a re-import), not on every keystroke or every recommend call.
- The new test `apps/server/test/librarySync.test.js` proves the fix is the sync path, not a disguised limit increase: it specifically asserts `recommend` still 413s on an inline library over the normal limit, and separately proves a real ~38,484-track sync succeeds and a subsequent recommend call (carrying only `libraryRevision`) succeeds too.

## Consequences
- `recommend`'s inline-`library` path is left in place (unused by the real desktop client going forward) rather than removed, since existing Phase 3/4 tests exercise it directly and removing it is out of scope for this fix.
- True incremental sync (`upserts`/`deletes` against `lastRevision`) remains a documented gap, not built here. If the synced library grows large enough that a full resync becomes slow, that is a reason to revisit this decision - not a reason to build it preemptively now.
- A second server instance, or a server restart mid-gig, forces exactly one resync (automatic, from the desktop app's perspective) the next time a recommend call is made. This is the correct, honest behavior given the in-memory store - not a bug to "fix" by adding persistence here (persistence is Phase 6/Postgres work, per CLAUDE.md Section 5.2).
