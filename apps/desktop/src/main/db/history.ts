// Session history (migration 4): Mike's evaluation dataset (CLAUDE.md 6.5).
// Each entry is stored whole, as JSON, in the shape the caller gives it.
// appendHistoryEntry and listHistory are adopted from Ranjish Kumar's
// ranjish/ccdj-desktop branch, same names and shapes. updateHistoryEntry is
// new: the prototype changes an entry after it is written (logOutcome sets a
// result's outcome on drag or vote; setEntryNote adds a note).
// No size cap: the prototype's 300 was a storage limit, not a retention
// policy (R23, Mike to decide).

import type Database from "better-sqlite3";

export interface HistoryRow {
  id: number;
  timestamp: number;
  entry: unknown;
}

// The entry's own "id" field, when it has a string one.
function entryIdOf(entry: unknown): string | null {
  if (entry && typeof entry === "object" && "id" in entry) {
    const id = (entry as { id: unknown }).id;
    if (typeof id === "string" && id !== "") return id;
  }
  return null;
}

export function appendHistoryEntry(db: Database.Database, entry: unknown): void {
  db.prepare("INSERT INTO history (timestamp, entry, entry_id) VALUES (?, ?, ?)").run(
    Date.now(),
    JSON.stringify(entry),
    entryIdOf(entry)
  );
}

export function listHistory(db: Database.Database, limit: number): HistoryRow[] {
  const rows = db
    .prepare("SELECT id, timestamp, entry FROM history ORDER BY id DESC LIMIT ?")
    .all(limit) as Array<{ id: number; timestamp: number; entry: string }>;
  return rows.map((r) => ({ id: r.id, timestamp: r.timestamp, entry: JSON.parse(r.entry) }));
}

// Replaces the saved entry whose own id is entryId. Returns false, and
// changes nothing, if there is none: an update never creates an entry.
export function updateHistoryEntry(db: Database.Database, entryId: string, entry: unknown): boolean {
  const result = db
    .prepare("UPDATE history SET entry = ? WHERE entry_id = ?")
    .run(JSON.stringify(entry), entryId);
  return result.changes > 0;
}
