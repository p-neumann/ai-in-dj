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

const api = {
  library: {
    importFromFile: (): Promise<LibraryImportResult> => ipcRenderer.invoke("library:importFromFile"),
    getStatus: (): Promise<LibraryStatus> => ipcRenderer.invoke("library:getStatus"),
    getAllTracks: (): Promise<LibraryRow[]> => ipcRenderer.invoke("library:getAllTracks")
  },
  prefs: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke("prefs:get", key),
    set: (key: string, value: string): Promise<boolean> => ipcRenderer.invoke("prefs:set", key, value)
  },
  history: {
    append: (entry: unknown): Promise<boolean> => ipcRenderer.invoke("history:append", entry),
    list: (limit: number): Promise<HistoryRow[]> => ipcRenderer.invoke("history:list", limit)
  },
  // R18 - keeps the prototype's own function names.
  showInFinder: (trackId: number): Promise<ShowInFinderResult> =>
    ipcRenderer.invoke("files:showInFinder", trackId),
  setAlwaysOnTop: (flag: boolean): Promise<boolean> => ipcRenderer.invoke("window:setAlwaysOnTop", flag),
  // Step 5, piece 1 - the pipe to the real backend. The renderer never
  // calls the backend itself; it only ever asks main to do it.
  backend: {
    checkHealth: (): Promise<BackendHealthResult> => ipcRenderer.invoke("backend:checkHealth"),
    createSession: (): Promise<BackendSessionResult> => ipcRenderer.invoke("backend:createSession")
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
