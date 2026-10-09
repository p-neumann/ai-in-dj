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
  },
  {
    // Step 3: library import. A re-import (step 3's only import path for
    // now) replaces the whole table inside one transaction - CLAUDE.md's
    // real revision-based sync (only upserting changes) is later, Phase 5/6
    // work, not built here.
    version: 2,
    up(db) {
      db.exec(`
        CREATE TABLE tracks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          displayName TEXT NOT NULL,
          artist TEXT NOT NULL,
          title TEXT NOT NULL,
          bpm REAL NOT NULL,
          key TEXT NOT NULL,
          genre TEXT NOT NULL,
          year INTEGER NOT NULL,
          playcount INTEGER,
          durationSec INTEGER,
          location TEXT NOT NULL,
          extra TEXT NOT NULL
        );
      `);
    }
  }
];
