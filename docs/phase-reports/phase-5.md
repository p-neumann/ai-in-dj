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

## Step 5, piece 5 - Crate Cheat (stopped mid-check, 2026-10-30)

Crate Cheat screen built and committed (`6bf186a`), same pattern as Track Cheat. Ranjish's real-window check against his real library (real AI on) found a real bug: prompt "music for the hip hop", size 10, mix mode failed with `stop_reason:"max_tokens"` ("Response cut off..."). Confirmed with real evidence the Oct 12 max_tokens fix (`0008`) was present and unmodified, and computing the identical numbers (requestCount 15, ceiling 8700) as the scenario it was already tested against - so the formula wasn't the problem, but there was no logging anywhere to see what the model's real token usage actually was for that call.

Added real per-call diagnostics logging and replaced the misleading "try a smaller track count" message (committed `ce1f4ce`, `docs/decisions/0012`). **The failing request has not been re-run yet with this logging in place** - that's the next step: re-run "music for the hip hop" / size 10 / mix against the real AI, read the real `outputTokens`/`thinkingTokens`/`stopReason` from the server console, and only then decide whether anything (a limit, a formula) should actually change.

**Status: Crate Cheat is NOT yet confirmed working end-to-end with real AI.** Both commits above explicitly flag their real-window check as pending/incomplete. Stopped here for an exam; resume by re-running the same failing request.

**Resolved, 2026-10-30:** re-ran the same request with the new logging in place. The real numbers showed the ceiling and the request size were not the actual problem - thinking varies a lot from call to call and does not track pool size, confirmed across three real calls. Applied a stopgap (`docs/decisions/0013`, third time for this failure, marked clearly as a stopgap, not a real fix) and closed a second logging gap in the knowledge-resolver call. Ranjish's real-window re-check passed. Committed `964c686`, `110684c`'s predecessor. Crate Cheat is now confirmed working end-to-end with real AI.

## Step 5, piece 6 - Playlist Cheat, plain text only (committed, 2026-11-04)

Built the plain-text half of Playlist Cheat (parse, match against the real library, pick 1/3/5 versions per song). Spotify URL import left out on purpose - that's Phase 6 (needs D2, the Spotify secret rotated, and a proxy audit, none done). Confirmed directly against the reference source that the real matcher makes no AI calls at all - an AI-based picker exists in the source but is marked dead code by Mike himself and has zero real call sites, independently re-confirmed. Runs entirely in the desktop renderer, no call to `apps/server`.

Ranjish's real-window check found a real bug: pasting an artist name with no title (copied straight from his own Library screen) returned "no match in your library," wrongly implying he didn't own a song he actually owns several versions of. Confirmed, including against Mike's own verbatim source run standalone, that this is an existing limitation in the real prototype (artist-only input was never supported), not something this port introduced. Fixed the wording only (`docs/decisions/0014`) - no matching logic changed. Checked again by Ranjish, passed. Committed `110684c`. Not pushed.

**Backlog (noted, not started):** rewrite `docs/decisions/0006` through `0013` in the same plain-English style as `0014`, so the whole folder reads consistently for Mike and Paul, not just the newest entries.

**Note for anyone picking this up later (2026-11-08):** Ranjish's own Anthropic API key expired on 2026-11-04. All the local, simulated-provider checks in this phase don't need it and keep working fine - but any real-AI check (`LIVE_AI_CALLS=true`) will fail with an authentication error until he generates a new key. If a real-AI check suddenly starts failing with an auth-shaped error, check this before assuming something in the code broke.

## Step 5, piece 7 - Settings screen (in progress, real bug found 2026-11-08)

Settings screen built (theme, Always On Top, Style Profile, Do Play/Do Not Play, History, Report a Problem) - see `docs/decisions/0016`. Ranjish's real-window check found a real bug: a session-only Do Not Play entry survived a full app restart, which CLAUDE.md's own Phase 5 goal line explicitly says should not happen. Root cause confirmed with real evidence (see `docs/decisions/0018` once written) before any fix - this port's own `persistLocal` function never filtered out session-only entries before writing to local storage, unlike Mike's real `persistPrefs`, which does. Same flaw affects both Do Play and Do Not Play. Not yet fixed - investigation reported to Ranjish, fix pending his approval.

