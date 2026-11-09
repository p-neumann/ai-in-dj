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
//   - "Ignored" prompt line and the overplayed-pairs note (both need new
//     session concepts - per-track ignore counts, and play-sequence pair
//     tracking - not just reusing session.votes the way "liked" does, see
//     below) - always absent from the prompt for now.
//   - fuzzyFind - bridge mode's old-seed lookup uses an exact id match only.
//   - Do Not Play enforcement (R27) - sessionPrefs are stored but not yet
//     applied as a filter; that's an open question for Mike either way.

import { buildSmartCtx } from "../engine/candidateSelection.js";
import { computeDragLean } from "../engine/dragLean.js";
import { resolveRes } from "../engine/resolveResults.js";
import { applyGenreWall, applyGenderFilter, injectGenreDiversity } from "../engine/postProcessing.js";
import { sortByKeyCompatibility } from "../engine/keyCompatibility.js";
import { getDisplayName, getRawTitleFromName } from "../engine/trackNames.js";
import { inferGenreLocal, inferArtistGender } from "../engine/artistLookup.js";
import { getBpmRange, getYearInstruction } from "../engine/vibe.js";
import { compatibleKeys } from "../engine/keyCompatibility.js";
import { buildSys, divPick } from "../engine/promptBuilder.js";
import { resolveSeedYear } from "../engine/seedYear.js";
import { parseJSON } from "../engine/parsing.js";
import { ProviderError } from "../providers/providerErrors.js";
import { isFamiliarSongFamily } from "../engine/playCountMode.js";
import {
  detectStyleTypeLock, detectGenreIslandLock, mergeTypeLockIntoCtx,
  applyTypeLock, injectTypeLockBalance
} from "../engine/typeLock.js";
import { getSession } from "../session/sessionStore.js";
import { getLibraryForRevision, LibraryOutOfSyncError } from "../library/libraryStore.js";
import { callWithEffortRetry } from "../providers/callWithEffortRetry.js";

export class ValidationError extends Error {}
// CLAUDE.md Section 6.3's own documented error code - a client holding a
// stale or never-synced libraryRevision is told plainly to resync and
// retry, not served results that silently don't match what it thinks it
// sent. Defined in library/libraryStore.js (docs/decisions/0011) so
// crates.js can throw/catch the same class; re-exported here so existing
// importers (app.js) don't need to change.
export { LibraryOutOfSyncError };

function buildRequestBody(seedName, ctx, system, allEx, likedNames, debugOverride) {
  const seedTitleWords = seedName.toLowerCase().replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "")
    .trim().split(" ").filter((w) => w.length > 2).slice(0, 3);
  const seedExcludeNote = seedTitleWords.length
    ? "\nNEVER return any track whose title contains: " + seedTitleWords.join(", ") + ". This includes all remixes, edits, intros, or versions of the seed song."
    : "";
  // exN: tells the MODEL what to avoid, on top of (not instead of) the hard
  // post-filter in resolveRes/injectGenreDiversity/injectTypeLockBalance -
  // steers generation away from excluded tracks instead of relying purely
  // on filtering them out after the fact. Was missing from this port
  // entirely until caught while wiring the liked-tracks line below.
  const exN = allEx && allEx.length ? "\nDo NOT include:\n" + allEx.join("\n") : "";
  const likedN = likedNames && likedNames.length ? "\nDJ liked these:\n" + likedNames.join("\n") : "";
  // debugOverride: started as a test-only model/effort override for the
  // Oct 29 A/B/C comparison (docs/decisions/0010). docs/decisions/0017
  // promotes the effort half of it to a real, shipped testing control -
  // a dropdown on the Track Cheat screen, clearly labeled as such -
  // while model stays fixed at claude-sonnet-5 either way. The dropdown
  // always sends its current value explicitly - an untouched dropdown
  // sends "high", which is byte-for-byte what shipped before (Anthropic's
  // own default for this model), so nothing changes for anyone who never
  // touches it.
  const body = {
    model: (debugOverride && debugOverride.model) || "claude-sonnet-5",
    // Was 2000 (prototype-era), raised to 6000 on 2026-10-06 (docs/decisions/
    // 0006) after thinking exhausted a 2000 ceiling on a tiny test library.
    // 6000 then proved insufficient too: against a real ~100-track library
    // with a Style Drift hybrid-mode prompt, three consecutive real calls
    // (the daisy-chain fetch plus both R28 fallbacks) each hit
    // stop_reason:"max_tokens" with thinking_tokens:5999 of 6000 and an
    // EMPTY answer (docs/decisions/0007, 2026-10-07) - same code path as
    // before, just not enough headroom for a harder prompt. Sonnet 5's own
    // ceiling is 128K output tokens (far above either number), so 16000
    // still leaves a large, deliberately generous margin above the worst
    // case actually observed, while the real answer still only needs
    // ~400-500 tokens - this changes ONLY how much space the model is
    // given to respond, never what it's asked for or how results are
    // selected/ranked.
    max_tokens: 16000,
    system,
    messages: [{
      role: "user",
      content: "Seed: " + seedName + "\nLibrary:\n" + ctx.context +
        "\nReturn JSON array of 20 tracks." + exN + seedExcludeNote +
        "\nHARD RULES:\n1. Every result must be a DIFFERENT song title — never return two versions or remixes of the same song.\n2. Never return any version of the seed track.\n3. Return exactly 20 different song titles." + likedN
    }]
  };
  if (debugOverride && debugOverride.effort) {
    body.output_config = { effort: debugOverride.effort };
  }
  return body;
}

