// Phase 4 Track Cheat pipeline. Ported and wired, in the source's own order
// (fetchBangerResults, source ~L3460-3622):
//
//   seed resolution -> type-lock detection -> session-derived chain/bridge/
//   drift/vibe-drift state -> chain vibe lock (R8) -> genre-island
//   detection -> local seed-year resolution -> buildSmartCtx ->
//   mergeTypeLockIntoCtx -> buildSys -> AI call -> parseJSON -> resolveRes
//   -> applyGenreWall -> applyGenderFilter -> injectGenreDiversity ->
//   applyTypeLock -> injectTypeLockBalance -> [R28 fallback chain] ->
//   sortByKeyCompatibility -> deep-mode filter -> session commit (R12/R13,
//   lastBatch for the NEXT event to react to).
//
// Hybrid-mode inputs (bridge/drift/vibe-drift) are now DERIVED from session
// state (session/sessionStore.js, mutated by session/sessionEvents.js via
// POST /v1/sessions/:id/events), not accepted as request fields - this is
// the real architecture CLAUDE.md Section 5.4 calls for: the state machine
// lives server-side. `sessionId` is optional; without one, every fetch is
// stateless (chainDepth 0, no hybrid modes, no exclusion memory) - same
// degraded-but-working behavior as before session support existed.
//
// Ordering (CLAUDE.md Section 6.3): a session-scoped recommend call carries
// `clientSeq`. A call whose clientSeq is not newer than the session's last
// accepted one is rejected before any provider call (STALE_EVENT, no
// network spent). A call that WAS newest when it started but got
// overtaken by a newer accepted change while its provider call was in
// flight returns `superseded:true` and commits nothing (no exclusion
// update, no lastBatch update, no cache write) - only the results
// themselves are still returned, for transparency, per "commits nothing
// except usage/cost logging".
//
// NOT YET PORTED (listed honestly rather than silently skipped):
//   - "likedAsSeed" as its own trigger label - see sessionEvents.js header.
//   - Drag lean (computeDragLean) - dragLeanHint is always "".
//   - "Liked"/"ignored" prompt lines and overplayed-pairs note - these read
//     vote/play history the server doesn't fold into prompts yet; always "".
//   - resolveSeedYearAsync's AI-knowledge fallback - only the local
//     (no-network) part is ported (seedYear.js); unknown stays unknown.
//   - fuzzyFind - bridge mode's old-seed lookup uses an exact id match only.
//   - Do Not Play enforcement (R27) - sessionPrefs are stored but not yet
//     applied as a filter; that's an open question for Mike either way.

import { buildSmartCtx } from "../engine/candidateSelection.js";
import { resolveRes } from "../engine/resolveResults.js";
import { applyGenreWall, applyGenderFilter, injectGenreDiversity } from "../engine/postProcessing.js";
import { sortByKeyCompatibility } from "../engine/keyCompatibility.js";
import { getDisplayName, getRawTitleFromName } from "../engine/trackNames.js";
import { inferGenreLocal, inferArtistGender } from "../engine/artistLookup.js";
import { getBpmRange, getYearInstruction } from "../engine/vibe.js";
import { compatibleKeys } from "../engine/keyCompatibility.js";
import { buildSys, divPick } from "../engine/promptBuilder.js";
import { resolveSeedYearLocal } from "../engine/seedYear.js";
import { parseJSON } from "../engine/parsing.js";
import { isFamiliarSongFamily } from "../engine/playCountMode.js";
import {
  detectStyleTypeLock, detectGenreIslandLock, mergeTypeLockIntoCtx,
  applyTypeLock, injectTypeLockBalance
} from "../engine/typeLock.js";
import { getSession } from "../session/sessionStore.js";

export class ValidationError extends Error {}

function buildRequestBody(seedName, ctx, system) {
  const seedTitleWords = seedName.toLowerCase().replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "")
    .trim().split(" ").filter((w) => w.length > 2).slice(0, 3);
  const seedExcludeNote = seedTitleWords.length
    ? "\nNEVER return any track whose title contains: " + seedTitleWords.join(", ") + ". This includes all remixes, edits, intros, or versions of the seed song."
    : "";
  return {
    model: "claude-sonnet-5",
    max_tokens: 2000,
    system,
    messages: [{
      role: "user",
      content: "Seed: " + seedName + "\nLibrary:\n" + ctx.context +
        "\nReturn JSON array of 20 tracks." + seedExcludeNote +
        "\nHARD RULES:\n1. Every result must be a DIFFERENT song title — never return two versions or remixes of the same song.\n2. Never return any version of the seed track.\n3. Return exactly 20 different song titles."
    }]
  };
}

