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
  }
];
