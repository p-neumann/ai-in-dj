// Runs pending migrations in order (CLAUDE.md Section 6.2: "migrations
// are forward-only scripts with a test; writes use transactions
// (atomic)"), tracking progress via schema_meta.
//
// All pending migrations now run inside ONE transaction, not one each.
// Before this change, each migration committed separately: a failure on
// migration 3 of 5 left 1 and 2 applied and the database sitting at a
// version nothing in migrations.ts actually describes. Now a failure
// anywhere rolls the whole attempt back, leaving the database exactly at
// its original version - "all-or-nothing" the way CLAUDE.md's atomicity
// requirement actually means it. (Credit: all-pending-migrations-in-one-
// transaction is the same shape Hannah Sitther's hannah/phase5-desktop
// branch uses in her own migrate.ts; this version keeps this project's own
// schema_meta table and per-call signature instead of adopting her
// schema_migrations design.)
//
// This file works on any already-open connection, including a :memory:
// database that has no file to back up - so it has no opinion about
// backups. openDatabase.ts is where a real file's pending migration is
// preceded by a verified backup (backup.ts) when there's existing data to
// protect; this function only reports what happened (tooNew /
// migrationFailed / migrated / upToDate) so that caller can act on it.

import type Database from "better-sqlite3";
import { ensureMetaTable, getSchemaVersion } from "./schemaMeta.ts";
import { migrations as defaultMigrations, type Migration } from "./migrations.ts";

export { getSchemaVersion } from "./schemaMeta.ts";

export type MigrateResult =
  | { status: "upToDate"; version: number }
  | { status: "migrated"; from: number; to: number }
  | { status: "tooNew"; version: number; maxReadable: number }
  | { status: "migrationFailed"; version: number; failedAt: number; error: string };

// migrationsList is overridable only so tests can inject a migration that
// deliberately throws, to prove the all-or-nothing rollback for real - the
// real app always calls this with the default, real migrations.ts list.
export function runMigrations(
  db: Database.Database,
  migrationsList: readonly Migration[] = defaultMigrations
): MigrateResult {
  ensureMetaTable(db);
  const current = getSchemaVersion(db);
  const target = migrationsList.length ? migrationsList[migrationsList.length - 1].version : 0;

  // CLAUDE.md Section 6.2: "if the database is newer than it understands,
  // it must not write to it." Checked before anything else runs, so a
  // too-new database is never touched at all, not even to try.
  if (current > target) {
    return { status: "tooNew", version: current, maxReadable: target };
  }
  if (current === target) {
    return { status: "upToDate", version: current };
  }

  const pending = migrationsList.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
  let failedAt = 0;

  try {
    const applyAll = db.transaction(() => {
      for (const migration of pending) {
        failedAt = migration.version;
        migration.up(db);
        db.prepare("UPDATE schema_meta SET version = ? WHERE id = 1").run(migration.version);
      }
    });
    applyAll();
  } catch (err) {
    // better-sqlite3 already rolled back everything this transaction did -
    // every migration in `pending`, not just the one that threw - so
    // getSchemaVersion(db) is still `current` here, unchanged.
    return {
      status: "migrationFailed",
      version: current,
      failedAt,
      error: err instanceof Error ? err.message : String(err)
    };
  }

  return { status: "migrated", from: current, to: target };
}
