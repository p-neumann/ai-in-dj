// Ported from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 3006-3025, resolveSeedYearAsync) - LOCAL-ONLY portion.
//
// SCOPE NOTE (honest, not a shortcut): the source falls back to an AI call
// (resolveSeedYearFromKnowledge) when no local signal exists at all. That
// call is not ported here - adding it means another provider round-trip to
// orchestrate, and CLAUDE.md's instruction not to require a real key for
// what doesn't need one applies just as much to new server code as to
// tests. When no local year signal exists, this returns 0 (unknown) rather
// than guessing via a model call; strictEra/year-note behavior degrades
// gracefully (CLAUDE.md's own getYearInstruction already has an "unknown
// year" wording path for exactly this case).

import { getArtistTitle, getDisplayName } from "./trackNames.js";
import { inferArtistEra } from "./artistLookup.js";

export function resolveSeedYearLocal(seedTrack, seedName, library) {
  var seedYear = seedTrack ? parseInt(seedTrack.year || 0) : 0;
  if (!seedYear) seedYear = inferArtistEra(seedName);
  if (!seedYear) {
    var seedArtistReal = (seedTrack && seedTrack.artist) ? seedTrack.artist.trim() : "";
    var seedArtistParsed = getArtistTitle(seedName).artist;
    var seedArtistForMatch = seedArtistReal || seedArtistParsed;
    if (seedArtistForMatch) {
      var artistYears = library.filter(function (t) {
        var taReal = (t.artist || "").trim();
        var taParsed = getArtistTitle(getDisplayName(t)).artist;
        var match = (taReal && taReal.toLowerCase() === seedArtistForMatch.toLowerCase()) || (taParsed && taParsed.toLowerCase() === seedArtistForMatch.toLowerCase());
        return match && parseInt(t.year || 0) > 0;
      }).map(function (t) { return parseInt(t.year); }).sort(function (a, b) { return a - b; });
      if (artistYears.length) seedYear = artistYears[Math.floor(artistYears.length / 2)];
    }
  }
  return seedYear || 0;
}
