# 0007 - How the desktop app opens its real database at startup

**Date:** 2026-10-13
**Owner/source:** Hannah, this session (Phase 5 SQLite milestone), choosing among the options in `docs/design-notes/startup-database-init.md`. An engineering decision, not a Mike decision; it does not touch musical behavior. Ranjish has not yet reviewed it.
**Status:** Accepted

## Decision
1. **Location.** The database lives at `<userData>/database/ccdj-db.sqlite`, with its `-wal`/`-shm` files and `ccdj-db.v<N>.bak` backups in the same `database/` folder.
2. **Pinned user-data folder.** The user-data folder name is set explicitly in code instead of being derived from the app's name, so renaming the app for packaging (§8.8) cannot silently move users' data. **The final folder name is not decided** and may not be `ccdj-desktop`; the current value is a placeholder, labelled as such in code, and must be settled before beta.
3. **Failures stop the app safely.** If the database is too new, a backup fails, a migration fails, or the file cannot be opened, the app shows an error message and quits. It writes nothing further, and never deletes or overwrites the database file. Offering to restore a backup (§6.2) and corruption recovery come later as separate steps.
4. **Single instance.** Only one copy of the app runs at a time. A second launch focuses the existing window, so two processes never write the same database.
5. **Durability.** The connection uses `synchronous = FULL` (safest against power loss) together with WAL mode, foreign keys on and a busy timeout. May be revisited once library import is benchmarked.
6. **Temporary folders first.** All implementation and testing uses temporary folders. The one action that creates the real database on this machine (the first manual launch of the built app against the real user-data folder) waits until Ranjish has reviewed decision 0006, or Hannah decides to proceed.

## Why
These choices put CLAUDE.md §6.2's safety rules (verified backup before migrating, refuse to write a too-new database, failed migrations leave the original intact) in front of any real data, before preferences, history or the library are stored. Quitting rather than continuing is the conservative choice while no recovery UI exists: the app's code expects the current schema, and running against an old or damaged one risks data loss. Pinning the folder costs nothing now, because no user has data yet.

## Consequences
- `src/main/db/` stays free of Electron imports, so its logic is testable under plain Node with temporary folders. Message boxes, quitting and the single-instance lock live in `src/main/index.ts`.
- The temporary startup log and `sqliteRuntimeInfo()` (Phase 5 report, Section 5) are removed when this lands, replaced by a database-ready log line.
- Changing the pinned folder name after beta users have data would require a data-move step; choosing the final name is now a pre-beta task.
- The Electron and SQLite APIs this depends on (single-instance lock, message boxes before a window exists, `--user-data-dir`, the four PRAGMAs) were **checked against official documentation on 2026-10-13**; findings and sources are in `docs/design-notes/startup-database-init.md` section 7. Nothing contradicts the decisions above. Two plan details changed: Chromium's `--user-data-dir` switch is not documented by Electron, so a development-only `CCDJ_USER_DATA_DIR` override (ignored when the app is packaged; approved by Hannah 2026-10-13) is used for launches against throwaway folders; and the busy timeout uses better-sqlite3's `timeout` option (default 5000 ms) instead of a PRAGMA. Still to confirm at runtime: that Chromium's files follow the pinned folder, the single-instance behaviour, and WAL side-file behaviour.
- If decision 0006 is overturned, a database created under it holds no user data at this stage and can be deleted safely.
