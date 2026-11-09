// Ported from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx (source
// lines 3757-4488, buildCrate + runBuildCrateBody). This is Crate Cheat's
// full orchestration pipeline: the gating logic that decides whether to
// call the curated-tracks or era knowledge resolver first (buildCrate),
// then context building, era hard-filtering (pre-filter + final guard),
// seven guaranteed-inclusion context merges (strict artist lock, tropical/
// old-school anchors, style-type lock, curated anchors from the resolver,
// Style Profile's own curated tracks, remix-type lock, content keywords),
// system-prompt assembly, the AI call, and all post-fetch filtering/
// balancing (dedup, deep-mode familiarity filter, hard type-lock
// enforcement, type-lock count balance, old-school 50/50 interleave,
// genre explicit/implicit interleave, Do Not Play / Do Play, final slice).
//
// Per CLAUDE.md Top Rule 5 this is musical behavior end to end - every
// formula, threshold, and instruction string below is preserved exactly
// as Mike gig-tested it, including asymmetries that look like they "should"
// be consistent but aren't (e.g. the era pre-filter drops untagged tracks
// while the final guard keeps them - that's the source's own behavior, not
// a bug introduced here). Source `libraryRef.current` becomes an explicit
// `library` parameter throughout, matching every other port in this codebase.
//
// R4 (CLAUDE.md): the source's own UI used "fetch a bit more than asked,
// then slice" as its only sizing/bounding strategy - no real batching, no
// hard request-size ceiling beyond the formulas themselves. This port keeps
// those exact formulas (they already self-bound via Math.min caps on
// requestCount and max_tokens) and reports requested/returned/
// candidatePoolSize/shortfallReason instead of a UI message string, so a
// caller can render an honest shortfall rather than the source's baked-in
// prose ("No Results - ...").

import { buildSmartCtx } from "./candidateSelection.js";
import { detectStyleTypeLock, injectTypeLockBalance } from "./typeLock.js";
import { matchCuratedTracksInLibrary } from "./crateMatching.js";
import { applyDoNotPlay, applyDoPlayBoost } from "./crateLists.js";
import { resolveCuratedTracks, resolveEraFromKnowledge } from "./knowledgeCalls.js";
import { getPlayCountModeLine, isFamiliarSongFamily, isFileItselfFamiliar } from "./playCountMode.js";
import { getDisplayName, getRawTitleFromName, getArtistTitle } from "./trackNames.js";
import { inferArtistEra } from "./artistLookup.js";
import { shuffleArr } from "./shuffleArr.js";
import { parseJSON } from "./parsing.js";
import { ProviderError } from "../providers/providerErrors.js";
import { callWithEffortRetry } from "../providers/callWithEffortRetry.js";
import {
  GENRE_KEYWORDS_IN_PROMPT, ERA_KEYWORD_YEAR_RANGE,
  extractGenreFromPrompt, extractEraFromPrompt, extractBpmFromPrompt,
  mightReferenceUnrecognizedEra, detectPromptArtist, hasBroadeningLanguage,
  detectRemixTypeLock, extractContentKeywords
} from "./cratePromptParsing.js";
import {
  isHighEnergyPrompt, getHeaterTier, isOldSchoolPrompt, getOldSchoolTier,
  TROPICAL_ANCHOR_ARTISTS, OLD_SCHOOL_TRUE, OLD_SCHOOL_NEWER
} from "./crateAnchors.js";

export class ValidationError extends Error {}
export class RequestTooLargeError extends Error {}

// CLAUDE.md Section 6.3/R4: "maximum crate size 200" - the source itself
// offered sizes 10/25/50/100/150/200 and never enforced a hard ceiling
// beyond that menu; this is the documented bound, not a guess.
export const MAX_CRATE_SIZE = 200;
const MAX_PROMPT_LENGTH = 2000;

function rebuildCtx(trackList) {
  return {
    indexed: trackList.map(function (t, i) { return { id: i, track: t }; }),
    context: trackList.map(function (t, i) {
      return [i, getDisplayName(t), t.bpm || "", t.key || "", t["play count"] || t.playcount || "0", t.year || "", t.genre || ""].join("|");
    }).join("\n")
  };
}

function mergeIfMissing(ctx, missingTracks) {
  if (!missingTracks.length) return ctx;
  const merged = shuffleArr(missingTracks).concat(ctx.indexed.map(function (e) { return e.track; }));
  return rebuildCtx(merged);
}

// Pre-filter: applied to the FULL library before genre-tier sampling.
// Tracks with neither a usable year nor a known artist era are dropped
// (ty stays 0, which can never satisfy ty>=range[0]) - source v1.0.14007.
function filterLibraryByEraPre(library, eraRange) {
  let overrideCount = 0;
  const filtered = library.filter(function (t) {
    let ty = parseInt(t.year || 0);
    const artistEra = inferArtistEra(getDisplayName(t));
    if (ty && artistEra && Math.abs(ty - artistEra) > 6) { ty = artistEra; overrideCount++; }
    if (!ty) ty = artistEra;
    return ty >= eraRange[0] && ty <= eraRange[1];
  });
  return { filtered: filtered, overrideCount: overrideCount };
}

