// Orchestrates the plain-text Playlist Cheat flow: parse -> find every
// matching version of each song in the library -> pick N diverse
// versions per song. Mirrors the source's buildFromPlainText (source
// lines 4943-4972) minus the double-requestAnimationFrame paint-timing
// workaround (a browser-freeze fix specific to the artifact sandbox,
// irrelevant to Electron's renderer) and minus pickWithSessionVariety's
// cross-build "don't repeat this session" tracking, still deferred to a
// later piece (CLAUDE2.md).
//
// Vibe Prompt type-lock (piece 15, 2026-11-12): source combines the
// DJ's permanent Style Profile with this tab's own Vibe Prompt text
// (styleProfile+" "+spotifyPrompt, line 4522) before parsing a type
// lock out of it - see typeLock.ts's getSavedStyleProfile for why that
// fold-in reads localStorage directly.

import { parsePlainText } from "./parsePlainText.ts";
import { buildCandidatePools } from "./buildCandidatePools.ts";
import { localDiversePick } from "./localDiversePick.ts";
import { detectStyleTypeLock, getSavedStyleProfile } from "./typeLock.ts";

export interface MatchedResult {
  sourceArtist: string;
  sourceName: string;
  matches: CcdjLibraryRow[];
}

export function matchPlaylistFromPlainText(text: string, library: CcdjLibraryRow[], resultCount: number, vibePromptText = ""): MatchedResult[] {
  const sourceTracks = parsePlainText(text);
  const typeLock = detectStyleTypeLock(`${getSavedStyleProfile()} ${vibePromptText}`);
  const pools = buildCandidatePools(sourceTracks, library, typeLock);
  return pools.map((p) => {
    // Same shortcut as the source's pickWithSessionVariety: when there
    // aren't more candidates than requested, just return them all in
    // library-filter order rather than running the diversity pass (which
    // would reorder by remix priority even with nothing to choose between).
    const picks = p.dedupedCandidates.length <= resultCount ? p.dedupedCandidates : localDiversePick(p.dedupedCandidates, resultCount);
    return { sourceArtist: p.spotifyTrack.artist, sourceName: p.spotifyTrack.name, matches: picks };
  });
}
