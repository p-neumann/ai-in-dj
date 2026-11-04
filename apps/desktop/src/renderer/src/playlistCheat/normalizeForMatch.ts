// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 4542-4557, inside buildCandidatePools). One general
// normalizer instead of patching one-off punctuation cases (Mike's dated
// comments, v1.0.16061/16062/16063): strips accents, converts hyphens to
// spaces, expands a dropped-g "in'" colloquialism to "ing", strips
// apostrophes/periods/exclamation marks/commas, $ -> s, and drops a
// leading "the ". Applied identically to source playlist text and
// library text, artist and title - CLAUDE.md Top Rule 5 (preserve
// musical/matching behavior exactly).

const APOSTROPHES = "'‘’"; // straight ', left single quote, right single quote

// Combining diacritical marks (U+0300-U+036F) left behind by NFD
// decomposition - built from char codes, not pasted literal combining
// characters, so this file's bytes stay unambiguous.
const COMBINING_MARKS = new RegExp(
  "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
  "g"
);

export function normalizeForMatch(input: string | undefined | null): string {
  let a = (input || "").toLowerCase();
  if (a.normalize) a = a.normalize("NFD").replace(COMBINING_MARKS, "");
  const inApostropheExpand = new RegExp("in[" + APOSTROPHES + "](?=\\s|$)", "g");
  a = a.replace(inApostropheExpand, "ing");
  const stripChars = new RegExp("[" + APOSTROPHES + "\\.!,]", "g");
  return a.replace(/^the\s+/, "").replace(/\$/g, "s").replace(/-/g, " ").replace(stripChars, "");
}
