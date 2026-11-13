// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 505, 517-531). Same logic as apps/server/src/engine/
// fuzzyMatch.js (Crate Cheat's curated-track matcher) - duplicated
// client-side rather than imported from the server, since this is
// explicitly client-side, unprotected logic (CLAUDE.md Section 5.4)
// that runs in the desktop app's renderer, not the backend server;
// there is no shared package between the two.
//
// Promoted to shared/ (piece 18, 2026-11-13) - originally lived only
// in playlistCheat/, now also used by trackCheat/fuzzyFind.ts (Track
// Cheat's free-typed GO resolver needs the identical typo-tolerance
// math his own fuzzyFind calls) - genuinely shared, not two
// coincidentally-similar copies.

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) dp.push([i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

export function consonantSkeleton(w: string): string {
  return w.replace(/[aeiou]/g, "");
}

export function fuzzyEq(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen < 4) return false;
  const tolerance = Math.max(1, Math.floor(maxLen * 0.18));
  if (levenshtein(a, b) <= tolerance) return true;
  if (a.length !== b.length) {
    const skA = consonantSkeleton(a);
    const skB = consonantSkeleton(b);
    if (skA && skB) {
      if (skA === skB) return true;
      const skMaxLen = Math.max(skA.length, skB.length);
      if (skMaxLen >= 3) {
        const skTolerance = Math.max(1, Math.floor(skMaxLen * 0.18));
        if (levenshtein(skA, skB) <= skTolerance) return true;
      }
    }
  }
  return false;
}
