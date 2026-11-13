// Phase 5, step 5 piece 17 (👍 thumbs-up reseed). Ported verbatim from
// reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx (source lines 69-87,
// 644-696), duplicated from the already-tested server copy
// (apps/server/src/engine/genre.js) for the same reason as
// bpmRange.ts - this feature's genre priority runs client-side, no AI.

export const GENRE_TIERS: Record<string, string[][]> = {
  latin: [["latin"], ["latin", "reggaeton"], ["latin", "reggaeton", "dancehall", "tropical", "dembow"], ["latin", "reggaeton", "dancehall", "salsa", "cumbia", "merengue", "bachata", "tropical", "dembow", "caribbean"], ["latin", "reggaeton", "dancehall", "salsa", "cumbia", "merengue", "bachata", "tropical", "dembow", "caribbean", "pop"]],
  reggaeton: [["reggaeton"], ["reggaeton", "latin"], ["reggaeton", "latin", "dembow", "trap latino"], ["reggaeton", "latin", "dancehall", "dembow", "trap latino", "urbano"], ["reggaeton", "latin", "dancehall", "dembow", "trap latino", "urbano", "pop"]],
  dancehall: [["dancehall"], ["dancehall", "reggae"], ["dancehall", "reggae", "latin"], ["dancehall", "reggae", "latin", "reggaeton", "caribbean"], ["dancehall", "reggae", "latin", "reggaeton", "caribbean"]],
  reggae: [["reggae"], ["reggae", "dancehall"], ["reggae", "dancehall", "caribbean"], ["reggae", "dancehall", "caribbean", "ska", "latin"], ["reggae", "dancehall", "caribbean", "ska", "latin"]],
  country: [["country"], ["country", "country pop"], ["country", "country pop", "americana"], ["country", "country pop", "americana", "bluegrass", "country rock", "southern rock"], ["country", "country pop", "americana", "bluegrass", "country rock", "southern rock", "outlaw country", "folk"]],
  "hip hop": [["hip hop"], ["hip hop", "rap"], ["hip hop", "rap", "trap"], ["hip hop", "rap", "trap", "r&b", "crunk", "dirty south", "boom bap", "gangsta rap"], ["hip hop", "rap", "trap", "r&b", "crunk", "dirty south", "boom bap", "gangsta rap", "funk"]],
  rap: [["rap"], ["rap", "hip hop"], ["rap", "hip hop", "trap"], ["rap", "hip hop", "trap", "r&b", "dirty south"], ["rap", "hip hop", "trap", "r&b", "dirty south", "funk"]],
  "r&b": [["r&b"], ["r&b", "soul"], ["r&b", "soul", "neo soul"], ["r&b", "soul", "neo soul", "hip hop", "funk", "new jack swing"], ["r&b", "soul", "neo soul", "hip hop", "funk", "new jack swing", "pop"]],
  pop: [["pop"], ["pop", "dance pop", "indie pop"], ["pop", "dance pop", "electropop", "indie pop", "synth pop"], ["pop", "dance pop", "electropop", "synth pop", "indie pop", "teen pop", "hyperpop", "alternative pop"], ["pop", "dance pop", "electropop", "synth pop", "indie pop", "teen pop", "hyperpop", "alternative pop", "dance", "r&b"]],
  edm: [["edm"], ["edm", "electronic"], ["edm", "electronic", "house", "dance"], ["edm", "electronic", "house", "techno", "trance", "dance", "eurodance"], ["edm", "electronic", "house", "techno", "trance", "dance", "eurodance", "dubstep"]],
  house: [["house"], ["house", "deep house"], ["house", "deep house", "tech house"], ["house", "deep house", "tech house", "progressive house", "edm", "dance", "electronic", "eurodance"], ["house", "deep house", "tech house", "progressive house", "edm", "dance", "electronic", "eurodance", "hi-nrg"]],
  eurodance: [["eurodance"], ["eurodance", "dance"], ["eurodance", "dance", "house"], ["eurodance", "dance", "house", "hi-nrg", "trance", "pop"], ["eurodance", "dance", "house", "hi-nrg", "trance", "pop", "edm"]],
  dance: [["dance"], ["dance", "house"], ["dance", "house", "edm"], ["dance", "house", "edm", "eurodance", "hi-nrg", "electronic", "disco"], ["dance", "house", "edm", "eurodance", "hi-nrg", "electronic", "disco", "pop"]],
  rock: [["rock"], ["rock", "alternative"], ["rock", "alternative", "indie rock"], ["rock", "alternative", "indie rock", "pop rock", "classic rock"], ["rock", "alternative", "indie rock", "pop rock", "classic rock", "hard rock", "punk"]],
  funk: [["funk"], ["funk", "soul"], ["funk", "soul", "r&b"], ["funk", "soul", "r&b", "disco", "groove"], ["funk", "soul", "r&b", "disco", "groove", "hip hop"]],
  disco: [["disco"], ["disco", "funk"], ["disco", "funk", "soul"], ["disco", "funk", "soul", "dance", "boogie", "hi-nrg"], ["disco", "funk", "soul", "dance", "boogie", "hi-nrg", "pop"]],
  trap: [["trap"], ["trap", "hip hop"], ["trap", "hip hop", "rap"], ["trap", "hip hop", "rap", "mumble rap", "drill"], ["trap", "hip hop", "rap", "mumble rap", "drill", "r&b"]]
};

export function normalizeGenreString(genre: string | null | undefined): string[] {
  if (!genre || typeof genre !== "string") return [];
  return genre.split(/[,|]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function getAdjacentGenresAtTier(genre: string, tier: number): string[] {
  if (!genre) return [];
  let segments = normalizeGenreString(genre);
  if (!segments.length) segments = [genre.toLowerCase().trim()];
  const merged: string[] = [];
  const seen: Record<string, boolean> = {};
  for (const seg of segments) {
    for (const key in GENRE_TIERS) {
      if (seg.indexOf(key) !== -1 || key.indexOf(seg) !== -1) {
        const list = GENRE_TIERS[key][Math.min(tier, GENRE_TIERS[key].length - 1)];
        list.forEach((g) => {
          if (!seen[g]) {
            seen[g] = true;
            merged.push(g);
          }
        });
        break;
      }
    }
  }
  if (merged.length) return merged;
  return [segments[0]];
}

export function genreMatches(trackGenre: string | null | undefined, adjacentList: string[]): boolean {
  if (!trackGenre || !adjacentList.length) return false;
  const segments = normalizeGenreString(trackGenre);
  if (!segments.length) {
    const tg = trackGenre.toLowerCase().trim();
    return adjacentList.some((ag) => tg.indexOf(ag) !== -1 || ag.indexOf(tg) !== -1);
  }
  return segments.some((seg) => adjacentList.some((ag) => {
    const agL = ag.toLowerCase().trim();
    return seg.indexOf(agL) !== -1 || agL.indexOf(seg) !== -1;
  }));
}
