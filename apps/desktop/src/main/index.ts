// CCDJ desktop — main process (Phase 5).
//
// This is the only process with OS access. Per CLAUDE.md Section 5.6 it owns
// SQLite, file dialogs, the Serato adapter and the media protocol — none of
// which exist yet. Right now it does one job: open a window.
//
// The webPreferences below are Section 7.5's hardening requirements. They are
// load-bearing security settings, not defaults to tune: test/security.test.js
// fails if any of them is removed.

import { app, BrowserWindow, shell } from "electron";
import { join } from "path";

function createWindow(): void {
  const window = new BrowserWindow({
    // Provisional until Mike confirms D7 (default/minimum window size).
    // CLAUDE.md 8.2: "label any number you pick as provisional".
    width: 1100,
    height: 760,
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

  // Show only once painted, so the window never flashes empty.
  window.on("ready-to-show", () => window.show());

  // The renderer must never navigate itself anywhere, and must never open a
  // window. External links go to the real browser instead (Section 7.5 bars
  // shell.openExternal with arbitrary URLs, so this is restricted to http/https).
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  // macOS keeps the app alive with no windows; re-open on dock click.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
