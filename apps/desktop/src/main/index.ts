// CCDJ desktop - main process.
//
// This is the only process allowed to touch the operating system - real
// files, a real database, Serato - per CLAUDE.md Section 5.6.
//
// Step 1 (done): a window that opens safely (Section 7.5 hardening).
// Step 2 (done): a real, permanent local database, proven by the window
// remembering its own size/position across restarts.
// Step 3 (done): real library import.
// Step 4 (this file now): the rest of the locked-door bridge - prefs,
// history, showInFinder, setAlwaysOnTop (ipc.ts) - plus a single-instance
// lock, added after a real second-instance run showed two copies fighting
// over the same GPU cache folder, which would also mean two copies
// fighting over the same SQLite file. Only one copy of this app may ever
// run at once; a second launch just focuses the first instead of opening
// a second window.

import { app, BrowserWindow, dialog, shell } from "electron";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { openDatabase } from "./db/openDatabase.ts";
import { getWindowBounds, saveWindowBounds } from "./db/windowBounds.ts";
import {
  registerLibraryIpc,
  registerPreferencesIpc,
  registerHistoryIpc,
  registerFileIpc,
  registerWindowIpc,
  registerBackendIpc,
  registerExportIpc
} from "./ipc.ts";

// Must happen before anything else touches the filesystem (the database,
// the GPU cache) - that's the whole point.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

// Step 5: BACKEND_URL/BACKEND_DEV_TOKEN for backendClient.ts. Missing
// .env is fine - backendClient.ts falls back to localhost:8080 with no
// token, which is already the common dev default.
try {
  process.loadEnvFile(join(__dirname, "../../.env"));
} catch {
  // No .env present - fall back to backendClient.ts's own defaults.
}

// Provisional defaults until Mike confirms D7 (CLAUDE.md 8.2 - "label any
// number you pick as provisional"). Only used when nothing's been saved yet.
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;
const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;

let db: Database.Database;

function createWindow(): void {
  const saved = getWindowBounds(db);

  const window = new BrowserWindow({
    width: saved?.width ?? DEFAULT_WIDTH,
    height: saved?.height ?? DEFAULT_HEIGHT,
    ...(saved?.x != null && saved?.y != null ? { x: saved.x, y: saved.y } : {}),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const persistBounds = (): void => {
    const bounds = window.getBounds();
    saveWindowBounds(db, { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  };
  window.on("resize", persistBounds);
  window.on("move", persistBounds);
  window.on("close", persistBounds);

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

if (gotSingleInstanceLock) {
  // A second launch while this instance is already running lands here
  // instead of opening a second window - bring the real one to the front.
  app.on("second-instance", () => {
    const [existing] = BrowserWindow.getAllWindows();
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
    }
  });

  app.whenReady().then(async () => {
    const dbPath = join(app.getPath("userData"), "ccdj.sqlite");
    let opened;
    try {
      opened = await openDatabase(dbPath);
    } catch (err) {
      // CLAUDE.md Section 6.2: a database newer than this build, a failed
      // backup, or a failed migration must never be used silently. No
      // restore-a-snapshot UI exists yet, so "quit with instructions" (the
      // other option CLAUDE.md allows) is the honest minimal behavior -
      // a real native dialog, not just a console line, since this is the
      // one failure mode severe enough to stop the app from opening at all.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ccdj] Refusing to open the database - quitting. ${message}`);
      dialog.showErrorBox("CCDJ - Database Error", message);
      app.quit();
      return;
    }
    db = opened.db;
    if (opened.recoveredFromCorruption) {
      // CLAUDE.md Section 6.2: "tell the user." No real UI to tell them with
      // yet (that's a later step) - logged for now so this is at least
      // visible, not silent.
      console.warn(`Database at ${dbPath} was damaged and has been reset. The old file was kept at: ${opened.backupPath}`);
    }
    if (opened.preMigrationBackupPath) {
      console.log(
        `[ccdj] Migrated the database to the latest schema. A verified backup from just before the migration is at: ${opened.preMigrationBackupPath}`
      );
    }

    registerLibraryIpc(db);
    registerPreferencesIpc(db);
    registerHistoryIpc(db);
    registerFileIpc(db);
    registerWindowIpc();
    registerBackendIpc(db);
    registerExportIpc(db);
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

  app.on("before-quit", () => {
    db?.close();
  });
}