Settings screen remains uncommitted pending this fix and Ranjish's remaining checks (theme-after-restart, session-vs-permanent-after-restart, Always On Top, Report a Problem).


---

<!-- Below: Hannah's phase-5 report from hannah/phase5-desktop, kept whole until the two reports are merged (combine step 7). -->

# Phase 5 — Desktop shell and durable local data

**Status:** In progress. First of three commit milestones complete.
**Date of this report:** 2026-10-06 (work performed 2026-10-05).
**Update history:**
- **2026-10-13 (first update):** Serato spike status (Sections 1, 4, Summary) and two new findings in Section 5. *At the time of this update*, no Phase 5 code had changed since `f4ae88f`. That is no longer the current status; see the later updates below.
- **2026-10-13 (second update):** `better-sqlite3` installed and verified to load in Electron 44 without a rebuild (Section 5); `package.json`/`package-lock.json` changed. A minimal main-process load check was then added (`src/main/db/`, one call and a temporary startup log in `src/main/index.ts`) and verified through `npm run build` and a launch of the built app (Section 5).
- **2026-10-13 (third update):** migration runner and pre-migration backup added with 11 tests (Section 3a); decision 0006 recorded (Section 6).
- **2026-10-13 (fourth update):** startup plan and decision 0007 committed (`f79ef3a`); connection settings (`openDatabase()`) added with 6 tests, revealing that this better-sqlite3 build's SQLite defaults differ from plain SQLite's (Section 3b).
- **2026-10-19 (fifth update):** design note corrected for this build's SQLite defaults (Section 3b); Section 3a's note on connection pragmas updated. Documentation only; no code changed.
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
- Tests use SQLite's default rollback journal, not WAL. Backup and read-only opening in WAL mode are not exercised yet. Connection pragmas (journal mode, foreign keys) come with the startup wiring. *(2026-10-19: the connection settings, including `synchronous = FULL`, now exist in `openDatabase()` (Section 3b) but are not wired to startup; `migrate()`'s own connections do not use them yet.)*
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
5. WAL persists after closing, while a plain connection falls back to `synchronous = NORMAL` and has foreign keys on; reopening through `openDatabase()` restores FULL;
6. a file that is not a database is rejected, left byte-for-byte unchanged, and not left open.

0 temporary folders were left over.

**Finding: this better-sqlite3 build changes SQLite's defaults.**
- The first run of test 5 failed (23/24). It assumed a plain connection has foreign keys **off**, which is SQLite's documented default, but the connection reported **on**.
- better-sqlite3's `docs/compilation.md` lists the bundled SQLite's compile options, including `SQLITE_DEFAULT_FOREIGN_KEYS=1` and `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1` (also visible in the installed package's `deps/defines.gypi`, checked 2026-10-19). So, in every connection this app opens:
  - **foreign keys are on by default**;
  - **in WAL mode, `synchronous` defaults to NORMAL**, which can lose the last committed transactions on power loss. FULL is what decision 0007 chose.
- Test 5 was rewritten to assert the actual behaviour (24/24). `connection.ts` was not changed; it was already correct.

**Consequences:**
- **`openDatabase()`'s explicit `synchronous = FULL` is essential, not redundant.** Its `foreign_keys = ON` line cannot be shown to have an effect, because the default is already on. It is kept as protection in case a future build changes that default.
- **`migrate()` opens its own connections without `openDatabase()`.** Once the file is in WAL mode (stored in the file), migrations would therefore run at this build's WAL default, `synchronous = NORMAL` (`synchronous` is not stored in the file). That does not meet decision 0007 item 5, read as covering every connection that writes (design note section 8). Not yet fixed; to handle in the `initDatabase` step.
- **Foreign keys are also on inside `migrate()`'s connections.** A future migration that rebuilds a table may need them off, outside the migration transaction (design note section 2).
- **Design note corrected 2026-10-19.** It said foreign keys are "off by default" and was silent on the WAL `synchronous` default. Both are wrong for this build. A dated correction is now in section 8; the original text is kept and marked. Decision 0007 is unchanged.

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
