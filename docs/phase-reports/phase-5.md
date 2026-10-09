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

## Step 2 onward
Not started. Next: a real local SQLite database (schema, migrations), per CLAUDE.md's own commit-milestone order (`electron shell` → `sqlite persistence` → `library import`).
