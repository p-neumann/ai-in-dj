// The server's own copy of the DJ's library, synced once by the desktop
// app instead of being sent inline on every recommend/build call
// (CLAUDE.md Phase 5 file list: "sync client"; Section 6.3: "max request
// body 1MB for recommend; larger for sync chunks").
//
// Deliberately a FULL REPLACE on every sync, not true incremental
// upsert/delete diffing - CLAUDE.md's own contract describes "client
// sends changes since lastRevision," which is real, separate work this
// does not build. This is the minimal, honest fix for the actual problem
// (one oversized request), not the full aspirational design - recorded
// in docs/decisions/0009.
//
// In-memory only, same durability category as session/sessionStore.js -
// a real Postgres-backed store is Phase 6, not built here. That also
// means this forgets everything on a server restart, which is exactly
// why LIBRARY_OUT_OF_SYNC exists (CLAUDE.md Section 6.3's own documented
// error code) - a client holding a stale revision is told plainly to
// resync, not served silently-wrong results.

// docs/decisions/0009 introduced this on the track-cheat route only;
// defined here (not in routes/trackCheat.js) so any route backed by this
// same store - crates.js included (docs/decisions/0011) - can throw and
// catch the same error class without importing one route's file from
// another's. trackCheat.js re-exports this for callers that already
// import it from there (e.g. app.js).
export class LibraryOutOfSyncError extends Error {}

let currentRevision = 0;
let tracksById = new Map();

export function syncLibrary(tracks) {
  currentRevision += 1;
  // Defense in depth (CLAUDE.md Section 5.4 privacy rule): never store a
  // location/path even if one slipped through - the desktop client
  // should never send one, but this does not just trust that silently.
  tracksById = new Map(
    tracks.map((t) => {
      const { location, ...rest } = t;
      return [rest.id, rest];
    })
  );
  return { libraryRevision: currentRevision, trackCount: tracksById.size };
}

// Returns null for anything but the exact current revision - including
// revision 0 (never synced) and any older revision a stale client might
// still be holding. The caller maps that to LIBRARY_OUT_OF_SYNC.
export function getLibraryForRevision(revision) {
  if (currentRevision === 0 || revision !== currentRevision) return null;
  return Array.from(tracksById.values());
}

export function getCurrentRevision() {
  return currentRevision;
}

// Test-only reset, same pattern as session/sessionStore.js's own
// _resetAllSessionsForTests - keeps tests isolated from each other.
export function _resetLibraryStoreForTests() {
  currentRevision = 0;
  tracksById = new Map();
}