// docs/decisions/0010: real per-call timing and token usage, logged and
// returned alongside the results - pure observability, changes nothing
// about which songs get picked or how they're ranked. Built after a real
// 2-minute single-call latency report (fallbackDepth 0) had no data to
// diagnose from - this is what would have told us, immediately, whether
// that was thinking tokens or something else.
async function callAndResolve(provider, seedName, ctx, system, vibeForSort, effectiveRange, allEx, playedNames, likedNames, debugOverride) {
  const requestBody = buildRequestBody(seedName, ctx, system, allEx, likedNames, debugOverride);
  // docs/decisions/0017: callWithEffortRetry watches for a cut-off
  // response or a ~45s stall and retries once at low effort before this
  // function ever sees the response - everything below operates on
  // whichever attempt actually came back.
  const { response, elapsedMs, effortUsed, retried, retryReason } = await callWithEffortRetry(provider, requestBody);
  if (!response.content || !Array.isArray(response.content)) {
    throw new ProviderError((response.error && response.error.message) || "Provider returned no content", "PROVIDER_ERROR");
  }
  let rawResults;
  try {
    rawResults = parseJSON(response.content.map((b) => b.text || "").join(""));
  } catch (parseErr) {
    throw new ProviderError("Model response was not valid JSON: " + parseErr.message, "MODEL_OUTPUT_INVALID");
  }
  const resolved = resolveRes(rawResults, ctx.indexed, seedName, ctx.seedGenre, vibeForSort > 0, effectiveRange, allEx, playedNames);

  const usage = response.usage || {};
  const callDiag = {
    model: requestBody.model,
    effort: effortUsed,
    elapsedMs,
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    thinkingTokens: (usage.output_tokens_details && usage.output_tokens_details.thinking_tokens) || 0,
    stopReason: response.stop_reason || null,
    retried,
    retryReason,
    simulated: provider.kind !== "anthropic"
  };
  console.log(
    "[track-cheat] AI call: model=" + callDiag.model + " effort=" + callDiag.effort +
    " elapsedMs=" + callDiag.elapsedMs + " inputTokens=" + callDiag.inputTokens +
    " outputTokens=" + callDiag.outputTokens + " thinkingTokens=" + callDiag.thinkingTokens +
    " stopReason=" + callDiag.stopReason + " retried=" + callDiag.retried + (retryReason ? " retryReason=" + retryReason : "") +
    (callDiag.simulated ? " (simulated)" : " (real)")
  );

  return { resolved, callDiag };
}

