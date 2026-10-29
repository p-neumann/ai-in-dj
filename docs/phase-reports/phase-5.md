# Phase 5 — Desktop shell and durable local data

**Status:** In progress. Built entirely independently on `ranjish/ccdj-desktop` - not based on, referencing, or merging any other branch's desktop work.

---

## Step 1 — Electron shell (commit `84011f7`, `feat(desktop): electron shell`)

### What was built
Main/preload/renderer split per CLAUDE.md Section 5.6, with Section 7.5 hardening on from the first version: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, denied window-open handler. Preload exposes an empty bridge (nothing to call yet - no database or library import exists for it to reach into). Renderer is a placeholder screen that live-checks the isolation is actually working.

### Verification done before committing
- 7/7 security tests pass (`node --test`, source-level checks - no Electron binary or display needed).
- Typecheck clean (`tsc --noEmit`, both the main/preload and renderer configs).
- Real production build succeeds (`electron-vite build`).
- Checked the **real compiled output** in `out/`, not just source: all three hardening flags present in the actual shipped `out/main/index.js`; zero hits for `window.storage` or `api.anthropic.com` anywhere in the built app (CLAUDE.md's own Phase 5 gate).
- Caught and fixed 9 known security advisories (CVEs) in the initially-picked dependency versions (an older Electron release, an old esbuild with a known dev-server vulnerability) before committing - re-pinned to patched, compatible versions (Electron ^44, Vite ^7, electron-vite ^4, `@vitejs/plugin-react` ^5.2). Re-ran `npm audit` after: 0 vulnerabilities.

### Gap found - real evidence, found by Ranjish, not by any automated check
None of the checks above actually launch the real Electron app window. Tests are source-text checks by design (so they run with no GUI); the build only compiles JavaScript, it doesn't run it; typecheck never executes anything. **The one thing that actually opens a real window - `npm run dev` - was never run by me**, deliberately, since this tool has no display to see a GUI window on.

When Ranjish ran `npm run dev` himself to see the window with his own eyes (exactly as asked), it failed first with `Error: Electron uninstall` - the actual Electron program binary had never been downloaded during `npm install` in this environment, only Electron's small JavaScript wrapper package. Likely cause: Electron's installer needs to download a large (~100+ MB) platform-specific binary from the network as part of `npm install`, and that step didn't complete in this tool's environment, without `npm install` itself reporting any error - so every check above passed cleanly while the one thing that actually matters (a real window opening) was still broken.

**Fix (Ranjish, confirmed working):** ran `node node_modules\electron\install.js` manually from `apps\desktop`, which downloaded the missing binary. After that, `npm run dev` opened a real window showing **4 of 4 security checks green**.

### Standing process change, effective immediately
For every remaining Phase 5 step, "the tests pass and the build succeeds" is no longer treated as sufficient proof on its own. Each step's verification now explicitly includes **a real `npm run dev` launch, confirmed by Ranjish with his own eyes** (since this environment has no display to confirm it directly) - not just source-level tests and a compiled build. This gap is exactly why that matters: every automated check available passed while the app genuinely did not open.

---

## Step 2 — SQLite persistence (commit pending, `feat(desktop): sqlite persistence`)

### What was built
A real, permanent local database (`better-sqlite3`), per CLAUDE.md Section 6.2:
- **Migrations** (`db/migrations.ts`, `db/migrate.ts`) - forward-only, tracked via a `schema_meta` table, each applied inside its own transaction. Migration 1 creates `window_bounds` and `preferences`.
- **Corruption safety** (`db/openDatabase.ts`) - checks `PRAGMA integrity_check` on open; a damaged file is renamed aside (`*.corrupt-<timestamp>`) and a fresh, working database takes its place, rather than crashing. No restore-from-backup history exists yet (that needs real backup infrastructure, not built this step) - this is the honest, minimal safe behavior for now.
- **Window bounds** (`db/windowBounds.ts`) - wired into `main/index.ts`: the window opens at its last saved size/position (falling back to the provisional D7 default on first run), and saves on every resize, move, and close.
- **Preferences** (`db/preferences.ts`) - simple key/value get/set. Built and tested, not yet wired to any UI (no screen exists yet to set one).

### Verification done
- 13/13 tests pass (6 new: migrations from empty, migrations run twice safely, window-bounds round-trip, preferences round-trip, a real corrupt-file recovery test that writes genuine garbage bytes to a file and confirms the app backs it up and recovers, and a clean-file open).
- Typecheck clean, build succeeds.
- `npm run rebuild-native` run (rebuilds the native module for Electron's own Node version) - and re-ran the full test suite afterward specifically to check it hadn't broken plain-Node testing. It hadn't: direct evidence (the prebuilt `.node` files are named only by OS+architecture, e.g. `win32-x64.node`, not by a Node-version/ABI number) shows `better-sqlite3` v13 ships ABI-stable N-API binaries - the same file already worked for both. The rebuild step is kept in the scripts as a documented safety net for any future native dependency that isn't N-API-based, not because a real conflict was found this time.
- Confirmed the real Electron binary (from step 1's fix) was still intact after this step's `npm install`.
- A small, known, harmless warning: Node prints a one-line performance notice about re-parsing the new `.ts` files' module syntax (`MODULE_TYPELESS_PACKAGE_JSON`). Not an error, not something masking a real problem - noted here rather than silently ignored.

### Real-window check
**Confirmed by Ranjish:** moved and resized the window, closed the app, reopened it - it came back at the exact size and position it was left at. Step 2 confirmed working, for real.

### Process correction
Step 2 was committed before Ranjish's real-window check, not after - against our own agreed order (step 1's standing process says the real check happens before committing, not after). Corrected going forward: step 3 (below) is held uncommitted until Ranjish confirms the real-window check himself.

---

## Step 3 — library import (commit pending, `feat(desktop): library import`)

### What was built
Real Serato CSV import, per CLAUDE.md Section 6.1:
- **A proper RFC-4180 CSV parser** (`library/parseCsv.ts`) - handles commas inside quoted fields, escaped quotes (`""`), newlines inside a quoted field, a leading UTF-8 BOM, and both CRLF/LF line endings. Headers are lowercased.
- **Row normalization** (`library/normalizeTrack.ts`) - the display-name rule and the Camelot key-notation cleanup (`8M`->`8A`, `2D`->`2B`, etc.) copied faithfully from the project's own reference spec (`reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx`), not invented fresh or looked at from any other branch. A real `0` play count is kept as `0`, distinct from an empty/absent one (kept as unknown, not silently zeroed). Unknown columns are preserved, not dropped. A row is only rejected if it has none of title/location/filename, with the reason and 1-based line number recorded - never a crash.
- **A new `tracks` table** (migration 2) and storage functions (`db/tracks.ts`) - a full import replaces the table in one transaction (no partial-merge/sync logic yet - that's real Phase 5/6 work, not built here).
- **One narrow IPC function pulled forward from step 4** (`main/ipc.ts`, `preload/index.ts`) - `library.importFromFile()`. The renderer never supplies a file path; the file comes from a native OS "Open" dialog the main process controls.
- **Renderer**: a new "Step 3: library import" section with a real button, plus the step 1/2 lede text updated (it still said "Next: a real local database" after step 2 shipped - fixed).

### Verification done
- 32/32 tests pass (19 new: 5 CSV-parser edge cases incl. quoted commas/quotes/newlines/BOM/CRLF, header lowercasing, 6 `normalizeTrack` rules incl. the real-0-vs-unknown play count distinction, a rejected-row line-number check, 3 `tracks`-table storage tests, and a real, measured benchmark).
- **75,000-row benchmark (CLAUDE.md's own Phase 5 test list), actually measured, not assumed: 512ms.**
- Found and fixed a real break in step 2's own tests: they'd hardcoded "the latest schema version is 1," which broke the moment step 3 legitimately added migration 2. Fixed to check against the real migrations list instead of a hardcoded number, so a future step 4/5 migration won't break this again.
- Typecheck clean, build succeeds. Real build output re-checked: still 0 hits for `window.storage`/`api.anthropic.com`.

### Three real bugs found by Ranjish testing the real window, with real evidence, before committing

**1. Saved data wasn't shown again after restart.** Checked directly, not assumed: queried the real `ccdj.sqlite` file on disk (`%APPDATA%\ccdj-desktop\ccdj.sqlite`) after closing the app - `SELECT COUNT(*) FROM tracks` genuinely returned 38,484, with real track names. **The data was never lost** - the bug was that nothing on startup read it back and displayed it. Fixed: a new `library:getStatus` IPC function + a renderer startup check, so the screen now shows what's already saved instead of looking empty.

**2. Duplicate-import risk, checked at full scale, not just a small test.** Imported the real `Crates.csv` into a real database file three times in a row: `38484 -> 38484 -> 38484`. No duplication, confirmed with real evidence (`replaceAllTracks`'s whole-table replace, inside one transaction, was already correct here).

**3. The real bug behind "38484 rejected."** Direct byte inspection of `Crates.csv` found every row actually ends in a doubled `\r\r\n`, not a plain `\r\n` - a genuine export quirk, not expected. The parser (correctly, by RFC-4180/old-Mac-line-ending rules) treated the lone `\r` and the following `\r\n` as TWO separate line endings, producing one real row plus one spurious empty row for every single real song - doubling the apparent row count and reporting half the file as "rejected," when none of it actually was. **Fixed at the root**: consecutive line-break characters now collapse into one row boundary. Re-ran the import after the fix: **0 rejected**, `38484 -> 38484` kept, confirmed clean.

Also kept, defensively, even though it's no longer triggered on this file: `normalizeTrack` now tells a genuinely blank row apart from a row that has real data but is still unusable, and the screen shows "N blank line(s) skipped" separately from "N row(s) need attention" - not a flat, ambiguous "rejected" number.

**4. The real explanation for 38,486 (prototype) vs 38,484 (this import), checked by directly diffing both parsers' actual output - not guessed:** every one of the 2 missing/differing entries is a title containing an escaped quote mark, like `12"` (a real 12-inch-single mark) or `"N"`. The old prototype's own parser (`apps/server/src/engine/parsing.js`) has no concept of RFC-4180's `""`-escaping - it toggles quote-state on every single `"` character, which corrupts its own field boundaries on exactly these rows (confirmed directly: its output for one of them literally reads `Word Up! (12 Club Mix...)` - missing the real quote mark - and for 2 of them, the corruption causes it to emit one real song as two garbled, duplicate-looking fragments, artificially inflating its own count by 2). This is exactly CLAUDE.md's own R24 parity rule: a difference is expected and correct when it's a row the prototype itself mis-parses (escaped quotes), not a defect in the new parser. 38,484 is the correct, true count of distinct real songs in this file.

### Real-window check
**Confirmed by Ranjish:** import showed 38,484/38,484, restart showed the saved count immediately with no re-import, and importing again stayed at 38,484. Step 3 confirmed working, for real.

---

## Step 4 — the rest of the locked-door bridge (commit pending, `feat(desktop): finish the bridge - prefs, history, showInFinder, setAlwaysOnTop`)

### What was built
Four more narrow, named IPC functions (CLAUDE.md Section 7.5), finishing what the step-1 preload file's own comment had already listed as coming:
- **`prefs.get`/`prefs.set`** - wired to the preferences store already built in step 2.
- **`history.append`/`history.list`** - a new, generic history table (migration 3). Stores whatever JSON-serializable entry it's given; the real Track Cheat session-history shape (CLAUDE.md Section 6.5) doesn't exist to store yet (that's step 5) - this layer doesn't need to guess that shape in advance.
- **`showInFinder(trackId)`** (R18, the prototype's own name) - the renderer only ever says "show me track #N"; the real file path lookup happens on the trusted main-process side (`db/tracks.ts`'s new `getTrackLocation`), never a raw path accepted from the renderer.
- **`setAlwaysOnTop(flag)`** (R18, the prototype's own name) - pins the real window above others.
- **Renderer**: three new sections (preferences, history, always-on-top) plus a "Reveal in Finder" button next to each sample track shown from step 3.

### A real, honest limitation flagged before testing, not discovered by accident
The real library you imported has Mac-style paths (`/Volumes/...`) that don't exist on this Windows machine - clicking "Reveal in Finder" on those will correctly do nothing, since those files genuinely aren't here, not because the feature is broken. Added a small, **local-only, not committed** fixture (`test/fixtures/reveal-in-finder-manual-test.csv`, gitignored - it hardcodes a real path from this one machine, not portable or meant for the shared repo) pointing at two files that actually exist here, so this feature has something real to prove itself against today. Full behavior on an actual Mac next to Serato still needs real Mac verification later - unchanged.

### Verification done
- 39/39 tests pass (4 new: history round-trips the exact entry shape, not just a string; history returns newest-first and respects a limit; `getSampleTracks` returns real ids; `getTrackLocation` returns the real path for a known id and `null` - never a guess - for an unknown one).
- Typecheck clean, build succeeds. Real build output re-checked: still 0 hits for `window.storage`/`api.anthropic.com`.

### Real-window check (Ranjish, confirmed)
Preferences persisted after a real restart, history showed newest first, Reveal in Finder opened a real Explorer window on the test file, and Always on Top kept the window in front. Step 4's four bridge functions confirmed working, for real.

**Also confirmed, real evidence, not assumed:** importing the 2-row test fixture genuinely replaced the saved 38,484-track library down to 2 rows (queried the real `.sqlite` file directly to check) - this is step 3's own documented "a full import replaces the table" behavior working exactly as designed, not a new bug. Flagging it here since it had a real, visible consequence during this test: re-import `Crates.csv` to get the real library back.

### A second real bug found during this same real-window test: two copies of the app running at once
The terminal showed `Unable to move the cache: Access is denied (0x5)` and a GPU cache creation failure, from two process IDs at once - a real second instance of the app had started while the first was still running. Confirmed the cause: both copies were fighting over the same Chromium GPU-cache folder on disk - and, more seriously, both would have been opening the exact same SQLite database file at the same time, risking write conflicts between them (not something to leave to chance in a desktop app).

**Fix:** added Electron's standard single-instance lock (`app.requestSingleInstanceLock()`). Only one copy of the app can ever run now; a second launch attempt just brings the real, already-running window to the front instead of opening a duplicate. Added a regression test (`security.test.js`) so this can't be silently removed later. 40/40 tests pass, typecheck clean, build clean, `requestSingleInstanceLock` confirmed present in the real compiled output.

### Real-window check (Ranjish, confirmed)
Single-instance lock: a real second launch correctly failed to open a second window, no GPU-cache error. Step 4 fully confirmed.

---

## Step 5, piece 1 — the pipe to the real backend (commit pending)

### Plan agreed before building anything (Ranjish's own rules)
- Port Mike's real screens, don't redesign them.
- Every AI request goes through the real backend server - this app must never call Anthropic directly or contain any key.
- `LIVE_AI_CALLS` stays `false`; use the simulated provider until a real call is explicitly approved.
- Ordered pieces: **(1) the pipe** -> (2) Library screen -> (3) Track Cheat core -> (4) daisy-chain/votes -> (5) Crate Cheat -> (6) Playlist Cheat -> (7) Account/Settings -> (8) polish.

### What was built (piece 1 only - no AI involved at all)
A real, proven HTTP connection from this app to the backend server, following CLAUDE.md Section 5.6's own architecture diagram exactly: the real network call lives in the **main process** (`src/main/backendClient.ts`), never the renderer. The renderer only ever asks main, through the same locked-door bridge from steps 1-4, to check the connection or create a session - it never fetches anything itself and never sees the dev token.
- `checkBackendHealth()` -> `GET /healthz` (no auth needed, matches the real route).
- `createBackendSession()` -> `POST /v1/sessions` with the dev-token `Authorization` header (`apps/desktop/.env`, mirroring `apps/server/.env`'s own `DEV_TOKENS` value - a local dev convenience, not a real secret, same category as the server's own dev token).
- Renderer: a new "Step 5, piece 1: backend connection" section - checks health on load, with a "Check again" button and a "Create a real session" button showing the real returned session ID.

### Verification done
- 45/45 tests pass (5 new: real request-shape checks against a stubbed `fetch` - correct URL, correct method, correct `Authorization` header, a network error caught and reported rather than thrown, a non-ok HTTP response reported as a clear failure). The real end-to-end network call itself is proven by the real-window check below, not by these - same approach as every other Electron-specific piece in this project.
- Typecheck clean, build succeeds.
- **Checked the real compiled renderer bundle specifically for this piece** (not just the old gate): zero hits for the dev token, and zero hits for the backend URL, anywhere in `out/renderer/assets/*.js` - confirming the architecture actually holds in the real build, not just in intent. The security gate (`window.storage`/`api.anthropic.com`) still holds too.
- Sanity-checked the real backend server directly (`curl`) against the exact calls the app will make - `/healthz` and `POST /v1/sessions` with the real dev token both responded correctly - before handing this to Ranjish, so a real-window failure would point clearly at the Electron side, not an unrelated server issue.

### Real-window check (Ranjish, confirmed)
Connection worked. Piece 1 confirmed working, for real.

---

## Step 5, piece 2 — the real Library screen (commit pending)

### Two speed questions, answered with real measurements before building anything
Ranjish asked these before any code was written, not after - both measured directly against the real ~38,484-track library:

1. **Does `tracks` have indexes for searching?** No. Measured plain substring search (`LIKE`) for "punk," "daft," "the" (worst case), and even an unfiltered fetch of all 38,484 rows: **7-12ms every time** - about 20x under CLAUDE.md's own 200ms/75k target. Also measured SQLite's FTS5 (full-text search) for comparison: **0-2ms** - genuinely faster, but not something a person could feel while typing. A plain index wouldn't help this query shape anyway (a leading-wildcard `LIKE` can't use one). **Decision: no index, no FTS5** - real, measured complexity-for-no-benefit at this size; FTS5 is the right tool to reach for later if the library grows far larger and search measurably slows down, not now.
2. One more real number that shaped the actual design: moving all 38,484 rows out of the database and across to the screen takes **~50-60ms total**. Cheap enough to do **once** when the screen opens; doing it on every keystroke would add a small but real lag while typing fast. So: fetch once, then search **instantly in the screen's own memory** from there - measurably faster overall than re-querying the database per keystroke, not slower.

### What was built
- `db/tracks.ts`'s `getAllTracksForLibrary` - one query, returns every track with only the fields the screen needs (no `location`/`extra` - keeps the one-time transfer lean).
- `library:getAllTracks` IPC function (main-owned, same pattern as every other IPC function so far).
- `renderer/src/library/filterTracks.ts` - the actual search logic, a small pure function (case-insensitive substring match across displayName/artist/title) so it's directly unit-testable without any React/DOM involved.
- `renderer/src/library/LibraryScreen.tsx` - the real screen: a search box, a live "Showing X of Y tracks" count, and a **virtualized** scrollable list using `@tanstack/react-virtual` (a small, well-established library chosen deliberately over hand-rolling the scroll math, which has real, easy-to-get-wrong edge cases). Only the rows actually visible in the scroll viewport are ever real DOM elements - CLAUDE.md's own R25 limitation ("Library list | only 500 rows") is now removed; all 38,484 tracks scroll, not just the first 500.
- Refreshes automatically after a new library import (via a simple refresh-signal counter), not just once at app start.

### Verification done
- 50/50 tests pass (5 new: `getAllTracksForLibrary` returns the right lean fields; `filterTracks`'s 4 cases - empty search returns everything, case-insensitive substring match, matches artist/title too not just displayName, no match returns an empty list cleanly).
- Typecheck clean, build succeeds. Security gate re-checked: still 0 hits for `window.storage`/`api.anthropic.com` in the real compiled output.
- `@tanstack/react-virtual` installed clean: 0 vulnerabilities.

### Real-window check (Ranjish, confirmed)
38,484/38,484 shown, scrolling smooth, "daft" narrowed instantly, clearing snapped back immediately. Also confirmed before committing: `npm audit` → 0 vulnerabilities, `@tanstack/react-virtual@3.14.15` installed. Piece 2 is not yet styled to Mike's real look (confirmed, deliberate - the visual port is separate, later work) - piece 2 only proves the mechanics.

---

## Step 5, piece 3 — Track Cheat core (commit `d2bef3e`)

### Confirmed before building anything (Ranjish's own check)
The recommendation logic is already built and tested in the backend - that was Phase 3/4's job, not this one. This piece adds only the screen (seed, sliders, button) and wires it to the already-existing `POST /v1/track-cheat/recommend` route; it changes nothing in `apps/server`. Follows `CLAUDE.md`'s own Phase 5 line: *"replace every `window.storage` use and every direct Anthropic `fetch` with the typed API client."* No session yet - chain/bridge/drift/daisy-chain memory is piece 4, kept deliberately separate (the real route runs fully stateless without a `sessionId`, which is its own documented behavior, not a shortcut taken here).

### What was built (first pass)
- `db/tracks.ts`'s `getAllTracksForBackend` - the fields the real `recommendTrackCheat` route actually reads (including `location`, needed to derive the same display name already computed at import time) - read fresh from this process's own database on every call, never passed through the renderer (same reasoning as piece 1).
- `backendClient.ts`'s `recommendTrackCheat` - posts to the real route, same auth pattern as every other call so far.
- `renderer/src/trackCheat/vibeLabels.ts` - Mike's real vibe-slider labels (`-8` "Vibe Lock" through `+8` "Total Chaos"), copied character-for-character from the reference spec's own `VIBE_LABELS` object, not reworded. Vibe `0` shows **no label**, matching the original app's own behavior (its label lookup genuinely returns nothing at 0) - not an invented placeholder.
- `renderer/src/trackCheat/TrackCheatScreen.tsx` - seed search (reuses the same `filterTracks` function from piece 2), vibe slider (-8..+8) with the real label and description shown live, energy slider (-16..+16), play-count mode (familiar/mix/deep), a results list showing name/bpm/key/lane, and the honest diagnostic line CLAUDE.md's own contract already returns: candidate pool size, fallback depth, requested vs. returned, and whether the call was real or simulated.

### First-pass verification
- 58/58 tests pass (8 new: Mike's real vibe labels locked in against the reference spec at -8/0/+5/+8; `getAllTracksForBackend`'s exact field set; `recommendTrackCheat`'s request shape - confirms the library array and every field name match what the real server route expects; a server-reported failure handled as a clear error; a network error caught, never thrown).
- Typecheck clean, build succeeds.
- Security gate re-checked, including the new surface: still 0 hits for `window.storage`/`api.anthropic.com`, and - specifically re-checked since this piece added more backend calls - still 0 hits for the dev token or the backend URL anywhere in the real compiled renderer bundle.
- **Sanity-checked the exact request shape against the real, running server** (mock provider, `LIVE_AI_CALLS=false`, untouched) before handing this to Ranjish: posted the same library/seedTrackId/vibe/energy/playCountMode shape the app will send, got back a real, valid simulated result. Server process stopped immediately after.

### Real bug found by Ranjish testing against his real 38,484-track library: HTTP 413

Seed picking, vibe labels, and sliders all worked. "Get Recommendations" failed with `Error: HTTP 413`. Root cause, confirmed directly: the app sent the entire library inline on every recommend call, and that request body exceeded Fastify's default ~1MB limit once the library was Ranjish's real size, not the small test library the first-pass tests used. Explicit instruction: **don't just raise the limit** - that would hide the real problem (a request that grows without bound as the library grows) instead of fixing it.

#### The fix, explained plainly, agreed before building

The library doesn't need to travel on every recommend call - it only changes when the DJ imports or re-imports. So: **sync it to the server once, then every recommend call afterward just says "use revision #5," not the whole library again.**

1. A new route, `POST /v1/library/sync`, takes the whole library and gives back a `libraryRevision` number. It has its **own**, much larger size limit (30MB) - `recommend`'s own limit is untouched.
2. `recommend` now accepts a `libraryRevision` instead of the library itself. Its request body stays tiny (a seed id and a few numbers) no matter how big the library is.
3. This is a **full-replace sync, not true incremental diffing** - every sync sends the whole library again, it doesn't compute "what changed since last time." CLAUDE.md's own fuller design (upserts/deletes against a last-known revision) is real work this doesn't build. Full replace was chosen because the desktop app already has the complete, current library in SQLite at all times, and syncing only happens rarely (app start, or right after a re-import) - not on every keystroke or every recommend call - so the extra complexity of real diffing isn't earning its cost yet. Written up in full in `docs/decisions/0009`.
4. **The server forgets the synced library on restart** (in-memory only, same as its existing session store) - so a `libraryRevision` the app is holding can go stale at any time, not just after a new import. When that happens, the server returns `LIBRARY_OUT_OF_SYNC` (a code CLAUDE.md's own Section 6.3 already documents for exactly this). The desktop app detects that specific error, **automatically resyncs once, and retries** - the DJ never sees a raw error for something the app can fix itself.
5. **Privacy, confirmed directly, not assumed:** the sync payload is the exact same lean shape already built for the Library screen in piece 2 (`id, displayName, artist, title, bpm, key, genre, year, playcount`) - it has never included `location`/file paths. The server also strips any `location` field from a synced payload anyway, as a second layer of protection, proven by a dedicated test (`libraryStore.test.js`) that sends a fake path on purpose and confirms it's never stored.

#### What changed to build this
- `apps/server/src/library/libraryStore.js` (new) - the in-memory, full-replace store.
- `apps/server/src/routes/library.js` (new) - the sync route, 30MB body limit.
- `apps/server/src/routes/trackCheat.js` - additively accepts `libraryRevision`; throws a new `LibraryOutOfSyncError` (mapped to HTTP 409) when a revision is stale or unknown. The old inline-`library` path is untouched - existing Phase 3/4 tests still exercise it directly.
- `apps/server/src/engine/trackNames.js`'s `getDisplayName` - additively trusts a provided `displayName` first (for location-less synced tracks), falling through to the exact original logic for anything without one.
- `apps/desktop/src/main/db/tracks.ts` - removed `getAllTracksForBackend` entirely. `getAllTracksForLibrary` (already built for the Library screen) is now also the sync payload - one lean shape, not two.
- `apps/desktop/src/main/backendClient.ts` - added `syncLibraryToBackend`; added `recommendTrackCheatWithAutoSync`, a plain, directly-unit-tested function that does the "sync if we don't have a revision yet, recommend, and if the server says `LIBRARY_OUT_OF_SYNC`, resync once and retry" logic - deliberately kept out of the IPC handler itself so it's testable without a real Electron environment.
- `apps/desktop/src/main/ipc.ts` - the `backend:recommendTrackCheat` handler is now a thin wrapper: it owns only where the cached revision lives between calls (module-level state, cleared after a fresh import), and calls the tested function above for everything else.

#### Verification after the fix
- Server: **119/119 tests pass** (16 new in 3 files - `libraryStore.test.js`, `trackNames.test.js`, and `librarySync.test.js`, the real-HTTP-layer proof). The two tests that matter most for proving this is the real fix, not a bigger limit in disguise: a synthetic ~38,484-track sync succeeds and a subsequent recommend call using only `libraryRevision` succeeds too; and `recommend` **still 413s** on an oversized **inline** library, confirming its own limit was never touched.
- Desktop: **64/64 tests pass** (rewrote the old inline-library `recommendTrackCheat` tests to the new `libraryRevision` shape; added tests for `syncLibraryToBackend` and for `recommendTrackCheatWithAutoSync`'s sync-first/skip-sync-when-cached/resync-and-retry-once/resync-failure-reported paths). Fixed a real bug in the tests' own shared fetch-stubbing helper while writing these - it restored the real `fetch` before a test's second sequential call ever fired, which only this piece's multi-call tests exposed.
- Typecheck clean (`tsc --noEmit`, both configs), real build succeeds.
- Security gate re-checked on the real compiled output: still 0 hits for `window.storage`/`api.anthropic.com`, and 0 hits for the dev token or the backend URL anywhere in the compiled renderer bundle - confirming the sync/resync logic, like everything else, stayed entirely on the main-process side.
- All server and desktop test runs done with `--test-concurrency=1` (now the permanent default in both `package.json` files, per Ranjish's standing instruction after a parallel test run exhausted his laptop's memory mid-session and crashed it).

### Real-window check - confirmed by Ranjish, 2026-10-11

Checklist run as planned, with one honest difference from how it was written: by this point `LIVE_AI_CALLS=true` in `apps/server/.env`, so the backend was calling the real Anthropic API, not the mock provider the checklist's step 1 assumed. That's a stronger result, not a weaker one - this is the real regression test for the 413, actually exercised against the real AI, not simulated.

**Result:** searched for a seed, moved the vibe slider (label text changed correctly), clicked "Get Recommendations" against the real, full library. Got back **10 of 20 requested**, `candidatePoolSize: 100`, `fallbackDepth: 0` - a clean first-try result, no fallback chain needed. Marked `simulated: false` (real AI). The 10 returned songs fit the seed musically. No 413, confirming the library-sync fix works end to end against the real backend and the real AI.

Step 5, piece 3 is fully confirmed working, for real, with real AI - not just simulated.

(The second-click-is-fast and stop-server/auto-resync checks from the original plan were not separately reported back - only the core recommend-against-real-AI result above is confirmed with evidence. Treat those two as still open if they matter later.)
