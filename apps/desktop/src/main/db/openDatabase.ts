// Opens the real, permanent database file, with a safety net (CLAUDE.md
// Section 6.2: "On corrupt DB: back up the file, rebuild from last good
// backup or re-import, tell the user"). No backup-restore chain exists yet
// (that needs real backup history, which isn't built this step) - the
// honest, minimal safe behavior right now is: never crash the app over a
// damaged database file, move the damaged file aside instead, and start a
// fresh, working one. The caller is told this happened so it can surface
// that to the DJ rather than silently losing their saved preferences.

import Database from "better-sqlite3";
import { existsSync, renameSync } from "node:fs";
import { runMigrations } from "./migrate.ts";

export interface OpenDatabaseResult {
  db: Database.Database;
  recoveredFromCorruption: boolean;
  backupPath: string | null;
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

export function openDatabase(filePath: string): OpenDatabaseResult {
  let recoveredFromCorruption = false;
  let backupPath: string | null = null;

  if (existsSync(filePath) && !isHealthy(filePath)) {
    backupPath = `${filePath}.corrupt-${Date.now()}`;
    renameSync(filePath, backupPath);
    recoveredFromCorruption = true;
  }

  const db = new Database(filePath);
  runMigrations(db);
  return { db, recoveredFromCorruption, backupPath };
}