function makeBatchId() {
  return "b_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function recommendTrackCheat(request, provider) {
  const {
    library: inlineLibrary, libraryRevision = null, seedTrackId, vibe = -3, energy = 0, exclude = [],
    playCountMode = "mix", styleProfile: requestStyleProfile = null, styleProfileEnrichment: requestStyleProfileEnrichment = null,
    vibePromptText = "", sessionId = null, clientSeq = null, expectedStateVersion = null,
    // debugOverride (docs/decisions/0010): test-only, for Ranjish's blind
    // Sonnet-5-vs-lower-effort-vs-Haiku comparison. Never sent by the real
    // desktop app's normal Track Cheat path.
    debugOverride = null
  } = request;

  // Two ways a caller can supply the library: inline (small test
  // fixtures, every existing test, unchanged) or by libraryRevision
  // (the real desktop app, after a one-time sync - CLAUDE.md Phase 5's
  // "sync client"). Checked in this order so inline keeps working
  // exactly as before for anyone still using it.
  let library = inlineLibrary;
  if (!Array.isArray(library) || library.length === 0) {
    if (libraryRevision !== null && libraryRevision !== undefined) {
      const synced = getLibraryForRevision(libraryRevision);
      if (!synced) {
        throw new LibraryOutOfSyncError(
          "libraryRevision " + libraryRevision + " is stale or was never synced - resync via POST /v1/library/sync and retry"
        );
      }
      library = synced;
    }
  }

  if (!Array.isArray(library) || library.length === 0) {
    throw new ValidationError("library must be a non-empty array (or provide a valid libraryRevision)");
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

  // CLAUDE.md Section 6.4: PUT /v1/preferences stores permanent prefs on
  // the session (routes/preferences.js); a request's own fields still win
  // when explicitly supplied (e.g. a one-off override), matching the
  // source's own "request field overrides stored preference" precedent
  // (crateVibePrompt vs styleProfile in buildCrate).
  const styleProfile = requestStyleProfile !== null ? requestStyleProfile : (session ? session.styleProfile : "") || "";
  const styleProfileEnrichment = requestStyleProfileEnrichment !== null ? requestStyleProfileEnrichment : (session ? session.styleProfileEnrichment : null);

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

  const seedYear = await resolveSeedYear(seedTrack, seedName, library, provider);
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
  // "DJ liked these" prompt line (source doFetch ~L2558-2559): thumbs-up
  // reuses the same session.votes Map handleVote already maintains.
  const likedTrackIds = session ? Array.from(session.votes.entries()).filter(([, v]) => v === "up").map(([id]) => id) : [];
  const likedNames = namesFor(new Set(likedTrackIds));

  const prefs = { styleProfile, styleProfileEnrichment, playCountMode };

  function buildCtxFor(shuffle, retryMode, invertGenreOverride) {
    let ctx = buildSmartCtx(library, seedGenre, shuffle, "", seedBpm, retryMode, excludeTitles, seedYear, strictEra, invertGenreOverride);
    ctx = mergeTypeLockIntoCtx(ctx, trackTypeLock, library);
    ctx.seedGenre = seedGenre;
    return ctx;
  }

  // R6/4.4: "one fetch-count tick per doFetch call, including internal
  // auto-retries" (source comment, v1.0.17005) - ticks once per sys() call
  // since sys() is invoked exactly once per doFetch-equivalent attempt
  // below (fetch #1, and each R28 fallback). Genre is resolved from
  // dragLeanEntries' trackIds against THIS request's library, since
  // sessionEvents.js has no library access to resolve it at drag time.
  function nextDragLeanHint() {
    if (!session) return "";
    session.trackCheatFetchCount += 1;
    const resolvedEntries = session.dragLeanEntries.map((e) => {
      const t = library.find((x) => x.id === e.trackId);
      return { genre: t ? (t.genre || "") : "", atFetch: e.atFetch };
    });
    return computeDragLean(resolvedEntries, session.trackCheatFetchCount).hint;
  }

  function sys(vibeForPrompt, isRetry, retryHint) {
    return buildSys(bpmN, keyN, divPick(), vibeForPrompt, seedGenre, "", isRetry, yearNote, seedGender, retryHint, vibePromptText, bridgeInfo, driftInfo, vibeDriftInfo, nextDragLeanHint(), trackTypeLock, genreIslandLock, prefs);
  }

  let resolved;
  let fallbackDepth = 0;
  let cached = false;
  let candidatePoolSize = 0;
  const aiCalls = [];

  try {
    const ctx1 = buildCtxFor(true, false, vibe > 0);
    candidatePoolSize = ctx1.indexed.length;
    const call1 = await callAndResolve(provider, seedName, ctx1, sys(currentVibe, false, null), currentVibe, effectiveRange, allEx, playedNames, likedNames, debugOverride);
    aiCalls.push(call1.callDiag);
    resolved = call1.resolved;
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
        const call2 = await callAndResolve(provider, seedName, ctx2, sys(currentVibe, true, null), currentVibe, effectiveRange, allEx, playedNames, likedNames, debugOverride);
        aiCalls.push(call2.callDiag);
        let resolved2 = call2.resolved;
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
            const call3 = await callAndResolve(provider, seedName, ctx3, sys(looserVibe, false, null), looserVibe, effectiveRange, allEx, playedNames, likedNames, debugOverride);
            aiCalls.push(call3.callDiag);
            let resolved3 = call3.resolved;
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

  // timingsMs.ai + aiCalls (docs/decisions/0010): CLAUDE.md 6.4 already
  // names a single timingsMs.ai number - aiCalls is purely additive, the
  // per-call breakdown (model/effort/latency/token usage) that number
  // alone can't show, built to diagnose the real reported 2-minute
  // single-call latency instead of guessing at its cause.
  const timingsMs = { ai: aiCalls.reduce((sum, c) => sum + c.elapsedMs, 0) };
  // docs/decisions/0017: a plain top-level summary of the LAST real call
  // (the one whose result is actually being returned), so the desktop
  // diagnostics line doesn't need to dig into aiCalls for the common
  // case - aiCalls itself is unchanged, for anyone who wants the full
  // per-attempt breakdown (e.g. an R28 fallback chain of 2-3 calls).
  const lastCall = aiCalls[aiCalls.length - 1] || null;

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
    simulated: provider.kind !== "anthropic",
    effortUsed: lastCall ? lastCall.effort : null,
    retried: lastCall ? lastCall.retried : false,
    retryReason: lastCall ? lastCall.retryReason : null,
    timingsMs,
    aiCalls
  };
}
