// Read-only history inspector - built 2026-11-13 (Problem 1/2 investigation)
// because the Settings History panel truncates entries at the right edge
// and buries the one you need under newer ones. Opens the REAL app
// database read-only (never writes, never touches the running app) and
// prints full, untruncated entries, newest first.
//
// Usage (from apps/desktop):
//   node scripts/dumpHistory.js [limit]
//
// Default limit is 10. Pass CCDJ_DB_PATH to point at a different file
// (e.g. a copied-aside db) instead of the live one under %APPDATA%.

const path = require("node:path");
const os = require("node:os");
const Database = require("better-sqlite3");

function defaultDbPath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "ccdj-desktop", "ccdj.sqlite");
}

const dbPath = process.env.CCDJ_DB_PATH || defaultDbPath();
const limit = Number(process.argv[2]) || 10;

console.log(`Reading (read-only): ${dbPath}\n`);

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
try {
  const rows = db.prepare("SELECT id, timestamp, entry FROM history ORDER BY id DESC LIMIT ?").all(limit);

  for (const row of rows) {
    const entry = JSON.parse(row.entry);
    const when = new Date(row.timestamp).toLocaleString();
    console.log(`--- id ${row.id}  (${when}) ---`);
    console.log(JSON.stringify(entry, null, 2));
    console.log("");
  }

  console.log(`${rows.length} row(s) shown (limit ${limit}, newest first). Highest id in the table:`);
  const { maxId } = db.prepare("SELECT MAX(id) as maxId FROM history").get();
  console.log(maxId);
} finally {
  db.close();
}
