// CCDJ desktop - main process (Phase 5, step 1: just the window).
//
// This is the only process allowed to touch the operating system - real
// files, a real database, Serato - per CLAUDE.md Section 5.6. None of that
// exists yet. This file's only job right now is opening a window safely.
//
// The security settings below (CLAUDE.md Section 7.5) are the actual point
// of this step: the renderer must never be able to read Node modules, touch
// the filesystem, or run arbitrary code, even though it's showing a web
// page. test/security.test.js fails if any of these are weakened.

import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";

function createWindow(): void {
  const window = new BrowserWindow({
    // Default/minimum size: provisional until Mike confirms D7 (CLAUDE.md
    // 8.2 - "label any number you pick as provisional").
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Don't show a blank/white frame while the page is still loading.
  window.once("ready-to-show", () => window.show());

  // The renderer never gets to open its own windows. A link to a real
  // website opens in the user's normal browser instead; anything else is
  // refused outright (CLAUDE.md 7.5: no arbitrary shell.openExternal).
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  // macOS keeps an app running with no open windows; clicking the dock
  // icon should reopen one instead of doing nothing.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
