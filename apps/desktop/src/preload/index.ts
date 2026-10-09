// CCDJ desktop - preload (Phase 5, step 1).
//
// The only channel the renderer has into the main process (CLAUDE.md
// Section 7.5): expose ONLY named, validated functions - never generic
// file access, never raw paths from the renderer. Nothing is exposed yet;
// that comes with step 4 (the real IPC functions), once there's something
// real (a database, a library) on the other end of the bridge to call.

import { contextBridge } from "electron";

const api = {};

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
