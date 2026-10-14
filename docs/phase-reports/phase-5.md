# Phase 5 — Desktop shell and durable local data

**Status:** In progress. First of three commit milestones complete.
**Date of this report:** 2026-10-06 (work performed 2026-10-05).
**Update history:**
- **2026-10-13 (first update):** Serato spike status (Sections 1, 4, Summary) and two new findings in Section 5. *At the time of this update*, no Phase 5 code had changed since `f4ae88f`. That is no longer the current status; see the later updates below.
- **2026-10-13 (second update):** `better-sqlite3` installed and verified to load in Electron 44 without a rebuild (Section 5); `package.json`/`package-lock.json` changed. A minimal main-process load check was then added (`src/main/db/`, one call and a temporary startup log in `src/main/index.ts`) and verified through `npm run build` and a launch of the built app (Section 5).
- **2026-10-13 (third update):** migration runner and pre-migration backup added with 11 tests (Section 3a); decision 0006 recorded (Section 6).
- **2026-10-13 (fourth update):** startup plan and decision 0007 committed (`f79ef3a`); connection settings (`openDatabase()`) added with 6 tests, revealing that this better-sqlite3 build's SQLite defaults differ from plain SQLite's (Section 3b).
**Branch:** `hannah/phase5-desktop` (based on `ranjish/ccdj-desktop`, pushed)
**AI calls used while doing this work:** none. Nothing in this milestone calls a model, and `apps/desktop` has no provider dependency of any kind.

Phase 5's three commit milestones per CLAUDE.md Section 9:

| Milestone | State |
|---|---|
| `feat(desktop): electron shell` | **Done** (`f4ae88f`) |
| `feat(desktop): sqlite persistence` | Started — `better-sqlite3` loads from the built app's main process (Section 5); migration runner + verified pre-migration backup implemented and tested (Section 3a); connection settings implemented and tested (Section 3b); not yet wired to startup; no real database file yet |
| `feat(desktop): library import` | Not started |

---

## 1. Completed

**`apps/desktop/` scaffolded** — Electron main + preload + React renderer, TypeScript throughout, per the file layout in Section 5.7. Twelve files committed; `node_modules/`, `out/` and `CLAUDE.md` all confirmed excluded from the commit.

**Process separation implemented (Section 5.6).**
- `src/main/index.ts` — window lifecycle, loads the Vite dev server in development and `index.html` from disk when packaged.
- `src/preload/index.ts` — `contextBridge.exposeInMainWorld("ccdj", api)` where `api` is deliberately **empty**. The Phase 5 API surface (`library.import`, `prefs.get/set`, `history.append`, `showInFinder`, `setAlwaysOnTop`) is listed in comments, to be added one function at a time with main-side validation.
- `src/renderer/` — React, no Node access.

**Section 7.5 hardening applied from the first commit**, not retrofitted: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `setWindowOpenHandler` denying all child windows, external links restricted to `http`/`https` via `shell.openExternal`, and a CSP meta tag in `index.html`.

The preload additionally refuses to expose the bridge at all if `process.contextIsolated` is false, so weakening the main-process flags does not silently open the door.

**Two layers of enforcement for those flags:**
- `test/security.test.js` — 7 tests asserting the flags in source. Deliberately source assertions rather than a running-app check, so they run in CI with no Electron binary and no display.
- The renderer draws the same four checks live on screen (`require`, `process`, `module` unreachable; `window.ccdj` present), so a regression is visible on launch.

**Window sizing** set to 1100×760 with minimums 900×600, labelled provisional in a code comment per Section 8.2, pending D7.

**Serato DJ Lite installed** on the Windows development machine. The spike has since been run on Windows — see Section 4.

---

## 2. Verified (real output, re-run 2026-10-06)

```
npm test        # tests 7 / pass 7 / fail 0
npm run typecheck   # exit 0, clean
npm run build       # exit 0, clean
```

**Phase 5 gate**, run against the real build output in `apps/desktop/out/` (5 emitted files):

```
'window.storage'     -> 0 hits
'api.anthropic.com'  -> 0 hits
```

**The app launches.** `npm run dev` opens a real desktop window, and all four on-screen isolation checks pass.

Note on an earlier false result: a first gate check pointed at a path that did not exist and reported zero hits because it was scanning nothing. The numbers above are from the real `out/` directory, confirmed to contain the 5 build artefacts.

