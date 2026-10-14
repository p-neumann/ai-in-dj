# Design note: opening the real database at app startup

**Date:** 2026-10-13 · **Phase:** 5 (SQLite milestone) · **Status:** Plan, checked against official documentation (section 7). Nothing in this note is implemented yet.
**Decisions taken from this plan:** `docs/decisions/0007-startup-database-initialization.md`. Builds on `0006-database-wide-schema-version.md`, which awaits Ranjish's review.

The migration runner and verified pre-migration backup already exist and are tested in isolation (`apps/desktop/src/main/db/`, commit `2772825`). This step connects them to app startup: on launch the app opens or creates its real database, brings it up to date safely, and keeps one connection open while it runs. If anything goes wrong, it explains and quits instead of continuing with a broken database.

**Order of work:** implement and test against temporary folders only. The real database on this machine is **not** created until Ranjish has reviewed decision 0006 or Hannah explicitly approves proceeding (decision 0007, item 6).

## 1. Location

`<userData>/database/ccdj-db.sqlite`
- Windows, today: `%APPDATA%\ccdj-desktop\database\ccdj-db.sqlite`. macOS (expected, to verify on a Mac): `~/Library/Application Support/ccdj-desktop/database/`.
- The `database/` subfolder keeps our database, its `-wal`/`-shm` files and the `ccdj-db.v<N>.bak` backups apart from Chromium's own files in `userData`.
- The file name makes backups `ccdj-db.v<N>.bak`, matching the CLAUDE.md §6.2 example.

**Pinned folder.**
- **Why:** by default Electron's `userData` is the `appData` folder plus the app's name, and the name comes from `package.json`, where `productName` "will be preferred over `name`" (section 7). Adding a `productName` for packaging (§8.8) would therefore silently change the folder and orphan existing databases.
- **How:** the folder is set explicitly with `app.setPath("userData", …)`, using a named constant.
- **Two requirements:**
  - `setPath` throws if the directory does not exist, so the folder is created first (`mkdirSync(…, { recursive: true })`).
  - The call happens at the top of `src/main/index.ts`, before the `ready` event. The docs require overriding `sessionData` before `ready`, and `sessionData` defaults to `userData`; applying the same timing to `userData` is an inference to confirm at runtime.
- **The final folder name is undecided** (it may not be `ccdj-desktop`) and must be settled before beta. Pinning to the current value keeps Chromium's existing files where they are.

**Development-only override (approved 2026-10-13).**
- If the environment variable `CCDJ_USER_DATA_DIR` is set **and `app.isPackaged` is false**, it replaces the pinned folder. Packaged builds ignore it.
- This exists so the built app can be launched against a throwaway folder during development without touching the real user-data folder.
- It replaces the earlier idea of Chromium's `--user-data-dir` switch, which Electron's documentation does not mention (section 7).

## 2. Connection settings

Set when the long-lived connection opens, in a new `src/main/db/connection.ts`, never inside migrations.

| Setting | Value | How it is set | Why |
|---|---|---|---|
| `journal_mode` | `WAL` | `PRAGMA` on open | Safer after a crash; reads don't block writes. Persistent once set, and cannot be changed while a transaction is active, so it stays out of migrations |
| `synchronous` | `FULL` | `PRAGMA` on every open | In WAL mode FULL is fully durable: a crash or power loss does not lose committed transactions (NORMAL can). Speed is irrelevant for prefs; revisit when library import is benchmarked. Treated as per-connection and set on every open (the documentation excerpt read does not state its scope) |
| `foreign_keys` | `ON` | `PRAGMA` on every open | Off by default; a no-op inside a transaction, so it is set right after opening |
| busy timeout | 5000 ms | better-sqlite3 constructor option `timeout: 5000` | Already better-sqlite3's default; passed explicitly for clarity. No separate PRAGMA |

**Future note (not this step):** because `foreign_keys` cannot change inside a transaction, a later migration that needs foreign keys off (for example, rebuilding a table) must handle that outside the one-transaction migration run.

## 3. Startup sequence

In `src/main/index.ts`, in this order:
1. **Single-instance lock** with `app.requestSingleInstanceLock()`.
   - If it returns `false`, quit immediately, before any database code runs.
   - In the first copy, the `second-instance` event restores and focuses the existing window.
2. **Pin the user-data path** (section 1): create the folder, call `setPath`, apply the development override if allowed. All of this happens before `ready`.
3. **When ready, initialize the database** with `initDatabase(<userData>/database)`.
4. **Only then create the window.**

| `migrate()` result | App behavior |
|---|---|
| `migrated` / `upToDate` | Open the long-lived connection; continue |
| `tooNew` | Error message: created by a newer version of CCDJ; install the newer version. Quit; database contents unchanged (§6.2 "quits with instructions") |
| `backupFailed` | Error message: the backup could not be made (e.g. disk full); nothing changed. Quit |
| `migrationFailed` | Error message: the update failed and the database was left unchanged (backup location given). Quit |
| throws (damaged or not a database) | Error message: the database can't be opened. Quit. The file is never deleted or overwritten |

- **Error messages** use `dialog.showErrorBox`, which is safe before `ready` and needs no window.
- **The connection** closes on quit and is never exposed to the preload or renderer.
- **Later steps, not this one:** offering to restore a backup (§6.2) and corruption recovery.

## 4. Keeping tests away from real data

