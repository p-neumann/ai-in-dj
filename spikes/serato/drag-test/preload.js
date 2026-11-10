// Sandboxed preload: exposes only what the test needs.
// webUtils.getPathForFile is how a sandboxed Electron renderer learns a dropped
// file's real path (File.path no longer exists in current Electron).
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("spike", {
  demoNames: () => ipcRenderer.invoke("demo-names"),
  startDrag: (index) => ipcRenderer.send("start-drag", index),
  log: (line) => ipcRenderer.send("log", String(line)),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || "(empty)";
    } catch (e) {
      return "(error: " + e.message + ")";
    }
  }
});
