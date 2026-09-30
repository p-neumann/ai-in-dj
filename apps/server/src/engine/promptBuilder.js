// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 2335 [divPick], 2363-2457 [buildSys]). Mike's dated
// comments preserved unchanged.
//
// SCOPE NOTE (honest, not a shortcut): trackTypeLock/genreIslandLock
// (type-lock), bridgeInfo (Bridge Mode), driftInfo (Style Drift), and
// vibeDriftInfo (Vibe Slider Drift) are accepted as parameters, exactly
// like the source, and produce the exact same text when present - the
// FUNCTION is fully ported. What's NOT yet built is the DETECTION/session
// logic that decides when those parameters become non-empty
// (detectStyleTypeLock, mergeTypeLockIntoCtx, bridge/drift state machine -
// CLAUDE.md Section 4.3, Appendix B). The route calling this passes
// null/empty for all of them for now, so buildSys naturally falls through
// to its default (passive lane-tagging, no bridge/drift/type-lock) branches
// - same as the prototype does whenever none of those signals are active.

import { getPlayCountModeLine } from "./playCountMode.js";
import { vibeInstruction } from "./vibe.js";

export function divPick() {
  var options = [
    "Prioritize deep cuts and underplayed tracks. Avoid obvious or overplayed hits.",
    "Think outside the box — veteran DJ picks only. No obvious singles.",
    "Dig for hidden gems and low play count tracks only.",
    "Avoid safe or predictable picks. Surface tracks the crowd won't expect.",
    "Surface ONLY low play count tracks. Ignore high play count tracks entirely.",
    "Pick tracks that a seasoned DJ would choose, not what a casual listener would expect.",
    "Avoid any track that has been overplayed. Deep cuts only."
  ];
  return options[Math.floor(Math.random() * options.length)];
}

