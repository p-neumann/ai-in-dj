// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 471-494). Strips version/remix keywords and
// parentheticals, keeps the first artist word plus up to 4 title
// words - the "core" two tracks are compared by for near-duplicate
// detection (Duplicate Finder's own bucketing) and for scoring how
// close typed text is to a real library track (Track Cheat's
// free-typed GO resolver, fuzzyFind.ts).
//
// Promoted to shared/ (piece 18, 2026-11-13) - originally lived only
// in duplicateFinder/findDuplicates.ts; genuinely shared logic now
// that a second feature needs the identical word-core extraction, not
// two coincidentally-similar copies (same judgment call already made
// for getRawTitleFromName and fuzzyMatch.ts).

import { getArtistTitle } from "./getArtistTitle.ts";

const STRIP_WORDS = [
  "remix", "version", "bootleg", "intro", "outro", "dirty", "clean", "edit", "club", "extended",
  "radio", "slam", "hype", "vip", "acapella", "instrumental", "redrum", "mashup", "blend",
  "rework", "flip", "funk", "official", "unofficial", "moombahton", "xtenda", "redrums",
  "lounge", "deville", "kees", "sjansen", "crooklyn", "taito", "wooderson", "frey", "ligotti",
  "moji", "muzik", "junkies", "holla", "tik", "tok", "dance", "break", "big", "room", "deep",
  "house", "beat", "breaker", "supreme", "soundsystem", "cmp", "twerk", "five", "scratch",
  "stutter", "chop", "riddim", "magenta", "jack", "millz", "arman", "aveiru", "mayhem",
  "genzo", "ultimate"
];

export function extractCore(name: string): string {
  const at = getArtistTitle(name);
  const artist = at.artist.toLowerCase().trim();
  const title = at.title || name;
  let t = title.toLowerCase().replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "");
  STRIP_WORDS.forEach((k) => {
    t = t.split(k).join(" ");
  });
  const titleWords = t
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 1 && !/^\d+$/.test(w))
    .slice(0, 4);
  const artistWords = artist
    .replace(/ vs\.? .*/, "")
    .split(" ")
    .filter((w) => w.length > 1)
    .slice(0, 1);
  return artistWords.concat(titleWords).join(" ");
}
