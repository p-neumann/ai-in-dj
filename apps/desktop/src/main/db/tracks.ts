// The imported library (migration 5). Function names and shapes adopted from
// Ranjish Kumar's ranjish/ccdj-desktop branch, so his screens can call them;
// the differences are the stable string trackId (docs/decisions/0008) and
// null for an unknown bpm or year.

import type Database from "better-sqlite3";
import { trackId } from "./trackId.ts";

// One normalized row, as the CSV import produces it.
export interface TrackInput {
  displayName: string;
  artist: string;
  title: string;
  bpm: number | null;
  key: string;
  genre: string;
  year: number | null;
  playcount: number | null;
  durationSec: number | null;
  location: string;
  extra: Record<string, string>;
}

export interface ReplaceResult {
  inserted: number;
  // Later rows whose location repeats an earlier one (same file, same ID).
  // The first is kept; these are reported instead of failing the import.
  duplicateLocations: string[];
}

// A full import replaces the whole table in one transaction (CLAUDE.md 6.2:
// writes are atomic). IDs come from locations, so a re-import of the same
// files gives the same IDs.
export function replaceAllTracks(db: Database.Database, tracks: TrackInput[]): ReplaceResult {
  const insert = db.prepare(`
    INSERT INTO tracks (id, displayName, artist, title, bpm, key, genre, year, playcount, durationSec, location, extra)
    VALUES (@id, @displayName, @artist, @title, @bpm, @key, @genre, @year, @playcount, @durationSec, @location, @extra)
  `);

  const replaceAll = db.transaction((rows: TrackInput[]): ReplaceResult => {
    db.prepare("DELETE FROM tracks").run();
    const seen = new Set<string>();
    const duplicateLocations: string[] = [];
    for (const track of rows) {
      const id = trackId(track.location);
      if (seen.has(id)) {
        duplicateLocations.push(track.location);
        continue;
      }
      seen.add(id);
      insert.run({ ...track, id, extra: JSON.stringify(track.extra) });
    }
    return { inserted: seen.size, duplicateLocations };
  });

  return replaceAll(tracks);
}

export function countTracks(db: Database.Database): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM tracks").get() as { n: number };
  return row.n;
}

export function getSampleTrackNames(db: Database.Database, limit: number): string[] {
  const rows = db.prepare("SELECT displayName FROM tracks LIMIT ?").all(limit) as Array<{
    displayName: string;
  }>;
  return rows.map((r) => r.displayName);
}

export interface SampleTrack {
  id: string;
  displayName: string;
}

export function getSampleTracks(db: Database.Database, limit: number): SampleTrack[] {
  return db.prepare("SELECT id, displayName FROM tracks LIMIT ?").all(limit) as SampleTrack[];
}

// The renderer only ever names a trackId; the real path is looked up here, in
// the main process (CLAUDE.md 7.5). null for an unknown ID, never a guess.
export function getTrackLocation(db: Database.Database, id: string): string | null {
  const row = db.prepare("SELECT location FROM tracks WHERE id = ?").get(id) as
    | { location: string }
    | undefined;
  return row ? row.location : null;
}

export interface ExportTrackRow {
  id: string;
  displayName: string;
  artist: string;
  bpm: number | null;
  key: string;
  location: string;
}

// Adopted from Ranjish's branch (step 5, piece 8: Export), with string IDs.
// Crate Cheat's export needs each track's real location, looked up here by
// trackId like getTrackLocation. Unknown IDs are skipped. SQL's IN() does not
// keep order, so the caller re-orders by its own ID list.
export function getTracksByIds(db: Database.Database, trackIds: string[]): ExportTrackRow[] {
  if (trackIds.length === 0) return [];
  const placeholders = trackIds.map(() => "?").join(",");
  return db
    .prepare(`SELECT id, displayName, artist, bpm, key, location FROM tracks WHERE id IN (${placeholders})`)
    .all(...trackIds) as ExportTrackRow[];
}

export interface DuplicateScanRow {
  id: string;
  displayName: string;
  bpm: number | null;
  key: string;
  playcount: number | null;
  durationSec: number | null;
  location: string;
}

// Step 5, piece 9 (Duplicate Finder) - its own query, not a reuse of
// getAllTracksForLibrary below: duration and location are both
// essential to the matching algorithm itself (duration is a hard
// comparison input; location is how it tells "the same file counted
// twice" apart from "two different files"), not just extra display
// fields, so they're real inputs here, unlike that query's deliberate
// no-location rule (CLAUDE.md 5.4 - which is about what leaves this
// process over the network, not about what the trusted desktop app can
// show the DJ about files already on their own machine, the same
// reasoning that already applies to Reveal-in-Finder and Crate Cheat's
// own export).
export function getTracksForDuplicateScan(db: Database.Database): DuplicateScanRow[] {
  return db
    .prepare("SELECT id, displayName, bpm, key, playcount, durationSec, location FROM tracks")
    .all() as DuplicateScanRow[];
}

// Step 5, piece 9 (Duplicate Finder) - the deliberate, separate
// "Apply Permanently" action only. The default "Send to Recycle Bin"
// path never calls this - it only hides tracks for the rest of the
// current session, in the renderer's own memory, exactly like the
// source (R20): no row here is touched until the DJ takes this
// second, explicit action. A real transaction (CLAUDE.md 6.2), same
// pattern as replaceAllTracks - this is a real, permanent removal from
// CCDJ's own library record. It never touches the actual audio/video
// file on disk; only this table.
export function deleteTracksByIds(db: Database.Database, trackIds: string[]): number {
  if (trackIds.length === 0) return 0;
  const del = db.transaction((ids: string[]) => {
    const placeholders = ids.map(() => "?").join(",");
    return db.prepare(`DELETE FROM tracks WHERE id IN (${placeholders})`).run(...ids).changes;
  });
  return del(trackIds);
}

export interface LibraryRow {
  id: string;
  displayName: string;
  artist: string;
  title: string;
  bpm: number | null;
  key: string;
  genre: string;
  year: number | null;
  playcount: number | null;
}

// The Library screen's rows, and the shape synced to the server: no location
// or extra, so no file path ever leaves this process (CLAUDE.md 5.4).
export function getAllTracksForLibrary(db: Database.Database): LibraryRow[] {
  return db
    .prepare("SELECT id, displayName, artist, title, bpm, key, genre, year, playcount FROM tracks")
    .all() as LibraryRow[];
}
