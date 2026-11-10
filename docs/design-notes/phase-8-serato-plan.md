# Phase 8 plan: Serato integration — proposed split

**Date:** 2026-11-09, updated 2026-11-10 (Mac runbook added) · **Author:** Hannah · **Status:** Proposal for discussion with Ranjish. Nothing here is built.
**Based on:** `docs/serato-spike.md` (Phase 2S, Windows / Serato DJ Lite 4.0.10) and CLAUDE.md §8.

## The short version

- **Hannah** builds the Serato code in the desktop app, on Windows (Serato DJ runs there; the spike was done there).
- **Ranjish** owns the Mac side: re-runs the spike checks on macOS (Phase 8a) and verifies each feature on a real Mac.
- Two-way drag is shared, because it is half app code and half macOS behaviour.

Goal: no one builds the same thing twice, and nothing is called done until it works on a Mac (CLAUDE.md §1.5, §8.1).

## Before any Phase 8 code

| # | Prerequisite | Owner | Status |
|---|---|---|---|
| 1 | Mike's Serato version (Pro/Lite + number) and macOS version | Hannah (asked by email 2026-11-09) | **Answered 2026-11-09:** Serato DJ **Pro 5.0.0** (build 5001236, arm64) on **macOS Sonoma 14.6.1** |
| 2 | Share `docs/serato-spike.md` with Mike (Phase 2S gate) | Hannah | Not done |
| 3 | Phase 5 finished: Hannah's database layer combined into the app | Hannah + Ranjish | **Combined 2026-11-10** on `hannah/combine-db` (pushed); Ranjish reviewing. Not needed for 8a, which only uses the throwaway spike tools |
| 4 | 8a re-confirmed on a Mac, and **Mike approves the findings** (CLAUDE.md §9, human gate) | Ranjish runs it, Mike approves | Not started |

If Mike's version has no SQLite library (spike finding), the Deck Watcher approach below changes. That is why #1 comes first.

## Proposed split by sub-phase

| Sub-phase (CLAUDE.md §9) | What | Builds | Verifies on Mac |
|---|---|---|---|
| **8a** | Re-run spike checks 1–4 on macOS with Mike's Serato version | — | **Ranjish** |
| **8b** | Find and import the Serato library; "Can't find my software" fallback | **Hannah** | Ranjish |
| **8c** | Drag out to Serato, drops in from Serato, reveal in Finder, always on top, window bounds | **Together** (Ranjish already has reveal / always on top / bounds) | Ranjish |
| **8d** | Deck Watcher + Auto Seed | **Hannah** | Ranjish |
| **8e** | Serato `.crate` export (back up `Subcrates` first) | **Hannah** | Ranjish |
| **8f** | Preview protocol, real trash for duplicates, tag write/restore | To decide | Ranjish |
| **8g** | Microphone, themed logos | To decide | Ranjish |

## What the spike already tells us (Windows / Lite; provisional until 8a)

- **Library (8b):** the live library is SQLite: `%LOCALAPPDATA%\Serato\Library\master.sqlite`. Table `asset` has file name, artist, title, BPM, key, genre, year, play count. `_Serato_\database V2` and `.crate` files are an *export* written on quit, not the source of truth. Open: the full-path rule (`location.path` + `portable_id`?) and whether to read SQLite or the export.
- **Deck Watcher (8d):** reading a *copy* of `master.sqlite` (with `-wal`/`-shm`, shared read, never written) every ~1 s gives each load in `history_entry`, **with the deck number**, within ~0.4–1.1 s. `end_time = -1` means "still on the deck". Tested for 4 minutes, no errors. The log file shows loads but not which deck.
- **Drag (8c):** Serato → app gives the full file path only (no deck or crate info), so the app maps path → `trackId`. App → Serato with `webContents.startDrag` loads a deck or adds to a crate. The app gets no "where did it land" signal; Deck Watcher can confirm a deck load afterwards.
- **Crates (8e):** a `.crate` written while Serato is **closed** is imported on next launch. One written while Serato is **running** is **deleted** at the next export on quit. Dragging onto a crate inside Serato works while it runs.

## Decisions needed (with Mike where marked)

1. **Crate export while Serato is open (Mike):** block it and explain, or queue it until Serato closes? Writing into Serato's SQLite directly is not recommended (undocumented; risk of corrupting his library).
2. **Library source for 8b:** read Serato's SQLite (live, richer) or the `database V2` export (community parsers exist)? Decide after 8a.
3. **Deck Watcher risk (Mike):** it depends on Serato's private, undocumented database; a Serato update could break it. Acceptable for v1, with a clear "unavailable" state when it fails?

## Mac check list for Ranjish (8a)

