// Adopted unchanged from Ranjish Kumar's ranjish/ccdj-desktop branch.
//
// Ties the CSV reader and row-normalizer together, and never crashes on
// a bad row (CLAUDE.md 6.1: "Record rejected rows with line number and
// reason; never crash the import"). Line numbers are 1-based and count
// the header row, matching what a DJ would see if they opened the CSV in
// a spreadsheet program.

import { parseCsvWithHeaders } from "./parseCsv.ts";
import { normalizeTrack, type Track } from "./normalizeTrack.ts";

export interface RejectedRow {
  line: number;
  reason: string;
  isBlankLine: boolean;
}

export interface ImportResult {
  tracks: Track[];
  rejected: RejectedRow[];
  totalRows: number;
}

export function importLibraryFromCsvText(text: string): ImportResult {
  const { rows } = parseCsvWithHeaders(text);
  const tracks: Track[] = [];
  const rejected: RejectedRow[] = [];

  rows.forEach((row, index) => {
    const { track, rejectedReason, isBlankLine } = normalizeTrack(row);
    if (track) {
      tracks.push(track);
    } else {
      // +2: 1 to make it 1-based, +1 again for the header row itself.
      rejected.push({ line: index + 2, reason: rejectedReason ?? "unknown", isBlankLine });
    }
  });

  return { tracks, rejected, totalRows: rows.length };
}
