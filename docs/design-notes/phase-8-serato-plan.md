# Phase 8 plan: Serato integration — proposed split

**Date:** 2026-11-09 · **Author:** Hannah · **Status:** Proposal for discussion with Ranjish. Nothing here is built.
**Based on:** `docs/serato-spike.md` (Phase 2S, Windows / Serato DJ Lite 4.0.10) and CLAUDE.md §8.

## The short version

- **Hannah** builds the Serato code in the desktop app, on Windows (Serato DJ runs there; the spike was done there).
- **Ranjish** owns the Mac side: re-runs the spike checks on macOS (Phase 8a) and verifies each feature on a real Mac.
- Two-way drag is shared, because it is half app code and half macOS behaviour.

Goal: no one builds the same thing twice, and nothing is called done until it works on a Mac (CLAUDE.md §1.5, §8.1).

## Before any Phase 8 code

| # | Prerequisite | Owner | Status |
|---|---|---|---|
| 1 | Mike's Serato version (Pro/Lite + number) and macOS version | Hannah (asked by email 2026-11-09) | Waiting |
| 2 | Share `docs/serato-spike.md` with Mike (Phase 2S gate) | Hannah | Not done |
| 3 | Phase 5 finished: Hannah's database layer combined into the app | Hannah + Ranjish | In progress |
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

Record the Serato version, macOS version and results in `docs/serato-spike.md` under a new "macOS" section. Repeat each observation at least twice.

## Questions for Ranjish

- Does this split work for you? Anything you'd rather own?
- Can you run 8a on your Mac once Mike tells us his version?
- 8f and 8g: do you want them, or split later?
