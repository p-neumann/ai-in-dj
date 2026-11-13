// Phase 5, step 5 piece 18 (free-typed GO, 2026-11-13).
//
// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx's
// fuzzyFind (source lines 532-548), used by his fetchSearchResults
// (line 3645): `lib.find(t=>getDisplayName(t)===fname)||fuzzyFind(fname,
// lib,"searchSeed")` - exact match on display name first, fuzzyFind
// only as a fallback.
//
// fuzzyFind itself: word-overlap score (extractCore's word-core per
// side, exact word hit or fuzzyEq's typo tolerance), normalized by the
// LARGER word count, tie broken toward the tighter word-count match
// (his own 7/16 fix for bare-title ties), and a hard 0.4 floor - below
// that, this returns null, same as his.
//
// His own code caches each library track's extracted word-core on the
// track object itself (`t._core||extractCore(...)`) since this runs
// over the whole library on every search. Same idea here via a
// WeakMap keyed on the track object, since mutating the shared
// CcdjLibraryRow objects directly isn't this port's style.

import { extractCore } from "../shared/extractCore.ts";
import { fuzzyEq } from "../shared/fuzzyMatch.ts";

const coreCache = new WeakMap<CcdjLibraryRow, string[]>();

function coreWords(name: string, cacheKey?: CcdjLibraryRow): string[] {
  if (cacheKey) {
    const cached = coreCache.get(cacheKey);
    if (cached) return cached;
  }
  const words = extractCore(name).split(" ").filter((w) => w.length > 1);
  if (cacheKey) coreCache.set(cacheKey, words);
  return words;
}

export function fuzzyFindTrack(name: string, library: CcdjLibraryRow[]): CcdjLibraryRow | null {
  const nw = coreWords(name);
  if (!nw.length) return null;

  let best: CcdjLibraryRow | null = null;
  let bestScore = 0;
  let bestTw = 0;

  for (const t of library) {
    const tw = coreWords(t.displayName, t);
    if (!tw.length) continue;
    const score = nw.filter((w) => tw.indexOf(w) !== -1 || tw.some((tword) => fuzzyEq(w, tword))).length / Math.max(nw.length, tw.length);
    if (score > bestScore || (score === bestScore && score > 0 && Math.abs(tw.length - nw.length) < Math.abs(bestTw - nw.length))) {
      bestScore = score;
      best = t;
      bestTw = tw.length;
    }
  }

  return bestScore >= 0.4 ? best : null;
}

// His full resolution rule, confirmed verbatim at source line 3645.
export function resolveSeedTrack(text: string, library: CcdjLibraryRow[]): CcdjLibraryRow | null {
  const exact = library.find((t) => t.displayName === text);
  if (exact) return exact;
  return fuzzyFindTrack(text, library);
}
