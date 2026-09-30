// Phase 4 Track Cheat pipeline - supersedes the Phase 3 vertical slice with
// (nearly) full parity on the DEFAULT, non-hybrid path. Ported and wired,
// in the source's own order (fetchBangerResults, source ~L3460-3622):
//
//   seed resolution -> chain vibe lock (R8) -> local seed-year resolution ->
//   buildSmartCtx -> buildSys -> AI call -> parseJSON -> resolveRes ->
//   applyGenreWall -> applyGenderFilter -> injectGenreDiversity ->
//   [R28 fallback chain, up to 2 more AI calls, if <10 results at negative
//   vibe] -> sortByKeyCompatibility -> deep-mode filter -> session
//   exclusion update (R12) / cache (R13).
//
// NOT YET PORTED (each is a separate, well-scoped chunk of Phase 4 - listed
// honestly rather than silently skipped):
//   - Type locks (detectStyleTypeLock, mergeTypeLockIntoCtx, applyTypeLock,
//     injectTypeLockBalance, detectGenreIslandLock) - trackTypeLock is
//     always [] and genreIslandLock always false, which makes buildSys and
//     resolveRes naturally take their "no type lock" branch, same as the
//     prototype does whenever a DJ hasn't typed a type request.
//   - Hybrid modes: Bridge Mode, Style Drift, Vibe Slider Drift. bridgeInfo/
//     driftInfo/vibeDriftInfo are always null, so buildSys takes its
//     default passive-lane-tagging branch, same as the prototype whenever
//     none of those signals are active.
//   - Drag lean (computeDragLean) - dragLeanHint is always "".
//   - "Liked"/"ignored" prompt lines and overplayed-pairs note - these read
//     session vote/play history the server doesn't track yet; always "".
//   - resolveSeedYearAsync's AI-knowledge fallback - only the local
//     (no-network) part is ported (seedYear.js); unknown stays unknown
//     rather than triggering a 4th kind of provider call.
// Full parity on all of the above is tracked as ongoing Phase 4 work.

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
import { getExcludedNames, addExcludedNames, cacheGet, cacheSet } from "../session/sessions.js";

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

