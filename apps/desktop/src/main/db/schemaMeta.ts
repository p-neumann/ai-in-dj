// schema_meta bookkeeping shared by the migration runner (migrate.ts) and
// the backup verifier (backup.ts). Kept in its own small file so those two
// can both depend on this without depending on each other - migrate.ts
// needs backup.ts (to take a snapshot before migrating) and backup.ts
// needs to read the schema version too, so a shared leaf module avoids a
// circular import.

import type Database from "better-sqlite3";

export function ensureMetaTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.prepare("INSERT OR IGNORE INTO schema_meta (id, version) VALUES (1, 0)").run();
}

// Read-only on purpose: this is called against read-only connections too
// (a backup verification, or a quick "what version is this" check before
// deciding whether to open for writing at all), so it must never try to
// create the table itself. A database that has no schema_meta table yet
// (brand new, or never migrated) reads as version 0 - ensureMetaTable is
// what actually creates it, and only runs on a writable connection as
// part of migrating.
export function getSchemaVersion(db: Database.Database): number {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'")
    .get();
  if (!exists) return 0;
  const row = db.prepare("SELECT version FROM schema_meta WHERE id = 1").get() as
    | { version: number }
    | undefined;
  return row ? row.version : 0;
}

// Every real table except our own bookkeeping one - used to decide "is
// there anything in this database actually worth backing up" and to
// compare row counts when verifying a backup.
export function userTableNames(db: Database.Database): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_meta'"
    )
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function tableRowCounts(db: Database.Database): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of userTableNames(db)) {
    const quoted = `"${name.replace(/"/g, '""')}"`;
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${quoted}`).get() as { n: number };
    counts[name] = row.n;
  }
  return counts;
}
