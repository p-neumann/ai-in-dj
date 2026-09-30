// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 2077-2142, 2297-2333). Runs after resolveRes, in this exact
// order, matching fetchBangerResults (source ~L3577-3582):
//   resolveRes -> applyGenreWall -> applyGenderFilter -> injectGenreDiversity
//   -> [applyTypeLock -> injectTypeLockBalance, NOT YET PORTED - see
//   trackCheat.js header] -> ... -> sortByKeyCompatibility -> deep-mode filter.

import { getDisplayName, isSameSong } from "./trackNames.js";
import { getAdjacentGenresAtTier, genreMatches, getAdjacentGenres } from "./genre.js";
import { getGenreEnforcement, getGenreTier } from "./vibe.js";
import { inferGenreLocal, inferArtistGender } from "./artistLookup.js";

export function applyGenreWall(resolved, seedGenre, vibeOff) {
  if (vibeOff >= 0) return resolved;
  var enforcement = getGenreEnforcement(vibeOff);
  if (enforcement === "none") return resolved;

  var getTrackGenre = function (t) {
    var libGenre = t._libTrack && t._libTrack.genre && t._libTrack.genre.trim();
    if (libGenre) return libGenre;
    var inferred = inferGenreLocal(t.name);
    if (inferred) return inferred;
    return null;
  };

  if (!seedGenre) {
    if (enforcement !== "hard") return resolved;
    var tally = {};
    resolved.forEach(function (t) { var g = getTrackGenre(t); if (g) { var norm = g.toLowerCase().trim(); tally[norm] = (tally[norm] || 0) + 1; } });
    var sortedGenres = Object.entries(tally).sort(function (a, b) { return b[1] - a[1]; });
    if (!sortedGenres.length) return resolved;
    var majorityGenre = sortedGenres[0][0];
    var keepers = resolved.filter(function (t) { var g = getTrackGenre(t); return !g || g.toLowerCase().trim() === majorityGenre; });
    return keepers.length >= 3 ? keepers : resolved;
  }

  var tier = getGenreTier(vibeOff);
  var adjacent = getAdjacentGenresAtTier(seedGenre, tier);
  if (!adjacent.length) return resolved;

  if (enforcement === "hard") {
    var matched = [], unknown = [], mismatched = [];
    resolved.forEach(function (t) {
      var tg = getTrackGenre(t);
      if (!tg) { unknown.push(t); }
      else if (genreMatches(tg, adjacent)) { matched.push(t); }
      else { mismatched.push(t); }
    });
    var combined = matched.concat(unknown);
    if (combined.length < 3) {
      var broader = getAdjacentGenresAtTier(seedGenre, Math.min(tier + 2, 4));
      var broadMatched = resolved.filter(function (t) { var tg = getTrackGenre(t); return !tg || genreMatches(tg, broader); });
      if (broadMatched.length >= 3) return broadMatched;
      return resolved;
    }
    return combined.length >= 3 ? combined : resolved;
  }

  return resolved.slice().sort(function (a, b) {
    var ag = getTrackGenre(a); var bg2 = getTrackGenre(b);
    var am = !ag ? 1 : genreMatches(ag, adjacent) ? 0 : 2;
    var bm = !bg2 ? 1 : genreMatches(bg2, adjacent) ? 0 : 2;
    return am - bm;
  });
}

export function applyGenderFilter(resolved, seedGender, vibeOff) {
  if (vibeOff !== -8 || !seedGender) return resolved;
  var matchesGender = function (t) {
    var g = inferArtistGender(t.name);
    if (!g) return true;
    if (seedGender === "group") return g === "group" || g === seedGender;
    return g === seedGender || g === "group";
  };
  var matched = resolved.filter(matchesGender);
  if (matched.length > 0) return matched;
  return resolved.map(function (t) { return Object.assign({}, t, { _genderStretch: true }); });
}

export function injectGenreDiversity(resolved, ctxIndexed, seedGenre, vibeOff, range, allEx, fname) {
  if (vibeOff <= 0 || !seedGenre) return resolved;
  var narrowAdj = getAdjacentGenres(seedGenre);
  var getTG = function (t) { var lg = t._libTrack && t._libTrack.genre && t._libTrack.genre.trim(); return lg || inferGenreLocal(t.name) || null; };
  var isDiverse = function (t) { var g = getTG(t); return !!(g && !genreMatches(g, narrowAdj)); };
  var diverseCount = resolved.filter(isDiverse).length;
  var target = vibeOff >= 5 ? vibeOff : Math.min(vibeOff, 4);
  if (diverseCount >= target) return resolved;
  var usedNames = {}; resolved.forEach(function (t) { usedNames[t.name] = true; });
  var candidates = ctxIndexed.map(function (e) { return e.track; }).filter(function (tr) {
    var nm = getDisplayName(tr);
    if (usedNames[nm]) return false;
    if (allEx.indexOf(nm) !== -1) return false;
    if (isSameSong(fname, nm)) return false;
    var g = (tr.genre && tr.genre.trim()) || inferGenreLocal(nm) || null;
    if (!g) return false;
    if (genreMatches(g, narrowAdj)) return false;
    if (range) { var bpm = parseFloat(tr.bpm || 0); if (!bpm || bpm < range[0] || bpm > range[1]) return false; }
    return true;
  });
  var needed = target - diverseCount;
  var seenGenres = {};
  resolved.filter(isDiverse).forEach(function (t) { var g = getTG(t); if (g) seenGenres[g.toLowerCase().trim()] = true; });
  var byNewGenre = [], byRepeatGenre = [];
  candidates.forEach(function (tr) {
    var g = ((tr.genre && tr.genre.trim()) || inferGenreLocal(getDisplayName(tr)) || "").toLowerCase().trim();
    if (g && !seenGenres[g]) { seenGenres[g] = true; byNewGenre.push(tr); }
    else byRepeatGenre.push(tr);
  });
  var pickedCandidates = byNewGenre.concat(byRepeatGenre).slice(0, needed);
  var toAdd = pickedCandidates.map(function (tr) { return { id: -1, name: getDisplayName(tr), bpm: tr.bpm || "", key: tr.key || "", _libTrack: tr, _injected: true }; });
  if (!toAdd.length) return resolved;
  var sameGenre = resolved.filter(function (t) { return !isDiverse(t); });
  var diverse = resolved.filter(isDiverse);
  var keepSame = Math.max(0, 10 - diverse.length - toAdd.length);
  return diverse.concat(sameGenre.slice(0, keepSame)).concat(toAdd).slice(0, 10);
}
