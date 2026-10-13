// Read-only inspection helpers shared by the migration runner and the backup
// verifier. Nothing here writes to a database.

import type Database from "better-sqlite3";

// One version for the whole database file (docs/decisions/0006).
export const VERSION_TABLE = "schema_migrations";

export function userTableNames(db: Database): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all() as { name: string }[];
  return rows.map((row) => row.name);
}

// 0 means "no migrations applied": a new file, or one CCDJ never migrated.
export function readSchemaVersion(db: Database): number {
  if (!userTableNames(db).includes(VERSION_TABLE)) return 0;
  const row = db.prepare(`SELECT MAX(version) AS v FROM ${VERSION_TABLE}`).get() as {
    v: number | null;
  };
  return row.v ?? 0;
}

export function tableRowCounts(db: Database): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of userTableNames(db)) {
    const quoted = `"${name.replace(/"/g, '""')}"`;
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${quoted}`).get() as { n: number };
    counts[name] = row.n;
  }
  return counts;
}