// styleProfile/styleProfileEnrichment/playCountMode: read from a "prefs"
// object instead of component closure state (the source reads these as
// closure variables - CLAUDE.md Section 5.4 puts preferences server-side,
// but the real preferences store is Phase 6 work, so callers pass
// `{ styleProfile: "", styleProfileEnrichment: null, playCountMode: "mix" }`
// for now until that store exists).
export function buildSys(bpmN, keyN, div, vibe, seedGenre, overplayedNote, isRetry, yearNote, seedGender, retryHint, vibePromptText, bridgeInfo, driftInfo, vibeDriftInfo, dragLeanHint, trackTypeLock, genreIslandLock, prefs) {
  prefs = prefs || {};
  var styleProfile = prefs.styleProfile || "";
  var styleProfileEnrichment = prefs.styleProfileEnrichment || null;
  var playCountMode = prefs.playCountMode || "mix";

  var genderLine = "";
  if (vibe === -8 && seedGender) {
    genderLine = " Artist gender of seed: " + seedGender + ". Prefer " + seedGender + " artists (or groups). Infer gender from your knowledge when not obvious.";
  }
  var genreInferenceLine = "";
  if (vibe === -8) {
    genreInferenceLine = " For tracks with no genre tag, infer genre from your knowledge of the artist — do not exclude them.";
  }
  var retryLine = "";
  if (retryHint) {
    retryLine = " RETRY NOTE: " + retryHint + " Keep the exact same BPM range and era — do NOT change either. Do not change artist gender on this attempt unless explicitly told to below.";
  }
  if (retryHint === "__ALLOW_GENDER__") {
    retryLine = " RETRY NOTE: Multiple prior batches were rejected. Still hold BPM range and era fixed. You may now also broaden artist gender if needed to find enough strong matches.";
  }
  var priorityLine = vibe > 0
    ? "PRIORITY: 1) BPM, 2) Key, 3) Year Era. Genre is explicitly NOT a priority here — follow the genre-blend instruction below exactly, even if that means straying far from the seed's genre. Do not default back to the seed's genre out of habit."
    : "PRIORITY: 1) Genre, 2) Year Era, 3) BPM, 4) Key.";
  var countLine = vibe > 0
    ? " CRITICAL: You MUST return exactly 20 tracks in the JSON array, no fewer. Cast a wide net — return 20 diverse candidates matching the BPM and era instructions above, prioritizing genre variety per the genre-blend instruction below over genre similarity to the seed. The DJ's app will filter and display only the best 10. Never return fewer than 20."
    : " CRITICAL: You MUST return exactly 20 tracks in the JSON array, no fewer. Cast a wide net — return 20 diverse candidates that are close to the seed's genre, era, and BPM. The DJ's app will filter and display only the best 10. Never return fewer than 20.";
  var discoverLine = getPlayCountModeLine(playCountMode);

  var stylePreferenceLine = "";
  if (styleProfile && styleProfile.trim()) stylePreferenceLine += " STANDING STYLE PREFERENCE (always applies, this DJ saved it once): \"" + styleProfile.trim() + "\" — actively favor candidates matching this, blending naturally with the specific request below if one is given rather than one overriding the other.";
  if (styleProfileEnrichment && styleProfileEnrichment.formatTokens && styleProfileEnrichment.formatTokens.length) stylePreferenceLine += " This DJ also generally prefers these version/edit types when available: " + styleProfileEnrichment.formatTokens.join(", ") + ".";
  var vibePromptLine = (vibePromptText && vibePromptText.trim()) ? (" DJ's specific request for this build, follow it directly: " + vibePromptText.trim() + ".") : "";

  var trackTypeLockLine = (trackTypeLock && trackTypeLock.length) ? (genreIslandLock ? (" HARD TYPE RULE: the DJ wants ONLY " + trackTypeLock.join("/").toUpperCase() + " versions/remixes — every result's title must actually indicate one of these. Do not substitute other types even if they're a good genre/BPM match otherwise. At least one of these requested types is NOT genre-adjacent to the seed, so the genre/era instruction above does NOT apply to this fetch — give a fair, roughly EVEN spread across each requested type instead of favoring whichever one happens to be closer to the seed's own genre.") : (" HARD TYPE RULE: the DJ wants ONLY " + trackTypeLock.join("/").toUpperCase() + " versions/remixes — every result's title must actually indicate one of these. Do not substitute other types even if they're a good genre/BPM match otherwise. However, still prefer candidates close to the seed's own genre/era/feel per the instruction above where possible — aim for MOST results to stay in that neighborhood, with only 2-3 results allowed to come from outside it specifically because they satisfy this type rule.")) : "";

  var bridgeLine = "";
  var jsonShape = "[{id,name,bpm,key}]";
  var driftLine = "";
  if (bridgeInfo && bridgeInfo.oldSeedName) {
    jsonShape = "[{id,name,bpm,key,camp}] where camp is either \"new\" or \"bridge\"";
    bridgeLine = " DAISY CHAIN BRIDGE MODE: the DJ just broke away from a chain that was built on \"" + bridgeInfo.oldSeedName + "\"" + (bridgeInfo.oldSeedGenre ? (" (genre: " + bridgeInfo.oldSeedGenre + ")") : "") + (bridgeInfo.oldSeedBpm ? (" (BPM: " + Math.round(bridgeInfo.oldSeedBpm) + ")") : "") + " by choosing a new direction on their own. Return a genuine MIX: roughly half tagged \"new\" continuing the new seed's own vibe normally (respecting the BPM/era instructions above), and roughly half tagged \"bridge\" — real, honest attempts to reconnect to the OLD seed's vibe, using half-time or double-time BPM relationships to the OLD seed's tempo, or genre-adjacent tracks that share DNA with both vibes. The BPM constraint above does NOT apply to \"bridge\" tracks — reach outside it freely if a genuine bridge requires it. If you can't find any honest bridge candidates, it's fine to return fewer \"bridge\" tracks rather than force a fake connection — a manufactured bridge that doesn't actually work is worse than an honest shortage.";
  } else {
    jsonShape = "[{id,name,bpm,key,lane}] where lane is \"pure\" (matches the seed's own core genre/style — no crossover signal), \"crossover\" (a remix/version explicitly signaling a DIFFERENT genre than the seed, in ITS OWN title/tag text — read parenthetical or bracketed version-tag text literally as real signal here, don't discard it as noise the way you might for other purposes), or \"native\" (a track that genuinely IS a different genre entirely on its own — not a remix of anything in the seed's genre family)";
    if (driftInfo && driftInfo.active) {
      jsonShape += ". Also include crossoverGenre (lowercase, e.g. \"reggaeton\") on every non-\"pure\" track, naming which other genre it represents";
      driftLine = " STYLE DRIFT MODE: the DJ's own recent picks from this chain have been trending away from pure \"" + (seedGenre || "the seed genre") + "\" toward " + (driftInfo.crossoverGenre ? ("\"" + driftInfo.crossoverGenre + "\"") : "a different genre") + " — first noticed via a \"" + driftInfo.detectedLane + "\" pick, not a pattern over many picks, so lean in now rather than waiting for more confirmation. Go TRUE three-way hybrid this batch — roughly even thirds pure/crossover/native, think Goldilocks and the three bears, not heavily favoring any one lane yet while it's still being figured out which way the DJ is actually leaning. Do not force a crossover or native genre that doesn't genuinely exist well in this library — an honest shortage in one lane is better than a manufactured, fake-feeling connection.";
    } else if (!driftInfo && vibeDriftInfo) {
      jsonShape = "[{id,name,bpm,key,camp}] where camp is either \"chain\" (respecting the locked same-era vibe) or \"vibe\" (respecting the DJ's slider movement)";
      driftLine = " VIBE SLIDER DRIFT: the DJ moved the vibe slider from its prior position while building this chain — a deliberate signal. Return a genuine MIX: roughly half tagged \"chain\" continuing the locked same-era/same-feel vibe (respecting the BPM/era constraints above), and roughly half tagged \"vibe\" responding to the slider movement they just made (aim for era and BPM that match their actual slider position, NOT the chain's locked vibe). Treat the slider position as ground truth — it was a direct human action. Which camp they pick next signals whether the movement was deliberate or a false alarm.";
    } else {
      driftLine = " This lane tagging is passive classification only for now — it must NOT influence which tracks you actually pick. Pick exactly as you normally would; just tag honestly what each pick actually is.";
    }
  }
  var dragLeanLine = dragLeanHint ? (" SECONDARY, LOW-PRIORITY SIGNAL: this DJ has recently been dragging out tracks leaning toward: " + dragLeanHint + ". This must NEVER override BPM/key/genre-family matching or anything else above — use it only as a tie-breaker among candidates that are already otherwise equally valid picks.") : "";

  return "You are a DJ assistant. Return ONLY a valid JSON array of 12 objects: " + jsonShape + ". No markdown, no explanation, no extra text — ONLY the JSON array. Library: ID|DisplayName|BPM|Key|PlayCount|Year|Genre. " + priorityLine + " " + div + " " + bpmN + " " + keyN + " " + (yearNote || "") + " " + vibeInstruction(vibe, seedGenre, isRetry, seedGender) + " " + overplayedNote + genderLine + genreInferenceLine + retryLine + countLine + discoverLine + stylePreferenceLine + vibePromptLine + trackTypeLockLine + bridgeLine + driftLine + dragLeanLine;
}
