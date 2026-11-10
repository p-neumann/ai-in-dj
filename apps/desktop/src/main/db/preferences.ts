// Permanent key/value preferences (migration 3). Callers store JSON text as
// the value. Session-only entries are filtered out before they get here.
// Adopted from Ranjish Kumar's ranjish/ccdj-desktop branch, same names and
// shapes, so his main-process code can call it unchanged.

import type Database from "better-sqlite3";

export function getPreference(db: Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM preferences WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function setPreference(db: Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO preferences (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}