---

## 3. Render spike — the prototype inside Electron (2026-10-06)

**Question asked:** does the prototype's UI actually run inside Electron's sandbox and CSP? It was known to run in a plain browser, but nothing had been checked against the stricter desktop host — and Phase 5.4 is a large commitment to make on an assumption.

**Method:** `reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx` was copied into a temporary `_spike/` folder inside the renderer and rendered in place of the placeholder, with `StrictMode` and the shell's stylesheet omitted so neither would distort the reading. Reverted immediately afterwards; nothing committed, and the repository's tests, build and Phase 5 gate were re-run clean after the revert.

The sanitized copy was used deliberately. The root `CheatCodeDJ_v_1_0_22016.jsx` still carries the live Spotify client secret on line 35, and bundling it — even temporarily — would write that value into build output.

**Result: it works.**

| Check | Outcome |
|---|---|
| UI renders — logo, theme, five tabs | Works |
| `Crates.csv` drag-and-drop import | Works, full library loaded |
| Library search | Works, noticeably laggy |
| Tab navigation | Works |
| The 9 `api.anthropic.com` calls | Blocked by CSP `connect-src` — **as designed** |
| `window.storage` persistence | Absent; fails silently, as the prototype's own guards intend |

**Conclusion:** the host environment does not fight the prototype. Phase 5.4 is a port, not a rewrite, and the largest single risk in this phase is retired. Both failures above are the security model working rather than defects.

**R14 was not reproduced.** The Artist Era Resolver did run slowly enough to interfere with testing, but every one of its calls was CSP-blocked, so it was retrying against a dead endpoint. R14 describes a stall on a real library *with zero API errors logged*. The cause here is entirely different, and this run is not evidence either way about R14.

---

## 3a. Migration runner and pre-migration backup (2026-10-13)

**Scope:** CLAUDE.md §6.2's migration and snapshot rules, as library code plus tests. **Not** connected to app startup: no real user database is created, and there are no preference tables, IPC or library tables yet. No packages installed.

**Decision recorded:** `docs/decisions/0006-database-wide-schema-version.md`: one schema version for the whole database file. §6.2's "every local table has a `schema_version`" is the only per-table wording. The snapshot naming, the "database is newer than it understands" check, rollback and §11.1 all assume one version per file.

**Files:**

| File | Change |
|---|---|
| `src/main/db/schema.ts` | New. Read-only helpers: table names, schema version (`MAX(version)` from `schema_migrations`, 0 if absent), per-table row counts |
| `src/main/db/migrations.ts` | New. Ordered migration list with the forward-only / expand→contract rules in its header. Migration 1 creates `schema_migrations(version INTEGER PRIMARY KEY, name, applied_at)` only |
| `src/main/db/backup.ts` | New. `createVerifiedBackup`, `verifyBackup`, `backupPathFor` |
| `src/main/db/migrate.ts` | New. `migrate(dbPath, migrations?, options?)` → `upToDate` / `migrated` / `tooNew` / `backupFailed` / `migrationFailed` |
| `src/main/db/better-sqlite3.d.ts` | Extended with the methods now used (`exec`, `pragma`, `transaction`, `backup`, `run`, `all`) |
| `test/db-migrate.test.mjs` | New. 11 tests |
| `tsconfig.json` | `allowImportingTsExtensions: true`. Node's type stripping needs `.ts` in relative imports between the db modules |
| `package.json` | Test script `node --test` → `node --experimental-strip-types --test` |

**How `migrate` behaves:**
1. It reads the version through a **read-only** connection.
2. If the database is newer than the last migration in the list, it returns `tooNew` and writes nothing. If it is already current, it does nothing.
3. If the file has any tables, it backs up and verifies first. On failure it returns `backupFailed` and applies nothing. A brand-new file has nothing to back up.
4. It applies all pending migrations and their version rows in **one transaction**. On failure everything rolls back and it returns `migrationFailed` with the version that failed. A new file that fails its first migration is deleted.

**How the backup is made and verified:**
- It uses SQLite's online backup API (`db.backup()`), not a file copy, so writes still in a WAL file are included.
- It writes to `ccdj-db.v<old>.bak.tmp`, then opens that copy read-only. `PRAGMA integrity_check` must be `ok`, the schema version must match, and every table's row count must match the source.
- Only then is it renamed to `ccdj-db.v<old>.bak`. On any failure the temp file is deleted.
- A same-version backup from an earlier attempt is replaced by the fresher verified one. Older-version backups are kept.

