// IPC handlers (CLAUDE.md Section 7.5): expose only named, validated
// functions - never generic file access, never a raw path or arbitrary
// command from the renderer.

import { ipcMain, dialog, shell, BrowserWindow } from "electron";
import { readFileSync } from "node:fs";
import type Database from "better-sqlite3";
import { importLibraryFromCsvText } from "./library/importLibrary.ts";
import { replaceAllTracks, countTracks, getSampleTracks, getTrackLocation, getAllTracksForLibrary } from "./db/tracks.ts";
import { getPreference, setPreference } from "./db/preferences.ts";
import { appendHistoryEntry, listHistory } from "./db/history.ts";
import {
  checkBackendHealth,
  createBackendSession,
  sendSessionEvent,
  recommendTrackCheatWithAutoSync,
  type BackendTrackCheatResult,
  type SessionEventResult
} from "./backendClient.ts";

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

// Step 5, piece 3 (docs/decisions/0009): the backend forgets its synced
// library on restart (in-memory only, same as session state) - so a
// cached revision from an earlier run can go stale at any time, not just
// after a new import. Module-level on purpose: shared between the
// import handler (which invalidates it) and the recommend handler
// (which syncs/retries using it) below.
let cachedLibraryRevision: number | null = null;

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
    // The content just changed - any cached revision now describes the
    // OLD library. Forces a fresh sync before the next recommend call.
    cachedLibraryRevision = null;

    return { cancelled: false as const, ...buildImportSummary(db, imported) };
  });

  // Lets the renderer show what's already saved on startup, instead of
  // looking empty until the DJ re-imports a file that was already there.
  ipcMain.handle("library:getStatus", () => {
    const count = countTracks(db);
    return { count, sampleTracks: count > 0 ? getSampleTracks(db, 5) : [] };
  });

  // Step 5, piece 2 - the real Library screen. One fetch of everything;
  // the renderer searches/filters in its own memory from there (see
  // db/tracks.ts's getAllTracksForLibrary for the measured reasoning).
  ipcMain.handle("library:getAllTracks", () => getAllTracksForLibrary(db));
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

// Step 5, piece 1 - the pipe to the real backend. No AI call lives here;
// this only proves the connection itself works.
// Step 5, piece 3 - Track Cheat. docs/decisions/0009: the actual
// sync-if-needed / resync-and-retry-once-on-LIBRARY_OUT_OF_SYNC logic
// lives in backendClient.ts's recommendTrackCheatWithAutoSync (so it can
// be unit-tested without a real IPC/Electron environment). This handler
// only owns the one piece that's genuinely tied to app lifetime: where
// the cached revision lives between calls.
export function registerBackendIpc(db: Database.Database): void {
  ipcMain.handle("backend:checkHealth", () => checkBackendHealth());
  ipcMain.handle("backend:createSession", () => createBackendSession());

  // Step 5, piece 4 (daisy-chain/votes): the renderer owns the session's
  // sessionId/clientSeq/stateVersion bookkeeping (plain numbers/ids, not
  // secrets - same thing the manual-test harness already does) and sends
  // one event per DJ action through this handler. This handler itself
  // knows nothing about chain/bridge/drift - that derivation is entirely
  // server-side (Phase 4, sessionEvents.js); it only relays the event.
  ipcMain.handle(
    "backend:sendSessionEvent",
    (_event, sessionId: string, event: Record<string, unknown>): Promise<SessionEventResult> =>
      sendSessionEvent(sessionId, event)
  );

  ipcMain.handle(
    "backend:recommendTrackCheat",
    async (
      _event,
      params: {
        seedTrackId: number;
        vibe: number;
        energy: number;
        playCountMode: string;
        sessionId?: string;
        clientSeq?: number;
        expectedStateVersion?: number;
      }
    ): Promise<BackendTrackCheatResult> => {
      const { result, revision } = await recommendTrackCheatWithAutoSync(
        () => getAllTracksForLibrary(db),
        cachedLibraryRevision,
        params
      );
      cachedLibraryRevision = revision;
      return result;
    }
  );
}
