# Serato feasibility spike (Phase 2S)

**Status: not started.** This check requires Serato DJ actually running with a
**disposable test library** (never Mike's real collection) and, ultimately,
confirmation on a real Mac. Claude Code has no GUI access to run Serato, so
this file is a skeleton to fill in once Ranjish can run the checks below.
Time box per CLAUDE.md: ~3 working days.

## Checks to run (CLAUDE.md Section 8.4)

### 1. Library access
Can we list tracks and crates from Serato's own files? Which fields are
available (path, BPM, key, play count)?
- **Result:** Not tested
- **Evidence:**

### 2. Deck load detection
When a track is loaded on a deck, does any file on disk change? How fast?
Can deck 1 vs deck 2 be told apart? Does it only change on play, not load?
- **Result:** Not tested
- **Evidence:**

### 3. Drag contents
What arrives when dragging from Serato's library, crates, and decks into an
Electron (or plain browser/file-manager) window? What raw formats appear on
the drag payload?
- **Result:** Not tested
- **Evidence:**

### 4. Crate export visibility
Does a newly written `.crate` file appear in Serato while it's running, or
only after a restart? Does Serato ever overwrite a crate file we wrote?
- **Result:** Not tested
- **Evidence:**

## Expected file locations to check first (per CLAUDE.md 8.3 - UNVERIFIED, do not assume)
- A `_Serato_` folder in the user's Music folder
- `_Serato_` folders at the root of external drives
- Inside: a library database file, a `Subcrates` folder of `.crate` files, a `History` folder

## What Ranjish needs to do to run this spike
1. Have Serato DJ installed (already true, per CLAUDE.md 8.1 - runs on Windows too).
2. Build or use a **disposable test library** - a handful of throwaway audio files, never the real collection.
3. Load tracks onto decks, drag between Serato and a test window/file explorer, write a test crate, and observe what changes on disk, timestamped.
4. Report back findings (or screenshots/file listings) so this document can be filled in and each check marked Feasible / Uncertain / Blocked with evidence.

## Recommendation
Not yet possible - no data collected. Do not build Deck Watcher or crate export logic against assumptions from this file until it has real findings.
