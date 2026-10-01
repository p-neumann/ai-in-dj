// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 1704-1771). Do Play / Do Not Play list matching. Per
// CLAUDE.md R27, applyDoNotPlay/applyDoPlayBoost are currently called
// ONLY in Crate Cheat in the source (not Track Cheat) - preserved as-is
// here; whether to also enforce Do Not Play in Track Cheat is an open
// question for Mike (docs/QUESTIONS.md), not something to decide here.

import { inferGenreLocal } from "./artistLookup.js";

// entry: { type: "artist" | "track" | "genre" | "era" | "content", value: string }
export function matchesListEntry(track, entry) {
  var name = (track.name || "").toLowerCase();
  var lib = track._libTrack || {};
  var val = entry.value.toLowerCase().trim();
  if (entry.type === "artist" || entry.type === "track") {
    if (name.indexOf(val) !== -1) return true;
    var libArtist = (lib.artist || "").toLowerCase();
    if (libArtist && libArtist.indexOf(val) !== -1) return true;
    return false;
  }
  if (entry.type === "genre") {
    var trackGenre = (lib.genre || inferGenreLocal(track.name) || "").toLowerCase();
    if (trackGenre && (trackGenre.indexOf(val) !== -1 || val.indexOf(trackGenre) !== -1)) return true;
    if (name.indexOf(val) !== -1) return true;
    return false;
  }
  if (entry.type === "era") {
    var y = lib.year ? parseInt(lib.year) : 0;
    var eraDigits = val.replace(/[^0-9]/g, "");
    if (eraDigits.length === 2) {
      var decade = parseInt(eraDigits);
      var century = decade < 30 ? 2000 : 1900;
      var decadeStart = century + decade;
      if (y && y >= decadeStart && y < decadeStart + 10) return true;
    }
    if (name.indexOf(val) !== -1) return true;
    return false;
  }
  if (entry.type === "content") {
    var explicitTag = lib.explicit;
    if (explicitTag === undefined) explicitTag = lib.content;
    if (explicitTag === undefined) explicitTag = lib.contentrating;
    var isDirty;
    if (explicitTag !== undefined && explicitTag !== null && explicitTag !== "") {
      var tagStr = String(explicitTag).toLowerCase().trim();
      isDirty = tagStr === "true" || tagStr === "yes" || tagStr === "explicit" || tagStr === "dirty" || tagStr === "1";
    } else {
      isDirty = /\bdirty\b|\bexplicit\b/i.test(track.name || "");
    }
    if (val === "dirty") return isDirty;
    if (val === "clean") return !isDirty;
    return false;
  }
  return false;
}

export function applyDoNotPlay(resolved, doNotPlayList) {
  if (!doNotPlayList || !doNotPlayList.length) return resolved;
  return resolved.filter(function (t) {
    return !doNotPlayList.some(function (entry) { return matchesListEntry(t, entry); });
  });
}

export function applyDoPlayBoost(resolved, doPlayList) {
  if (!doPlayList || !doPlayList.length) return resolved;
  return resolved.slice().sort(function (a, b) {
    var aMatch = doPlayList.some(function (entry) { return matchesListEntry(a, entry); });
    var bMatch = doPlayList.some(function (entry) { return matchesListEntry(b, entry); });
    if (aMatch && !bMatch) return -1;
    if (bMatch && !aMatch) return 1;
    return 0;
  });
}
