// SQLite access for the main process (CLAUDE.md Section 5.6: only main
// touches the database; the renderer reaches it through named IPC calls).
//
// better-sqlite3 is a native addon. It must stay external to the main bundle
// (electron-vite does this for everything in package.json "dependencies") and
// must never be imported from the preload or renderer.
//
// For now this only proves the module loads inside Electron. It opens an
// in-memory database — no file is created. Schema, schema_version and
// migrations (Section 6.2) come next.

import Database from "better-sqlite3";

export function sqliteRuntimeInfo(): { sqliteVersion: string } {
  const db = new Database(":memory:");
  try {
    const row = db.prepare("select sqlite_version() as v").get() as { v: string };
    return { sqliteVersion: row.v };
  } finally {
    db.close();
  }
}
