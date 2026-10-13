// Phase 2S check 3 — throwaway drag test. NOT part of the app.
//
// Uses the same renderer security settings as apps/desktop (sandbox,
// contextIsolation, no nodeIntegration), so what arrives here is what the real
// CCDJ renderer would receive.
//
// Drag IN:  drop anything on the window; every type/string/file is printed.
// Drag OUT: drag a demo track row out of the window (webContents.startDrag),
//           e.g. onto a Serato deck. The renderer only sends an index; the
//           main process owns the path, mirroring CLAUDE.md 7.5's trackId rule.
//
// Run (from the repo root):
//   apps\desktop\node_modules\electron\dist\electron.exe spikes\serato\drag-test\main.js

const { app, BrowserWindow, ipcMain, nativeImage } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEMO_DIR = path.join(os.homedir(), "Music", "_Serato_", "Imported", "Serato Demo Tracks");
const demoFiles = fs.existsSync(DEMO_DIR)
  ? fs.readdirSync(DEMO_DIR).filter((f) => f.toLowerCase().endsWith(".mp3")).map((f) => path.join(DEMO_DIR, f))
  : [];

// 16x16 solid icon (BGRA) — startDrag requires a non-empty icon.
const icon = nativeImage.createFromBitmap(Buffer.alloc(16 * 16 * 4, 0xc0), { width: 16, height: 16 });

function stamp() {
  return new Date().toTimeString().slice(0, 8) + "." + String(Date.now() % 1000).padStart(3, "0");
}

ipcMain.handle("demo-names", () => demoFiles.map((f) => path.basename(f)));

ipcMain.on("start-drag", (event, index) => {
  const file = demoFiles[index];
  if (typeof index !== "number" || !file) return;
  console.log(`[${stamp()}] DRAG OUT start: ${path.basename(file)}`);
  event.sender.startDrag({ file, icon });
});

ipcMain.on("log", (_event, line) => console.log(`[${stamp()}] ${line}`));

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    title: "CCDJ spike — drag test",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  // Without this, dropping a file onto the window navigates to it.
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, "index.html"));
  console.log(`[${stamp()}] drag test ready; ${demoFiles.length} demo tracks available to drag out`);
});

app.on("window-all-closed", () => app.quit());
