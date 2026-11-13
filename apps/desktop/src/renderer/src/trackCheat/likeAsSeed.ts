// Phase 5, step 5 piece 17 (👍 thumbs-up reseed, 2026-11-13).
//
// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx's
// handleLikeAsSeed (source lines 2489-2546). His own comment (2479-2488)
// is the spec: "THUMBS UP REDEFINED (7/16, per Mike): instead of a soft
// 'DJ liked these' hint the model may or may not act on, thumbs-up now
// instantly makes that track the new seed and pulls every OTHER version
// of the same song title directly from the library... This is a direct
// client-side library search, not a model call - instant, no API cost."
//
// Title match is ALWAYS exact (minus whatever's in parens/brackets),
// at every vibe position, confirmed by his own corrected comment
// (2507-2511) - the vibe slider never loosens or crosses into a
// different song. What the vibe slider DOES still control, among those
// same-title matches only:
//   1. BPM window (getBpmRange - same formula used everywhere else)
//   2. Genre priority - negative vibe hard/soft-locks toward the seed's
//      genre family (applyGenreWall, same as normal recommendations);
//      positive vibe sorts genre-DIFFERENT versions of that SAME song
//      first (e.g. a house remix of it ahead of a version closer to
//      the original genre) - never crosses into a different song.
// Capped at 10, sorted by BPM ascending (NOT by genre-match order -
// his own code re-sorts by BPM as the very last step, after whichever
// genre pass ran).

import { getRawTitleFromName } from "../shared/getRawTitleFromName.ts";
import { getBpmRange } from "./bpmRange.ts";
import { getAdjacentGenresAtTier, genreMatches } from "./genreTiers.ts";
import { inferGenreLocal } from "./artistGenreMap.ts";
import { applyGenreWall, type GenreWallCandidate } from "./applyGenreWall.ts";

export interface LikeAsSeedMatch {
  trackId: number;
  name: string;
  bpm: number;
  key: string;
}

export function buildLikeAsSeedMatches(trackName: string, library: CcdjLibraryRow[], vibeOffset: number, energyOffset: number): LikeAsSeedMatch[] {
  const targetTitle = getRawTitleFromName(trackName);
  if (!targetTitle) return [];

  const seedTrack = library.find((t) => t.displayName === trackName) ?? null;
  const seedBpm = seedTrack ? seedTrack.bpm || 0 : 0;
  const seedGenre = (seedTrack && seedTrack.genre && seedTrack.genre.trim()) || inferGenreLocal(trackName) || "";
  const range = getBpmRange(seedBpm, vibeOffset, energyOffset);

  let matches: GenreWallCandidate[] = library
    .filter((t) => t.displayName !== trackName && getRawTitleFromName(t.displayName) === targetTitle)
    .map((t) => ({ name: t.displayName, bpm: t.bpm || 0, key: t.key || "", _libTrack: t }));

  if (range) {
    matches = matches.filter((m) => !m.bpm || (m.bpm >= range[0] && m.bpm <= range[1]));
  }

  if (vibeOffset < 0) {
    matches = applyGenreWall(matches, seedGenre, vibeOffset);
  } else if (vibeOffset > 0 && seedGenre) {
    const narrowAdj = getAdjacentGenresAtTier(seedGenre, 0);
    const getTG = (m: GenreWallCandidate): string | null => {
      const lg = m._libTrack && m._libTrack.genre && m._libTrack.genre.trim();
      return lg || inferGenreLocal(m.name) || null;
    };
    matches = matches.slice().sort((a, b) => {
      const ag = getTG(a);
      const bg = getTG(b);
      const aMatch = ag ? genreMatches(ag, narrowAdj) : false;
      const bMatch = bg ? genreMatches(bg, narrowAdj) : false;
      return (aMatch ? 1 : 0) - (bMatch ? 1 : 0);
    });
  }

  return matches
    .slice(0, 10)
    .sort((a, b) => a.bpm - b.bpm)
    .map((m) => ({ trackId: m._libTrack.id, name: m.name, bpm: m.bpm, key: m.key }));
}
