// CCDJ desktop - preload.
//
// The only channel the renderer has into the main process (CLAUDE.md
// Section 7.5): expose ONLY named, validated functions - never generic
// file access, never raw paths from the renderer.

import { contextBridge, ipcRenderer } from "electron";

export interface SampleTrack {
  id: number;
  displayName: string;
}

export interface LibraryImportResult {
  cancelled: boolean;
  imported?: number;
  blankLinesSkipped?: number;
  rowsNeedingAttention?: number;
  totalRows?: number;
  sampleTracks?: SampleTrack[];
}

// Step 5, piece 16 - the drag-and-drop import path. Never "cancelled"
// the way the dialog path can be: by the time this is called, the
// renderer already has the dropped file's text in hand.
export interface ImportSummary {
  imported: number;
  blankLinesSkipped: number;
  rowsNeedingAttention: number;
  totalRows: number;
  sampleTracks: SampleTrack[];
}

export interface LibraryStatus {
  count: number;
  sampleTracks: SampleTrack[];
}

export interface HistoryRow {
  id: number;
  timestamp: number;
  entry: unknown;
}

export interface ShowInFinderResult {
  ok: boolean;
  reason?: string;
}

export interface BackendHealthResult {
  reachable: boolean;
  error?: string;
}

export interface BackendSessionResult {
  ok: boolean;
  sessionId?: string;
  chainId?: string;
  stateVersion?: number;
  error?: string;
}

export interface LibraryRow {
  id: number;
  displayName: string;
  artist: string;
  title: string;
  bpm: number;
  key: string;
  genre: string;
  year: number;
  playcount: number | null;
}

// Step 5, piece 9 (Duplicate Finder).
export interface DuplicateScanRow {
  id: number;
  displayName: string;
  bpm: number;
  key: string;
  playcount: number | null;
  durationSec: number | null;
  location: string;
}

export interface PermanentlyDeleteResult {
  deleted: number;
}

export interface TrackCheatResult {
  ok: boolean;
  results?: Array<{ trackId: number; name: string; bpm: number; key: string; camp: string | null; lane: string | null }>;
  candidatePoolSize?: number;
  requested?: number;
  returned?: number;
  fallbackDepth?: number;
  simulated?: boolean;
  error?: string;
  chain?: { chainId: string; depth: number } | null;
  trigger?: string | null;
  mode?: string;
  stateVersion?: number | null;
  superseded?: boolean;
  // docs/decisions/0017 - the effort testing control's own diagnostics.
  effortUsed?: string | null;
  retried?: boolean;
  retryReason?: string | null;
}

// Step 5, piece 4: one session event per DJ action (seedDropped, vote,
// ...). The renderer owns clientSeq/stateVersion itself (plain numbers,
// not secrets) and sends them here; the server derives all chain/bridge/
// drift/exclusion state from the sequence of events, not from this result.
export interface SessionEventResult {
  ok: boolean;
  accepted?: boolean;
  stateVersion?: number;
  duplicate?: boolean;
  error?: string;
}

// Step 5, piece 5 (Crate Cheat).
export interface CrateResult {
  ok: boolean;
  results?: Array<{ trackId: number; name: string; bpm: number; key: string }>;
  requested?: number;
  returned?: number;
  candidatePoolSize?: number;
  shortfallReason?: string | null;
  knowledgeCallMade?: string | null;
  simulated?: boolean;
  error?: string;
  // docs/decisions/0017 - the effort testing control's own diagnostics.
  effortUsed?: string | null;
  retried?: boolean;
  retryReason?: string | null;
}

export interface PreferencesResult {
  ok: boolean;
  enrichmentStatus?: string;
  error?: string;
}

// Step 5, piece 8 (Export).
export type ExportFormat = "csv" | "m3u" | "json" | "txt";

export interface ExportTrackInput {
  name: string;
  artist: string;
  bpm: number | string;
  key: string;
  location?: string;
}

export interface ExportJsonTrackInput {
  name: string;
  artist: string;
  bpm: number | string;
  key: string;
  isSource?: boolean;
  isMatch?: boolean;
  noMatch?: boolean;
}

export interface ExportResult {
  cancelled: boolean;
  filePath?: string;
}

