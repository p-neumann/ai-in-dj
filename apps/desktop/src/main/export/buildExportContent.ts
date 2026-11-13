// Phase 5, step 5 piece 8 - Export (Crate Cheat + Playlist Cheat).
//
// Pure string-building only - no Electron, no filesystem, no dialog.
// That split is deliberate: the save dialog and file write belong in
// ipc.ts (where Electron already lives); this file stays testable with
// plain `node --test`, same as every other pure module in this port.
//
// Formats and shapes are ported from the source's genericExport/
// handleExport/handleExportSpotify, not invented:
// - CSV: "Location,Artist,Title,BPM,Key" header, one row per track.
// - M3U: "#EXTM3U" then "#EXTINF:-1,<name>" + a path line per track,
//   falling back to the name itself when there's no location.
// - TXT / Copy: just the names, one per line.
// - JSON: {matchCount, exportDate, tracks, versionExported, ...extra} -
//   "tracks" here is deliberately whatever the caller calls
//   allTracksForJson, which can be richer than the CSV/M3U/TXT track
//   list (see Playlist Cheat's own source vs. match vs. no-match
//   entries) or identical to it (Crate Cheat has no such distinction).
//
// One confirmed real asymmetry, preserved rather than "fixed": the
// source's Crate Cheat export includes each track's real location;
// its Playlist Cheat export never does, even though the underlying
// matched tracks have one. That's not re-derived here - the caller
// decides what "location" is for each track object it hands in.

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
  // Piece 19 (2026-11-14) - source line 5215/4980: Crate Cheat's own
  // JSON export carries a "reason" per track; today the only real
  // value it's ever set to is "From Spotify", written by his
  // spotifyToPlaylist when a track arrives via Playlist Cheat's "Add
  // To Crate" (even for plain-text/file-sourced matches - his own
  // hardcoded string, not re-derived from actual origin here either).
  // Tracks built directly by Crate Cheat's own AI pipeline have no
  // reason at all, matching his reason:"" default.
  reason?: string;
}

function csvField(value: string): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function buildCsv(tracks: ExportTrack[]): string {
  const header = "Location,Artist,Title,BPM,Key";
  const rows = tracks.map((t) =>
    [csvField(t.location ?? ""), csvField(t.artist), csvField(t.name), csvField(String(t.bpm ?? "")), csvField(t.key)].join(",")
  );
  return [header, ...rows].join("\n");
}

export function buildM3u(tracks: ExportTrack[]): string {
  const lines = ["#EXTM3U"];
  for (const t of tracks) {
    lines.push(`#EXTINF:-1,${t.name}`);
    lines.push(t.location || t.name);
  }
  return lines.join("\n");
}

export function buildTxt(tracks: ExportTrack[]): string {
  return tracks.map((t) => t.name).join("\n");
}

export function buildJson(
  jsonTracks: ExportJsonTrack[],
  extraJson: Record<string, unknown>,
  versionExported: string,
  exportDate: string
): string {
  return JSON.stringify(
    {
      matchCount: jsonTracks.length,
      exportDate,
      tracks: jsonTracks,
      versionExported,
      ...extraJson
    },
    null,
    2
  );
}

export type ExportFormat = "csv" | "m3u" | "json" | "txt";

export function extensionForFormat(format: ExportFormat): string {
  return format;
}
