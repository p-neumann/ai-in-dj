// Permanent key/value preferences (CLAUDE.md Section 6.2: theme, style
// profile, etc. - local SQLite cache). Not wired to any UI yet; that's a
// later step, once the locked-door bridge actually exposes functions.

import type Database from "better-sqlite3";

export function getPreference(db: Database.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM preferences WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function setPreference(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO preferences (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}
