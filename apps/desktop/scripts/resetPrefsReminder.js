// Flips dontAskPrefsReminder back to false in the real preferences
// table, so the startup preferences reminder can be checked again
// without wiping the whole database - library, history, and theme are
// all untouched. Built 2026-11-20 for piece 4's real-window testing,
// same pattern as dumpHistory.js (opens the real app database
// directly, documented, not a hidden dev trick).
//
// Usage (from apps/desktop):
//   node scripts/resetPrefsReminder.js
//
// Pass CCDJ_DB_PATH to point at a different file instead of the live
// one under %APPDATA%.

const path = require("node:path");
const os = require("node:os");
const Database = require("better-sqlite3");

function defaultDbPath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "ccdj-desktop", "ccdj.sqlite");
}

const PREFS_KEY = "settingsPrefs";
const dbPath = process.env.CCDJ_DB_PATH || defaultDbPath();

console.log(`Opening (read-write): ${dbPath}\n`);

const db = new Database(dbPath, { fileMustExist: true });
try {
  const row = db.prepare("SELECT value FROM preferences WHERE key = ?").get(PREFS_KEY);
  if (!row) {
    console.log(`No "${PREFS_KEY}" row exists yet - nothing to reset.`);
    console.log("The reminder only shows once a permanent Style Profile, Do Play, or Do Not Play entry exists anyway.");
  } else {
    const parsed = JSON.parse(row.value);
    const was = parsed.dontAskPrefsReminder;
    parsed.dontAskPrefsReminder = false;
    db.prepare("UPDATE preferences SET value = ? WHERE key = ?").run(JSON.stringify(parsed), PREFS_KEY);
    console.log(`dontAskPrefsReminder: ${was} -> false. Style Profile, Do Play, and Do Not Play are untouched.`);
    console.log("Restart the app - the reminder will show again on next launch if any permanent preference exists.");
  }
} finally {
  db.close();
}
