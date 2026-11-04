// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 4726-4745). Greedily picks `n` candidates that are
// maximally different from each other by version/edit descriptor (the
// words inside parens/brackets - "Extended", "Redrum", "Clean", etc.),
// after sorting by remix priority so clean/radio-adjacent edits are
// preferred on ties. Replaced an earlier AI-based picker for this exact
// reason - the AI picker wasn't producing meaningfully different results
// run-to-run despite attempts to force variety (Mike's dated comment,
// source lines 4774-4785); this deterministic approach, combined with a
// shuffle before calling it, solved that. Deliberately NOT ported here:
// that shuffle, and the cross-build "don't show the same pick again this
// session" tracking (pickWithSessionVariety) - deferred to a later piece.

import { getRemixPriority } from "./remixPriority.ts";

function descriptorWords(displayName: string): Set<string> {
  const parens: string[] = displayName.match(/\(([^)]*)\)/g) || [];
  const brackets: string[] = displayName.match(/\[([^\]]*)\]/g) || [];
  const tags = parens.concat(brackets).join(" ").toLowerCase();
  const set = new Set<string>();
  tags.split(/[^a-z0-9]+/).forEach((w) => {
    if (w.length > 2) set.add(w);
  });
  return set;
}

export function localDiversePick<T extends { displayName: string }>(cands: T[], n: number): T[] {
  const sorted = cands.slice().sort((a, b) => getRemixPriority(a.displayName) - getRemixPriority(b.displayName));
  const chosen: T[] = [];
  const chosenSets: Set<string>[] = [];
  const pool = sorted.slice();
  while (chosen.length < n && pool.length) {
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const ws = descriptorWords(pool[i].displayName);
      let overlap = 0;
      for (const prevSet of chosenSets) {
        for (const w of ws) {
          if (prevSet.has(w)) overlap++;
        }
      }
      if (overlap < bestScore) {
        bestScore = overlap;
        bestIdx = i;
      }
    }
    chosen.push(pool[bestIdx]);
    chosenSets.push(descriptorWords(pool[bestIdx].displayName));
    pool.splice(bestIdx, 1);
  }
  return chosen;
}