// Final guard: applied to the fully-merged context right before the fetch,
// catching era violators any of the later force-inclusion merges may have
// reintroduced. Deliberately more lenient than the pre-filter - a track
// with NO year and NO known artist era is KEPT here (source v1.0.14010:
// "if(!ty)return true"), not dropped. That asymmetry is the source's own
// design, not something to reconcile.
function applyFinalEraGuard(ctxIndexed, eraRange) {
  let overrideCount = 0;
  const kept = ctxIndexed.filter(function (e) {
    let ty = parseInt(e.track.year || 0);
    const artistEra = inferArtistEra(getDisplayName(e.track));
    if (ty && artistEra && Math.abs(ty - artistEra) > 6) { ty = artistEra; overrideCount++; }
    if (!ty) ty = artistEra;
    if (!ty) return true;
    return ty >= eraRange[0] && ty <= eraRange[1];
  });
  return { kept: kept, overrideCount: overrideCount, caught: ctxIndexed.length - kept.length };
}

function dedupeByRawTitle(parsed) {
  const seen = [];
  return parsed.filter(function (t) {
    const core = getRawTitleFromName(t.name);
    if (seen.indexOf(core) !== -1) return false;
    seen.push(core);
    return true;
  });
}

function balanceOldSchool(deduped, playlistSize) {
  const trueTierTracks = deduped.filter(function (t) { return getOldSchoolTier(t.name) === "true"; });
  const newerTierTracks = deduped.filter(function (t) { return getOldSchoolTier(t.name) === "newer"; });
  const unclassified = deduped.filter(function (t) { return !getOldSchoolTier(t.name); });
  const halfA = Math.ceil(playlistSize / 2), halfB = Math.floor(playlistSize / 2);
  const firstUp = trueTierTracks.length >= newerTierTracks.length ? newerTierTracks : trueTierTracks;
  const secondUp = trueTierTracks.length >= newerTierTracks.length ? trueTierTracks : newerTierTracks;
  let balanced = [];
  for (let bi = 0; bi < Math.max(halfA, halfB); bi++) {
    if (balanced.length < playlistSize && bi < firstUp.length) balanced.push(firstUp[bi]);
    if (balanced.length < playlistSize && bi < secondUp.length) balanced.push(secondUp[bi]);
  }
  if (balanced.length < playlistSize) {
    const leftover = trueTierTracks.slice(halfA).concat(newerTierTracks.slice(halfA)).concat(unclassified);
    balanced = balanced.concat(leftover.filter(function (t) { return balanced.indexOf(t) === -1; }));
  }
  return balanced;
}

function balanceGenreExplicitImplicit(deduped, genreKeywords, playlistSize) {
  const explicitTagTracks = deduped.filter(function (t) { const n = (t.name || "").toLowerCase(); return genreKeywords.some(function (k) { return n.indexOf(k) !== -1; }); });
  const implicitMatchTracks = deduped.filter(function (t) { const n = (t.name || "").toLowerCase(); return !genreKeywords.some(function (k) { return n.indexOf(k) !== -1; }); });
  const gHalfA = Math.ceil(playlistSize / 2), gHalfB = Math.floor(playlistSize / 2);
  const gFirstUp = explicitTagTracks.length >= implicitMatchTracks.length ? implicitMatchTracks : explicitTagTracks;
  const gSecondUp = explicitTagTracks.length >= implicitMatchTracks.length ? explicitTagTracks : implicitMatchTracks;
  let gBalanced = [];
  for (let gi = 0; gi < Math.max(gHalfA, gHalfB); gi++) {
    if (gBalanced.length < playlistSize && gi < gFirstUp.length) gBalanced.push(gFirstUp[gi]);
    if (gBalanced.length < playlistSize && gi < gSecondUp.length) gBalanced.push(gSecondUp[gi]);
  }
  if (gBalanced.length < playlistSize) {
    const gLeftover = explicitTagTracks.slice(gHalfA).concat(implicitMatchTracks.slice(gHalfA));
    gBalanced = gBalanced.concat(gLeftover.filter(function (t) { return gBalanced.indexOf(t) === -1; }));
  }
  return gBalanced;
}

function validateInput(input) {
  const { library, prompt, playlistSize, crateVibePrompt, styleProfile } = input;
  if (!Array.isArray(library) || library.length === 0) throw new ValidationError("library must be a non-empty array");
  if (!prompt || !prompt.trim()) throw new ValidationError("prompt must not be empty");
  if (!Number.isInteger(playlistSize) || playlistSize < 1) throw new ValidationError("playlistSize must be a positive integer");
  if (playlistSize > MAX_CRATE_SIZE) throw new RequestTooLargeError("playlistSize exceeds the maximum of " + MAX_CRATE_SIZE);
  for (const [field, value] of [["prompt", prompt], ["crateVibePrompt", crateVibePrompt], ["styleProfile", styleProfile]]) {
    if (value && value.length > MAX_PROMPT_LENGTH) throw new RequestTooLargeError(field + " exceeds the maximum length of " + MAX_PROMPT_LENGTH);
  }
}

