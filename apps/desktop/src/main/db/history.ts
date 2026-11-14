// A generic history log (step 4). Stores whatever JSON-serializable entry
// it's given - the real session-history shape (CLAUDE.md Section 6.5)
// gets written here once real Track Cheat sessions exist (step 5); this
// layer doesn't need to know that shape in advance.

import type Database from "better-sqlite3";

export interface HistoryRow {
  id: number;
  timestamp: number;
  entry: unknown;
}

// Piece 20 (History panel, Piece A - recording, 2026-11-14) - now
// returns the new row's real id. Source's own logOutcome/setEntryNote
// (lines 1656-1666, 1772-1777) find the entry to patch by searching
// backwards through history for a result matching by NAME, since his
// app has no better handle available. We don't need that heuristic -
// the renderer already knows exactly which fetch it's reacting to, so
// it can hand this id straight back for updateHistoryEntry below,
// which is more precise than his own name-search (two different
// fetches can legitimately share a result name).
export function appendHistoryEntry(db: Database.Database, entry: unknown): number {
  const result = db.prepare("INSERT INTO history (timestamp, entry) VALUES (?, ?)").run(Date.now(), JSON.stringify(entry));
  return Number(result.lastInsertRowid);
}

// New this piece - didn't exist before. Source's logResultsForSeed/
// logOutcome/setEntryNote are all PATCHES to an entry already written
// by logSeedEvent, not fresh appends - our history table had no way
// to do that at all until now. A shallow merge (Object.assign
// semantics, same as his own update functions), not a deep patch -
// the caller sends the full replacement value for whichever top-level
// field(s) it's changing (e.g. the whole updated `results` array, not
// a single result's delta), same division of responsibility his own
// code uses.
export function updateHistoryEntry(db: Database.Database, id: number, patch: Record<string, unknown>): boolean {
  const row = db.prepare("SELECT entry FROM history WHERE id = ?").get(id) as { entry: string } | undefined;
  if (!row) return false;
  const entry = JSON.parse(row.entry);
  const next = { ...entry, ...patch };
  db.prepare("UPDATE history SET entry = ? WHERE id = ?").run(JSON.stringify(next), id);
  return true;
}

export function listHistory(db: Database.Database, limit: number): HistoryRow[] {
  const rows = db
    .prepare("SELECT id, timestamp, entry FROM history ORDER BY id DESC LIMIT ?")
    .all(limit) as Array<{ id: number; timestamp: number; entry: string }>;
  return rows.map((r) => ({ id: r.id, timestamp: r.timestamp, entry: JSON.parse(r.entry) }));
}
