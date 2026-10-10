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

export function appendHistoryEntry(db: Database.Database, entry: unknown): void {
  db.prepare("INSERT INTO history (timestamp, entry) VALUES (?, ?)").run(Date.now(), JSON.stringify(entry));
}

export function listHistory(db: Database.Database, limit: number): HistoryRow[] {
  const rows = db
    .prepare("SELECT id, timestamp, entry FROM history ORDER BY id DESC LIMIT ?")
    .all(limit) as Array<{ id: number; timestamp: number; entry: string }>;
  return rows.map((r) => ({ id: r.id, timestamp: r.timestamp, entry: JSON.parse(r.entry) }));
}