// Entry point (source: buildCrate). Decides whether a knowledge-resolver
// call is needed before the real build, then runs the body.
export async function buildCrate(input, provider) {
  validateInput(input);
  const {
    library, prompt, crateVibePrompt = "", styleProfile = ""
  } = input;

  const quickDetectedArtist = detectPromptArtist(prompt, library);
  const quickNoMatch = !extractGenreFromPrompt(prompt)
    && !(quickDetectedArtist && !hasBroadeningLanguage(prompt))
    && !/\btropical\b|\bbeach\b/i.test(prompt)
    && !isOldSchoolPrompt(prompt)
    && !detectRemixTypeLock(prompt + " " + crateVibePrompt)
    && !detectStyleTypeLock(styleProfile + " " + crateVibePrompt);
  const needsEraResolver = !quickNoMatch && !extractEraFromPrompt(prompt) && mightReferenceUnrecognizedEra(prompt);

  let unknownGenreAnchors = null;
  let resolvedEraRange = null;
  let knowledgeCallMade = null;

  if (quickNoMatch) {
    const playlistSize = input.playlistSize;
    const curationCount = Math.min(80, Math.max(30, playlistSize * 3));
    unknownGenreAnchors = await resolveCuratedTracks(prompt, curationCount, provider);
    knowledgeCallMade = "curatedTracks";
  } else if (needsEraResolver) {
    resolvedEraRange = await resolveEraFromKnowledge(prompt, provider);
    knowledgeCallMade = "era";
  }

  const result = await runBuildCrateBody({ ...input, unknownGenreAnchors, resolvedEraRange }, provider);
  result.knowledgeCallMade = knowledgeCallMade;
  return result;
}

