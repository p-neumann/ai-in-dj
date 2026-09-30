// Minimal in-memory session store - NOT the real architecture from CLAUDE.md
// Section 6.2/6.3 (Postgres-backed, TTL, stateVersion/clientSeq ordering).
// This exists only to make two specific "defect against a stated
// requirement" fixes real and testable in Phase 4, per CLAUDE.md Section 1.7:
//
//  - R12: a thumbs-downed (or otherwise excluded) track must never
//    reappear "the rest of the night" - the exact track name, every fetch,
//    with no 20-item cap. Needs *something* to remember exclusions across
//    requests; this Map is that something for now.
//  - R13: a cached fallback batch must be re-validated against current
//    exclusions and the current library before being shown, not shown
//    blindly.
//
// Real session state (chain/bridge/drift/retry counters, drag lean,
// server-side durability across restarts) is NOT here - that's the bigger
// state machine in CLAUDE.md Section 4.3/6.3, deferred along with hybrid
// modes (see routes/trackCheat.js header).
//
// Process-lifetime only: restarting the server clears every session. A
// sessionId is provided by the caller; if omitted, the request is fully
// stateless (no exclusion memory, no cache), same as Phase 3.

const sessions = new Map();

function getOrCreate(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { excludedNames: new Set(), cache: new Map() });
  }
  return sessions.get(sessionId);
}

export function getExcludedNames(sessionId) {
  if (!sessionId) return [];
  return Array.from(getOrCreate(sessionId).excludedNames);
}

export function addExcludedNames(sessionId, names) {
  if (!sessionId) return;
  const session = getOrCreate(sessionId);
  names.forEach((n) => session.excludedNames.add(n));
}

function cacheKey(seedTrackId, vibe, energy) {
  return seedTrackId + "|v" + vibe + "|e" + energy;
}

export function cacheSet(sessionId, seedTrackId, vibe, energy, results) {
  if (!sessionId) return;
  getOrCreate(sessionId).cache.set(cacheKey(seedTrackId, vibe, energy), results);
}

export function cacheGet(sessionId, seedTrackId, vibe, energy) {
  if (!sessionId) return null;
  return getOrCreate(sessionId).cache.get(cacheKey(seedTrackId, vibe, energy)) || null;
}

// Test-only escape hatch - avoids cross-test pollution of the module-level Map.
export function _resetAllSessionsForTests() {
  sessions.clear();
}
