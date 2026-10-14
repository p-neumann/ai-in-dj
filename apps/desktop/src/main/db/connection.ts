// The long-lived connection's settings (docs/decisions/0007 item 5;
// docs/design-notes/startup-database-init.md section 2).
//
// These are set here, on every open, and never inside migrations:
// journal_mode cannot change while a transaction is active, and foreign_keys
// is a no-op inside one. Not yet called at app startup.

import Database from "better-sqlite3";

// better-sqlite3's own default; passed explicitly so the choice is visible.
export const BUSY_TIMEOUT_MS = 5000;

// Opens (or creates) the database at `path` with WAL, synchronous=FULL and
// foreign keys on. Throws if any setting cannot be applied; the connection is
// closed first, so nothing is left holding the file.
export function openDatabase(path: string): Database {
  const db = new Database(path, { timeout: BUSY_TIMEOUT_MS });
  try {
    const mode = db.pragma("journal_mode = WAL", { simple: true });
    if (mode !== "wal") {
      throw new Error(`could not enable WAL journal mode (SQLite reported ${String(mode)})`);
    }
    db.pragma("synchronous = FULL");
    db.pragma("foreign_keys = ON");
  } catch (err) {
    db.close();
    throw err;
  }
  return db;
}
