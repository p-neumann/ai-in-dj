// Ported from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx (source
// lines 4507-4724, buildCandidatePools). For each source playlist track,
// finds every version of that song already in the library: title words
// must clear a 90%/95% threshold (90% when the source also names an
// artist, since the artist match adds a second, independent check; 95%
// when title words are all we have to go on), with a small fuzzy-edit-
// distance tolerance for near-misses and a parenthetical/concatenated-
// title fallback for songs filed under an alternate title. Then dedupes
// by version-tag-stripped name so "Song (Clean)" and "Song (Clean) [v2]"
// don't both show up as separate candidates.
//
// Deliberately NOT ported in this piece (CLAUDE.md Top Rule 5 - tracked,
// not silently dropped): the Vibe Prompt type-lock filter (spotifyPrompt/
// styleProfile hard-filtering each pool to a requested edit type) and the
// debug-line UI trace. Both are real behavior from the source, left for
// a follow-up piece rather than bundled into the first matching pass.

import { normalizeForMatch } from "./normalizeForMatch.ts";
import { getRawTitleFromName } from "./getRawTitleFromName.ts";
import { fuzzyEq } from "./fuzzyMatch.ts";

const TITLE_MATCH_STOPWORDS = new Set([
  "you", "the", "a", "an", "and", "or", "it", "is", "are", "was", "in", "on", "at", "to", "of", "for",
  "with", "my", "me", "we", "your", "this", "that", "be", "do", "got", "get", "up", "so", "im", "like",
  "no", "yeah"
]);

function wordsOf(normalized: string): string[] {
  return normalized.split(/[^a-z0-9]+/i).filter(Boolean);
}

interface LibTitleData {
  words: Set<string>;
  wordsArr: string[];
  merged: string;
}

const titleCache = new WeakMap<CcdjLibraryRow, LibTitleData>();
const artistCache = new WeakMap<CcdjLibraryRow, Set<string>>();

function getLibTitleData(t: CcdjLibraryRow): LibTitleData {
  let cached = titleCache.get(t);
  if (!cached) {
    const dnTitleOnly = getRawTitleFromName(t.displayName);
    const wordsArr = wordsOf(normalizeForMatch(dnTitleOnly));
    cached = { words: new Set(wordsArr), wordsArr, merged: wordsArr.join("") };
    titleCache.set(t, cached);
  }
  return cached;
}

function getLibArtistWords(t: CcdjLibraryRow): Set<string> {
  let cached = artistCache.get(t);
  if (!cached) {
    cached = new Set(wordsOf(normalizeForMatch(t.artist || "")));
    artistCache.set(t, cached);
  }
  return cached;
}

function normalizeForDedup(name: string): string {
  return name
    .replace(
      /\s*\[(Extended|Xtendz|Xtenda|ReFix|Remix|Bootleg|Blend|X-Mix|Hype|Intro|Refix|Club|Radio|Radio.*Edit|Dirty|Clean|Album|Version|pt\.\d+|Mix|Edit|VIP|Short|Long|Transition|yRemix|Serafin|Extended|vs|vs\s+\w+|ft\.|feat\.)\].*$/gi,
      ""
    )
    .trim();
}

export interface SourceTrack {
  artist: string;
  name: string;
}

export interface CandidatePool {
  spotifyTrack: SourceTrack;
  dedupedCandidates: CcdjLibraryRow[];
}