const api = {
  library: {
    importFromFile: (): Promise<LibraryImportResult> => ipcRenderer.invoke("library:importFromFile"),
    // Real drag-and-drop (piece 16): the renderer reads the dropped
    // file's own text (File.text()) and sends that - never a path.
    importFromText: (text: string): Promise<ImportSummary> => ipcRenderer.invoke("library:importFromText", text),
    getStatus: (): Promise<LibraryStatus> => ipcRenderer.invoke("library:getStatus"),
    getAllTracks: (): Promise<LibraryRow[]> => ipcRenderer.invoke("library:getAllTracks"),
    // Step 5, piece 9 (Duplicate Finder).
    getTracksForDuplicateScan: (): Promise<DuplicateScanRow[]> => ipcRenderer.invoke("library:getTracksForDuplicateScan"),
    // The deliberate "Apply Permanently" action only - never called by
    // the default, session-only "Send to Recycle Bin" path.
    permanentlyDeleteTracks: (trackIds: number[]): Promise<PermanentlyDeleteResult> =>
      ipcRenderer.invoke("library:permanentlyDeleteTracks", trackIds),
    // Piece 16 - source's Clear Library, ported literally (no
    // confirmation prompt here; App.tsx's onClearLibrary callback is
    // what also clears the crate, matching his setLibrary([])+setPlaylist([])).
    clear: (): Promise<PermanentlyDeleteResult> => ipcRenderer.invoke("library:clear")
  },
  prefs: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke("prefs:get", key),
    set: (key: string, value: string): Promise<boolean> => ipcRenderer.invoke("prefs:set", key, value)
  },
  history: {
    // Piece 20 - returns the new row's real id now, not just `true`.
    append: (entry: unknown): Promise<number> => ipcRenderer.invoke("history:append", entry),
    update: (id: number, patch: Record<string, unknown>): Promise<boolean> => ipcRenderer.invoke("history:update", id, patch),
    list: (limit: number): Promise<HistoryRow[]> => ipcRenderer.invoke("history:list", limit)
  },
  // R18 - keeps the prototype's own function names.
  showInFinder: (trackId: number): Promise<ShowInFinderResult> =>
    ipcRenderer.invoke("files:showInFinder", trackId),
  setAlwaysOnTop: (flag: boolean): Promise<boolean> => ipcRenderer.invoke("window:setAlwaysOnTop", flag),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
  // Step 5, piece 1 - the pipe to the real backend. The renderer never
  // calls the backend itself; it only ever asks main to do it.
  backend: {
    checkHealth: (): Promise<BackendHealthResult> => ipcRenderer.invoke("backend:checkHealth"),
    createSession: (): Promise<BackendSessionResult> => ipcRenderer.invoke("backend:createSession"),
    sendSessionEvent: (sessionId: string, event: Record<string, unknown>): Promise<SessionEventResult> =>
      ipcRenderer.invoke("backend:sendSessionEvent", sessionId, event),
    recommendTrackCheat: (params: {
      seedTrackId: number;
      vibe: number;
      energy: number;
      playCountMode: string;
      vibePromptText?: string;
      sessionId?: string;
      clientSeq?: number;
      expectedStateVersion?: number;
      debugOverride?: { effort?: string };
    }): Promise<TrackCheatResult> => ipcRenderer.invoke("backend:recommendTrackCheat", params),
    buildCrate: (params: {
      prompt: string;
      size: number;
      crateVibePrompt?: string;
      playCountMode: string;
      debugOverride?: { effort?: string };
      sessionId?: string;
    }): Promise<CrateResult> => ipcRenderer.invoke("backend:buildCrate", params),
    savePreferences: (params: {
      sessionId: string;
      styleProfile: string;
      doPlay: Array<{ type: string; value: string; persistent: boolean }>;
      doNotPlay: Array<{ type: string; value: string; persistent: boolean }>;
    }): Promise<PreferencesResult> => ipcRenderer.invoke("backend:savePreferences", params)
  },
  // Step 5, piece 8 (Export). Two shapes, not one, because the two
  // screens resolve their track data differently (see ipc.ts's
  // registerExportIpc) - Crate Cheat sends only trackIds and lets main
  // resolve real location data; Playlist Cheat sends already-built
  // track objects straight through, with no location ever (a real
  // asymmetry in the source, not something invented here).
  export: {
    exportCrateTracks: (params: { format: ExportFormat; trackIds: number[]; prompt: string; reasons?: Record<number, string> }): Promise<ExportResult> =>
      ipcRenderer.invoke("files:exportCrateTracks", params),
    exportPlaylistTracks: (params: {
      format: ExportFormat;
      tracks: ExportTrackInput[];
      allTracksForJson: ExportJsonTrackInput[];
      extraJson: Record<string, unknown>;
    }): Promise<ExportResult> => ipcRenderer.invoke("files:exportPlaylistTracks", params)
  }
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("ccdj", api);
  } catch (error) {
    console.error("Failed to expose the ccdj bridge:", error);
  }
} else {
  // Should be unreachable - main/index.ts always forces contextIsolation on.
  throw new Error("contextIsolation is off - refusing to expose the bridge.");
}

export type CcdjApi = typeof api;
