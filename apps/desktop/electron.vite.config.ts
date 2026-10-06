import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

// Three build targets, matching CLAUDE.md Section 5.6's process boundaries:
//   main     -> OS access (SQLite, dialogs, Serato adapter later)
//   preload  -> the narrow contextBridge between the two
//   renderer -> UI only, no Node
export default defineConfig({
  main: {
    build: {
      lib: { entry: resolve(__dirname, "src/main/index.ts") }
    }
  },
  preload: {
    build: {
      lib: { entry: resolve(__dirname, "src/preload/index.ts") }
    }
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html")
      }
    },
    plugins: [react()]
  }
});
