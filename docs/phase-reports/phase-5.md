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

### Real-window check (per the step 1 standing process - not yet done by me, no display here)
**Ranjish to confirm:** run `npm run dev` from `apps/desktop`. Resize or move the window, then fully quit the app, then reopen it - the window should come back at the exact size and position it was left at. That is the database actually working, not a claim from a passing test.
