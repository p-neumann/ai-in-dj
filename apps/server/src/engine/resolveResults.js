// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 1996-2075, function resolveRes, including the
// invertGenreForSort branch used at positive vibe). Logic and Mike's dated
// comments preserved unchanged.
//
// SCOPE NOTE: applyTypeLock and injectTypeLockBalance (type-lock support)
// are not yet ported - see trackCheat.js header. applyGenreWall,
// applyGenderFilter, injectGenreDiversity, sortByKeyCompatibility, and the
// deep-mode filter ARE ported (postProcessing.js, keyCompatibility.js,
// playCountMode.js) and run after this function, same order as the source.

import { getDisplayName, getArtistTitle, isSameSong } from "./trackNames.js";
import { getAdjacentGenres, genreMatches } from "./genre.js";
import { inferGenreLocal } from "./artistLookup.js";

export function resolveRes(results, indexed, seedName, seedGenreForSort, invertGenreForSort, rangeForFilter, allExForFilter, playedNames) {
  var seen = {};
  var seedToCheck = seedName || "";
  var seedAt0 = getArtistTitle(seedToCheck);
  var seedTitleRaw = (seedAt0.title || seedToCheck).toLowerCase()
    .replace(/\s*-\s*(dirty|clean|explicit|radio|instrumental)$/i, "")
    .replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "")
    .trim().split(/\s+/).filter(function (w) { return w.length > 1; }).slice(0, 4).join(" ");

  var deduped = results.map(function (r) {
    var e = indexed.find(function (x) { return x.id === r.id; });
    if (!e) return null;
    return { ...r, name: getDisplayName(e.track), _libTrack: e.track };
  }).filter(Boolean).filter(function (t) {
    var at = getArtistTitle(t.name);
    var titleKey = at.title.toLowerCase()
      .replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "")
      .trim().split(/\s+/).filter(function (w) { return w.length > 1; }).slice(0, 4).join(" ");

    if (seedTitleRaw && titleKey && titleKey === seedTitleRaw) return false;
    if (seedToCheck && isSameSong(seedToCheck, t.name)) return false;
    if (playedNames && playedNames.some(function (p) { return isSameSong(p, t.name); })) return false;

    if (seen[titleKey]) return false;
    seen[titleKey] = true;
    return true;
  });

  if (allExForFilter && allExForFilter.length) {
    deduped = deduped.filter(function (t) { return allExForFilter.indexOf(t.name) === -1; });
  }
  if (rangeForFilter) {
    deduped = deduped.filter(function (t) { var bpm = parseFloat(t.bpm || 0); return bpm >= rangeForFilter[0] && bpm <= rangeForFilter[1]; });
  }

  if (invertGenreForSort && seedGenreForSort) {
    // Positive-vibe genre blend sort (source lines 2041-2072, R2 in
    // CLAUDE.md - the "some same-genre room must survive" design intent).
    var adjacentNarrow = getAdjacentGenres(seedGenreForSort);
    var getTrackGenreForSort = function (t) {
      var lg = t._libTrack && t._libTrack.genre && t._libTrack.genre.trim();
      return lg || inferGenreLocal(t.name) || null;
    };
    var tier0 = [], tier1 = [], tier2 = [];
    deduped.forEach(function (t) {
      var g = getTrackGenreForSort(t);
      if (!g) tier1.push(t);
      else if (genreMatches(g, adjacentNarrow)) tier2.push(t);
      else tier0.push(t);
    });
    var seenT0Genres = {}, t0New = [], t0Repeat = [];
    tier0.forEach(function (t) {
      var g = (getTrackGenreForSort(t) || "").toLowerCase().trim();
      if (g && !seenT0Genres[g]) { seenT0Genres[g] = true; t0New.push(t); }
      else t0Repeat.push(t);
    });
    deduped = t0New.concat(t0Repeat).concat(tier1).concat(tier2);
  }

  return deduped.slice(0, 10).sort(function (a, b) { return parseFloat(a.bpm || 0) - parseFloat(b.bpm || 0); });
}
