// Migration runner (CLAUDE.md Section 6.2). Not yet called at app startup.
//
// Order of operations:
//   1. Read the database's schema version, read-only.
//   2. Newer than this build can read -> refuse, write nothing.
//   3. Already current -> do nothing.
//   4. Existing data -> make and verify a backup first; if that fails, stop.
//   5. Apply every pending migration plus its version row in ONE transaction,
//      so a failure anywhere leaves the database exactly at its old version.

import Database from "better-sqlite3";
import { existsSync, rmSync } from "node:fs";
import { createVerifiedBackup } from "./backup.ts";
import { MIGRATIONS, type Migration } from "./migrations.ts";
import { readSchemaVersion, userTableNames, VERSION_TABLE } from "./schema.ts";

export type MigrateResult =
  | { status: "upToDate"; version: number }
  | { status: "migrated"; from: number; to: number; backupPath: string | null }
  | { status: "tooNew"; version: number; maxReadable: number }
  | { status: "backupFailed"; version: number; error: string }
  | {
      status: "migrationFailed";
      version: number;
      failedAt: number;
      error: string;
      backupPath: string | null;
    };

export interface MigrateOptions {
  // Replaceable so tests can force a backup failure.
  backup?: (source: Database, dbPath: string, version: number) => Promise<string>;
}

export function assertValidMigrations(migrations: readonly Migration[]): void {
  if (migrations.length === 0) throw new Error("migration list is empty");
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`migration versions must be contiguous from 1; position ${i} has ${m.version}`);
    }
    if (!m.name.trim()) throw new Error(`migration ${m.version} has no name`);
  });
}

export async function migrate(
  dbPath: string,
  migrations: readonly Migration[] = MIGRATIONS,
  options: MigrateOptions = {}
): Promise<MigrateResult> {
  assertValidMigrations(migrations);
  const target = migrations[migrations.length - 1].version;
  const makeBackup = options.backup ?? createVerifiedBackup;

  const existed = existsSync(dbPath);
  let current = 0;
  let backupPath: string | null = null;

  if (existed) {
    const ro = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      current = readSchemaVersion(ro);
      if (current > target) return { status: "tooNew", version: current, maxReadable: target };
      if (current === target) return { status: "upToDate", version: current };
      if (userTableNames(ro).length > 0) {
        try {
          backupPath = await makeBackup(ro, dbPath, current);
        } catch (err) {
          return { status: "backupFailed", version: current, error: errorMessage(err) };
        }
      }
    } finally {
      ro.close();
    }
  }

  const pending = migrations.filter((m) => m.version > current);
  const db = new Database(dbPath);
  let applying = 0;
  try {
    db.transaction(() => {
      const record = () =>
        db.prepare(`INSERT INTO ${VERSION_TABLE} (version, name, applied_at) VALUES (?, ?, ?)`);
      for (const m of pending) {
        applying = m.version;
        m.up(db);
        record().run(m.version, m.name, new Date().toISOString());
      }
    })();
  } catch (err) {
    db.close();
    // A brand-new file that failed its first migration holds nothing worth
    // keeping; remove it so the next launch starts clean.
    if (!existed) rmSync(dbPath, { force: true });
    return {
      status: "migrationFailed",
      version: current,
      failedAt: applying,
      error: errorMessage(err),
      backupPath
    };
  }
  db.close();
  return { status: "migrated", from: current, to: target, backupPath };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
