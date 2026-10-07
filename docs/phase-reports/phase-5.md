# Phase 5 — Desktop shell and durable local data

**Status:** In progress. First of three commit milestones complete.
**Date of this report:** 2026-10-06 (work performed 2026-10-05)
**Branch:** `hannah/phase5-desktop` (based on `ranjish/ccdj-desktop`, pushed)
**AI calls used while doing this work:** none. Nothing in this milestone calls a model, and `apps/desktop` has no provider dependency of any kind.

Phase 5's three commit milestones per CLAUDE.md Section 9:

| Milestone | State |
|---|---|
| `feat(desktop): electron shell` | **Done** (`f4ae88f`) |
| `feat(desktop): sqlite persistence` | Not started |
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

**Serato DJ Lite installed** on the Windows development machine. The spike itself has **not** been run — see Section 3.

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

## 4. Not started, unverified, or blocked

**The Serato spike (Phase 2S).** All four checks in `docs/serato-spike.md` still read *Not tested*. Serato DJ Lite is installed and the spike is the next piece of non-code work. Findings will be labelled with edition and platform, since Section 8.1 warns the folder layout may differ between Windows and macOS, and the product owner runs the full version on a Mac.

**Everything requiring a Mac.** Deck detection, two-way drag, always-on-top over Serato, code signing, notarization, and the clean-machine install test. Access is on the agenda for the 2026-10-07 meeting.

**The renderer is a placeholder.** The prototype UI has not been ported, not split into components, and the 27 `window.storage` calls and 9 `api.anthropic.com` fetches in `CheatCodeDJ_v_1_0_22016.jsx` are untouched. Section 9 groups those with the component split as one piece of work, correctly — they are the same edit. Section 3's spike confirms the port is viable; it does not constitute any part of the port itself.

**The CSP is development-permissive.** `index.html` currently allows `'unsafe-inline'` and `'unsafe-eval'` because Vite's HMR requires them, flagged in a comment. Section 7.5 requires a strict CSP in the shipped app, so both must go before Phase 10, and `connect-src` must name the backend explicitly instead of allowing localhost.

**`docs/QUESTIONS.md` has still not been received.** It is gitignored and local-only to the other developer's machine. The full `CLAUDE.md` was received on 2026-10-05 and is now present locally (also gitignored).

---

## 5. Findings worth carrying forward

**`CLAUDE.md` §8.1 does not say Serato is installed.** `docs/serato-spike.md` states *"Have Serato DJ installed (already true, per CLAUDE.md 8.1 - runs on Windows too)"*. §8.1 actually says *"Serato DJ runs on Windows; folder layout may differ — VERIFY"* — a statement about platform capability, not about what is installed. §12.1's Phase 2S row independently lists *"Serato installed"* as an unmet blocker, contradicting the spike doc. Neither developer had it installed; Lite has now been installed to resolve this. **The spike doc's prerequisite line should be corrected.**

**Node version mismatch between development machines.** §7 records *"node -v # confirmed: v24.11.0"*. This machine runs **v22.16.0**. Nothing has broken — the server's 103 tests and all of the above pass on 22 — but the two machines should agree on a version, or §7 should record that it varies.

**Vite 8 is incompatible with electron-vite 5.** A default `npm i -D vite` resolves to 8.x and fails peer resolution against `electron-vite@5`, which accepts `^5 || ^6 || ^7`. Pinned to `vite@^7`. Note the root prototype wrapper used `vite@^8.3.0`, so this will recur for anyone scaffolding from that.

**The Electron postinstall did not fetch the binary.** The package installed with `install.js` present but no `dist/` and no `path.txt`, so `npm run dev` failed with `Error: Electron uninstall` while `npm run build` succeeded — building never launches Electron. Resolved by running `node node_modules/electron/install.js` directly. If this was an environment or network restriction it will likely recur on other machines and in CI.

**Native modules will need rebuilding for Electron.** Measured on this machine:

```
system Node ABI : 127   (Node v22.16.0)
Electron ABI    : 149   (Electron 44.5.1)
```

`better-sqlite3` compiled against 127 will not load in Electron. `@electron/rebuild` is therefore required, not optional, for the SQLite milestone — which matches Phase 5's own anticipated failure mode (*"native module build errors (SQLite binding) → rebuild for Electron's Node version"*).

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
| Branch and PR convention | §10.2 specifies feature branch → PR into the default branch. `hannah/phase5-desktop` is currently based on `ranjish/ccdj-desktop` rather than `main`, so a PR now would carry 20 unrelated commits. Phase 4 should merge to `main` first. |

---

## Summary

The desktop application exists and opens. Process separation and the Section 7.5 security model are in place and enforced by tests rather than by convention, and Phase 5's own gate passes against real build output. That is the first of three milestones.

The render spike then retired this phase's largest unknown: the prototype runs inside Electron, imports a full library and searches it, with only the two failures the security model is supposed to produce. Phase 5.4 is therefore a port rather than a rewrite.

Nothing about Serato has been tested, nothing has been verified on a Mac, and no part of the UI port has been done — none of which is claimed otherwise anywhere above.

Next: the Serato spike (no code, unblocked now that Lite is installed), then the SQLite foundation, where the ABI mismatch recorded above will be the first obstacle.
