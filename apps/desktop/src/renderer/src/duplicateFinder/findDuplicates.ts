// Phase 5, step 5 piece 9 - Duplicate Finder core. Ported from the
// source's runDupScan (lines 5244-5303) plus its helpers extractCore
// (471-494), getVersionTags/sigsCompatible/VERSION_FAMILIES (421-430).
// No AI, no network call - this is the same kind of fully local
// pattern-matching as Playlist Cheat's own matcher.
//
// Two real differences from how the source reads a track, both because
// our import already did work the source redoes on every scan:
// - displayName is read directly (computed once at import, by the same
//   rule as the source's getDisplayName - no need to recompute it here).
// - duration is read from durationSec (already parsed to whole seconds
//   at import, CLAUDE.md 6.1) instead of re-parsing a raw "mm:ss" or
//   millisecond string with the source's own parseDur - the parsing
//   itself isn't duplicated, only its result is used.
//
// Not chunked across setTimeout ticks the way the source's processChunk
// is - that was a browser-tab-freeze mitigation for the artifact
// sandbox specifically; this port's other local matchers (Playlist
// Cheat's buildCandidatePools) run synchronously too. The 500,000-
// comparison safety cap is kept regardless, so a pathological library
// still can't run away.

export interface DuplicateFinderTrack {
  id: string;
  displayName: string;
  bpm: number | null;
  key: string;
  playcount: number | null;
  durationSec: number | null;
  location: string;
}

export interface DuplicateGroupEntry {
  track: DuplicateFinderTrack;
  confidence?: "likely" | "possible";
}

export interface DuplicateGroup {
  confidence: "likely" | "possible";
  tracks: DuplicateGroupEntry[];
}

const MAX_COMPARISONS = 500000;

// Source: VERSION_FAMILIES (421-426). Grouped so two tracks whose
// version-tags land in the same family (e.g. "dirty" and "clean") are
// still allowed to be compared as possible duplicates of each other;
// tracks in different families (a Redrum vs. a plain Remix) are not.
const VERSION_FAMILIES: string[][] = [
  ["redrum", "crooklyn", "cdj"],
  ["extended", "xtenda", "xtendz"],
  ["transition"],
  ["bootleg", "remix", "edit", "refix", "rework", "flip"],
  ["mashup", "blend"],
  ["intro", "outro"],
  ["instrumental"],
  ["acapella"],
  ["dirty", "clean"],
  ["radio", "club"],
  ["moombah", "twerk", "bounce", "trap"]
];
const VERSION_ALL: string[] = VERSION_FAMILIES.reduce((a, f) => a.concat(f), [] as string[]);

function getFamilyTag(word: string): number {
  for (let fi = 0; fi < VERSION_FAMILIES.length; fi++) {
    if (VERSION_FAMILIES[fi].indexOf(word) !== -1) return fi;
  }
  return -1;
}

export function getArtistTitle(name: string): { artist: string; title: string } {
  const idx = name.indexOf(" - ");
  if (idx !== -1) return { artist: name.slice(0, idx).trim(), title: name.slice(idx + 3).trim() };
  return { artist: "", title: name };
}

export function getVersionTags(fullName: string): number[] {
  const n = fullName.toLowerCase();
  const families = new Set<number>();
  VERSION_ALL.forEach((v) => {
    if (n.indexOf(v) !== -1 && n.indexOf(v + "s") === -1) {
      const fi = getFamilyTag(v);
      if (fi !== -1) families.add(fi);
    }
  });
  return Array.from(families).sort();
}

export function sigsCompatible(aTags: number[], bTags: number[]): boolean {
  if (aTags.length === 0 && bTags.length === 0) return true;
  if (aTags.length === 0 || bTags.length === 0) return false;
  const aSet = new Set(aTags);
  const bSet = new Set(bTags);
  return aTags.every((t) => bSet.has(t)) || bTags.every((t) => aSet.has(t));
}

// Source: extractCore (471-494). Strips version/remix keywords and
// parentheticals, keeps the first artist word plus up to 4 title words -
// this is what buckets tracks together before the expensive pairwise
// comparison, and what the name-overlap score compares.
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