**Results:**

```
npm test            # tests 18 / pass 18 / fail 0   (11 new + 7 existing)
npm run typecheck   # exit 0
npm run build       # exit 0 — out/main/index.js still 1.80 kB; no migration code in out/ (not imported yet)
Phase 5 gate        # window.storage 0 hits, api.anthropic.com 0 hits
```

New tests, all in their own `%TEMP%\ccdj-migrate-test-*` folder, deleted afterwards (0 left over after the run):
1. new file → migrated 0→1, version row recorded
2. second run → `upToDate`; file bytes and folder listing unchanged
3. upgrade 1→2 (test-only migration) → `ccdj-db.v1.bak` holds the v1 data without the v2 table; no `.tmp` left
4. database at v2 opened with a v1 list → `tooNew`; file bytes and folder listing unchanged
5. migrations 2 (succeeds) + 3 (throws) → `migrationFailed`, `failedAt: 3`; version still 1, migration 2's table rolled back, data rows intact; backup present at v1
6. new file whose first migration throws → no file left behind
7. backup function throws → `backupFailed`; file bytes unchanged, nothing applied
8. verification rejects a copy with a deleted row (`row count mismatch in "sample": 2 vs 3`) and a wrong version
9. verification rejects a non-database file
10. backup naming matches `ccdj-db.v<old-schema>.bak`
11. migration list must be contiguous from 1 and named

These also confirm that `better-sqlite3`'s binary opens real database files under plain Node 22.16 (ABI 127), which was previously unverified. `npm test` prints two harmless Node warnings (type stripping is experimental; no `"type"` field in `package.json`). `"type": "module"` was deliberately not added, because it would change how the app and the existing `.js` tests load.

The app's userData folder (`%APPDATA%\ccdj-desktop`) contains no CCDJ database. Its only `.db` files are Chromium internals from the first launch on 2026-10-05.

**Not covered or unverified:**
- Not wired to startup, and no real database location or name is fixed yet. `ccdj-db.sqlite` is used in tests only.
- `tooNew` returns a status only. Offering to restore a compatible snapshot or quitting with instructions (§6.2) needs UI and is not built.
- Corrupt-database recovery (§6.2) is not implemented. A file that is not a database currently makes `migrate` throw.
- Tests use SQLite's default rollback journal, not WAL. Backup and read-only opening in WAL mode are not exercised yet. Connection pragmas (journal mode, foreign keys) come with the startup wiring.
- No backup retention policy. Backups of each old version accumulate.
- Not tested on a large database, on a Mac, or with two app instances opening the file at once.
- The tests were not mutation-checked, i.e. not seen to fail against deliberately broken code. All 11 passed on the first run.

---

## 3b. Connection settings (2026-10-13)

**Context:**
- The plan for opening the real database at startup is in `docs/design-notes/startup-database-init.md`.
- Hannah's decisions on it are in `docs/decisions/0007-startup-database-initialization.md`: location, pinned user-data folder, error message then quit, single-instance lock, WAL with `synchronous=FULL`, temporary folders first.
- Before any code, the plan was checked against the official Electron, SQLite and better-sqlite3 documentation (design note section 7). Two plan details changed: a development-only `CCDJ_USER_DATA_DIR` override replaces Chromium's undocumented `--user-data-dir` switch, and the busy timeout uses better-sqlite3's `timeout` option. Both documents were committed in `f79ef3a`.
- This section covers **step 1 of that plan only**: the connection settings. Startup is not touched, and no real database is created.

**Files:**

| File | Change |
|---|---|
| `src/main/db/connection.ts` | New. `openDatabase(path)`: opens with `timeout: 5000` (`BUSY_TIMEOUT_MS`), sets `journal_mode = WAL` (throws unless SQLite confirms `wal`), then `synchronous = FULL` and `foreign_keys = ON`. On any failure it closes the connection before rethrowing. Not yet called by the app |
| `src/main/db/better-sqlite3.d.ts` | Added the `timeout` constructor option |
| `test/db-connection.test.mjs` | New. 6 tests, each in its own `%TEMP%\ccdj-connection-test-*` folder |

**Results:**