export function buildCandidatePools(sourceTracks: SourceTrack[], library: CcdjLibraryRow[]): CandidatePool[] {
  return sourceTracks.map((st) => {
    const rawName = st.name || "";
    // Spotify (and some plain-text sources) commonly tack a version tag
    // onto the title with a trailing " - Tag" instead of parens/brackets -
    // strip only the LAST dash-segment so a genuinely hyphenated mid-word
    // title ("Twenty-One") is untouched.
    const dashSuffixMatch = rawName.match(/^(.+?)\s+-\s+([^-]+)$/);
    const rawNameForTitle = dashSuffixMatch ? dashSuffixMatch[1] : rawName;
    // Capture the first parenthetical/bracketed group as an alternate
    // title candidate before discarding it - sometimes that's the song's
    // actually-filed title (Pitbull's "I Know You Want Me (Calle Ocho)").
    const altTitleMatch = rawName.match(/[([]([^)\]]+)[)\]]/);
    const altTitleRaw = altTitleMatch ? normalizeForMatch(altTitleMatch[1]) : "";
    const titleOnly = normalizeForMatch(rawNameForTitle).replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*]/g, " ");
    const titleWordsRaw = titleOnly.replace(/-/g, " ").replace(/\s+/g, " ").trim().split(" ").filter((w) => w.length > 1);
    // A title made entirely of common words ("I Like It") would otherwise
    // leave coreWords empty and never match anything - fall back to the
    // unfiltered word list in that specific case.
    const coreWordsFiltered = titleWordsRaw.filter((w) => !TITLE_MATCH_STOPWORDS.has(w));
    const coreWords = coreWordsFiltered.length ? coreWordsFiltered : titleWordsRaw;
    const altTitleWords = altTitleRaw ? wordsOf(altTitleRaw).filter((w) => w.length > 1) : [];

    let dedupedCandidates: CcdjLibraryRow[] = [];

    if (coreWords.length) {
      const spArtistWords = normalizeForMatch(st.artist || "").split(/[\s,&]+/).filter((w) => w.length > 1);
      const primaryArtist = normalizeForMatch((st.artist || "").split(/\s+ft\.?|\s+feat\.?|\s+featuring/i)[0].trim());
      const primaryArtistWords = primaryArtist.split(/[\s,&]+/).filter((w) => w.length > 1);

      const candidates = library.filter((t) => {
        const titleData = getLibTitleData(t);
        const libWords = titleData.words;
        let titleMatchCount = coreWords.filter((w) => libWords.has(w)).length;
        const titleThreshold = spArtistWords.length ? Math.ceil(coreWords.length * 0.9) : Math.ceil(coreWords.length * 0.95);
        let titlePasses = titleMatchCount >= titleThreshold;

        // A near-miss gets one fuzzy-edit-distance pass on the still-
        // missing words, bounded to only the couple of words separating
        // the match count from the threshold (running full edit-distance
        // against every candidate regardless of how unrelated it already
        // looks would add real cost for no benefit).
        if (!titlePasses) {
          const stillMissing = coreWords.filter((w) => !libWords.has(w));
          const gapAllowed = coreWords.length - titleThreshold + 1;
          if (stillMissing.length && stillMissing.length <= gapAllowed) {
            const libWordsArr = titleData.wordsArr;
            const fuzzyMatchedCount = stillMissing.filter((mw) => libWordsArr.some((lw) => fuzzyEq(mw, lw))).length;
            if (titleMatchCount + fuzzyMatchedCount >= titleThreshold) {
              titlePasses = true;
              titleMatchCount = titleMatchCount + fuzzyMatchedCount;
            }
          }
        }

        // Try the parenthetical as an alternate title if the primary text
        // failed - handles songs filed under their subtitle.
        if (!titlePasses && altTitleWords.length) {
          const altMatchCount = altTitleWords.filter((w) => libWords.has(w)).length;
          const altThreshold = spArtistWords.length ? Math.ceil(altTitleWords.length * 0.9) : Math.ceil(altTitleWords.length * 0.95);
          if (altMatchCount >= altThreshold) titlePasses = true;
        }

        // Try a concatenated (no-space) comparison if word-by-word still
        // failed - handles single-word-vs-split-word conventions
        // ("LoveGame" vs "Love Game").
        if (!titlePasses) {
          const sourceMerged = titleWordsRaw.join("");
          if (sourceMerged && sourceMerged === titleData.merged) titlePasses = true;
        }

        if (!titlePasses) return false;
        if (!spArtistWords.length) return true;

        const taWords = getLibArtistWords(t);
        // Require ALL primary artist words to match when there are 2+
        // words ("Jay Sean" must match both, not just one - this rejects
        // false positives like "Jay-Z"). Single-word artists use "some".
        return primaryArtistWords.length >= 2
          ? primaryArtistWords.every((w) => taWords.has(w))
          : primaryArtistWords.some((w) => taWords.has(w));
      });

      const seenNames = new Set<string>();
      dedupedCandidates = candidates.filter((t) => {
        const normalized = normalizeForDedup(t.displayName);
        if (seenNames.has(normalized)) return false;
        seenNames.add(normalized);
        return true;
      });
    }

    return { spotifyTrack: st, dedupedCandidates };
  });
}
