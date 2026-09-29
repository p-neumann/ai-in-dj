// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 746-833, function buildSmartCtx). Logic and Mike's dated
// comments preserved unchanged, per CLAUDE.md Top Rule 5 - candidate
// selection is musical behavior, not something to redesign while porting.
//
// SCOPE NOTE (honest, not a shortcut): this is buildSmartCtx only - the
// Phase 3 vertical slice's candidate-selection step. It does NOT yet cover
// the ~8 additional merge points (mergeTypeLockIntoCtx, type-lock/genre
// island injection, hybrid-mode context merges) that the full prototype
// applies on top of this for bridge/drift/type-lock requests (CLAUDE.md R3).
// Full parity is Phase 4 work. This function alone is enough to prove the
// endpoint can pick real candidates from a real library for a plain,
// non-hybrid Track Cheat request.

import { getDisplayName, getRawTitleFromName } from "./trackNames.js";
import { getAdjacentGenres, getAdjacentGenresAtTier, genreMatches, eraMatches } from "./genre.js";

export function buildSmartCtx(library, seedGenre, shuffle, eraHint, seedBpm, retryMode, excludeTitles, seedYear, strictEra, invertGenre) {
  var adjacent = invertGenre ? getAdjacentGenresAtTier(seedGenre, 0) : getAdjacentGenres(seedGenre);
  var genreEra = [], genreOnly = [], eraOnly = [], other = [];
  library.forEach(function (t) {
    if (excludeTitles && excludeTitles.size > 0) {
      var rawTitle = getRawTitleFromName(getDisplayName(t));
      if (rawTitle && excludeTitles.has(rawTitle)) return;
    }
    if (strictEra && seedYear) {
      var trackYear = parseInt(t.year || 0);
      if (!trackYear || Math.abs(trackYear - seedYear) > 5) return;
    }
    var gm = adjacent.length && genreMatches(t.genre, adjacent);
    var em = eraHint ? eraMatches(t, eraHint) : true;
    if (gm && em) genreEra.push(t);
    else if (gm) genreOnly.push(t);
    else if (em && eraHint) eraOnly.push(t);
    else other.push(t);
  });
  if (retryMode && seedBpm) {
    var bpmSort = function (a, b) {
      var aBpm = parseFloat(a.bpm || 0); var bBpm = parseFloat(b.bpm || 0);
      var aDiff = aBpm ? Math.abs(aBpm - seedBpm) : 9999;
      var bDiff = bBpm ? Math.abs(bBpm - seedBpm) : 9999;
      return aDiff - bDiff;
    };
    genreEra = genreEra.sort(bpmSort);
    genreOnly = genreOnly.sort(bpmSort);
    eraOnly = eraOnly.sort(function () { return Math.random() - 0.5; });
    other = other.sort(function () { return Math.random() - 0.5; });
  } else if (shuffle) {
    genreEra = genreEra.sort(function () { return Math.random() - 0.5; });
    genreOnly = genreOnly.sort(function () { return Math.random() - 0.5; });
    eraOnly = eraOnly.sort(function () { return Math.random() - 0.5; });
    other = other.sort(function () { return Math.random() - 0.5; });
  }
  var combined;
  if (invertGenre) {
    combined = other.slice(0, 150);
    if (combined.length < 150) combined = combined.concat(eraOnly.slice(0, 150 - combined.length));
    if (combined.length < 100) combined = combined.concat(genreOnly.slice(0, 100 - combined.length));
    if (combined.length < 100) combined = combined.concat(genreEra.slice(0, 100 - combined.length));
  } else {
    combined = genreEra.slice(0, 150);
    if (combined.length < 150) combined = combined.concat(genreOnly.slice(0, 150 - combined.length));
    if (combined.length < 100) combined = combined.concat(eraOnly.slice(0, 100 - combined.length));
    if (combined.length < 100) combined = combined.concat(other.slice(0, 100 - combined.length));
  }
  if (shuffle && !retryMode) combined = combined.sort(function () { return Math.random() - 0.5; });
  combined = combined.slice(0, 100);
  return {
    indexed: combined.map(function (t, i) { return { id: i, track: t }; }),
    context: combined.map(function (t, i) {
      return [i, getDisplayName(t), t.bpm || "", t.key || "", t["play count"] || t.playcount || "0", t.year || "", t.genre || ""].join("|");
    }).join("\n")
  };
}