```
npm test            # tests 24 / pass 24 / fail 0   (6 new + 18 existing)
npm run typecheck   # exit 0
npm run build       # exit 0 — output unchanged (connection.ts not imported yet)
Phase 5 gate        # window.storage 0 hits, api.anthropic.com 0 hits
```

Tests:
1. a new database opens in WAL mode;
2. `synchronous` is FULL (2);
3. the busy timeout is 5000 ms;
4. foreign keys are on and enforced (an insert with a missing parent is rejected);
5. WAL persists after closing, while a plain connection falls back to `synchronous = NORMAL`; reopening through `openDatabase()` restores FULL;
6. a file that is not a database is rejected, left byte-for-byte unchanged, and not left open.

0 temporary folders were left over.

**Finding: this better-sqlite3 build changes SQLite's defaults.**
- The first run of test 5 failed (23/24). It assumed a plain connection has foreign keys **off**, which is SQLite's documented default, but the connection reported **on**.
- better-sqlite3's `docs/compilation.md` lists the bundled SQLite's compile options, including `SQLITE_DEFAULT_FOREIGN_KEYS=1` and `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1`. So, in every connection this app opens:
  - **foreign keys are on by default**;
  - **in WAL mode, `synchronous` defaults to NORMAL**, which can lose the last committed transactions on power loss. FULL is what decision 0007 chose.
- Test 5 was rewritten to assert the actual behaviour (24/24). `connection.ts` was not changed; it was already correct.

**Consequences (not yet acted on):**
- **`openDatabase()`'s explicit `synchronous = FULL` is essential, not redundant.** Its `foreign_keys = ON` line cannot be shown to have an effect, because the default is already on. It is kept as protection in case a future build changes that default.
- **`migrate()` opens its own connections without `openDatabase()`.** Once the file is in WAL mode, migrations would therefore run at `synchronous = NORMAL`, which does not match decision 0007. To handle in the next step (`initDatabase`).
- **Foreign keys are also on inside `migrate()`'s connections.** A future migration that rebuilds a table may need them off, outside the migration transaction (design note section 2).
- **The design note says foreign keys are "off by default" and is silent on the WAL `synchronous` default.** Both are wrong for this build and need a dated correction.

**Still unverified:** mutation-checking of the 6 tests; behaviour on macOS.

---

## 4. Not started, unverified, or blocked

**The Serato spike (Phase 2S) — updated 2026-10-13.** Run on 2026-10-07 and 2026-10-12/13 on Serato DJ Lite 4.0.10.213, Windows 11, demo tracks only; full evidence in `docs/serato-spike.md`. All four checks now have answers on that platform:
- **Library:** the live library is SQLite (`%LOCALAPPDATA%\Serato\Library\master.sqlite`); `_Serato_\database V2` and `.crate` files are an export written on quit. Fields (BPM, key, genre, year, play count) are available; the full-path rule is still open.
- **Deck detection:** each load is recorded with its deck, readable from a copy of the database while Serato runs, within ~1 s.
- **Drag:** both directions work from a sandboxed Electron window. Drag in gives the full file path only; drag out loads a deck or adds to a crate.
- **Crate export:** a `.crate` written while Serato is closed is imported on next launch; one written while it runs is deleted at the next export — a design constraint for Phase 8e.

Still open: nothing is verified on macOS or on Mike's Serato version (questions for Mike are listed in the spike doc), and the spike doc has not yet been shared with him (Phase 2S gate). None of this is Phase 5 work; Deck Watcher, drag and crate export are Phase 8.

**Everything requiring a Mac.** Deck detection, two-way drag, always-on-top over Serato, code signing, notarization, and the clean-machine install test. Access is on the agenda for the 2026-10-07 meeting.

**The renderer is a placeholder.** The prototype UI has not been ported, not split into components, and the 27 `window.storage` calls and 9 `api.anthropic.com` fetches in `CheatCodeDJ_v_1_0_22016.jsx` are untouched. Section 9 groups those with the component split as one piece of work, correctly — they are the same edit. Section 3's spike confirms the port is viable; it does not constitute any part of the port itself.

**The CSP is development-permissive.** `index.html` currently allows `'unsafe-inline'` and `'unsafe-eval'` because Vite's HMR requires them, flagged in a comment. Section 7.5 requires a strict CSP in the shipped app, so both must go before Phase 10, and `connect-src` must name the backend explicitly instead of allowing localhost.

