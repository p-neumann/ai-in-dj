// CCDJ desktop — preload (Phase 5).
//
// The only channel between the renderer and the OS. CLAUDE.md Section 7.5:
// expose ONLY named functions with validated arguments. Never expose generic
// file read/write, shell.openExternal with arbitrary URLs, or command
// execution. File operations must accept only trackIds that the main process
// can map to known library paths — never a raw path from the renderer.
//
// Nothing is exposed yet. Every function added here needs a matching
// ipcMain.handle in src/main/ipc.ts and argument validation on the main side.

import { contextBridge } from "electron";

const api = {
  // Phase 5 will add, in this order:
  //   library.import(), library.search()   -> src/main/library/
  //   prefs.get(), prefs.set()             -> src/main/db/
  //   history.append(), history.list()     -> src/main/db/
  //   showInFinder(trackId)                -> R18, keeps the prototype's name
  //   setAlwaysOnTop(flag)                 -> R18
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("ccdj", api);
  } catch (error) {
    console.error("Failed to expose the ccdj bridge:", error);
  }
} else {
  // Should be unreachable: contextIsolation is forced true in main/index.ts.
  throw new Error("contextIsolation is off — refusing to expose the bridge.");
}

export type CcdjApi = typeof api;
