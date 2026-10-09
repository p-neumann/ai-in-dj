// Phase 5 step 3: narrow, named IPC functions pulled forward from step 4,
// just enough to make library import visible in the real window.
// CLAUDE.md Section 7.5: expose only named, validated functions - the
// import handler takes no renderer-supplied path at all; the file comes
// from a native OS dialog the main process controls, never a raw path
// the renderer could hand in.

import { ipcMain, dialog, BrowserWindow } from "electron";
import { readFileSync } from "node:fs";
import type Database from "better-sqlite3";
import { importLibraryFromCsvText } from "./library/importLibrary.ts";
import { replaceAllTracks, countTracks, getSampleTrackNames } from "./db/tracks.ts";

function buildImportSummary(db: Database.Database, imported: ReturnType<typeof importLibraryFromCsvText>) {
  const blankLinesSkipped = imported.rejected.filter((r) => r.isBlankLine).length;
  const rowsNeedingAttention = imported.rejected.length - blankLinesSkipped;
  return {
    imported: imported.tracks.length,
    blankLinesSkipped,
    rowsNeedingAttention,
    totalRows: imported.totalRows,
    sampleNames: getSampleTrackNames(db, 5)
  };
}

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
    return { count, sampleNames: count > 0 ? getSampleTrackNames(db, 5) : [] };
  });
}
