// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 1996-2075, function resolveRes). Logic and Mike's dated
// comments preserved unchanged.
//
// SCOPE NOTE: this covers the default (non-hybrid) post-processing path.
// applyGenreWall, applyGenderFilter, applyTypeLock, injectGenreDiversity,
// injectTypeLockBalance, and sortByKeyCompatibility (CLAUDE.md Appendix B)
// run AFTER this in the full prototype and are not yet ported - Phase 4
// work. This function alone is real, working post-processing: it is what
// turns "the model said these IDs" into "these IDs are confirmed real
// library tracks, deduped by song, never the seed, within the BPM window."

import { getDisplayName, getArtistTitle, isSameSong } from "./trackNames.js";

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
    // Positive-vibe genre blend sort - see CLAUDE.md R2. Ported for
    // completeness; genreMatches/getAdjacentGenres imports needed if this
    // branch is exercised. Left inert (not wired to genre.js) until a test
    // actually exercises invertGenreForSort, so it doesn't silently diverge
    // from the source if ported incorrectly without a fixture to check it against.
    throw new Error("resolveRes: invertGenreForSort path not yet ported/tested - see docs/QUESTIONS.md R2");
  }

  return deduped.slice(0, 10).sort(function (a, b) { return parseFloat(a.bpm || 0) - parseFloat(b.bpm || 0); });
}
