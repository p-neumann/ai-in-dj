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
//
// Database startup is Hannah's initDatabase() (docs/design-notes/
// startup-database-init.md): pinned user-data folder, then init before the
// window, then an error box and quit on any failure.

import { app, BrowserWindow, dialog, shell } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { initDatabase, type InitResult } from "./db/init.ts";
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

// Pinned user-data folder (startup-database-init.md section 1). Electron's
// default comes from package.json, and a later productName would silently
// move it and orphan the database. The final name is undecided before beta;
// this keeps today's folder. CCDJ_USER_DATA_DIR replaces it in development
// builds only, so a test launch can use a throwaway folder.
const USER_DATA_FOLDER_NAME = "ccdj-desktop";
if (gotSingleInstanceLock) {
  const devOverride = process.env.CCDJ_USER_DATA_DIR;
  const userDataDir =
    devOverride && !app.isPackaged ? devOverride : join(app.getPath("appData"), USER_DATA_FOLDER_NAME);
  // setPath throws if the folder does not exist.
  mkdirSync(userDataDir, { recursive: true });
  app.setPath("userData", userDataDir);
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
    const result = await initDatabase(join(app.getPath("userData"), "database"));
    if (result.status !== "ready") {
      // CLAUDE.md Section 6.2: a database newer than this build, a failed
      // backup, or a failed migration must never be used silently. No
      // restore-a-backup UI exists yet, so "quit with instructions" (the
      // other option CLAUDE.md allows) is the honest minimal behavior. The
      // file is never deleted or overwritten here.
      const message = startupErrorMessage(result);
      console.error(`[ccdj] database not opened (${result.status}) - quitting. ${message}`);
      dialog.showErrorBox("CCDJ - Database Error", message);
      app.quit();
      return;
    }
    db = result.db;
    const m = result.migration;
    console.log(
      m.status === "migrated"
        ? `[ccdj] database ready: schema v${m.to} (updated from v${m.from}${m.backupPath ? `, backup at ${m.backupPath}` : ", new file"}), SQLite ${result.sqliteVersion}`
        : `[ccdj] database ready: schema v${m.version} (up to date), SQLite ${result.sqliteVersion}`
    );

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

// One plain message per failure (startup-database-init.md section 3).
function startupErrorMessage(result: Exclude<InitResult, { status: "ready" }>): string {
  if (result.status === "error") {
    return `CCDJ could not open its database (stage: ${result.stage}). The file was not deleted or changed.\n\n${result.error}\n\n${result.path}`;
  }
  const m = result.migration;
  switch (m.status) {
    case "tooNew":
      return `This library database was created by a newer version of CCDJ (database version ${m.version}; this version reads up to ${m.maxReadable}). Install the newer version of CCDJ. Nothing was changed.\n\n${result.path}`;
    case "backupFailed":
      return `CCDJ needs to update its database but could not make a safety backup first (for example, the disk may be full). Nothing was changed.\n\n${m.error}\n\n${result.path}`;
    case "migrationFailed":
      return `CCDJ could not update its database. The database was left unchanged.${m.backupPath ? `\n\nA verified backup is at:\n${m.backupPath}` : ""}\n\n${m.error}`;
  }
}
