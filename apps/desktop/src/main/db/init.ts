// Opens the app's database at startup (docs/decisions/0007;
// docs/design-notes/startup-database-init.md sections 3 and 4). Not yet
// called at app startup.
//
// Order of operations:
//   1. Create the folder.
//   2. Bring the file up to date with migrate(); any other outcome is passed
//      straight through and no connection is opened.
//   3. Open the long-lived connection with openDatabase().
//
// Every outcome is returned rather than thrown, so the caller can handle all
// of them in one place (error box, then quit). Nothing here deletes or
// overwrites the database file. No Electron imports: tests pass temporary
// folders, and only index.ts will pass the real one.

import type Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openDatabase } from "./connection.ts";
import { migrate, type MigrateOptions, type MigrateResult } from "./migrate.ts";
import { MIGRATIONS, type Migration } from "./migrations.ts";

export const DB_FILE_NAME = "ccdj-db.sqlite";

export type InitResult =
  | {
      status: "ready";
      db: Database;
      path: string;
      migration: Extract<MigrateResult, { status: "migrated" | "upToDate" }>;
      sqliteVersion: string;
    }
  | {
      status: "tooNew" | "backupFailed" | "migrationFailed";
      path: string;
      migration: Exclude<MigrateResult, { status: "migrated" | "upToDate" }>;
    }
  | { status: "error"; stage: "createFolder" | "migrate" | "open"; path: string; error: string };

// On "ready" the caller owns the returned connection and must close it.
export async function initDatabase(
  dir: string,
  migrations: readonly Migration[] = MIGRATIONS,
  options: MigrateOptions = {}
): Promise<InitResult> {
  const path = join(dir, DB_FILE_NAME);

  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    return { status: "error", stage: "createFolder", path, error: errorMessage(err) };
  }

  let migration: MigrateResult;
  try {
    migration = await migrate(path, migrations, options);
  } catch (err) {
    // E.g. a damaged file or one that is not a database. Left as it is.
    return { status: "error", stage: "migrate", path, error: errorMessage(err) };
  }
  if (migration.status !== "migrated" && migration.status !== "upToDate") {
    return { status: migration.status, path, migration };
  }

  let db: Database | undefined;
  try {
    db = openDatabase(path);
    const row = db.prepare("SELECT sqlite_version() AS v").get() as { v: string };
    return { status: "ready", db, path, migration, sqliteVersion: row.v };
  } catch (err) {
    // openDatabase() closes its own connection when it throws; close ours if
    // the version query was what failed. A failed close must not replace the
    // structured error.
    try {
      db?.close();
    } catch {
      // The original error is the one worth reporting.
    }
    return { status: "error", stage: "open", path, error: errorMessage(err) };
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
