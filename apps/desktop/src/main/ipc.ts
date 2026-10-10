// IPC handlers (CLAUDE.md Section 7.5): expose only named, validated
// functions - never generic file access, never a raw path or arbitrary
// command from the renderer.

import { ipcMain, dialog, shell, BrowserWindow } from "electron";
import { readFileSync } from "node:fs";
import type Database from "better-sqlite3";
import { importLibraryFromCsvText } from "./library/importLibrary.ts";
import { replaceAllTracks, countTracks, getSampleTracks, getTrackLocation } from "./db/tracks.ts";
import { getPreference, setPreference } from "./db/preferences.ts";
import { appendHistoryEntry, listHistory } from "./db/history.ts";

function buildImportSummary(db: Database.Database, imported: ReturnType<typeof importLibraryFromCsvText>) {
  const blankLinesSkipped = imported.rejected.filter((r) => r.isBlankLine).length;
  const rowsNeedingAttention = imported.rejected.length - blankLinesSkipped;
  return {
    imported: imported.tracks.length,
    blankLinesSkipped,
    rowsNeedingAttention,
    totalRows: imported.totalRows,
    sampleTracks: getSampleTracks(db, 5)
  };
}

// Step 3 (library import) - taking no renderer-supplied path at all; the
// file comes from a native OS dialog the main process controls.
export function registerLibraryIpc(db: Database.Database): void {
  ipcMain.handle("library:importFromFile", async (event: Electron.IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions: Electron.OpenDialogOptions = {
      title: "Import Serato library CSV",
      filters: [{ name: "CSV files", extensions: ["csv"] }],
      properties: ["openFile"]
    };
    const picked = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (picked.canceled || picked.filePaths.length === 0) {
      return { cancelled: true as const };
    }

    const text = readFileSync(picked.filePaths[0], "utf8");
    const imported = importLibraryFromCsvText(text);
    // One transaction, whole-table replace (db/tracks.ts) - re-importing
    // the same file twice must leave the count unchanged, never doubled.
    replaceAllTracks(db, imported.tracks);

    return { cancelled: false as const, ...buildImportSummary(db, imported) };
  });

  // Lets the renderer show what's already saved on startup, instead of
  // looking empty until the DJ re-imports a file that was already there.
  ipcMain.handle("library:getStatus", () => {
    const count = countTracks(db);
    return { count, sampleTracks: count > 0 ? getSampleTracks(db, 5) : [] };
  });
}

// Step 4 - preferences: a permanent setting survives a restart.
export function registerPreferencesIpc(db: Database.Database): void {
  ipcMain.handle("prefs:get", (_event, key: string) => getPreference(db, key));
  ipcMain.handle("prefs:set", (_event, key: string, value: string) => {
    setPreference(db, key, value);
    return true;
  });
}

// Step 4 - history: a generic log of "this happened" entries. The real
// Track Cheat shape gets written here once it exists (step 5).
export function registerHistoryIpc(db: Database.Database): void {
  ipcMain.handle("history:append", (_event, entry: unknown) => {
    appendHistoryEntry(db, entry);
    return true;
  });
  ipcMain.handle("history:list", (_event, limit: number) => listHistory(db, limit));
}

// Step 4 - showInFinder (R18, keeps the prototype's own name). The
// renderer only ever says "show me track #N" - the real path lookup
// happens here, on the trusted side; a raw path from the renderer is
// never accepted.
export function registerFileIpc(db: Database.Database): void {
  ipcMain.handle("files:showInFinder", (_event, trackId: number) => {
    const location = getTrackLocation(db, trackId);
    if (!location) return { ok: false as const, reason: "unknown trackId" };
    try {
      shell.showItemInFolder(location);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, reason: error instanceof Error ? error.message : String(error) };
    }
  });
}

// Step 4 - setAlwaysOnTop (R18, keeps the prototype's own name).
export function registerWindowIpc(): void {
  ipcMain.handle("window:setAlwaysOnTop", (event: Electron.IpcMainInvokeEvent, flag: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.setAlwaysOnTop(!!flag);
    return window?.isAlwaysOnTop() ?? false;
  });
}
