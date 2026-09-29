// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 69-87, 590, 644-696). Logic unchanged - only converted from
// `var`/global-scope declarations to ES module exports. This is Mike's
// gig-tested genre-adjacency and era-matching logic (CLAUDE.md Top Rule 5:
// preserve behavior, don't redesign).

export const GENRE_TIERS = {
  "latin":[["latin"],["latin","reggaeton"],["latin","reggaeton","dancehall","tropical","dembow"],["latin","reggaeton","dancehall","salsa","cumbia","merengue","bachata","tropical","dembow","caribbean"],["latin","reggaeton","dancehall","salsa","cumbia","merengue","bachata","tropical","dembow","caribbean","pop"]],
  "reggaeton":[["reggaeton"],["reggaeton","latin"],["reggaeton","latin","dembow","trap latino"],["reggaeton","latin","dancehall","dembow","trap latino","urbano"],["reggaeton","latin","dancehall","dembow","trap latino","urbano","pop"]],
  "dancehall":[["dancehall"],["dancehall","reggae"],["dancehall","reggae","latin"],["dancehall","reggae","latin","reggaeton","caribbean"],["dancehall","reggae","latin","reggaeton","caribbean"]],
  "reggae":[["reggae"],["reggae","dancehall"],["reggae","dancehall","caribbean"],["reggae","dancehall","caribbean","ska","latin"],["reggae","dancehall","caribbean","ska","latin"]],
  "country":[["country"],["country","country pop"],["country","country pop","americana"],["country","country pop","americana","bluegrass","country rock","southern rock"],["country","country pop","americana","bluegrass","country rock","southern rock","outlaw country","folk"]],
  "hip hop":[["hip hop"],["hip hop","rap"],["hip hop","rap","trap"],["hip hop","rap","trap","r&b","crunk","dirty south","boom bap","gangsta rap"],["hip hop","rap","trap","r&b","crunk","dirty south","boom bap","gangsta rap","funk"]],
  "rap":[["rap"],["rap","hip hop"],["rap","hip hop","trap"],["rap","hip hop","trap","r&b","dirty south"],["rap","hip hop","trap","r&b","dirty south","funk"]],
  "r&b":[["r&b"],["r&b","soul"],["r&b","soul","neo soul"],["r&b","soul","neo soul","hip hop","funk","new jack swing"],["r&b","soul","neo soul","hip hop","funk","new jack swing","pop"]],
  "pop":[["pop"],["pop","dance pop","indie pop"],["pop","dance pop","electropop","indie pop","synth pop"],["pop","dance pop","electropop","synth pop","indie pop","teen pop","hyperpop","alternative pop"],["pop","dance pop","electropop","synth pop","indie pop","teen pop","hyperpop","alternative pop","dance","r&b"]],
  "edm":[["edm"],["edm","electronic"],["edm","electronic","house","dance"],["edm","electronic","house","techno","trance","dance","eurodance"],["edm","electronic","house","techno","trance","dance","eurodance","dubstep"]],
  "house":[["house"],["house","deep house"],["house","deep house","tech house"],["house","deep house","tech house","progressive house","edm","dance","electronic","eurodance"],["house","deep house","tech house","progressive house","edm","dance","electronic","eurodance","hi-nrg"]],
  "eurodance":[["eurodance"],["eurodance","dance"],["eurodance","dance","house"],["eurodance","dance","house","hi-nrg","trance","pop"],["eurodance","dance","house","hi-nrg","trance","pop","edm"]],
  "dance":[["dance"],["dance","house"],["dance","house","edm"],["dance","house","edm","eurodance","hi-nrg","electronic","disco"],["dance","house","edm","eurodance","hi-nrg","electronic","disco","pop"]],
  "rock":[["rock"],["rock","alternative"],["rock","alternative","indie rock"],["rock","alternative","indie rock","pop rock","classic rock"],["rock","alternative","indie rock","pop rock","classic rock","hard rock","punk"]],
  "funk":[["funk"],["funk","soul"],["funk","soul","r&b"],["funk","soul","r&b","disco","groove"],["funk","soul","r&b","disco","groove","hip hop"]],
  "disco":[["disco"],["disco","funk"],["disco","funk","soul"],["disco","funk","soul","dance","boogie","hi-nrg"],["disco","funk","soul","dance","boogie","hi-nrg","pop"]],
  "trap":[["trap"],["trap","hip hop"],["trap","hip hop","rap"],["trap","hip hop","rap","mumble rap","drill"],["trap","hip hop","rap","mumble rap","drill","r&b"]],
};

export function eraMatches(track, era) {
  if (!era || !track.year) return true;
  var y = parseInt(track.year);
  if (isNaN(y)) return true;
  if (era === "60s") return y >= 1960 && y < 1970;
  if (era === "70s") return y >= 1970 && y < 1980;
  if (era === "80s") return y >= 1980 && y < 1990;
  if (era === "90s") return y >= 1990 && y < 2000;
  if (era === "2000s") return y >= 2000 && y < 2010;
  if (era === "2010s") return y >= 2010 && y < 2020;
  return true;
}

export function normalizeGenreString(genre) {
  if (!genre || typeof genre !== "string") return [];
  return genre.split(/[,|]/).map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
}

export function getAdjacentGenresAtTier(genre, tier) {
  if (!genre) return [];
  var segments = normalizeGenreString(genre);
  if (!segments.length) segments = [genre.toLowerCase().trim()];
  var merged = []; var seen = {};
  for (var si = 0; si < segments.length; si++) {
    var seg = segments[si];
    for (var key in GENRE_TIERS) {
      if (seg.indexOf(key) !== -1 || key.indexOf(seg) !== -1) {
        var list = GENRE_TIERS[key][Math.min(tier, GENRE_TIERS[key].length - 1)];
        list.forEach(function (g) { if (!seen[g]) { seen[g] = true; merged.push(g); } });
        break;
      }
    }
  }
  if (merged.length) return merged;
  return [segments[0]];
}

export function getAdjacentGenres(genre) {
  return getAdjacentGenresAtTier(genre, 4);
}

export function genreMatches(trackGenre, adjacentList) {
  if (!trackGenre || !adjacentList.length) return false;
  var segments = normalizeGenreString(trackGenre);
  if (!segments.length) {
    var tg = trackGenre.toLowerCase().trim();
    return adjacentList.some(function (ag) { return tg.indexOf(ag) !== -1 || ag.indexOf(tg) !== -1; });
  }
  return segments.some(function (seg) {
    return adjacentList.some(function (ag) {
      var agL = ag.toLowerCase().trim();
      return seg.indexOf(agL) !== -1 || agL.indexOf(seg) !== -1;
    });
  });
}