**`docs/QUESTIONS.md` has still not been received.** It is gitignored and local-only to the other developer's machine. The full `CLAUDE.md` was received on 2026-10-05 and is now present locally (also gitignored).

---

## 5. Findings worth carrying forward

**`CLAUDE.md` §8.1 does not say Serato is installed.** `docs/serato-spike.md` states *"Have Serato DJ installed (already true, per CLAUDE.md 8.1 - runs on Windows too)"*. §8.1 actually says *"Serato DJ runs on Windows; folder layout may differ — VERIFY"* — a statement about platform capability, not about what is installed. §12.1's Phase 2S row independently lists *"Serato installed"* as an unmet blocker, contradicting the spike doc. Neither developer had it installed; Lite has now been installed to resolve this. **The spike doc's prerequisite line should be corrected.** *(Done 2026-10-07.)*

**`window.open` handler opens any http/https URL (found 2026-10-12, not yet fixed).** `src/main/index.ts` passes every `http://`/`https://` URL the renderer tries to open to `shell.openExternal`. §7.5 bars `shell.openExternal` with arbitrary URLs, so this should be narrowed to an allow-list. There is also no `will-navigate` guard, although the code comment says the renderer must never navigate itself. Small, separate fix; neither is covered by `test/security.test.js` yet.

**VS Code sets `ELECTRON_RUN_AS_NODE=1` in its terminals (found 2026-10-13).** With it set, `electron.exe` runs as plain Node and opens no window, failing silently. Observed while launching the Serato drag test from the IDE. If `npm run dev` ever does nothing from VS Code's terminal, clear the variable (`Remove-Item Env:ELECTRON_RUN_AS_NODE`) or use an external terminal.

**Node version mismatch between development machines.** §7 records *"node -v # confirmed: v24.11.0"*. This machine runs **v22.16.0**. Nothing has broken — the server's 103 tests and all of the above pass on 22 — but the two machines should agree on a version, or §7 should record that it varies.

**Vite 8 is incompatible with electron-vite 5.** A default `npm i -D vite` resolves to 8.x and fails peer resolution against `electron-vite@5`, which accepts `^5 || ^6 || ^7`. Pinned to `vite@^7`. Note the root prototype wrapper used `vite@^8.3.0`, so this will recur for anyone scaffolding from that.

**The Electron postinstall did not fetch the binary.** The package installed with `install.js` present but no `dist/` and no `path.txt`, so `npm run dev` failed with `Error: Electron uninstall` while `npm run build` succeeded — building never launches Electron. Resolved by running `node node_modules/electron/install.js` directly. If this was an environment or network restriction it will likely recur on other machines and in CI.

**`better-sqlite3` loads in Electron without a rebuild (verified 2026-10-13).** The ABI numbers on this machine differ:

```
system Node ABI : 127   (Node v22.16.0)
Electron ABI    : 149   (Electron 44.5.1)
```

An earlier version of this report concluded from this that `@electron/rebuild` was required. **That is wrong for the current release.** `better-sqlite3` v13.0.0 (2026-07-21) moved to Node-API, which is not tied to the ABI number, and ships prebuilt binaries inside the npm package (`prebuilds/win32-x64.node`, `darwin-arm64.node`, `darwin-x64.node`, …) with no install script or download step. Its release notes say the binaries "should theoretically work across different versions of Node.js and Electron"; Electron 44 is not named, so this was tested rather than assumed.

What was done:
- `npm install better-sqlite3` in `apps/desktop` → 13.0.3, added to `dependencies`. Exit 0, 0 vulnerabilities. No `build/` directory: nothing was compiled. `@electron/rebuild` was **not** installed.
- A throwaway script, kept outside the repository, run with `node_modules\electron\dist\electron.exe` (`ELECTRON_RUN_AS_NODE` cleared). It loaded the module in the main process, queried an in-memory database, then wrote a row to a temporary file database (WAL mode) in a fresh `%TEMP%` folder, closed it, reopened it read-only, read the row back, and deleted the folder.

Result (exit 0, no errors):

```
electron 44.5.1 · node 24.21.0 · ABI 149 · N-API 10 · main process: yes
better-sqlite3 13.0.3 · sqlite_version() 3.53.4
read-back: "electron-44" (matches the value written) · temp folder removed
```

