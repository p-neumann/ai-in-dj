// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 310, 467). Used by localDiversePick to sort candidates
// before the diversity pass, so clean/radio-adjacent versions are
// preferred over hype/intro edits when there's a tie in diversity score.

export const REMIX_KEYWORDS_ORDERED = [
  "single",
  "xtendz",
  "extended",
  "xtenda",
  "redrum",
  "refix",
  "slam intro",
  "epic intro",
  "acapella intro",
  "chorus intro",
  "hype intro",
  "party break intro"
];

export function getRemixPriority(name: string): number {
  const n = name.toLowerCase();
  const idx = REMIX_KEYWORDS_ORDERED.findIndex((k) => n.indexOf(k) !== -1);
  return idx === -1 ? 999 : idx;
}