export async function recommendTrackCheat(request, provider) {
  const {
    library, seedTrackId, vibe = -3, energy = 0, exclude = [], chainDepth = 0,
    playCountMode = "mix", styleProfile = "", styleProfileEnrichment = null,
    vibePromptText = "", sessionId = null
  } = request;

  if (!Array.isArray(library) || library.length === 0) {
    throw new ValidationError("library must be a non-empty array");
  }
  const seedTrack = library.find((t) => t.id === seedTrackId);
  if (!seedTrack) {
    throw new ValidationError("seedTrackId not found in library");
  }

  const seedName = getDisplayName(seedTrack);
  const seedGenre = (seedTrack.genre && seedTrack.genre.trim()) || inferGenreLocal(seedName) || "";
  const seedBpm = parseFloat(seedTrack.bpm || "0") || 0;
  const seedKey = (seedTrack.key || "").trim();
  const seedGender = inferArtistGender(seedName);

  // R8: chain vibe lock - a chain in progress holds -3 ("same era, same
  // feel") regardless of the slider, UNLESS vibe-slider-drift is active.
  // vibeDriftInfo is always null here (not ported), so any active chain
  // always locks to -3, same as the prototype whenever drift isn't firing.
  const currentVibe = chainDepth > 0 ? -3 : vibe;

  const seedYear = resolveSeedYearLocal(seedTrack, seedName, library);
  const strictEra = currentVibe <= -3 && seedYear > 0;
  const yearNote = getYearInstruction(seedYear ? String(seedYear) : "", seedName, currentVibe);

  const range = getBpmRange(seedBpm, vibe, energy);
  const compat = compatibleKeys(seedKey);
  const bpmN = range ? "BPM between " + Math.round(range[0]) + " and " + Math.round(range[1]) + " only." : "";
  const keyN = compat.length ? "Prefer keys: " + compat.join(", ") + "." : "";
  const effectiveRange = range; // no suspension - bridge/drift not ported, so never null here

  const excludeTitles = new Set();
  const seedRawTitle = getRawTitleFromName(seedName);
  if (seedRawTitle) excludeTitles.add(seedRawTitle);

  // R12 (defect fix): session-remembered exclusions, uncapped, merged with
  // whatever this request itself asked to exclude - no 20-item slice.
  const sessionExcluded = getExcludedNames(sessionId);
  const allEx = Array.from(new Set([...exclude, ...sessionExcluded]));

  const prefs = { styleProfile, styleProfileEnrichment, playCountMode };

  function buildCtxFor(shuffle, retryMode, invertGenreOverride) {
    const ctx = buildSmartCtx(library, seedGenre, shuffle, "", seedBpm, retryMode, excludeTitles, seedYear, strictEra, invertGenreOverride);
    ctx.seedGenre = seedGenre;
    return ctx;
  }

  function sys(vibeForPrompt, isRetry, retryHint) {
    return buildSys(bpmN, keyN, divPick(), vibeForPrompt, seedGenre, "", isRetry, yearNote, seedGender, retryHint, vibePromptText, null, null, null, "", [], false, prefs);
  }

  let resolved;
  let fallbackDepth = 0;
  let cached = false;
  let candidatePoolSize = 0;

  try {
    // Fetch #1: real, faithful default path (invertGenre uses the RAW
    // slider value, not the chain-overridden currentVibe - matches
    // buildCtx's own closure-read of vibeOffset in the source).
    const ctx1 = buildCtxFor(true, false, vibe > 0);
    candidatePoolSize = ctx1.indexed.length;
    resolved = await callAndResolve(provider, seedName, ctx1, sys(currentVibe, false, null), currentVibe, effectiveRange, allEx, allEx);
    // resolveRes already drops the seed itself (isSameSong check against
    // the same seedName passed here) - the source's extra outer
    // `.filter(t=>!isSameSong(fname,t.name))` after resolveRes is
    // therefore redundant with this call path and intentionally omitted.
    resolved = applyGenreWall(resolved, seedGenre, currentVibe);
    resolved = applyGenderFilter(resolved, seedGender, currentVibe);
    resolved = injectGenreDiversity(resolved, ctx1.indexed, seedGenre, currentVibe, effectiveRange, allEx, seedName);

    const genderCorrectCount = resolved.filter((t) => !t._genderStretch).length;
    const skipFallback = currentVibe === -8 && seedGender && genderCorrectCount > 0 && resolved.length >= 5;

    if (resolved.length < 10 && currentVibe < 0 && !skipFallback) {
      fallbackDepth = 1;
      try {
        // Fetch #2 (R28): note invertGenre is NOT passed here, matching the
        // source's own doFetch call (only 8 args to buildSmartCtx) -
        // fallback retries never invert genre regardless of slider sign.
        const ctx2 = buildCtxFor(true, true, undefined);
        let resolved2 = await callAndResolve(provider, seedName, ctx2, sys(currentVibe, true, null), currentVibe, effectiveRange, allEx, allEx);
        resolved2 = applyGenreWall(resolved2, seedGenre, currentVibe);
        resolved2 = applyGenderFilter(resolved2, seedGender, currentVibe);

        if (resolved2.length >= 5 || (resolved2.length > 0 && resolved.length === 0)) {
          resolved = resolved2.length > 0 ? resolved2 : resolved;
        } else {
          fallbackDepth = 2;
          const looserVibe = Math.min(currentVibe + 2, 0);
          try {
            const ctx3 = buildCtxFor(true, true, undefined);
            let resolved3 = await callAndResolve(provider, seedName, ctx3, sys(looserVibe, false, null), looserVibe, effectiveRange, allEx, allEx);
            resolved3 = applyGenreWall(resolved3, seedGenre, looserVibe);
            resolved3 = applyGenderFilter(resolved3, seedGender, looserVibe);
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
    const cachedFallback = cacheGet(sessionId, seedTrackId, currentVibe, energy);
    if (cachedFallback && cachedFallback.length) {
      // R13 (defect fix): re-validate before showing - current exclusions
      // and continued presence in the (possibly changed) library, not
      // shown blindly.
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
    key: r.key
  }));

  if (results.length > 0) {
    addExcludedNames(sessionId, results.map((r) => r.name));
    if (!cached) cacheSet(sessionId, seedTrackId, currentVibe, energy, results);
  }

  return {
    results,
    candidatePoolSize,
    requested: 20,
    returned: results.length,
    fallbackDepth,
    cached,
    simulated: provider.kind !== "anthropic"
  };
}