// source: runBuildCrateBody(unknownGenreAnchors, resolvedEraRange)
export async function runBuildCrateBody(input, provider) {
  const {
    library, prompt, playlistSize,
    crateVibePrompt = "", styleProfile = "", styleProfileEnrichment = null,
    playCountMode = "mix", doPlayList = [], doNotPlayList = [],
    vibeOffset = 0, shownSet = null,
    unknownGenreAnchors = null, resolvedEraRange = null,
    // docs/decisions/0017: real, shipped testing control (a dropdown on
    // the Crate Cheat screen, clearly labeled as such) - Crate Cheat had
    // no effort override at all before this. Omitted or {effort:"high"}
    // sends byte-for-byte what shipped before.
    debugOverride = null
  } = input;

  const promptGenre = extractGenreFromPrompt(prompt);
  const promptBpm = extractBpmFromPrompt(prompt);
  const promptEra = extractEraFromPrompt(prompt);

  let ctx = buildSmartCtx(library, promptGenre, true, promptEra, 0, false, [], 0, false, vibeOffset > 0);

  const eraRangeToUse = (promptEra && ERA_KEYWORD_YEAR_RANGE[promptEra]) || resolvedEraRange || null;
  if (eraRangeToUse) {
    const pre = filterLibraryByEraPre(library, eraRangeToUse);
    if (pre.filtered.length >= 10) {
      ctx = buildSmartCtx(pre.filtered, promptGenre, true, promptEra, 0, false, [], 0, false, vibeOffset > 0);
    }
    // else: safety valve - library genuinely doesn't have 10+ era matches,
    // era NOT enforced this build (ctx stays the unfiltered base build).
  }

  const isStaleTrack = function (t) { return !!(shownSet && (shownSet[t.location] || shownSet[getDisplayName(t)])); };
  const staleTrackedCount = shownSet ? Object.keys(shownSet).length : 0;
  if (shownSet) {
    const unstale = ctx.indexed.filter(function (e) { return !isStaleTrack(e.track); });
    if (unstale.length > 0) ctx = rebuildCtx(unstale.map(function (e) { return e.track; }));
    // else: every candidate already shown - filter NOT enforced this build (source behavior).
  }

  const detectedArtist = detectPromptArtist(prompt, library);
  const strictArtistLock = !!(detectedArtist && !hasBroadeningLanguage(prompt));
  const isTropicalPrompt = /\btropical\b|\bbeach\b/i.test(prompt);
  const oldSchoolWanted = isOldSchoolPrompt(prompt);
  let distinctArtistSongCount = 0;

  if (strictArtistLock) {
    const lockArtistLower = detectedArtist.toLowerCase();
    const alreadyInCtx = new Set(ctx.indexed.map(function (e) { return getDisplayName(e.track); }));
    const allArtistTracks = library.filter(function (t) { return (t.artist || "").toLowerCase().indexOf(lockArtistLower) !== -1; });
    const distinctSeen = new Set(allArtistTracks.map(function (t) { return getRawTitleFromName(getDisplayName(t)); }));
    distinctArtistSongCount = distinctSeen.size;
    const missing = allArtistTracks.filter(function (t) { return !alreadyInCtx.has(getDisplayName(t)) && !isStaleTrack(t); });
    ctx = mergeIfMissing(ctx, missing);
  }

  if (isTropicalPrompt || oldSchoolWanted) {
    const anchorSet = new Set();
    if (isTropicalPrompt) TROPICAL_ANCHOR_ARTISTS.forEach(function (a) { anchorSet.add(a); });
    if (oldSchoolWanted) { OLD_SCHOOL_TRUE.forEach(function (a) { anchorSet.add(a); }); OLD_SCHOOL_NEWER.forEach(function (a) { anchorSet.add(a); }); }
    const anchorNames = Array.from(anchorSet);
    const alreadyInCtx = new Set(ctx.indexed.map(function (e) { return getDisplayName(e.track); }));
    const missing = library.filter(function (t) {
      const af = (t.artist || "").toLowerCase();
      if (!af || alreadyInCtx.has(getDisplayName(t)) || isStaleTrack(t)) return false;
      return anchorNames.some(function (a) { return af.indexOf(a) !== -1; });
    });
    ctx = mergeIfMissing(ctx, missing);
  }

  const remixTypeLock = detectRemixTypeLock(prompt + " " + crateVibePrompt);
  let styleTypeLock = detectStyleTypeLock(styleProfile + " " + crateVibePrompt);
  if (styleProfileEnrichment && styleProfileEnrichment.formatTokens && styleProfileEnrichment.formatTokens.length) {
    const seenTok = new Set();
    styleTypeLock = (styleTypeLock || []).concat(styleProfileEnrichment.formatTokens).filter(function (t) {
      if (seenTok.has(t)) return false; seenTok.add(t); return true;
    });
  }

  if (styleTypeLock && styleTypeLock.length) {
    const alreadyInCtx = new Set(ctx.indexed.map(function (e) { return getDisplayName(e.track); }));
    const missing = library.filter(function (t) {
      const dn = getDisplayName(t).toLowerCase();
      if (alreadyInCtx.has(getDisplayName(t)) || isStaleTrack(t)) return false;
      return styleTypeLock.some(function (k) { return dn.indexOf(k) !== -1; });
    });
    ctx = mergeIfMissing(ctx, missing);
  }

  if (unknownGenreAnchors && unknownGenreAnchors.tracks && unknownGenreAnchors.tracks.length) {
    const alreadyInCtx = {}; ctx.indexed.forEach(function (e) { alreadyInCtx[getDisplayName(e.track)] = true; });
    const curatedMatches = matchCuratedTracksInLibrary(unknownGenreAnchors.tracks, alreadyInCtx, library).filter(function (t) { return !isStaleTrack(t); });
    ctx = mergeIfMissing(ctx, curatedMatches);
  }

  if (styleProfileEnrichment && styleProfileEnrichment.curatedTracks && styleProfileEnrichment.curatedTracks.length) {
    const alreadyInCtx = {}; ctx.indexed.forEach(function (e) { alreadyInCtx[getDisplayName(e.track)] = true; });
    const curatedMatches = matchCuratedTracksInLibrary(styleProfileEnrichment.curatedTracks, alreadyInCtx, library).filter(function (t) { return !isStaleTrack(t); });
    ctx = mergeIfMissing(ctx, curatedMatches);
  }

  if (remixTypeLock) {
    const alreadyInCtx = new Set(ctx.indexed.map(function (e) { return getDisplayName(e.track); }));
    const missing = library.filter(function (t) {
      const dn = getDisplayName(t).toLowerCase();
      if (alreadyInCtx.has(getDisplayName(t)) || isStaleTrack(t)) return false;
      return dn.indexOf(remixTypeLock) !== -1;
    });
    ctx = mergeIfMissing(ctx, missing);
  }

  const contentKeywords = (unknownGenreAnchors && unknownGenreAnchors.tracks && unknownGenreAnchors.tracks.length) ? [] : extractContentKeywords(prompt + " " + crateVibePrompt);
  if (contentKeywords.length) {
    const alreadyInCtx = new Set(ctx.indexed.map(function (e) { return getDisplayName(e.track); }));
    const missing = library.filter(function (t) {
      const dn = getDisplayName(t);
      if (alreadyInCtx.has(dn) || isStaleTrack(t)) return false;
      const dnWords = dn.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(function (w) { return w.length >= 3; });
      return contentKeywords.some(function (k) { return dnWords.some(function (w) { return w.indexOf(k) === 0 || k.indexOf(w) === 0; }); });
    });
    ctx = mergeIfMissing(ctx, missing);
  }

  if (eraRangeToUse) {
    const guard = applyFinalEraGuard(ctx.indexed, eraRangeToUse);
    if (guard.caught > 0) ctx = rebuildCtx(guard.kept.map(function (e) { return e.track; }));
  }

  let nonLockExtra = 5;
  if (playCountMode === "deep") nonLockExtra = Math.max(nonLockExtra, Math.max(20, playlistSize * 2));
  if (oldSchoolWanted) nonLockExtra = Math.max(nonLockExtra, 25);
  if (remixTypeLock) nonLockExtra = Math.max(nonLockExtra, playCountMode === "deep" ? 60 : 35);
  if (styleTypeLock && styleTypeLock.length) nonLockExtra = Math.max(nonLockExtra, playCountMode === "deep" ? 60 : 35);
  if (doNotPlayList.length) nonLockExtra = Math.max(nonLockExtra, 20);
  if (unknownGenreAnchors && unknownGenreAnchors.tracks && unknownGenreAnchors.tracks.length) nonLockExtra = Math.max(nonLockExtra, 30);

  const requestCount = strictArtistLock
    ? Math.min(playlistSize + 35, Math.max(playlistSize, distinctArtistSongCount + 5))
    : playlistSize + nonLockExtra;
  // STOPGAP, 3rd time for this same failure (docs/decisions/0013):
  // 2026-10-07 (0008) and 2026-10-12 (0de72f9) both raised this as
  // `Math.min(cap, base + requestCount*180)` - a single number that blended
  // "room for thinking" and "room for the answer" together, and shrank as
  // requestCount got smaller. That shape was the bug: a real size-10 call
  // (requestCount 15) failed again on 2026-10-30 with thinking at 5654 of
  // an 8700 ceiling, leaving only 2099 tokens - and three real calls that
  // same day (5654/2898/1869 thinking tokens, pool sizes 327/758/664) show
  // thinking does NOT scale with requestCount or candidate-pool size - it
  // varies independently of both. A margin that shrinks with request size
  // is therefore sized against the wrong variable.
  //
  // Fix: split the formula into two independent terms instead of one
  // blended one.
  //   - CRATE_THINKING_MARGIN (flat, does not scale with requestCount):
  //     12000 - about 2.1x the worst real Crate Cheat thinking draw seen
  //     so far (5654), and about 1.5x the worst thinking seen on ANY real
  //     call against this model/effort in this app, including Track
  //     Cheat's own A/B/C/D comparison (7711, docs/QUESTIONS.md). Using
  //     the higher of the two real worst-cases, not just this feature's
  //     own, since nothing suggests Crate Cheat's thinking is capped
  //     below what the same model/effort has already done elsewhere.
  //   - CRATE_ANSWER_TOKENS_PER_TRACK (scales with requestCount, same as
  //     before - this part IS legitimately request-size-dependent, since
  //     a bigger JSON array really does need more tokens): 70 tokens,
  //     rounded up from the one real call where both requestCount and the
  //     actual visible-answer size are known (947 tokens / 15 tracks =
  //     63.1/track).
  // Outer cap (16000) unchanged - both real failures so far were at the
  // small end (requestCount 15); nothing suggests the large end needs
  // more room, so it isn't being touched here.
  const CRATE_THINKING_MARGIN = 12000;
  const CRATE_ANSWER_TOKENS_PER_TRACK = 70;
  const dynamicMaxTokens = Math.min(16000, CRATE_THINKING_MARGIN + requestCount * CRATE_ANSWER_TOKENS_PER_TRACK);
  const candidatePoolSize = ctx.indexed.length;
  const simulated = provider.kind !== "anthropic";

  if (candidatePoolSize === 0) {
    return { results: [], requested: playlistSize, returned: 0, candidatePoolSize: 0, shortfallReason: "POOL_TOO_SMALL", simulated: simulated };
  }

  const bpmLine = promptBpm ? ("Target BPM around " + promptBpm + " — stay within roughly ±6 BPM of that unless the vibe genuinely can't support it. ") : "";

  let heaterAnchorArtists = [];
  const heaterWanted = isHighEnergyPrompt(prompt);
  if (heaterWanted && !detectedArtist && !isTropicalPrompt) {
    const seenArtists = new Set();
    for (const t of library) {
      if (heaterAnchorArtists.length >= 15) break;
      const dn = getDisplayName(t);
      if (getHeaterTier(dn) === "guaranteed") {
        const artistName = getArtistTitle(dn).artist;
        if (artistName && !seenArtists.has(artistName.toLowerCase())) { seenArtists.add(artistName.toLowerCase()); heaterAnchorArtists.push(artistName); }
      }
    }
  }
  const heaterLine = heaterWanted
    ? ("This DJ explicitly asked for HEATERS. The DJ's own definition, use exactly this test for every track: a heater makes people want to move on the dance floor. If it doesn't make people want to dance, it is NOT a heater — no matter how famous, classic, or well-known it is. Being a recognizable hit is NOT enough on its own. Do not use BPM, tempo, or production era as a proxy for this — a track only qualifies if it passes the dance-floor test itself."
      + (heaterAnchorArtists.length ? (" Artists this DJ has personally confirmed are reliable heaters in HIS library, use these as calibration anchors for the vibe (not an exclusive list — other tracks can qualify too, but weigh these heavily): " + heaterAnchorArtists.join(", ") + ".") : "")
      + " A single artist can have BOTH heater and non-heater tracks — an artist being on the list above is not a blanket pass for every song they've made; a slow, mellow, or verse-heavy track from a heater artist still fails the dance-floor test.")
    : "";

  const discoverLine = getPlayCountModeLine(playCountMode);

  let oldSchoolTrueAnchors = [], oldSchoolNewerAnchors = [];
  if (oldSchoolWanted) {
    const seenTrue = new Set(), seenNewer = new Set();
    for (const t of library) {
      if (oldSchoolTrueAnchors.length >= 10 && oldSchoolNewerAnchors.length >= 10) break;
      const dn = getDisplayName(t);
      const tier = getOldSchoolTier(dn);
      const artistName = getArtistTitle(dn).artist;
      if (!artistName) continue;
      const al = artistName.toLowerCase();
      if (tier === "true" && !seenTrue.has(al) && oldSchoolTrueAnchors.length < 10) { seenTrue.add(al); oldSchoolTrueAnchors.push(artistName); }
      else if (tier === "newer" && !seenNewer.has(al) && oldSchoolNewerAnchors.length < 10) { seenNewer.add(al); oldSchoolNewerAnchors.push(artistName); }
    }
  }
  const oldSchoolLine = oldSchoolWanted
    ? (" OLD SCHOOL RULE: this DJ's definition of \"old school\" spans two eras, not one — true old school (late 70s/early-mid 80s foundational hip-hop and electro) AND golden-age/90s hip-hop. Include AT LEAST 4-5 tracks from EACH era — do not let one era dominate the results."
      + (oldSchoolTrueAnchors.length ? (" True old school artists confirmed in his library: " + oldSchoolTrueAnchors.join(", ") + ".") : "")
      + (oldSchoolNewerAnchors.length ? (" Golden-age/90s artists confirmed in his library: " + oldSchoolNewerAnchors.join(", ") + ".") : "")
      + " Do NOT include anything from the 2000s onward — that's too recent for either tier, even if an artist has old-school-era roots.")
    : "";

  const tropicalLine = isTropicalPrompt
    ? (" TROPICAL/BEACH RULE: this DJ's \"tropical\"/\"beach\" vibe means tropical house and reggae-pop CROSSOVER — mellow, warm, island-flavored — NOT generic aggressive dancehall or party-rap that's merely Caribbean-adjacent. Confirmed-fit reference tracks: Cheerleader (OMI, Felix Jaehn Remix), Lean On (Major Lazer & DJ Snake ft. MO), One Dance (Drake ft. Wizkid & Kyla), Rude (MAGIC!), Hey Ma (Pitbull & J Balvin ft. Camila Cabello), Sun Is Shining Funkstar Deluxe Remix (Bob Marley), Waka Waka (Shakira), Red Red Wine (UB40), Danza Kuduro (Don Omar & Lucenzo), Riptide (Vance Joy)."
      + " Confirmed NOT a fit: Wild Thoughts (DJ Khaled ft. Rihanna & Bryson Tiller) — too hip-hop/R&B, not tropical house even though it samples island elements. If \"party\" also appears in the prompt, this tropical/beach steering takes priority over the generic heater-artist pool — don't default to Shaggy-style dancehall party tracks just because \"party\" is also in the wording.")
    : "";

  const remixTypeLine = remixTypeLock ? (" REMIX TYPE RULE: the DJ wants ONLY " + remixTypeLock.toUpperCase() + " remixes — every result's title must actually indicate a " + remixTypeLock + " remix/version. Do not substitute other remix types even if they're a good genre/BPM match otherwise.") : "";
  const styleTypeLine = (styleTypeLock && styleTypeLock.length) ? (" STYLE PROFILE TYPE RULE: this DJ's saved style profile requires ONLY these version types: " + styleTypeLock.join(", ").toUpperCase() + " — every result's title must actually indicate one of these. Do not substitute other version types even if they're a good genre/BPM match otherwise.") : "";
  const unknownGenreLine = (unknownGenreAnchors && unknownGenreAnchors.tracks && unknownGenreAnchors.tracks.length)
    ? (" CURATED TRACK RESOLUTION: the DJ's request (\"" + prompt + "\") didn't match anything in this app's built-in keyword list, so a specific curated list of real songs a knowledgeable DJ would pick for this exact request was generated and matched against this library — those matches have been force-included in the context below. Strongly prefer these curated matches for this request; they were chosen specifically for what was actually asked, not a generic genre pull. It's completely fine to return fewer than the requested count if there aren't enough curated matches available in this library — a smaller set of tracks that genuinely fit is better than padding out to the full count with something that doesn't."
      + (unknownGenreAnchors.bpmMin && unknownGenreAnchors.bpmMax ? (" Typical BPM range for this request: " + unknownGenreAnchors.bpmMin + "-" + unknownGenreAnchors.bpmMax + ".") : "")
      + (unknownGenreAnchors.eraStart && unknownGenreAnchors.eraEnd ? (" Typical era: " + unknownGenreAnchors.eraStart + "-" + unknownGenreAnchors.eraEnd + ".") : ""))
    : "";
  const styleProfileCuratedLine = (styleProfileEnrichment && styleProfileEnrichment.curatedTracks && styleProfileEnrichment.curatedTracks.length)
    ? (" This DJ's saved Style Profile describes a specific taste/context, and real matching tracks have been force-included in the context below — favor these when they're also a good fit for the current request.")
    : "";

  const playCountLine = heaterLine + discoverLine + oldSchoolLine + tropicalLine + remixTypeLine + styleTypeLine + unknownGenreLine + styleProfileCuratedLine;

  const artistScopeLine = detectedArtist
    ? (strictArtistLock
      ? (" ARTIST SCOPE RULE: the DJ's prompt specifically names \"" + detectedArtist + "\", an artist who exists in this library, with no broadening language. EVERY SINGLE result must be a track credited to " + detectedArtist + " — solo, or as a collaborator/feature alongside other artists — with NO exceptions. Pull " + detectedArtist + "'s entire available catalog from the library (including remixes/edits/collabs crediting them) before returning fewer than " + playlistSize + " if the library truly doesn't have enough.")
      : (" ARTIST SCOPE RULE: the DJ's prompt names \"" + detectedArtist + "\" AND asks for a broader blend — include " + detectedArtist + " plus genuinely similar artists, not just other artists in general."))
    : "";

  const styleProfileLine = styleProfile && styleProfile.trim() ? (" STYLE PREFERENCE: \"" + styleProfile.trim() + "\" — actively favor candidates matching this.") : "";
  const crateVibePromptLine = crateVibePrompt && crateVibePrompt.trim() ? (" DJ's specific format/vibe request for this build, follow it directly: \"" + crateVibePrompt.trim() + "\".") : "";

  const doPlayPermanent = doPlayList.filter(function (e) { return e.persistent; }).concat(doPlayList.filter(function (e) { return !e.persistent; }));
  const doNotPlayPermanent = doNotPlayList.filter(function (e) { return e.persistent; }).concat(doNotPlayList.filter(function (e) { return !e.persistent; }));
  const doPlayLine = doPlayPermanent.length ? (" FAVORED (prefer these when possible): " + doPlayPermanent.map(function (e) { return e.type + "=" + e.value; }).join(", ") + ".") : "";
  const doNotPlayLine = doNotPlayPermanent.length ? (" EXCLUDE ENTIRELY, do not include even one: " + doNotPlayPermanent.map(function (e) { return e.type + "=" + e.value; }).join(", ") + ".") : "";

  const diversityLine = " VARIETY: when multiple tracks fit this request roughly equally well, actively spread your picks across different artists and tracks rather than defaulting only to the most famous or most obvious matches — a DJ using this same request repeatedly needs real variety, not the identical \"greatest hits\" every time."
    + (staleTrackedCount ? (" This exact request has already been built " + staleTrackedCount + " track(s) worth this session (those are already excluded from the library below) — treat this as a genuine repeat ask and prioritize picks meaningfully different in feel from what a first-time run would obviously reach for first.") : "");

  const system = "You are a DJ assistant. Return ONLY a valid JSON array of exactly " + requestCount + " objects: [{id,name,bpm,key}]. No markdown, no extra text. Library: ID|DisplayName|BPM|Key|PlayCount|Year|Genre."
    + styleProfileLine + crateVibePromptLine + doPlayLine + doNotPlayLine + diversityLine
    + " PRIORITY: 1) Genre, 2) BPM, 3) Key. " + bpmLine + playCountLine + artistScopeLine + " No duplicates.";

  const userContent = "Library:\n" + ctx.context + "\n\nVibe: " + prompt + "\n\nReturn exactly " + requestCount + " tracks matching this vibe.";

  const requestBody = { model: "claude-sonnet-5", max_tokens: dynamicMaxTokens, system: system, messages: [{ role: "user", content: userContent }] };
  if (debugOverride && debugOverride.effort) {
    requestBody.output_config = { effort: debugOverride.effort };
  }
  // docs/decisions/0017: callWithEffortRetry watches for a cut-off
  // response or a ~45s stall and retries once at low effort before this
  // function ever sees the response - `data` below is whichever attempt
  // actually came back, same as before this existed.
  const { response: data, elapsedMs, effortUsed, retried, retryReason } = await callWithEffortRetry(provider, requestBody);

  // docs/decisions/0012: same per-call token diagnostics Track Cheat
  // already has (trackCheat.js's callAndResolve, docs/decisions/0010),
  // ported here after a real size-10 "music for the hip hop" crate build
  // hit stop_reason:"max_tokens" with no way to see what actually
  // happened - the old code threw before ever reading `data.usage`, so
  // the real numbers were discarded the instant the call failed. Logged
  // unconditionally, BEFORE the success/failure branches below, so a
  // cutoff still prints real numbers instead of nothing.
  const usage = data.usage || {};
  const callDiag = {
    model: requestBody.model,
    effort: effortUsed,
    elapsedMs,
    maxTokensAllowed: dynamicMaxTokens,
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    thinkingTokens: (usage.output_tokens_details && usage.output_tokens_details.thinking_tokens) || 0,
    stopReason: data.stop_reason || null,
    retried,
    retryReason,
    simulated: provider.kind !== "anthropic"
  };
  console.log(
    "[crate-cheat] AI call: model=" + callDiag.model + " effort=" + callDiag.effort +
    " elapsedMs=" + callDiag.elapsedMs + " maxTokensAllowed=" + callDiag.maxTokensAllowed +
    " inputTokens=" + callDiag.inputTokens + " outputTokens=" + callDiag.outputTokens +
    " thinkingTokens=" + callDiag.thinkingTokens + " stopReason=" + callDiag.stopReason +
    " retried=" + callDiag.retried + (retryReason ? " retryReason=" + retryReason : "") +
    (callDiag.simulated ? " (simulated)" : " (real)")
  );

  if (!data.content || !Array.isArray(data.content)) {
    throw new ProviderError((data.error && data.error.message) || "API error", "PROVIDER_ERROR");
  }
  if (data.stop_reason === "max_tokens") {
    // Was "Try a smaller track count" - misleading: this exact ceiling
    // (requestCount 15 -> 8700 max_tokens) is identical whether playlistSize
    // is 10 or 25; a size-10 request already failed with it once (2026-10-30),
    // so "try smaller" is not just unhelpful, it is not even true. State the
    // real numbers we now have instead of guessing a remedy.
    throw new ProviderError(
      "Response cut off — the model hit its token limit before finishing (used " + callDiag.outputTokens +
      " of " + callDiag.maxTokensAllowed + " allowed tokens, " + callDiag.thinkingTokens + " of that on thinking). " +
      "This isn't caused by the crate size you picked. Try again, or try rewording the prompt.",
      "MODEL_OUTPUT_INVALID"
    );
  }
  const rawResponseText = data.content.map(function (b) { return b.text || ""; }).join("");
  let parsed;
  try { parsed = parseJSON(rawResponseText); }
  catch (parseErr) {
    throw new ProviderError("No JSON — model returned: \"" + rawResponseText.slice(0, 150).replace(/"/g, "'") + (rawResponseText.length > 150 ? "..." : "") + "\"", "MODEL_OUTPUT_INVALID");
  }

  let deduped = dedupeByRawTitle(parsed);

  if (playCountMode === "deep") {
    if (remixTypeLock) {
      deduped = deduped.filter(function (t) {
        const entry = ctx.indexed[t.id];
        const libTrack = entry ? entry.track : null;
        return libTrack ? !isFileItselfFamiliar(libTrack) : true;
      });
    } else {
      deduped = deduped.filter(function (t) { return !isFamiliarSongFamily(t.name, library); });
    }
  }

  if (strictArtistLock) {
    const lockArtist = detectedArtist.toLowerCase();
    deduped = deduped.filter(function (t) { return (t.name || "").toLowerCase().indexOf(lockArtist) !== -1; });
  }
  if (remixTypeLock) {
    deduped = deduped.filter(function (t) { return (t.name || "").toLowerCase().indexOf(remixTypeLock) !== -1; });
  }
  if (styleTypeLock && styleTypeLock.length) {
    deduped = deduped.filter(function (t) {
      const dn = (t.name || "").toLowerCase();
      return styleTypeLock.some(function (k) { return dn.indexOf(k) !== -1; });
    });
  }

  const combinedCrateTypeLock = (styleTypeLock && styleTypeLock.length ? styleTypeLock.slice() : []).concat(remixTypeLock ? [remixTypeLock] : []).filter(function (k, i, arr) { return arr.indexOf(k) === i; });
  if (combinedCrateTypeLock.length > 1) {
    deduped = injectTypeLockBalance(deduped, combinedCrateTypeLock, library, [], "", playlistSize);
  }

  if (oldSchoolWanted) {
    deduped = balanceOldSchool(deduped, playlistSize);
  } else if (promptGenre && !strictArtistLock && !remixTypeLock && !isTropicalPrompt && GENRE_KEYWORDS_IN_PROMPT[promptGenre]) {
    deduped = balanceGenreExplicitImplicit(deduped, GENRE_KEYWORDS_IN_PROMPT[promptGenre], playlistSize);
  }

  const beforeListFilters = deduped.length;
  deduped = applyDoNotPlay(deduped, doNotPlayList);
  deduped = applyDoPlayBoost(deduped, doPlayList);
  deduped = deduped.slice(0, playlistSize);

  // Library-first guarantee: every result must map to a real track that
  // was actually IN the candidate pool sent to the model - an id outside
  // ctx.indexed's range (or any id the pool-building code never assigned)
  // is dropped, never trusted or invented from the model's own text.
  const seenTrackIds = new Set();
  const results = deduped.map(function (t) {
    const entry = t.id >= 0 ? ctx.indexed[t.id] : null;
    const libTrack = entry ? entry.track : (t._libTrack || null);
    return {
      trackId: libTrack ? libTrack.id : null,
      name: libTrack ? getDisplayName(libTrack) : t.name,
      bpm: t.bpm,
      key: t.key
    };
  }).filter(function (r) {
    if (r.trackId === null) return false;
    // Belt-and-suspenders beyond the earlier raw-title dedup (which keys
    // off the MODEL's own name text): if two returned entries resolve to
    // the same real library track by id - whatever text the model
    // attached to each - only the first survives. A crate must never
    // contain the same real track twice.
    if (seenTrackIds.has(r.trackId)) return false;
    seenTrackIds.add(r.trackId);
    return true;
  });

  let shortfallReason = null;
  if (results.length < playlistSize) {
    if (candidatePoolSize < requestCount) shortfallReason = "POOL_TOO_SMALL";
    else if (beforeListFilters < playlistSize) shortfallReason = "FILTERED_OUT";
    else shortfallReason = "MODEL_RETURNED_FEWER";
  }

  return {
    results: shuffleArr(results),
    requested: playlistSize,
    returned: results.length,
    candidatePoolSize: candidatePoolSize,
    shortfallReason: shortfallReason,
    simulated: simulated,
    effortUsed: effortUsed,
    retried: retried,
    retryReason: retryReason,
    // caller (routes/crates.js) uses this to update per-prompt staleness
    // tracking (source: setCrateShownTracks) - not meaningful on its own.
    resultDisplayNames: results.map(function (r) { return r.name; })
  };
}
