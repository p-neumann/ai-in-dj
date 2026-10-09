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
**Ranjish to confirm before this gets committed, per our agreed order:** run `npm run dev` from `apps/desktop`. Click "Import CSV library..." and pick the real `Crates.csv` at the repo root. The screen should show 38,484 imported, 0 blank lines/rows needing attention, and real sample names. Then fully quit and reopen the app - it should show "38,484 tracks saved from before" immediately, without re-importing. Then import the same file again - the count should stay 38,484, not double.
