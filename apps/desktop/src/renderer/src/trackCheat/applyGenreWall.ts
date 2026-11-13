// Phase 5, step 5 piece 17 (👍 thumbs-up reseed). Ported verbatim from
// reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx (source lines
// 2077-2113 - only the negative-vibe genre-wall half; the positive-
// vibe sort happens separately in likeAsSeed.ts, matching his own
// handleLikeAsSeed which calls applyGenreWall only for v<0 and does
// its own inline sort for v>0). Duplicated from the already-tested
// server copy (apps/server/src/engine/postProcessing.js /
// apps/server/src/engine/vibe.js's getGenreEnforcement/getGenreTier).

import { getAdjacentGenresAtTier, genreMatches } from "./genreTiers.ts";
import { inferGenreLocal } from "./artistGenreMap.ts";

export interface GenreWallCandidate {
  name: string;
  bpm: number;
  key: string;
  _libTrack: CcdjLibraryRow;
}

function getGenreEnforcement(v: number): "hard" | "soft" | "none" {
  if (v <= -5) return "hard";
  if (v <= -1) return "soft";
  return "none";
}

function getGenreTier(v: number): number {
  if (v === -8) return 0;
  if (v === -7 || v === -6) return 1;
  if (v === -5 || v === -4) return 2;
  if (v === -3 || v === -2) return 3;
  return 4;
}

export function applyGenreWall<T extends GenreWallCandidate>(resolved: T[], seedGenre: string, vibeOff: number): T[] {
  if (vibeOff >= 0) return resolved;
  const enforcement = getGenreEnforcement(vibeOff);
  if (enforcement === "none") return resolved;

  function getTrackGenre(t: T): string | null {
    const libGenre = t._libTrack && t._libTrack.genre && t._libTrack.genre.trim();
    if (libGenre) return libGenre;
    const inferred = inferGenreLocal(t.name);
    return inferred || null;
  }

  if (!seedGenre) {
    if (enforcement !== "hard") return resolved;
    const tally: Record<string, number> = {};
    resolved.forEach((t) => {
      const g = getTrackGenre(t);
      if (g) {
        const norm = g.toLowerCase().trim();
        tally[norm] = (tally[norm] || 0) + 1;
      }
    });
    const sortedGenres = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (!sortedGenres.length) return resolved;
    const majorityGenre = sortedGenres[0][0];
    const keepers = resolved.filter((t) => {
      const g = getTrackGenre(t);
      return !g || g.toLowerCase().trim() === majorityGenre;
    });
    return keepers.length >= 3 ? keepers : resolved;
  }

  const tier = getGenreTier(vibeOff);
  const adjacent = getAdjacentGenresAtTier(seedGenre, tier);
  if (!adjacent.length) return resolved;

  if (enforcement === "hard") {
    const matched: T[] = [];
    const unknown: T[] = [];
    resolved.forEach((t) => {
      const tg = getTrackGenre(t);
      if (!tg) unknown.push(t);
      else if (genreMatches(tg, adjacent)) matched.push(t);
    });
    const combined = matched.concat(unknown);
    if (combined.length < 3) {
      const broader = getAdjacentGenresAtTier(seedGenre, Math.min(tier + 2, 4));
      const broadMatched = resolved.filter((t) => {
        const tg = getTrackGenre(t);
        return !tg || genreMatches(tg, broader);
      });
      if (broadMatched.length >= 3) return broadMatched;
      return resolved;
    }
    return combined.length >= 3 ? combined : resolved;
  }

  return resolved.slice().sort((a, b) => {
    const ag = getTrackGenre(a);
    const bg = getTrackGenre(b);
    const am = !ag ? 1 : genreMatches(ag, adjacent) ? 0 : 2;
    const bm = !bg ? 1 : genreMatches(bg, adjacent) ? 0 : 2;
    return am - bm;
  });
}
