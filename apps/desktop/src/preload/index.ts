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
    createSession: (): Promise<BackendSessionResult> => ipcRenderer.invoke("backend:createSession"),
    sendSessionEvent: (sessionId: string, event: Record<string, unknown>): Promise<SessionEventResult> =>
      ipcRenderer.invoke("backend:sendSessionEvent", sessionId, event),
    recommendTrackCheat: (params: {
      seedTrackId: number;
      vibe: number;
      energy: number;
      playCountMode: string;
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
