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
