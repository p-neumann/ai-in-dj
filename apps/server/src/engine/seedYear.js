// Ported from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 3006-3025, resolveSeedYearAsync).
//
// resolveSeedYearLocal covers the no-network part (seed.year, inferArtistEra
// keyword table, library artist-year median). resolveSeedYear adds the
// source's own AI-knowledge fallback (resolveSeedYearFromKnowledge,
// knowledgeCalls.js) for when none of that local data exists - previously
// deferred (see git history), now wired since it's a small, self-contained
// call like the other knowledgeCalls.js functions. It only fires when
// resolveSeedYearLocal genuinely found nothing, so the common case (a
// library with real year tags) never touches the provider at all - with
// the mock provider (the default everywhere in this codebase) this is
// free and instant either way.

import { getArtistTitle, getDisplayName } from "./trackNames.js";
import { inferArtistEra } from "./artistLookup.js";
import { resolveSeedYearFromKnowledge } from "./knowledgeCalls.js";

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

export async function resolveSeedYear(seedTrack, seedName, library, provider) {
  const local = resolveSeedYearLocal(seedTrack, seedName, library);
  if (local) return local;
  return resolveSeedYearFromKnowledge(seedName, provider);
}
