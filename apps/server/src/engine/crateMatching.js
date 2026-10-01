// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 2728-2854, matchCuratedTracksInLibrary). Mike's dated
// comments preserved unchanged - this is the matcher that turns a curated
// {artist,track} target (from resolveCuratedTracks' AI call - not yet
// ported, see trackCheat.js-equivalent header once the crate route
// exists) into real library tracks, tolerating connector-word and
// abbreviation/spelling differences between the curation model's phrasing
// and how a DJ's own library happens to be tagged.
//
// `libraryRef.current` (source) becomes an explicit `library` parameter
// here, matching every other port in this codebase. `t.__crateMatch` is a
// per-track memoization cache the source itself mutates onto track
// objects across calls within a session - preserved as-is (same object
// identity across a session's buildCrate calls is what makes this useful,
// same as the source).

import { getDisplayName } from "./trackNames.js";
import { getRawTitleFromName } from "./trackNames.js";
import { shuffleArr } from "./shuffleArr.js";
import { fuzzyEq } from "./fuzzyMatch.js";

function splitArtists(s) {
  return s.split(/\s*(?:,|&|\/|\bx\b|\bvs\.?\b|\bft\.?\b|\bfeat\.?\b|\bfeaturing\b|\bwith\b)\s*/i).map(function (a) { return a.trim(); }).filter(function (a) { return a.length >= 2; });
}
function expandShorthand(s) {
  var map = { u: "you", ur: "your", n: "and", "2": "to", "4": "for" };
  return s.split(/\s+/).map(function (w) { return map.hasOwnProperty(w) ? map[w] : w; }).join(" ");
}
function normFingerprint(s) {
  return s.replace(/[^a-z0-9]/g, "");
}

function getCrateMatchData(t) {
  if (!t.__crateMatch) {
    var dn = getDisplayName(t);
    var ta = (t.artist || "").toLowerCase();
    var dnLower = dn.toLowerCase();
    var libTitle = getRawTitleFromName(dn);
    t.__crateMatch = {
      dn: dn, ta: ta, dnLower: dnLower, libTitle: libTitle,
      libTitleExp: expandShorthand(libTitle),
      taFp: normFingerprint(ta), dnFp: normFingerprint(dnLower), libTitleFp: normFingerprint(libTitle)
    };
  }
  return t.__crateMatch;
}

// curatedList: [{artist, track}], alreadyIncludedMap: { [displayName]: true }
export function matchCuratedTracksInLibrary(curatedList, alreadyIncludedMap, library) {
  var matches = [];
  (curatedList || []).forEach(function (ct) {
    var wantArtist = (ct.artist || "").toLowerCase();
    var wantArtistTokens = splitArtists(wantArtist);
    var wantTrack = (ct.track || "").toLowerCase().replace(/\s*\([^)]*\)\s*|\s*\[[^\]]*\]\s*/g, "").trim();
    if (!wantArtist || !wantTrack) return;
    var wantTrackExp = expandShorthand(wantTrack);
    var wantTrackFp = normFingerprint(wantTrack);
    var wantTokenFps = wantArtistTokens.map(function (tok) { return normFingerprint(tok); });
    var localMatches = [];
    library.forEach(function (t) {
      var cm = getCrateMatchData(t);
      var dn = cm.dn;
      if (alreadyIncludedMap[dn]) return;
      var ta = cm.ta;
      var dnLower = cm.dnLower;
      var artistFieldMatch = ta && wantArtistTokens.some(function (tok, ti) { return ta.indexOf(tok) !== -1 || cm.taFp.indexOf(wantTokenFps[ti]) !== -1; });
      var titleTextMatch = !artistFieldMatch && wantArtistTokens.some(function (tok, ti) { return dnLower.indexOf(tok) !== -1 || cm.dnFp.indexOf(wantTokenFps[ti]) !== -1; });
      if (!artistFieldMatch && !titleTextMatch) return;
      var libTitle = cm.libTitle;
      var libTitleExp = cm.libTitleExp;
      var directMatch = libTitle.indexOf(wantTrack) !== -1 || wantTrack.indexOf(libTitle) !== -1 || libTitleExp.indexOf(wantTrackExp) !== -1 || wantTrackExp.indexOf(libTitleExp) !== -1;
      var fuzzyMatch = !directMatch && fuzzyEq(cm.libTitleFp, wantTrackFp);
      if (directMatch || fuzzyMatch) { localMatches.push(t); alreadyIncludedMap[dn] = true; }
    });
    matches = matches.concat(shuffleArr(localMatches));
  });
  return matches;
}