Use the spike's method: snapshot files with true size + SHA-256, do one action in Serato, snapshot again, diff. **Disposable test library only, never Mike's music.** Copy Serato's databases before reading them; open copies read-only. Do not open `user_tokens.json`.

1. Where are the live library (`*.sqlite`?) and `_Serato_` on macOS? Same tables (`asset`, `history_entry`, `container`)?
2. Load a track on deck 1, then deck 2: does `history_entry` get a row with the right `deck`, readable from a live copy within ~1 s?
3. Drag from Serato (library, crate, deck) into `spikes/serato/drag-test/`: what arrives? Drag out onto a deck and onto a crate: does Serato take it?
4. Write a test `.crate` with Serato closed, then with it open: same import / delete behaviour as on Windows?

**Target:** Mike's setup is Serato DJ Pro 5.0.0 (arm64) on macOS Sonoma 14.6.1; the spike was Serato DJ Lite 4.0.10 on Windows, so edition, version and OS all differ. Record the Serato edition and version, macOS version and results in `docs/serato-spike.md` under a new "macOS" section. Repeat each observation at least twice.

## Mac runbook for Ranjish: 8a with Serato DJ Lite

Step-by-step prompts to paste into Claude Code on the Mac, one at a time. Each prompt does **one** check and stops; paste the next only after you have looked at the result. Plan for about 3–4 hours in total, spread over sessions if needed.

**Why Lite first.** Lite is free; Mike's Pro 5.0.0 is paid. A Lite run on macOS answers the macOS questions (file locations, drag pasteboard, crate behaviour) now. Everything it finds is **provisional for Pro**: edition and version still differ, so record "Lite x.y on macOS 14/15" next to every result, and keep the Pro differences as an open item (Mike's own Mac, or a Pro trial if Serato offers one: check, don't assume).

