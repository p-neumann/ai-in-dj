// Per-connection pragmas, applied deliberately on every open - set on
// purpose, not left to SQLite/better-sqlite3's own defaults. Must run
// before any transaction starts: SQLite refuses to change journal_mode or
// synchronous inside one, and foreign_keys is a no-op there too.
//
// Credit: this WAL + synchronous=FULL + foreign_keys=ON combination, the
// explicit busy timeout, and specifically the reason for overriding WAL's
// own default come from Hannah Sitther's hannah/phase5-desktop branch
// (apps/desktop/src/main/db/connection.ts). Her own testing found this
// better-sqlite3 build defaults a WAL connection to synchronous=NORMAL:
// faster, but it can lose the most recently committed write(s) if the OS
// crashes or power is lost at the wrong moment. FULL fsyncs on every
// commit instead - slower, but a DJ's saved preferences, imported library
// and session history are not the place to spend that speed. WAL mode
// itself (over SQLite's plain rollback-journal default) is kept because
// the backup step below (backup.ts) relies on it: WAL is what lets a
// read-only connection see a consistent snapshot while this process keeps
// writing.
//
// foreign_keys=ON is forward-looking - no table defined yet (migrations.ts)
// declares a foreign key - but turning it on now means a future migration
// that adds one is enforced from the moment it ships, not whenever someone
// remembers to flip the pragma.

import type Database from "better-sqlite3";

// better-sqlite3's own default busy timeout - passed explicitly so the
// choice is visible in code instead of relying on a default nobody wrote
// down.
export const BUSY_TIMEOUT_MS = 5000;

export function applyConnectionSettings(db: Database.Database): void {
  const mode = db.pragma("journal_mode = WAL", { simple: true });
  if (mode !== "wal") {
    throw new Error(`could not enable WAL journal mode (SQLite reported "${String(mode)}")`);
  }
  db.pragma("synchronous = FULL");
  db.pragma("foreign_keys = ON");
}
