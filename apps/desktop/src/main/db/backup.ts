// Pre-migration snapshot (CLAUDE.md Section 6.2): "Before running any
// migration, the app saves a versioned snapshot of the database file and
// verifies the copy."
//
// The copy is made with SQLite's online backup API (better-sqlite3's
// db.backup), not a file copy: in WAL mode recent writes can live in the -wal
// file, which a plain copy of the main file would miss.

import Database from "better-sqlite3";
import { renameSync, rmSync } from "node:fs";
import { join, parse } from "node:path";
import { readSchemaVersion, tableRowCounts } from "./schema.ts";

export interface BackupExpectation {
  version: number;
  rowCounts: Record<string, number>;
}

// <dir>/ccdj-db.sqlite at version 3 -> <dir>/ccdj-db.v3.bak
export function backupPathFor(dbPath: string, version: number): string {
  const { dir, name } = parse(dbPath);
  return join(dir, `${name}.v${version}.bak`);
}

// Writes to a temporary name, verifies it, and only then renames it into
// place, so a half-written or unverified copy never carries the .bak name.
// A verified backup of the same version from an earlier attempt is replaced
// by the fresher one. Throws if the backup cannot be made or verified; the
// caller must not migrate in that case.
export async function createVerifiedBackup(
  source: Database,
  dbPath: string,
  version: number
): Promise<string> {
  const finalPath = backupPathFor(dbPath, version);
  const tmpPath = `${finalPath}.tmp`;
  rmSync(tmpPath, { force: true });
  try {
    await source.backup(tmpPath);
    verifyBackup(tmpPath, { version, rowCounts: tableRowCounts(source) });
    renameSync(tmpPath, finalPath);
  } catch (err) {
    rmSync(tmpPath, { force: true });
    throw err;
  }
  return finalPath;
}

// Opens the copy read-only and checks it is a sound database holding the same
// schema version and the same number of rows in every table as the source.
export function verifyBackup(path: string, expected: BackupExpectation): void {
  const copy = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = copy.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") {
      throw new Error(`backup failed integrity_check: ${String(integrity)}`);
    }

    const version = readSchemaVersion(copy);
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