**Before you start (by hand, no Claude):**
1. Install **Serato DJ Lite** (free) from serato.com. Open it once with no controller (it should offer a practice mode; note what it actually says). Note the exact version from Serato's About screen and your macOS version (Apple menu → About This Mac).
2. Use a **disposable test library only**: Serato's own demo tracks plus a few free MP3s in a new folder such as `~/Music/CCDJ-Serato-Test/`. **Never Mike's music, never your own real crates.**
3. Pull the repo and check out the branch you'll record results on (ask Hannah if unsure; `hannah/combine-db` is the current combined branch). Run `npm install` in `apps/desktop` so the spike can use its Electron.
4. If macOS asks whether Terminal/VS Code may access the Music folder or other app data, allow it and note that the prompt appeared (it matters for the real app's first-launch permissions).

**If Electron fails with** `Cannot read properties of undefined (reading 'requestSingleInstanceLock')` or `electron.app` undefined: the shell has `ELECTRON_RUN_AS_NODE=1` (VS Code sets it). Run with `env -u ELECTRON_RUN_AS_NODE …`. If it fails with "Electron uninstall": run `node install.js` inside `apps/desktop/node_modules/electron`.

### Prompt 0: paste first in every new Claude session

```
Read CLAUDE.md completely and follow it. Then read docs/serato-spike.md and
docs/design-notes/phase-8-serato-plan.md (section "Mac runbook for Ranjish").

We are running Phase 8a on macOS with Serato DJ Lite: re-checking the
Windows spike's 4 findings on a Mac. This is research with throwaway code
only. Rules for this whole session:
- Disposable test library only. Never touch Mike's music or real crates.
- Never write to, move or delete anything inside Serato's own folders,
  except the single test .crate files Prompt 5 asks for, after a backup.
- Read Serato databases only from COPIES (copy the .sqlite together with its
  -wal and -shm files, verify the copy with SHA-256, open read-only).
- Never open or print user_tokens.json or any login/token file.
- Throwaway scripts go in spikes/serato/mac/ only, never in apps/.
- Label every observation: loaded vs playing vs selected vs simulated.
- Don't commit, push, create branches or install global tools unless I ask
  in that message. zsh commands, with the folder to run them in.
- Each step: tell me what you'll do, do it, show the real output, stop.

First, without changing anything: report the git branch and status, macOS
version (sw_vers), CPU (uname -m), Node version, and whether Serato DJ Lite
is installed (and its version if you can read it from the app bundle's
Info.plist). Then stop.
```

### Prompt 1: find Serato's files on macOS

```
Check 1 prep (CLAUDE.md 8.3/8.4). Serato DJ Lite must be CLOSED.
Find, without opening any file's contents yet:
- Serato's live library database(s): on Windows it was
  %LOCALAPPDATA%\Serato\Library\master.sqlite and root.sqlite. Search the
  likely macOS places (~/Library/Application Support, ~/Music, ~/Library)
  for a "Serato" folder and *.sqlite files. Don't assume the path.
- The _Serato_ export folder (Windows: ~/Music/_Serato_ with "database V2",
  Subcrates/*.crate, neworder.pref, Logs/).
List each folder's files with size and modified time. Don't print the
contents of any token/login file. Stop and report the paths found.
```

### Prompt 2: library access (spike check 1)

```
Spike check 1, library access. Serato CLOSED.
1. Copy the live library .sqlite file(s) (with -wal/-shm if present) to a
   new folder in /tmp (not the repo). Verify each copy's SHA-256 matches.
2. Open the copies read-only. List the tables. For the tables the Windows
   spike used (asset, history_entry, container, container_asset, location),
   show the columns and row counts.
3. Show 3 sample rows from asset (test library only): file name, artist,
   title, BPM, key, genre, year, play count, and how the full file path is
   built (location + path? portable_id?).
4. Compare with docs/serato-spike.md check 1: same / different / missing.
Stop and report as a table.
```

### Prompt 3: deck load detection (spike check 2)

```
Spike check 2, deck load detection. This needs Serato RUNNING.
Write a throwaway script spikes/serato/mac/deck-watch.mjs that every ~1 s
copies the live library .sqlite + -wal + -shm (shared read, never write) to
/tmp, opens the copy read-only, and prints any new history_entry rows with
deck, start/end time and the track's file name, plus the time it noticed.
Show me the script before running it. Then run it while I:
  a) load a track on deck 1, b) load a different track on deck 2,
  c) play deck 1 for ~10 s, then pause, d) eject/load another on deck 1.
I'll tell you the clock time of each action. Then compare: delay per load,
right deck number?, does end_time = -1 mean "still loaded"?, does play or
pause write anything? Repeat a) and b) once more. Stop with a table.
```

### Prompt 4: drag in and out (spike check 3)

```
Spike check 3, drag. Use the existing throwaway app spikes/serato/drag-test/
(read main.js first). On macOS:
- Its DEMO_DIR is ~/Music/_Serato_/Imported/Serato Demo Tracks; check
  whether the demo MP3s are there on this Mac. If not, change DEMO_DIR in
  the SPIKE ONLY to my test folder and tell me.
- Run it with the repo's Electron (macOS path is
  apps/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron),
  clearing ELECTRON_RUN_AS_NODE.
Then I will: drag IN from Serato's library list, from a crate, and from a
deck; drag OUT onto deck 1 and onto a crate. For each, report exactly what
arrived (types, strings, file paths) or what Serato did (and check
history_entry / container_asset from a copy, as in Prompt 3).
Compare with docs/serato-spike.md check 3. Repeat each drag twice. Stop.
```

### Prompt 5: crate files and M3U (spike check 4)

```
Spike check 4, crate export. First back up the whole _Serato_/Subcrates
folder and neworder.pref to /tmp with SHA-256 for each file; show the list.
A) Serato CLOSED: copy one existing test crate to
   "_Serato_/Subcrates/CCDJ Spike Test.crate". Then I launch Serato.
   Report: is the crate shown? which tracks? did Serato change our file?
B) Serato RUNNING: copy another test crate to "CCDJ Spike Live.crate".
   Wait ~70 s: shown? Then I load one track and quit Serato.
   Report: was CCDJ Spike Live.crate deleted at the export on quit, as on
   Windows?
C) Mike's tip (Serato 5.0 builds a crate from a dragged-in M3U): write a
   3-line .m3u of test tracks to /tmp; I drag it onto Serato's crate panel.
   Does Lite create a crate? Record the Lite version; Pro may differ.
Afterwards, tell me exactly which test files remain and offer (don't do)
removing them. Stop.
```

### Prompt 6: write up and hand back

```
Write the results into docs/serato-spike.md as a new section
"## macOS (Serato DJ Lite <version>, macOS <version>, <date>)":
- environment (Serato edition+version, macOS, CPU, who ran it);
- checks 1-4: result, evidence (paths, timings, rows), same-as-Windows or
  different, each marked Feasible / Uncertain / Blocked;
- the Lite-vs-Pro caveat: what still needs Mike's Pro 5.0.0 to confirm;
- the macOS permission prompts seen;
- new questions for Mike.
Don't change the Windows sections. Show me the diff and stop. Don't commit
until I say so.
```

**When done:** tell Hannah and share the new section with Mike. CLAUDE.md §9 makes 8a a **human gate**: Mike approves the findings (Pro differences included) before 8b–8e are built on them.

## Questions for Ranjish

- Does this split work for you? Anything you'd rather own?
- Mike's version is known (Pro 5.0.0 on Sonoma 14.6.1). Can you run the Lite runbook above on your Mac this week?
- 8f and 8g: do you want them, or split later?
