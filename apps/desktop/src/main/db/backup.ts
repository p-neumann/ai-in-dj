// Verified pre-migration snapshot (CLAUDE.md Section 6.2: "Before running
// any migration, the app saves a versioned snapshot of the database file
// (e.g. ccdj-db.v<old-schema>.bak) and verifies the copy"). Used only when
// a database that already holds real data is about to be migrated - a
// brand-new, empty database has nothing yet worth protecting.
//
// Credit: using SQLite's own online backup API instead of a plain file
// copy - so a recent write still sitting only in the WAL side file (not
// yet folded into the main file) is still captured - and the
// write-to-a-temp-name / verify / only-then-rename pattern (so a
// half-written or bad backup can never be mistaken for a real, restorable
// one) are both adapted from Hannah Sitther's hannah/phase5-desktop branch
// (apps/desktop/src/main/db/backup.ts). The verification checks here
// (integrity_check, schema version, per-table row counts) follow her
// approach; the code is rewritten against this project's own schema_meta
// bookkeeping (schemaMeta.ts) rather than her schema_migrations table.

import Database from "better-sqlite3";
import { copyFileSync, renameSync, rmSync } from "node:fs";
import { join, parse } from "node:path";
import { getSchemaVersion, tableRowCounts } from "./schemaMeta.ts";

export interface BackupExpectation {
  version: number;
  rowCounts: Record<string, number>;
}

// <dir>/ccdj.sqlite at version 2 -> <dir>/ccdj.v2.bak
export function backupPathFor(dbPath: string, version: number): string {
  const { dir, name } = parse(dbPath);
  return join(dir, `${name}.v${version}.bak`);
}

// Throws if the backup cannot be made or verified - the caller
// (openDatabase.ts) must not migrate in that case (CLAUDE.md: "if the
// backup cannot be made and verified, do not write").
export async function createVerifiedBackup(
  source: Database.Database,
  dbPath: string,
  version: number
): Promise<string> {
  const finalPath = backupPathFor(dbPath, version);
  const tmpPath = `${finalPath}.tmp`;
  rmSync(tmpPath, { force: true });
  const expectedRowCounts = tableRowCounts(source);
  try {
    await source.backup(tmpPath);
    verifyBackup(tmpPath, { version, rowCounts: expectedRowCounts });
    renameSync(tmpPath, finalPath);
  } catch (err) {
    rmSync(tmpPath, { force: true });
    throw err;
  }
  return finalPath;
}

// Opens the copy read-only and checks it is a sound database holding the
// same schema version and the same row count in every table that the
// source had at the moment the backup started.
function verifyBackup(path: string, expected: BackupExpectation): void {
  const copy = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = copy.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") {
      throw new Error(`backup failed integrity_check: ${String(integrity)}`);
    }

    const version = getSchemaVersion(copy);
    if (version !== expected.version) {
      throw new Error(`backup has schema version ${version}, expected ${expected.version}`);
    }

    const actual = tableRowCounts(copy);
    const tables = new Set([...Object.keys(actual), ...Object.keys(expected.rowCounts)]);
    for (const table of tables) {
      if (actual[table] !== expected.rowCounts[table]) {
        throw new Error(
          `backup row count mismatch in "${table}": ${actual[table] ?? "missing"} vs ${expected.rowCounts[table] ?? "missing"}`
        );
      }
    }
  } finally {
    copy.close();
  }
}

// Restores a verified backup over the real database file - the production
// counterpart of CLAUDE.md's "offers to restore the most recent compatible
// snapshot." No restore UI exists yet (nothing in the app calls this
// today); it's exercised directly by tests for now so the mechanism is
// proven and ready for that UI without changes. Removes any stray WAL/SHM
// side files first so a restored copy never gets merged with leftover
// writes from the database it's replacing.
export function restoreFromBackup(backupPath: string, dbPath: string): void {
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  copyFileSync(backupPath, dbPath);
}