interface Bucketed {
  track: DuplicateFinderTrack;
  idx: number;
}

export function findDuplicateGroups(tracks: DuplicateFinderTrack[]): DuplicateGroup[] {
  // Source: seenPaths dedup before scanning at all - two rows sharing
  // the exact same real path are one file counted twice, not a
  // duplicate worth asking the DJ about.
  const seenPaths = new Set<string>();
  const dedupedLib = tracks.filter((t) => {
    const p = t.location || "";
    if (!p) return true;
    if (seenPaths.has(p)) return false;
    seenPaths.add(p);
    return true;
  });

  const buckets: Record<string, Bucketed[]> = {};
  dedupedLib.forEach((t, idx) => {
    const core = extractCore(t.displayName);
    if (!core) return;
    const words = core.split(" ").filter((w) => w.length > 2).slice(0, 3);
    const keys = new Set(words.map((w) => w.slice(0, 4).toLowerCase()));
    keys.forEach((key) => {
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push({ track: t, idx });
    });
  });

  const bucketList = Object.values(buckets).filter((b) => b.length > 1 && b.length <= 50);
  const groups: DuplicateGroup[] = [];
  const used = new Set<number>();
  const compared = new Set<string>();
  let totalComparisons = 0;

  for (const bucket of bucketList) {
    for (let i = 0; i < bucket.length; i++) {
      const a = bucket[i];
      if (used.has(a.idx)) continue;
      const aFull = a.track.displayName.toLowerCase();
      const aName = extractCore(aFull);
      const aTags = getVersionTags(aFull);
      const aBpm = a.track.bpm || 0;
      const aDur = a.track.durationSec || 0;
      const group: DuplicateGroupEntry[] = [{ track: a.track }];

      for (let j = i + 1; j < bucket.length; j++) {
        if (totalComparisons >= MAX_COMPARISONS) break;
        const b = bucket[j];
        if (used.has(b.idx)) continue;
        const pairKey = Math.min(a.idx, b.idx) + "-" + Math.max(a.idx, b.idx);
        if (compared.has(pairKey)) continue;
        compared.add(pairKey);
        totalComparisons++;

        const bFull = b.track.displayName.toLowerCase();
        const bTags = getVersionTags(bFull);
        if (!sigsCompatible(aTags, bTags)) continue;

        const aPath = a.track.location || "";
        const bPath = b.track.location || "";
        if (aPath && bPath && aPath === bPath) continue;

        const bName = extractCore(bFull);
        const bBpm = b.track.bpm || 0;
        const bDur = b.track.durationSec || 0;

        const aw = aName.split(" ").filter((w) => w.length > 1);
        const bw = bName.split(" ").filter((w) => w.length > 1);
        const nameScore = aw.length && bw.length ? aw.filter((w) => bw.indexOf(w) !== -1).length / Math.max(aw.length, bw.length) : 0;
        const durMatch = aDur && bDur ? Math.abs(aDur - bDur) <= 1 : false;
        const durClose = aDur && bDur ? Math.abs(aDur - bDur) <= 4 : false;
        const bpmMatch = aBpm && bBpm ? Math.abs(aBpm - bBpm) <= 1 : false;
        const isLikely = nameScore >= 0.95 && durMatch;
        const isPossible = !isLikely && nameScore >= 0.82 && durClose && bpmMatch;

        if (isLikely || isPossible) {
          group.push({ track: b.track, confidence: isLikely ? "likely" : "possible" });
          used.add(b.idx);
        }
      }

      if (group.length > 1) {
        used.add(a.idx);
        group.sort((x, y) => (y.track.playcount || 0) - (x.track.playcount || 0));
        groups.push({ confidence: group[1].confidence ?? "likely", tracks: group });
      }
    }
    if (totalComparisons >= MAX_COMPARISONS) break;
  }

  groups.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === "likely" ? -1 : 1;
    const an = a.tracks[0].track.displayName.toLowerCase();
    const bn = b.tracks[0].track.displayName.toLowerCase();
    return an < bn ? -1 : an > bn ? 1 : 0;
  });

  return groups;
}
