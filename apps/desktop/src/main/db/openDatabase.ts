// Opens the real, permanent database file (CLAUDE.md Section 6.2), with
// three real safety behaviors:
//
//   1. Corruption recovery (unchanged from before this change): a file
//      that fails integrity_check on open is renamed aside and replaced
//      with a fresh, working one. The caller is told this happened so it
//      can surface that to the DJ rather than silently losing their saved
//      preferences.
//
//   2. A verified backup BEFORE migrating any file that already holds
//      real data (backup.ts) - CLAUDE.md: "the app saves a versioned
//      snapshot of the database file... and verifies the copy." A
//      brand-new, empty database has nothing yet worth protecting, so no
//      backup is taken for one.
//
//   3. A "too new" guard: if the file's own recorded schema version is
//      higher than this build's migrations go up to, the app refuses to
//      touch it at all - CLAUDE.md: "it must not write to it... or quits
//      with instructions." No restore-a-snapshot UI exists yet (the same
//      honest gap as this file's own corruption handling below, which is
//      still only a console warning, not a dialog) - so the minimal
//      correct behavior for now is throwing a clear error for the caller
//      (main/index.ts) to show and quit on, rather than silently using a
//      database this build doesn't fully understand.
//
// Async because SQLite's own online backup API (used for #2) is
// asynchronous - everything else here was already synchronous and stays
// that way internally.

import Database from "better-sqlite3";
import { existsSync, renameSync } from "node:fs";
import { runMigrations } from "./migrate.ts";
import { createVerifiedBackup } from "./backup.ts";
import { applyConnectionSettings, BUSY_TIMEOUT_MS } from "./connection.ts";
import { getSchemaVersion, userTableNames } from "./schemaMeta.ts";
import { migrations as defaultMigrations, type Migration } from "./migrations.ts";

export class DatabaseTooNewError extends Error {
  readonly version: number;
  readonly maxReadable: number;

  constructor(version: number, maxReadable: number) {
    super(
      `This database's schema version (${version}) is newer than this build understands (up to ${maxReadable}). ` +
        "Refusing to open it for writing - install a newer build of CCDJ, or restore an older backup file " +
        "(ccdj.v<N>.bak, next to the database) that matches this build."
    );
    this.version = version;
    this.maxReadable = maxReadable;
  }
}

export class BackupFailedError extends Error {
  constructor(cause: string) {
    super(`Could not create and verify a backup before migrating - refusing to migrate. Cause: ${cause}`);
  }
}

export class MigrationFailedError extends Error {
  readonly preMigrationBackupPath: string | null;

  constructor(preMigrationBackupPath: string | null, cause: string) {
    super(
      `A migration failed and was rolled back - the database is unchanged from before this attempt. Cause: ${cause}` +
        (preMigrationBackupPath
          ? ` A verified backup from just before this attempt is also at: ${preMigrationBackupPath}`
          : "")
    );
    this.preMigrationBackupPath = preMigrationBackupPath;
  }
}

export interface OpenDatabaseResult {
  db: Database.Database;
  recoveredFromCorruption: boolean;
  backupPath: string | null; // set only when recoveredFromCorruption is true
  preMigrationBackupPath: string | null; // set only when a migration actually ran against existing data
}

function isHealthy(filePath: string): boolean {
  let probe: Database.Database | undefined;
  try {
    probe = new Database(filePath);
    const rows = probe.pragma("integrity_check") as Array<{ integrity_check: string }>;
    return rows.length === 1 && rows[0].integrity_check === "ok";
  } catch {
    return false;
  } finally {
    probe?.close();
  }
}

// migrationsList is overridable only so tests can exercise the tooNew
// guard and the backup-then-rollback path end to end against a real file;
// the real app always calls this with the default.
export async function openDatabase(
  filePath: string,
  migrationsList: readonly Migration[] = defaultMigrations
): Promise<OpenDatabaseResult> {
  let recoveredFromCorruption = false;
  let backupPath: string | null = null;

  if (existsSync(filePath) && !isHealthy(filePath)) {
    backupPath = `${filePath}.corrupt-${Date.now()}`;
    renameSync(filePath, backupPath);
    recoveredFromCorruption = true;
  }

  const db = new Database(filePath, { timeout: BUSY_TIMEOUT_MS });
  try {
    applyConnectionSettings(db);
  } catch (err) {
    db.close();
    throw err;
  }

  const current = getSchemaVersion(db);
  const target = migrationsList.length ? migrationsList[migrationsList.length - 1].version : 0;

  if (current > target) {
    db.close();
    throw new DatabaseTooNewError(current, target);
  }

  let preMigrationBackupPath: string | null = null;
  if (current !== target && current > 0 && userTableNames(db).length > 0) {
    try {
      preMigrationBackupPath = await createVerifiedBackup(db, filePath, current);
    } catch (err) {
      db.close();
      throw new BackupFailedError(err instanceof Error ? err.message : String(err));
    }
  }

  const result = runMigrations(db, migrationsList);
  if (result.status === "migrationFailed") {
    db.close();
    throw new MigrationFailedError(preMigrationBackupPath, result.error);
  }

  return { db, recoveredFromCorruption, backupPath, preMigrationBackupPath };
}
