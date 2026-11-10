// IPC handlers (CLAUDE.md Section 7.5): expose only named, validated
// functions - never generic file access, never a raw path or arbitrary
// command from the renderer.

import { app, ipcMain, dialog, shell, BrowserWindow } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import type Database from "better-sqlite3";
import { importLibraryFromCsvText } from "./library/importLibrary.ts";
import {
  replaceAllTracks,
  countTracks,
  getSampleTracks,
  getTrackLocation,
  getAllTracksForLibrary,
  getTracksByIds
} from "./db/tracks.ts";
import { getPreference, setPreference } from "./db/preferences.ts";
import { appendHistoryEntry, listHistory } from "./db/history.ts";
import {
  buildCsv,
  buildM3u,
  buildTxt,
  buildJson,
  extensionForFormat,
  type ExportFormat,
  type ExportTrack,
  type ExportJsonTrack
} from "./export/buildExportContent.ts";
import {
  checkBackendHealth,
  createBackendSession,
  sendSessionEvent,
  recommendTrackCheatWithAutoSync,
  buildCrateWithAutoSync,
  savePreferences,
  type BackendTrackCheatResult,
  type BackendCrateResult,
  type BackendPreferencesResult,
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
// renderer only ever names a trackId - the real path lookup
// happens here, on the trusted side; a raw path from the renderer is
// never accepted.
export function registerFileIpc(db: Database.Database): void {
  ipcMain.handle("files:showInFinder", (_event, trackId: string) => {
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

// Step 5, piece 8 (Export). Content is built from whatever track
// objects the caller hands in - a single shared path for both screens'
// four file formats, even though the two screens resolve those track
// objects very differently (see registerExportIpc below).
function buildExportContent(
  format: ExportFormat,
  tracks: ExportTrack[],
  jsonTracks: ExportJsonTrack[],
  extraJson: Record<string, unknown>
): string {
  switch (format) {
    case "csv":
      return buildCsv(tracks);
    case "m3u":
      return buildM3u(tracks);
    case "txt":
      return buildTxt(tracks);
    case "json":
      return buildJson(jsonTracks, extraJson, app.getVersion(), new Date().toISOString());
  }
}

async function showExportSaveDialog(
  window: BrowserWindow | null,
  format: ExportFormat,
  defaultBaseName: string,
  content: string
): Promise<{ cancelled: boolean; filePath?: string }> {
  const ext = extensionForFormat(format);
  const dialogOptions: Electron.SaveDialogOptions = {
    title: "Export",
    defaultPath: `${defaultBaseName}.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  };
  const picked = window ? await dialog.showSaveDialog(window, dialogOptions) : await dialog.showSaveDialog(dialogOptions);
  if (picked.canceled || !picked.filePath) return { cancelled: true };
  writeFileSync(picked.filePath, content, "utf8");
  return { cancelled: false, filePath: picked.filePath };
}

// Step 5, piece 8 (Export) - Crate Cheat and Playlist Cheat.
//
// CLAUDE.md 5.4: the renderer never holds a real file location, so a
// browser-style Blob-and-anchor download (the source's own mechanism)
// can't carry a real path, and isn't how Electron delivers a file to
// disk anyway - a native save dialog is the correct replacement
// mechanism for the same content, not a design change.
//
// The two handlers resolve their track data very differently, matching
// a real, confirmed asymmetry in the source rather than smoothing it
// over: Crate Cheat's export looks up each trackId's real location and
// includes it (CSV Location column, M3U path line); Playlist Cheat's
// own export (handleExportSpotify) never included a location at all,
// even though the matched tracks have one - so that screen sends
// already-built track objects straight from the renderer, with no
// trackId resolution step here at all, and location simply stays
// absent for every entry (see buildExportContent.ts's header comment).
export function registerExportIpc(db: Database.Database): void {
  ipcMain.handle(
    "files:exportCrateTracks",
    async (
      event: Electron.IpcMainInvokeEvent,
      params: { format: ExportFormat; trackIds: string[]; prompt: string }
    ): Promise<{ cancelled: boolean; filePath?: string }> => {
      const rows = getTracksByIds(db, params.trackIds);
      const byId = new Map(rows.map((r) => [r.id, r]));
      // Re-ordered to match the crate's own order - getTracksByIds'
      // SQL IN() does not preserve it. An id no longer in the library
      // (e.g. a re-import since the crate was built) is dropped, not
      // guessed at.
      const tracks: ExportTrack[] = [];
      for (const id of params.trackIds) {
        const row = byId.get(id);
        if (!row) continue;
        tracks.push({ name: row.displayName, artist: row.artist, bpm: row.bpm ?? "", key: row.key, location: row.location });
      }
      const jsonTracks: ExportJsonTrack[] = tracks.map((t) => ({ name: t.name, artist: t.artist, bpm: t.bpm, key: t.key }));
      const content = buildExportContent(params.format, tracks, jsonTracks, { prompt: params.prompt.slice(0, 200) });
      const window = BrowserWindow.fromWebContents(event.sender);
      return showExportSaveDialog(window, params.format, "cheatcode_cratecheat", content);
    }
  );

  ipcMain.handle(
    "files:exportPlaylistTracks",
    async (
      event: Electron.IpcMainInvokeEvent,
      params: {
        format: ExportFormat;
        tracks: ExportTrack[];
        allTracksForJson: ExportJsonTrack[];
        extraJson: Record<string, unknown>;
      }
    ): Promise<{ cancelled: boolean; filePath?: string }> => {
      const content = buildExportContent(params.format, params.tracks, params.allTracksForJson, params.extraJson);
      const window = BrowserWindow.fromWebContents(event.sender);
      return showExportSaveDialog(window, params.format, "cheatcode_playlistcheat", content);
    }
  );
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
        seedTrackId: string;
        vibe: number;
        energy: number;
        playCountMode: string;
        sessionId?: string;
        clientSeq?: number;
        expectedStateVersion?: number;
        debugOverride?: { effort?: string };
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

  // Step 5, piece 5 (Crate Cheat) - shares the SAME cached revision as
  // Track Cheat above: it's one synced library per server process, not
  // one per feature, so there's exactly one thing to invalidate when a
  // fresh import happens (library:importFromFile, above).
  ipcMain.handle(
    "backend:buildCrate",
    async (
      _event,
      params: { prompt: string; size: number; crateVibePrompt?: string; playCountMode: string; sessionId?: string; debugOverride?: { effort?: string } }
    ): Promise<BackendCrateResult> => {
      const { result, revision } = await buildCrateWithAutoSync(
        () => getAllTracksForLibrary(db),
        cachedLibraryRevision,
        params
      );
      cachedLibraryRevision = revision;
      return result;
    }
  );

  // Step 5, piece 7 (Settings). Calls the already-built, already-tested
  // PUT /v1/preferences (Phase 4) - nothing new server-side.
  ipcMain.handle(
    "backend:savePreferences",
    async (
      _event,
      params: {
        sessionId: string;
        styleProfile: string;
        doPlay: Array<{ type: string; value: string; persistent: boolean }>;
        doNotPlay: Array<{ type: string; value: string; persistent: boolean }>;
      }
    ): Promise<BackendPreferencesResult> => savePreferences(params)
  );
}
