// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 386-389, 2580-2601).

import { getRawTitleFromName, getDisplayName } from "./trackNames.js";

export function getPlayCountModeLine(mode) {
  if (mode === "familiar") return " PLAY COUNT PREFERENCE: favor tracks with HIGHER play counts — this DJ wants his tried-and-true go-to selections right now, not deep cuts.";
  if (mode === "deep") return " PLAY COUNT PREFERENCE: strongly favor tracks with LOW play counts — this DJ wants tracks he already owns and rates highly but doesn't reach for often. Avoid his most-played tracks even if they're a perfect match; treat a high play count as a mark AGAINST including a track right now. It is completely fine to return fewer results than requested if that's what it takes to avoid weak or off-vibe filler — a smaller set of tracks that genuinely fit is better than padding out to the full count with something that doesn't.";
  return " PLAY COUNT PREFERENCE: deliberately mix it up — aim for roughly half the results to be familiar, higher play count go-tos, and the other half to be lower play count tracks he owns but rarely reaches for. Best of both worlds, not all one or the other.";
}

export var FAMILIAR_PLAYCOUNT_THRESHOLD = 3;

// library: Track[] - the full library this session is working against.
export function isFamiliarSongFamily(trackName, library) {
  var rawTitle = getRawTitleFromName(trackName || "");
  if (!rawTitle) return false;
  return library.some(function (t) {
    if (getRawTitleFromName(getDisplayName(t)) !== rawTitle) return false;
    var pc = parseInt(t["play count"] || t.playcount || 0);
    return pc >= FAMILIAR_PLAYCOUNT_THRESHOLD;
  });
}

export function isFileItselfFamiliar(track) {
  var pc = parseInt(track["play count"] || track.playcount || 0);
  return pc >= FAMILIAR_PLAYCOUNT_THRESHOLD;
}
