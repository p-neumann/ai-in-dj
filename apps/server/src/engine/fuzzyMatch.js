// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 505, 517-531). Generic edit-distance fuzzy matching used
// by Crate Cheat's curated-track matcher (crateMatching.js) to catch minor
// spelling/stylization differences ("drank"/"drink") without a hardcoded
// word list.

export function levenshtein(a, b) {
  var m = a.length, n = b.length, dp = [], i, j;
  for (i = 0; i <= m; i++) dp.push([i]);
  for (j = 0; j <= n; j++) dp[0][j] = j;
  for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n];
}

export function consonantSkeleton(w) {
  return w.replace(/[aeiou]/g, "");
}

export function fuzzyEq(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  var maxLen = Math.max(a.length, b.length);
  if (maxLen < 4) return false;
  var tolerance = Math.max(1, Math.floor(maxLen * 0.18));
  if (levenshtein(a, b) <= tolerance) return true;
  if (a.length !== b.length) {
    var skA = consonantSkeleton(a), skB = consonantSkeleton(b);
    if (skA && skB) {
      if (skA === skB) return true;
      var skMaxLen = Math.max(skA.length, skB.length);
      if (skMaxLen >= 3) {
        var skTolerance = Math.max(1, Math.floor(skMaxLen * 0.18));
        if (levenshtein(skA, skB) <= skTolerance) return true;
      }
    }
  }
  return false;
}
