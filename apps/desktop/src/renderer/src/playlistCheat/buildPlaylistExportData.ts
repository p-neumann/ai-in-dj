// Phase 5, step 5 piece 8 - Export, Playlist Cheat side.
//
// Ported from the source's handleExportSpotify: the CSV/M3U/TXT/Copy
// track list is only the currently-selected match per song, but the
// JSON export carries a richer list - the source line plus every
// candidate match (selected or not), flagged - plus a "no match" line
// standing in for the source's "[No Results Found]" entry where there
// is no title/match at all. Deliberately no location on any of these
// entries, matching the source's own omission for this screen's export
// (confirmed real asymmetry against Crate Cheat's export, which does
// carry one - see buildExportContent.ts's header comment).
//
// This stays a pure function (no Electron) so it's unit-testable the
// same way every other matching/selection helper in this port is.

import type { MatchedResult } from "./matchPlaylist.ts";

// Duplicated from main/export/buildExportContent.ts rather than
// imported - the renderer's own tsconfig project can't reach across
// into src/main (same reason ccdj.d.ts duplicates the preload's types
// instead of importing them). Shapes must stay in sync by hand.
export interface ExportTrack {
  name: string;
  artist: string;
  bpm: number | string;
  key: string;
  location?: string;
}

export interface ExportJsonTrack {
  name: string;
  artist: string;
  bpm: number | string;
  key: string;
  isSource?: boolean;
  isMatch?: boolean;
  noMatch?: boolean;
}

export interface PlaylistExportData {
  tracks: ExportTrack[];
  allTracksForJson: ExportJsonTrack[];
  extraJson: { source: "Playlist Cheat"; tracksIncludeSourceAndAllCandidates: boolean };
}

// docs/decisions/0014's own distinction, reused here so the JSON's
// "no match" line says the same honest thing the screen already shows:
// a blank sourceArtist means no " - " was found to split on at all, a
// different situation from a title that WAS identified but matched
// nothing in the library.
function noMatchLabel(sourceArtist: string): string {
  return sourceArtist === "" ? "[No Title Found In This Line]" : "[No Match In Your Library]";
}

export function buildPlaylistExportData(results: MatchedResult[], selected: Record<number, number>): PlaylistExportData {
  const tracks: ExportTrack[] = [];
  const allTracksForJson: ExportJsonTrack[] = [];

  results.forEach((r, ri) => {
    allTracksForJson.push({ name: r.sourceName, artist: r.sourceArtist, bpm: "—", key: "—", isSource: true });

    if (r.matches.length === 0) {
      allTracksForJson.push({ name: noMatchLabel(r.sourceArtist), artist: "", bpm: "", key: "", noMatch: true });
      return;
    }

    r.matches.forEach((m, mi) => {
      if (selected[ri] === mi) {
        tracks.push({ name: m.displayName, artist: m.artist, bpm: m.bpm, key: m.key });
      }
      allTracksForJson.push({ name: m.displayName, artist: m.artist, bpm: m.bpm, key: m.key, isMatch: true });
    });
  });

  return {
    tracks,
    allTracksForJson,
    extraJson: { source: "Playlist Cheat", tracksIncludeSourceAndAllCandidates: allTracksForJson.length > 0 }
  };
}
