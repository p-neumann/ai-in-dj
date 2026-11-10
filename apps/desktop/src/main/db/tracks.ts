// Storing imported tracks. Replaces the whole table in one transaction
// per import (CLAUDE.md 6.2: "writes use transactions (atomic)") - this
// app has no screen to review changes yet, so a clean replace is the
// honest, simple behavior for this step, not a silent partial merge.

import type Database from "better-sqlite3";
import type { Track } from "../library/normalizeTrack.ts";

export function replaceAllTracks(db: Database.Database, tracks: Track[]): void {
  const insert = db.prepare(`
    INSERT INTO tracks (displayName, artist, title, bpm, key, genre, year, playcount, durationSec, location, extra)
    VALUES (@displayName, @artist, @title, @bpm, @key, @genre, @year, @playcount, @durationSec, @location, @extra)
  `);

  const replaceAll = db.transaction((rows: Track[]) => {
    db.prepare("DELETE FROM tracks").run();
    for (const track of rows) {
      insert.run({ ...track, extra: JSON.stringify(track.extra) });
    }
  });

  replaceAll(tracks);
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
  id: number;
  displayName: string;
}

export function getSampleTracks(db: Database.Database, limit: number): SampleTrack[] {
  return db.prepare("SELECT id, displayName FROM tracks LIMIT ?").all(limit) as SampleTrack[];
}

// The renderer only ever says "show me track #N" - it never gets to hand
// the main process a raw path itself (CLAUDE.md 7.5: "File operations
// accept only trackIds... never a raw path from the renderer").
export function getTrackLocation(db: Database.Database, trackId: number): string | null {
  const row = db.prepare("SELECT location FROM tracks WHERE id = ?").get(trackId) as
    | { location: string }
    | undefined;
  return row ? row.location : null;
}

export interface ExportTrackRow {
  id: number;
  displayName: string;
  artist: string;
  bpm: number;
  key: string;
  location: string;
}

// Step 5, piece 8 (Export) - Crate Cheat's export needs real
// displayName/artist/bpm/key AND a real location (CSV's Location
// column, M3U's path line); the renderer never holds a location itself
// (CLAUDE.md 5.4), so this is resolved here, by trackId, the same
// trusted-side pattern as getTrackLocation above. Order is NOT
// guaranteed by SQL's IN() - the caller must re-order by its own
// trackId list if order matters (the crate's own track order does).
export function getTracksByIds(db: Database.Database, trackIds: number[]): ExportTrackRow[] {
  if (trackIds.length === 0) return [];
  const placeholders = trackIds.map(() => "?").join(",");
  return db
    .prepare(`SELECT id, displayName, artist, bpm, key, location FROM tracks WHERE id IN (${placeholders})`)
    .all(...trackIds) as ExportTrackRow[];
}

export interface DuplicateScanRow {
  id: number;
  displayName: string;
  bpm: number;
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
export function deleteTracksByIds(db: Database.Database, trackIds: number[]): number {
  if (trackIds.length === 0) return 0;
  const del = db.transaction((ids: number[]) => {
    const placeholders = ids.map(() => "?").join(",");
    return db.prepare(`DELETE FROM tracks WHERE id IN (${placeholders})`).run(...ids).changes;
  });
  return del(trackIds);
}

export interface LibraryRow {
  id: number;
  displayName: string;
  artist: string;
  title: string;
  bpm: number;
  key: string;
  genre: string;
  year: number;
  playcount: number | null;
}

// Step 5, piece 2 (Library screen). Measured directly against the real
// ~38,484-track library before choosing this: fetching every row with no
// filter takes ~7-10ms at the database level, and transferring that many
// rows out takes ~50-60ms total - cheap enough to do ONCE when the screen
// opens, then search instantly in the renderer's own memory, rather than
// round-tripping to the database on every keystroke (which measured
// slower overall for fast typing, not faster). No search-specific SQL,
// no index, no FTS5 - deliberately: a leading-wildcard LIKE search can't
// use a plain index anyway, and FTS5 only measured ~8ms faster than plain
// LIKE at this size, not something a person could feel while typing.
export function getAllTracksForLibrary(db: Database.Database): LibraryRow[] {
  return db
    .prepare("SELECT id, displayName, artist, title, bpm, key, genre, year, playcount FROM tracks")
    .all() as LibraryRow[];
}

// Step 5, piece 3 (Track Cheat), revised per Ranjish's real-library test:
// the backend no longer gets the library inline on every recommend call
// (that's what produced the real 413 - see docs/decisions/0009). The
// desktop app now syncs the library to the backend ONCE (reusing this
// same lean, no-location shape already built for the Library screen -
// CLAUDE.md 5.4's privacy rule: send displayName, never a real path),
// and every recommend call afterward refers to it by libraryRevision
// only. getAllTracksForLibrary (above) IS the sync payload shape now -
// no separate "backend" projection needed, and no location ever leaves
// this process.