**Windows build tools are not installed** (checked 2026-10-13): Visual Studio Build Tools 2019 is present without the C++ workload; Python 3.11.9 and 3.13.13 are present. This machine therefore cannot compile native modules. With v13's prebuilt binaries that did not matter; it would if a future dependency needs compiling.

**Loaded through the app's own build (verified 2026-10-13).** Minimal integration, following §5.6/§5.7 (main process only, under `src/main/db/`):
- `src/main/db/sqlite.ts` — `sqliteRuntimeInfo()` opens an **in-memory** database, reads `sqlite_version()`, closes it. No database file is created; no schema.
- `src/main/db/better-sqlite3.d.ts` — minimal local type declaration (constructor, `prepare().get()`, `close()`). better-sqlite3 13 ships no TypeScript types, and no types package was installed.
- `src/main/index.ts` — calls it once at `whenReady` and logs the result; a failure is logged, not fatal, since nothing depends on SQLite yet.

**Temporary startup log (kept deliberately, Hannah, 2026-10-13).** Every launch prints `[ccdj] better-sqlite3 loaded, SQLite <version>` (or `[ccdj] better-sqlite3 failed to load: …`) from the main process. It is a temporary diagnostic: it stays until real database initialization at startup (opening the user database and running `migrate`) replaces it. That work should remove the log and `sqliteRuntimeInfo()`, or replace them with its own startup reporting. It should not be removed before then.

Results:

```
npm run typecheck   # exit 0
npm test            # tests 7 / pass 7 / fail 0
npm run build       # exit 0 — out/main/index.js 1.80 kB (2 modules)
```

- electron-vite 5.0.0 kept the module external, as its source says it does for `package.json` `dependencies` in main/preload (`build.externalizeDeps`, default `true`): `out/main/index.js` contains `const Database = require("better-sqlite3");`. No better-sqlite3 code in `out/preload` or `out/renderer`; no `.node` file anywhere in `out/`.
- Phase 5 gate re-run on `out/`: `window.storage` 0 hits, `api.anthropic.com` 0 hits.
- Built app launched with `electron.exe .` from `apps/desktop` (runs `out/main/index.js`, no dev server, `ELECTRON_RUN_AS_NODE` cleared), stdout captured, closed after 10 s. stdout: `[ccdj] better-sqlite3 loaded, SQLite 3.53.4`; stderr empty; still running at 10 s (did not crash). The window itself was not looked at in this run.

