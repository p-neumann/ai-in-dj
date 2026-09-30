// Real(er) session store per CLAUDE.md Section 6.2/6.3 - process-lifetime
// only (no Postgres yet, that's Phase 6), but implements the actual
// ordering primitives the spec calls for: stateVersion, clientSeq
// high-water mark, and per-event idempotency - not just a flat exclusion
// map like the Phase 4a version this replaces.
//
// A session tracks everything needed to DERIVE hybrid-mode signals from
// raw DJ actions (CLAUDE.md Section 4.1/4.3), rather than trusting a
// caller to say "this is a bridge". See sessionEvents.js for the state
// machine that mutates these fields, and routes/trackCheat.js for how
// recommend reads them.

import { randomUUID } from "node:crypto";

const sessions = new Map();

export function createSession() {
  const sessionId = "s_" + randomUUID();
  const session = {
    sessionId,
    stateVersion: 0,
    lastClientSeq: 0,

    chainId: "c_" + randomUUID(),
    daisyChainDepth: 0,
    lastSeedTrackId: null,
    lastSeedOrigin: null, // "ccdjResult" | "external" | "search" | "deckLoaded" | null
    lastBatch: null, // { batchId, results: [{trackId,name,camp,lane,crossoverGenre}] }

    // Hybrid mode state (CLAUDE.md 4.3). Bridge/Drift persist across
    // multiple fetches (detected -> continuing -> resolved). Vibe Drift is
    // one-shot per R8 ("a manual slider change overrides the lock for ONE
    // FETCH ONLY") so it's carried as a pending flag consumed by the very
    // next recommend call, not a multi-fetch phase machine like the other two.
    bridgeContext: null, // { oldSeedTrackId, phase: "detected" | "continuing" }
    driftContext: null, // { active:true, detectedLane, crossoverGenre, phase: "detected" | "continuing" }
    pendingVibeDriftOffset: null, // number | null - consumed (cleared) by the next recommend

    currentVibe: -3,
    currentEnergy: 0,
    sliderChangedSinceLastPick: false,

    manualRetryCount: 0,
    pendingManualRetry: false, // one-shot, consumed by the next recommend

    // Three distinct exclusion mechanisms, traced from the source
    // (fetchBangerResults ~L3513-3528, resolveRes ~L1996-2021, handleVote
    // ~L2461-2464) and kept separate because their add/remove rules and
    // match strength genuinely differ - conflating them was a real bug
    // (see trackCheat.js header for the specific case it caused):
    //
    // - shownTrackIds: every track returned in a committed batch (source:
    //   bangerExcluded). Add-only, never removed within a session. Exact
    //   name match only (source: allEx / allExForFilter).
    // - downvotedTrackIds: R12's actual target. Added on vote "down",
    //   REMOVED if the DJ un-votes (down -> null) - source:
    //   `if(current==="down"&&next===null)` in handleVote. The prototype's
    //   own `globalExcluded` did this same add/remove bookkeeping but was
    //   "written but never read" (R12 in CLAUDE.md) - this is that defect's
    //   minimal fix: actually read it, on every path, uncapped. Exact name
    //   match only, same as shownTrackIds.
    // - playedTrackIds: outward-drag signal only (source: playedNamesRef,
    //   populated by handleResultDragStart). FUZZY match via isSameSong -
    //   blocks other edits/remixes of the same underlying song too, not
    //   just the exact file. A track can be in shownTrackIds without ever
    //   being in playedTrackIds (shown but not dragged out), and vice
    //   versa is not possible via the event contract here (a drag is
    //   always of something already shown).
    //
    // Un-voting a thumbs-down only shrinks downvotedTrackIds - if that
    // track was also shown, it correctly remains excluded via
    // shownTrackIds independently. That independence is the point.
    shownTrackIds: new Set(),
    downvotedTrackIds: new Set(),
    playedTrackIds: new Set(),
    votes: new Map(), // trackId -> "up" | "down"

    doPlay: [],
    doNotPlay: [],

    cache: new Map(), // R13

    idempotency: new Map() // idempotencyKey -> stored event response
  };
  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

export function _resetAllSessionsForTests() {
  sessions.clear();
}
