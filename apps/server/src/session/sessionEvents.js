// Session-event state machine (CLAUDE.md Section 4.1, 4.3, 4.5, 6.3, 6.4).
// This is what makes hybrid-mode detection real: bridge/drift/vibe-drift
// are DERIVED here from a sequence of DJ actions, not supplied by the
// caller. recommendTrackCheat (routes/trackCheat.js) only READS the
// session fields this file writes.
//
// SCOPE NOTE: "likedAsSeed" (CLAUDE.md 3.1/6.5, using a thumbs-up'd result
// as a fresh seed) isn't a distinct origin in the documented event contract
// (Section 6.4 lists only ccdjResult/external/search/deckLoaded) and isn't
// derived here - a caller wanting that exact history label would need to
// send seedDropped with an origin this code treats as a normal fresh seed
// or reseed depending on chain state, which is behaviorally reasonable but
// won't produce the "likedAsSeed" trigger label specifically.

export class StaleEventError extends Error {
  constructor() { super("clientSeq is not newer than the session's last accepted event"); }
}

function isNewerOrDuplicate(session, clientSeq, idempotencyKey) {
  if (clientSeq > session.lastClientSeq) return { kind: "fresh" };
  if (idempotencyKey && session.idempotency.has(idempotencyKey)) {
    return { kind: "duplicate", stored: session.idempotency.get(idempotencyKey) };
  }
  return { kind: "stale" };
}

function commit(session, clientSeq, idempotencyKey, result) {
  session.lastClientSeq = clientSeq;
  session.stateVersion += 1;
  if (idempotencyKey) session.idempotency.set(idempotencyKey, { ...result, stateVersion: session.stateVersion });
  return { ...result, stateVersion: session.stateVersion, duplicate: false };
}

function handleSeedDropped(session, event) {
  const { trackId, origin } = event;
  const wasChainActive = session.daisyChainDepth > 0;
  const isKnownFromLastBatch = !!(session.lastBatch && session.lastBatch.results.some((r) => r.trackId === trackId));
  // CLAUDE.md 4.1: a search is a typed, deliberate request - the source's
  // own fetchSearchResults path never reads chain state at all (uses the
  // raw vibe slider unconditionally), so search never participates in
  // bridge/drift detection; it always starts clean.
  const isInternalReseed = origin === "ccdjResult" || (origin === "deckLoaded" && isKnownFromLastBatch);
  const isFreshSeed = origin === "search" || (!isInternalReseed && !wasChainActive);

  if (isFreshSeed) {
    session.chainId = "c_" + cryptoRandom();
    session.daisyChainDepth = 0;
    session.bridgeContext = null;
    session.driftContext = null;
    session.pendingVibeDriftOffset = null;
    session.manualRetryCount = 0;
  } else if (isInternalReseed) {
    const picked = session.lastBatch.results.find((r) => r.trackId === trackId);
    if (session.bridgeContext) {
      // CLAUDE.md 4.3 Bridge Mode: "new" resolves it, "bridge" continues it.
      if (picked && picked.camp === "bridge") {
        session.bridgeContext.phase = "continuing";
      } else {
        session.bridgeContext = null;
      }
    } else if (session.driftContext) {
      // Style Drift: another non-"pure" pick continues it, "pure" resolves it.
      if (picked && picked.lane && picked.lane !== "pure") {
        session.driftContext.phase = "continuing";
      } else {
        session.driftContext = null;
      }
    } else {
      // Not currently in a hybrid mode - passive lane tagging can newly
      // trigger Style Drift; otherwise check for Vibe Slider Drift.
      if (picked && picked.lane && picked.lane !== "pure") {
        session.driftContext = { active: true, detectedLane: picked.lane, crossoverGenre: (picked.crossoverGenre || ""), phase: "detected" };
      } else if (wasChainActive && session.sliderChangedSinceLastPick && session.currentVibe !== -3) {
        // R8: a genuine slider MOVE (not just "currently != -3") happened
        // since the last chain pick - one-shot signal for the very next
        // fetch only. Comparing against a static -3 here instead of "did
        // the slider actually move" would make this re-fire on every
        // subsequent pick for as long as the slider happens to sit away
        // from -3, even with no new DJ action - the slider is a physical
        // control that doesn't snap back on its own (CLAUDE.md 4.3: "next
        // chain link with slider unchanged -> resolved").
        session.pendingVibeDriftOffset = session.currentVibe;
      }
      session.sliderChangedSinceLastPick = false;
    }
    session.daisyChainDepth += 1;
  } else {
    // External swerve (CLAUDE.md 4.1): chain was active, this drop/load
    // didn't come from CCDJ's own results.
    session.bridgeContext = { oldSeedTrackId: session.lastSeedTrackId, phase: "detected" };
    session.driftContext = null;
    session.pendingVibeDriftOffset = null;
    session.chainId = "c_" + cryptoRandom();
    session.daisyChainDepth = 0;
    session.manualRetryCount = 0;
  }

  session.lastSeedTrackId = trackId;
  session.lastSeedOrigin = origin;
  return { accepted: true };
}