Still unverified:
- Which binary file was loaded — almost certainly `prebuilds/win32-x64.node` (the only Windows x64 binary present), but neither run printed the path.
- `npm run dev` with the new import (only the built output was launched).
- ~~`npm test` (plain Node) opening a database~~ — **now verified** (Section 3a): `test/db-migrate.test.mjs` creates, migrates, backs up and reopens real database files under plain Node 22.16 (ABI 127) through `npm test`, 11/11 passing.
- Operations that hand memory buffers between SQLite and JavaScript (e.g. `db.serialize()`, BLOBs) — Electron restricts some Node-API buffer operations; not exercised.
- macOS (arm64 and x64).
- **A packaged app.** No packaging tool is chosen yet (§8.8: electron-builder or Electron Forge), so none of the following has been checked: `better-sqlite3` shipped as a production dependency (it is loaded from `node_modules` at runtime); `prebuilds/*.node` placed outside `app.asar` (electron-builder states native modules are detected and unpacked automatically, but v13's `prebuilds/` layout is new; Forge needs its auto-unpack-natives plugin); the correct `darwin-arm64`/`darwin-x64` binary chosen on each Mac architecture or in a universal build; the `.node` files signed and notarized; unused Linux/Windows prebuilds (~16 MB total) excluded from the Mac build; the database file located under `app.getPath("userData")`, never inside the read-only bundle; and the §11.3 packaged-app exclusion check passing.
- Guardrail for later work: better-sqlite3 must only be imported from `src/main`. In the sandboxed preload an externalized `require` fails, and it would break the §5.6 boundary.

**`npm audit` on `apps/server` reports 9 high-severity Fastify advisories** (DoS, header spoofing via proxy headers, validation bypass) against `fastify@^4.28.1`. The fix is Fastify 5.12.5, a major version bump that would need the server's 103 tests re-run. **Not actioned** — that is the other developer's tree, and the practical risk today is low since the server binds to `localhost` and is not deployed. It should land before any Phase 6 deployment.

**37 duplicate keys in `ARTIST_ERA_MAP`, now enumerated.** Building the prototype through Vite surfaces every one of them as a warning. In a JavaScript object literal the last value wins, so for each of these artists one of the two eras is silently dead:

```
2 chainz · 21 savage · anuel aa · bad bunny · cardi b · chris brown · deadmau5
destiny's child · diana ross · dua lipa · duke dumont · en vogue
enrique iglesias · fall out boy · gucci mane · ja rule · janet jackson
jhay cortez · la bouche · mario · myke towers · nelly · panic at the disco
paramore · pink · polo g · rauw alejandro · saweetie · scarface · sech
swedish house mafia · t-pain · tank · the killers · tlc · warren g
ying yang twins
```

`polo g` appears as both 2020 and 2021, for example. This was already suspected — `apps/server/src/engine/artistLookup.js` cites it as logged in `docs/QUESTIONS.md` — but the list itself had not been recorded. **Not fixed, deliberately:** §1.7 classifies era data as musical behaviour, so it needs Mike to say which year is correct for each name.

**The Artist Era Resolver defaults to on and cannot remember being switched off.** `artistEraResolverEnabledRef = useRef(true)` (line 1034) and `useState(true)` (line 1266), with the toggle persisted only through `window.storage` (line 1272) — which does not exist outside Claude.ai. In the desktop app the resolver will therefore auto-start on every launch regardless of what the user last chose, and the toggle appears to do nothing across restarts.

`cheatcode_resolver_enabled` is already on Appendix A's migration list; it has to reach SQLite in Phase 5.4 or the toggle stays broken. §6.6 moves the resolver to a server job in Phase 7, which removes the problem entirely. Worth noting the other developer hit this independently and worked around it in the Phase 2 harness (*"disable resolver by default"*).

**Library search is laggy at 38,486 tracks.** Recorded as an impression, not a measurement — no timings were taken. §3.4 targets *results under 200ms on 75k* and marks it unverified. R25's virtualization is the likely fix for list rendering; real measurement belongs to Phase 9.

---

## 6. Decisions needing confirmation

| Item | State |
|---|---|
| D3 — Electron + better-sqlite3 | Agreed verbally between developers. `docs/decisions/0001-stack.md` still reads **Status: Proposed** and should be moved to Accepted. |
| Work split | Agreed in principle: `apps/server/**` and Phases 4/6/7 to one developer; `apps/desktop/**`, Serato and Playlist Cheat to the other. §1.1 still records *"split of work not yet recorded"*. Needs a record in `docs/decisions/`. |
| Decision 0006 — one database-wide schema version | `docs/decisions/0006-database-wide-schema-version.md`, recorded 2026-10-13 as Hannah's interpretation of §6.2. **Awaiting Ranjish's review.** If Ranjish objects, a superseding record is needed before any real database is created; the migration runner (Section 3a) is built on this reading. |
| Branch and PR convention | §10.2 specifies feature branch → PR into the default branch. `hannah/phase5-desktop` is currently based on `ranjish/ccdj-desktop` rather than `main`, so a PR now would carry 20 unrelated commits. Phase 4 should merge to `main` first. |

---

## Summary

The desktop application exists and opens. Process separation and the Section 7.5 security model are in place and enforced by tests rather than by convention, and Phase 5's own gate passes against real build output. That is the first of three milestones.

The render spike then retired this phase's largest unknown: the prototype runs inside Electron, imports a full library and searches it, with only the two failures the security model is supposed to produce. Phase 5.4 is therefore a port rather than a rewrite.

Nothing has been verified on a Mac, and no part of the UI port has been done — neither of which is claimed otherwise anywhere above.

*Updated 2026-10-13:* the Serato spike has been run on Windows / Serato DJ Lite; all four checks have answers on that platform (Section 4), pending Mike's version and a Mac.

Next: the SQLite foundation. The expected ABI obstacle did not materialise — `better-sqlite3` 13.0.3 loads in Electron 44 as installed (Section 5) — so the next step was the schema, `schema_version` and migrations (§6.2). That runner and its verified backup now exist and are tested (Section 3a). Next is wiring it into startup with the real database location and connection settings, then the first preference tables and `prefs.get/set` IPC. The startup plan is written and documentation-checked (decision 0007, design note), and its first step, the connection settings, is done (Section 3b). Next: `initDatabase(dir)` with the WAL tests, including running `migrate()` at `synchronous = FULL`.