async function callAndResolve(provider, seedName, ctx, system, vibeForSort, effectiveRange, allEx, playedNames) {
  const requestBody = buildRequestBody(seedName, ctx, system);
  const response = await provider.call(requestBody);
  if (!response.content || !Array.isArray(response.content)) {
    throw new Error((response.error && response.error.message) || "Provider returned no content");
  }
  const rawResults = parseJSON(response.content.map((b) => b.text || "").join(""));
  return resolveRes(rawResults, ctx.indexed, seedName, ctx.seedGenre, vibeForSort > 0, effectiveRange, allEx, playedNames);
}

function makeBatchId() {
  return "b_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function recommendTrackCheat(request, provider) {
  const {
    library, seedTrackId, vibe = -3, energy = 0, exclude = [],
    playCountMode = "mix", styleProfile = "", styleProfileEnrichment = null,
    vibePromptText = "", sessionId = null, clientSeq = null, expectedStateVersion = null
  } = request;

  if (!Array.isArray(library) || library.length === 0) {
    throw new ValidationError("library must be a non-empty array");
  }
  const seedTrack = library.find((t) => t.id === seedTrackId);
  if (!seedTrack) {
    throw new ValidationError("seedTrackId not found in library");
  }

  let session = null;
  if (sessionId) {
    session = getSession(sessionId);
    if (!session) throw new ValidationError("Unknown sessionId");
    if (typeof clientSeq !== "number") throw new ValidationError("clientSeq is required when sessionId is set");

    const staleAtStart = clientSeq <= session.lastClientSeq
      || (expectedStateVersion !== null && expectedStateVersion !== session.stateVersion);
    if (staleAtStart) {
      return {
        results: [], candidatePoolSize: 0, requested: 20, returned: 0,
        fallbackDepth: 0, cached: false, mode: "none", trigger: null,
        chain: { chainId: session.chainId, depth: session.daisyChainDepth },
        superseded: true, simulated: provider.kind !== "anthropic"
      };
    }
  }

  const seedName = getDisplayName(seedTrack);
  const seedGenre = (seedTrack.genre && seedTrack.genre.trim()) || inferGenreLocal(seedName) || "";
  const seedBpm = parseFloat(seedTrack.bpm || "0") || 0;
  const seedKey = (seedTrack.key || "").trim();
  const seedGender = inferArtistGender(seedName);

  const trackTypeLock = detectStyleTypeLock(styleProfile + " " + vibePromptText) || [];

  const daisyChainDepth = session ? session.daisyChainDepth : 0;

  // Bridge > Drift > Vibe Drift - only one hybrid mode active per fetch
  // (source ~L3481-3512), all derived from session state now.
  let bridgeInfo = null, driftInfo = null, vibeDriftInfo = null;
  let effectiveRangeSuspended = false;
  if (session && session.bridgeContext) {
    const oldSeed = library.find((t) => t.id === session.bridgeContext.oldSeedTrackId);
    bridgeInfo = oldSeed ? {
      oldSeedName: getDisplayName(oldSeed),
      oldSeedBpm: parseFloat(oldSeed.bpm || 0),
      oldSeedGenre: (oldSeed.genre && oldSeed.genre.trim()) || inferGenreLocal(getDisplayName(oldSeed)) || ""
    } : null;
    if (bridgeInfo) effectiveRangeSuspended = true;
  } else if (session && session.driftContext && session.driftContext.active) {
    driftInfo = { active: true, detectedLane: session.driftContext.detectedLane, crossoverGenre: session.driftContext.crossoverGenre || "" };
    effectiveRangeSuspended = true;
  } else if (session && session.pendingVibeDriftOffset !== null) {
    vibeDriftInfo = { newVibeOffset: session.pendingVibeDriftOffset };
    effectiveRangeSuspended = true;
  }

  // R8: chain vibe lock - a chain in progress holds -3 ("same era, same
  // feel") regardless of the slider, UNLESS vibe-slider-drift is active.
  const userMovedSliderSinceChainStart = !!vibeDriftInfo;
  const currentVibe = (daisyChainDepth > 0 && !userMovedSliderSinceChainStart) ? -3 : vibe;

  const genreIslandLock = detectGenreIslandLock(trackTypeLock, seedGenre, currentVibe);

  const seedYear = resolveSeedYearLocal(seedTrack, seedName, library);
  const strictEra = currentVibe <= -3 && seedYear > 0;
  const yearNote = getYearInstruction(seedYear ? String(seedYear) : "", seedName, currentVibe);

  const range = getBpmRange(seedBpm, vibe, energy);
  const compat = compatibleKeys(seedKey);
  const bpmN = range ? "BPM between " + Math.round(range[0]) + " and " + Math.round(range[1]) + " only." : "";
  const keyN = compat.length ? "Prefer keys: " + compat.join(", ") + "." : "";
  const effectiveRange = effectiveRangeSuspended ? null : range;

  const excludeTitles = new Set();
  const seedRawTitle = getRawTitleFromName(seedName);
  if (seedRawTitle) excludeTitles.add(seedRawTitle);

  // Session exclusions are stored by trackId (real, durable identifier)
  // and resolved to names against THIS request's library. Three genuinely
  // different mechanisms, traced from the source (see sessionStore.js
  // header for the exact add/remove rules and why they're kept separate):
  //   - shown names: exact match, capped to the most recently shown 20 -
  //     this matches the prototype's own bangerExcluded usage exactly
  //     (`allEx=(exclude||[]).slice(-20)`, source ~L3512). Not something
  //     this port is authorized to widen on its own (CLAUDE.md Top Rule 5
  //     - that would be a musical-behavior change needing Mike's
  //     approval); docs/QUESTIONS.md records this as the resolved default.
  //   - downvoted names: exact match, UNCAPPED. This is R12's actual,
  //     explicitly authorized minimal fix - the prototype's own
  //     globalExcluded was "written but never read" (CLAUDE.md R12); this
  //     reads it, on every path, with no cap, only for the down-vote list.
  //   - playedNames: fuzzy isSameSong match (playedTrackIds only) - also
  //     blocks other edits/remixes of the same song, matching the
  //     source's playedNamesRef behavior specifically for dragged-out
  //     tracks, not merely-shown ones.
  function namesFor(trackIdSet) {
    if (!session) return [];
    return Array.from(trackIdSet).map((id) => library.find((t) => t.id === id)).filter(Boolean).map(getDisplayName);
  }
  const shownNamesCapped = session ? namesFor(session.shownTrackIds).slice(-20) : [];
  const allEx = Array.from(new Set([
    ...exclude,
    ...shownNamesCapped,
    ...(session ? namesFor(session.downvotedTrackIds) : [])
  ]));
  const playedNames = session ? namesFor(session.playedTrackIds) : [];

  const prefs = { styleProfile, styleProfileEnrichment, playCountMode };

  function buildCtxFor(shuffle, retryMode, invertGenreOverride) {
    let ctx = buildSmartCtx(library, seedGenre, shuffle, "", seedBpm, retryMode, excludeTitles, seedYear, strictEra, invertGenreOverride);
    ctx = mergeTypeLockIntoCtx(ctx, trackTypeLock, library);
    ctx.seedGenre = seedGenre;
    return ctx;
  }

  function sys(vibeForPrompt, isRetry, retryHint) {
    return buildSys(bpmN, keyN, divPick(), vibeForPrompt, seedGenre, "", isRetry, yearNote, seedGender, retryHint, vibePromptText, bridgeInfo, driftInfo, vibeDriftInfo, "", trackTypeLock, genreIslandLock, prefs);
  }

  let resolved;
  let fallbackDepth = 0;
  let cached = false;
  let candidatePoolSize = 0;

  try {
    const ctx1 = buildCtxFor(true, false, vibe > 0);
    candidatePoolSize = ctx1.indexed.length;
    resolved = await callAndResolve(provider, seedName, ctx1, sys(currentVibe, false, null), currentVibe, effectiveRange, allEx, playedNames);
    resolved = applyGenreWall(resolved, seedGenre, currentVibe);
    resolved = applyGenderFilter(resolved, seedGender, currentVibe);
    resolved = injectGenreDiversity(resolved, ctx1.indexed, seedGenre, currentVibe, effectiveRange, allEx, seedName);
    resolved = applyTypeLock(resolved, trackTypeLock);
    resolved = injectTypeLockBalance(resolved, trackTypeLock, library, allEx, seedName);

    const genderCorrectCount = resolved.filter((t) => !t._genderStretch).length;
    const skipFallback = currentVibe === -8 && seedGender && genderCorrectCount > 0 && resolved.length >= 5;

    if (resolved.length < 10 && currentVibe < 0 && !skipFallback) {
      fallbackDepth = 1;
      try {
        const ctx2 = buildCtxFor(true, true, undefined);
        let resolved2 = await callAndResolve(provider, seedName, ctx2, sys(currentVibe, true, null), currentVibe, effectiveRange, allEx, playedNames);
        resolved2 = applyGenreWall(resolved2, seedGenre, currentVibe);
        resolved2 = applyGenderFilter(resolved2, seedGender, currentVibe);
        resolved2 = applyTypeLock(resolved2, trackTypeLock);
        resolved2 = injectTypeLockBalance(resolved2, trackTypeLock, library, allEx, seedName);

        if (resolved2.length >= 5 || (resolved2.length > 0 && resolved.length === 0)) {
          resolved = resolved2.length > 0 ? resolved2 : resolved;
        } else {
          fallbackDepth = 2;
          const looserVibe = Math.min(currentVibe + 2, 0);
          try {
            const ctx3 = buildCtxFor(true, true, undefined);
            let resolved3 = await callAndResolve(provider, seedName, ctx3, sys(looserVibe, false, null), looserVibe, effectiveRange, allEx, playedNames);
            resolved3 = applyGenreWall(resolved3, seedGenre, looserVibe);
            resolved3 = applyGenderFilter(resolved3, seedGender, looserVibe);
            resolved3 = applyTypeLock(resolved3, trackTypeLock);
            resolved3 = injectTypeLockBalance(resolved3, trackTypeLock, library, allEx, seedName);
            const candidates = [resolved3, resolved2, resolved].sort((a, b) => b.length - a.length);
            resolved = candidates[0];
          } catch {
            resolved = resolved2.length > 0 ? resolved2 : resolved;
          }
        }
      } catch {
        // keep fetch #1's `resolved` as-is
      }
    }
  } catch (err) {
    const cachedFallback = session ? session.cache.get(seedTrackId + "|v" + currentVibe + "|e" + energy) : null;
    if (cachedFallback && cachedFallback.length) {
      const libraryIds = new Set(library.map((t) => t.id));
      const excludedSet = new Set(allEx);
      resolved = cachedFallback.filter((r) => libraryIds.has(r.trackId) && !excludedSet.has(r.name));
      cached = true;
    } else {
      throw err;
    }
  }

  if (!cached) {
    resolved = sortByKeyCompatibility(resolved, seedKey);
    if (playCountMode === "deep") {
      resolved = resolved.filter((t) => !isFamiliarSongFamily(t.name, library));
    }
  }

  const results = resolved.map((r) => ({
    trackId: r.trackId || (r._libTrack && r._libTrack.id),
    name: r.name,
    bpm: r.bpm,
    key: r.key,
    camp: r.camp || null,
    lane: r.lane || null,
    crossoverGenre: r.crossoverGenre || null
  }));

  const mode = bridgeInfo ? "bridge" : driftInfo ? "styleDrift" : vibeDriftInfo ? "vibeDrift" : "none";
  const trigger = session && session.pendingManualRetry ? "manualRetry"
    : bridgeInfo ? "bridgeSwerve"
    : driftInfo ? "styleDrift"
    : vibeDriftInfo ? "vibeDrift"
    : daisyChainDepth > 0 ? "daisyChain"
    : (session && session.lastSeedOrigin === "search") ? "search"
    : "freshSeed";

  let superseded = false;
  if (session) {
    // Re-check: did a newer session-changing request land while our
    // provider call(s) were in flight? If so, this result is stale -
    // return it for transparency but commit nothing (CLAUDE.md 6.3).
    superseded = clientSeq <= session.lastClientSeq;
    if (!superseded) {
      const batchId = makeBatchId();
      session.lastBatch = { batchId, results };
      results.forEach((r) => session.shownTrackIds.add(r.trackId));
      session.pendingVibeDriftOffset = null;
      session.pendingManualRetry = false;
      if (!cached && results.length > 0) {
        session.cache.set(seedTrackId + "|v" + currentVibe + "|e" + energy, results);
      }
      session.lastClientSeq = clientSeq;
      session.stateVersion += 1;
    }
  }

  return {
    results,
    candidatePoolSize,
    requested: 20,
    returned: results.length,
    fallbackDepth,
    cached,
    mode,
    trigger,
    chain: session ? { chainId: session.chainId, depth: session.daisyChainDepth } : null,
    superseded,
    stateVersion: session ? session.stateVersion : null,
    simulated: provider.kind !== "anthropic"
  };
}