function handleResultDragged(session, event) {
  // CLAUDE.md 4.1: a drag is intent, not proof of playback, and does NOT
  // change chain depth. This is the source's playedNamesRef signal
  // specifically (populated by handleResultDragStart) - FUZZY-matched at
  // recommend time (blocks other edits/remixes of the same song too), and
  // distinct from shownTrackIds (exact match, populated by every shown
  // batch regardless of whether anything was dragged).
  session.playedTrackIds.add(event.trackId);
  return { accepted: true };
}

function handleVote(session, event) {
  const { trackId, value } = event;
  const previous = session.votes.get(trackId) || null;
  // R12 minimal fix: this is the prototype's globalExcluded bookkeeping
  // (add on down, remove on down->null) - now actually consulted at
  // recommend time, on every path, uncapped. Independent of
  // shownTrackIds: un-voting only shrinks this set, never that one.
  if (value === "down") {
    session.downvotedTrackIds.add(trackId);
  } else if (previous === "down" && value === null) {
    session.downvotedTrackIds.delete(trackId);
  }
  if (value === "up") {
    session.manualRetryCount = 0; // CLAUDE.md 4.5: thumbs-up resets the retry counter
  }
  if (value === null) session.votes.delete(trackId);
  else session.votes.set(trackId, value);
  return { accepted: true };
}

function handleSliderChanged(session, event) {
  session.currentVibe = event.vibe;
  session.currentEnergy = event.energy;
  session.sliderChangedSinceLastPick = true;
  return { accepted: true };
}

function handleTryAgain(session) {
  session.manualRetryCount += 1;
  session.pendingManualRetry = true;
  // CLAUDE.md 4.5/R11: 2nd consecutive Try Again (no pick in between) resets the chain.
  if (session.manualRetryCount > 1) {
    session.daisyChainDepth = 0;
  }
  return { accepted: true };
}

function handleSessionPrefs(session, event) {
  session.doPlay = event.doPlay || [];
  session.doNotPlay = event.doNotPlay || [];
  return { accepted: true };
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const HANDLERS = {
  seedDropped: handleSeedDropped,
  resultDragged: handleResultDragged,
  vote: handleVote,
  sliderChanged: handleSliderChanged,
  tryAgain: handleTryAgain,
  sessionPrefs: handleSessionPrefs
};

// Throws StaleEventError for a stale, non-duplicate event - caller (the
// route) maps that to the STALE_EVENT error response, changing nothing.
export function applyEvent(session, event) {
  const { type, clientSeq, idempotencyKey } = event;
  const ordering = isNewerOrDuplicate(session, clientSeq, idempotencyKey);
  if (ordering.kind === "stale") throw new StaleEventError();
  if (ordering.kind === "duplicate") return { ...ordering.stored, duplicate: true };

  const handler = HANDLERS[type];
  if (!handler) throw new Error("Unknown event type: " + type);
  const result = handler(session, event);
  return commit(session, clientSeq, idempotencyKey, result);
}
