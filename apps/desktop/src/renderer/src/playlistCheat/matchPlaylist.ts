// Orchestrates the plain-text Playlist Cheat flow: parse -> find every
// matching version of each song in the library -> pick N diverse
// versions per song. Mirrors the source's buildFromPlainText (source
// lines 4943-4972) minus the double-requestAnimationFrame paint-timing
// workaround (a browser-freeze fix specific to the artifact sandbox,
// irrelevant to Electron's renderer) and minus pickWithSessionVariety's
// cross-build "don't repeat this session" tracking, deferred to a later
// piece along with the Vibe Prompt type-lock.

import { parsePlainText } from "./parsePlainText.ts";
import { buildCandidatePools } from "./buildCandidatePools.ts";
import { localDiversePick } from "./localDiversePick.ts";

export interface MatchedResult {
  sourceArtist: string;
  sourceName: string;
  matches: CcdjLibraryRow[];
}

export function matchPlaylistFromPlainText(text: string, library: CcdjLibraryRow[], resultCount: number): MatchedResult[] {
  const sourceTracks = parsePlainText(text);
  const pools = buildCandidatePools(sourceTracks, library);
  return pools.map((p) => {
    // Same shortcut as the source's pickWithSessionVariety: when there
    // aren't more candidates than requested, just return them all in
    // library-filter order rather than running the diversity pass (which
    // would reorder by remix priority even with nothing to choose between).
    const picks = p.dedupedCandidates.length <= resultCount ? p.dedupedCandidates : localDiversePick(p.dedupedCandidates, resultCount);
    return { sourceArtist: p.spotifyTrack.artist, sourceName: p.spotifyTrack.name, matches: picks };
  });
}
