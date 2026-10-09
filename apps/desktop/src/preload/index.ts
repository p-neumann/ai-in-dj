// CCDJ desktop - preload.
//
// The only channel the renderer has into the main process (CLAUDE.md
// Section 7.5): expose ONLY named, validated functions - never generic
// file access, never raw paths from the renderer.
//
// Step 3 exposes its first two real functions: importing a library CSV,
// and asking what's already saved (so a restart shows the existing
// library instead of looking empty until the DJ re-imports it).

import { contextBridge, ipcRenderer } from "electron";

export interface LibraryImportResult {
  cancelled: boolean;
  imported?: number;
  blankLinesSkipped?: number;
  rowsNeedingAttention?: number;
  totalRows?: number;
  sampleNames?: string[];
}

export interface LibraryStatus {
  count: number;
  sampleNames: string[];
}

const api = {
  library: {
    importFromFile: (): Promise<LibraryImportResult> => ipcRenderer.invoke("library:importFromFile"),
    getStatus: (): Promise<LibraryStatus> => ipcRenderer.invoke("library:getStatus")
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
