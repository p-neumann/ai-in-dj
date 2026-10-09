// Runs pending migrations in order, each inside its own transaction
// (CLAUDE.md Section 6.2: "writes use transactions (atomic)"), and tracks
// how far along a given database file is via schema_meta. Safe to call on
// every app start - it only applies migrations newer than what's already
// been applied, including on a brand-new, empty file.

import type Database from "better-sqlite3";
import { migrations } from "./migrations.ts";

function ensureMetaTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.prepare("INSERT OR IGNORE INTO schema_meta (id, version) VALUES (1, 0)").run();
}

export function getSchemaVersion(db: Database.Database): number {
  ensureMetaTable(db);
  const row = db.prepare("SELECT version FROM schema_meta WHERE id = 1").get() as { version: number };
  return row.version;
}

export function runMigrations(db: Database.Database): void {
  ensureMetaTable(db);
  const current = getSchemaVersion(db);
  const pending = migrations.filter((m) => m.version > current).sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    const applyOne = db.transaction(() => {
      migration.up(db);
      db.prepare("UPDATE schema_meta SET version = ? WHERE id = 1").run(migration.version);
    });
    applyOne();
  }
}
