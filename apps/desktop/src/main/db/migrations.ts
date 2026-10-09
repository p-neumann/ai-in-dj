// Forward-only migrations (CLAUDE.md Section 6.2: "migrations are
// forward-only scripts with a test"). Each entry only ever ADDS - never
// edit a migration that's already shipped; add a new, higher-numbered one
// instead, even to fix a mistake in an earlier one.

import type Database from "better-sqlite3";

export interface Migration {
  version: number;
  up: (db: Database.Database) => void;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE window_bounds (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          x INTEGER,
          y INTEGER,
          width INTEGER NOT NULL,
          height INTEGER NOT NULL
        );
        CREATE TABLE preferences (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    }
  }
];