- `initDatabase(dir)` takes the folder as a parameter. Only `index.ts` passes the real path; tests pass temporary folders.
- `src/main/db/` never imports Electron, so it keeps running under plain Node in `npm test`.
- **Manual check of the built app:** launch it with `CCDJ_USER_DATA_DIR` pointing at a throwaway folder, which works because it is a non-packaged build. Confirm the following, then delete the folder:
  - the database is created there;
  - Chromium's files land there too;
  - the real `%APPDATA%\ccdj-desktop` is untouched (compare its listing before and after);
  - a second launch focuses the first window.
- **The first launch against the real folder** waits until Ranjish has reviewed 0006 or Hannah explicitly approves.

## 5. Temporary startup log

- Remove `sqliteRuntimeInfo()` and `src/main/db/sqlite.ts`.
- Replace them with e.g. `[ccdj] database ready: schema v1 (created|up to date), SQLite 3.53.4`, plus one clear log line per failure.

## 6. Planned files

| File | Change |
|---|---|
| `src/main/db/connection.ts` | New: `openDatabase(path)` with the settings in section 2 |
| `src/main/db/init.ts` | New: `initDatabase(dir)` creates the folder, runs `migrate()`, opens the connection, returns a result. No Electron imports |
| `src/main/index.ts` | Single-instance lock, pinned user-data path with development override, init before window, `showErrorBox` and quit on failure, close on quit, new log line |
| `src/main/db/sqlite.ts` | Removed |
| `src/main/db/better-sqlite3.d.ts` | Add the `timeout` constructor option; extend further if needed |
| `test/db-init.test.mjs` | New tests, listed below |
| `test/security.test.js` | New check: preload and renderer source never mention `better-sqlite3` |
| `docs/phase-reports/phase-5.md` | Results |

Planned tests in `test/db-init.test.mjs` (temporary folders only):
- new folder → ready, database created;
- second run → up to date;
- WAL, `synchronous = FULL` and foreign keys are actually set on the opened connection;
- upgrade of a WAL database with uncheckpointed writes in `-wal` produces a backup that contains those writes;
- read-only open and `migrate()` of a WAL database work;
- `tooNew` passed through. **WAL caveat:** a read-only open may create `-wal`/`-shm` files when the folder is writable. So "nothing written" is checked as main-file bytes and database contents unchanged. The test records what happens to the side files rather than assuming the folder listing stays the same;
- damaged file → error, with the file unchanged byte-for-byte.

No new packages. Verification: `npm test`, `npm run typecheck`, `npm run build`, the Phase 5 gate, then the manual launch in section 4.

## 7. Documentation check (done 2026-10-13, read-only)

| Item | Finding | Effect |
|---|---|---|
| `app.requestSingleInstanceLock()` / `second-instance` | Returns `true` for the primary instance, `false` otherwise. `second-instance` fires in the primary with the second copy's `argv`, working directory and additional data. The docs' example quits when the lock isn't obtained and restores and focuses the window on `second-instance` | As planned; lock taken before any database code |
| `dialog.showErrorBox` / `showMessageBox` | `showErrorBox` "can be called safely before the `ready` event". Without a window, `showMessageBox` "will be displayed as an independent window" | `showErrorBox` for error-then-quit |
| `app.setPath` / `userData` / `sessionData` | `setPath` throws if the directory doesn't exist. `userData` defaults to `appData` + app name. `sessionData` "by default points to `userData`" and must be overridden before `ready` | Create folder first; call before `ready`. That Chromium's files follow `userData` is inferred; confirm in the manual launch |
| `app.getName` / `productName` | The name comes from `package.json`; `productName` is preferred over `name` | Confirms the rename risk; justifies pinning |
| `--user-data-dir` | Not documented on Electron's `app` or command-line-switch pages | Not relied on; replaced by `CCDJ_USER_DATA_DIR` (development builds only) |
| `PRAGMA journal_mode` | WAL is persistent across connections; cannot be changed while a transaction is active | Set on open, outside migrations |
| `PRAGMA synchronous` | FULL is durable (ACID) in WAL mode; NORMAL in WAL may lose the last transactions on power loss | Confirms decision 0007 item 5 |
| `PRAGMA foreign_keys` | Default OFF; a no-op inside a transaction | Set right after opening; future-migration note in section 2 |
| busy timeout | better-sqlite3 option `timeout` defaults to 5000 ms | Use the constructor option, not a PRAGMA |
| Read-only WAL databases | Supported since SQLite 3.22.0 (we have 3.53.4) if `-shm`/`-wal` exist or the folder is writable so they can be created. The last connection to close checkpoints and deletes them. A WAL database must never be separated from its `-wal` file | `migrate()`'s read-only open works in our writable folder. Using the backup API rather than a file copy is confirmed. Side-file caveat added to the tests |

No finding contradicts decision 0007, so no superseding record is needed.

**Still to confirm by running the app** (against temporary folders):
- Chromium's files follow the pinned `userData`;
- the single-instance behaviour;
- the WAL side-file behaviour.

**Sources:**
- Electron `app` API (https://www.electronjs.org/docs/latest/api/app; source `docs/api/app.md` in electron/electron);
- Electron `dialog` API (https://www.electronjs.org/docs/latest/api/dialog);
- Electron command-line switches (https://www.electronjs.org/docs/latest/api/command-line-switches);
- SQLite PRAGMA reference (https://www.sqlite.org/pragma.html);
- SQLite WAL (https://www.sqlite.org/wal.html);
- better-sqlite3 API (`docs/api.md` in WiseLibs/better-sqlite3).
