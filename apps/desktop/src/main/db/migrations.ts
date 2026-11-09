// The local database's schema history (CLAUDE.md Section 6.2).
//
// Rules for this list:
// - Forward-only. Never edit or remove a migration once it has shipped; add a
//   new one with the next version number.
// - Expand -> contract. A release may only ADD tables/columns the previous
//   release safely ignores. Removing or renaming ships in a later release.
// - Versions are contiguous from 1. The last entry is the highest schema
//   version this build can read; a newer database is refused, not written.
// - All pending migrations run in one transaction, so statements that SQLite
//   refuses inside a transaction (e.g. PRAGMA journal_mode) do not belong here.

import type Database from "better-sqlite3";
import { VERSION_TABLE } from "./schema.ts";

export interface Migration {
  readonly version: number;
  readonly name: string;
  up(db: Database): void;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "create schema_migrations",
    up(db) {
      db.exec(`
        CREATE TABLE ${VERSION_TABLE} (
          version    INTEGER PRIMARY KEY,
          name       TEXT NOT NULL,
          applied_at TEXT NOT NULL
        )
      `);
    }
  },
  {
    // Table and functions adopted from Ranjish Kumar's ranjish/ccdj-desktop
    // branch (his migration 1), so his screens can run on this database unchanged.
    version: 2,
    name: "create window_bounds",
    up(db) {
      db.exec(`
        CREATE TABLE window_bounds (
          id     INTEGER PRIMARY KEY CHECK (id = 1),
          x      INTEGER,
          y      INTEGER,
          width  INTEGER NOT NULL,
          height INTEGER NOT NULL
        )
      `);
    }
  },
  {
    // Adopted from Ranjish Kumar's branch (his migration 1). Permanent
    // preferences only; session-only entries never reach this table.
    version: 3,
    name: "create preferences",
    up(db) {
      db.exec(`
        CREATE TABLE preferences (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
    }
  }
];
