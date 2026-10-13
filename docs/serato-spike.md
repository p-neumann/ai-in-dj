# Serato feasibility spike (Phase 2S)

**Status: all four checks have answers on Windows / Serato DJ Lite.** Sessions
on 2026-10-07 and 2026-10-12/13. Checks 2, 3 and 4 answered on this platform
(check 2 including a live read while Serato runs); check 1 partly answered
(path rule open). Nothing is confirmed on macOS or Mike's version — see
"Questions for Mike". The 2026-10-12 session
re-ran the load/play tests with a corrected method and **overturned several
2026-10-07 conclusions** — see "What changed on 2026-10-12" below.

**Environment for every finding below:** Serato DJ **Lite 4.0.10.213**
(version as recorded by Serato itself in `history_entry.app_version`),
Windows 11, against Serato's own bundled demo tracks and scratch samples — a
disposable set, never a real collection. CLAUDE.md 8.1 warns the folder layout
may differ on macOS, and the product owner runs the full version, so
**everything here is provisional until re-confirmed in Phase 8a**.

**Method (2026-10-12, corrected):** snapshot every file under both Serato
locations (below) with true size and SHA-256, perform exactly one action in
Serato, snapshot again, diff; for the log, print only appended lines, with the
periodic `AudioRenderSummary` / `FrameRenderSummary` / `PerformanceMetrics`
noise filtered out. An idle baseline (40 s, no action) changed only the log,
and only with noise. Serato's databases were inspected only as **byte-identical
copies** (SHA-256 verified), opened read-only. Checks 1 and 2 wrote nothing
to either Serato location. Check 4 wrote test crate files only, after a
hash-verified backup of both locations taken with Serato closed, and both
locations were restored from that backup afterwards (45 files verified
byte-identical) — see check 4. Check 3's drag-out test caused Serato itself to
add one demo track to a demo crate and log new deck loads (not reverted;
restorable from the same backup).

**Correction to the 2026-10-07 method:** it compared directory listings. On
Windows the listed size and modification time of a file another process holds
open can lag well behind its real state (observed: the listing reported a log
last written at 21:53 while it contained lines from 22:08). "File X did not
change" conclusions from 2026-10-07 are therefore unreliable. The 2026-10-12
method opens each file with shared read access and measures it directly.

Time box per CLAUDE.md: ~3 working days.

## The two Serato locations

| Location | What it is |
|---|---|
| `%LOCALAPPDATA%\Serato\Library\master.sqlite`, `root.sqlite` | **Serato's live library** — SQLite databases. `master.sqlite` runs in WAL mode while Serato is open (`master.sqlite-wal` / `-shm` side files appear on launch and are folded back in on quit). |
| `%USERPROFILE%\Music\_Serato_\` | `database V2`, `Subcrates\*.crate`, `neworder.pref`, `Logs\`, and others. `database V2` and the crates are an **export** of the SQLite library, written on quit when the library changed during the session (log: `Dbv2: Exporting DBv2 library to '…\_Serato_'`; every crate file rewritten at the same moment). Changes to these files made while Serato is closed are **imported** on the next launch. `neworder.pref` is the crate display order (UTF-16 text, one `[crate]Name` line per crate). |

CLAUDE.md 8.3 expected the library database and crates in `_Serato_` only. That
is true of the *export*; the source of truth in this version is the SQLite
library. Do not read `%LOCALAPPDATA%\Serato\Serato DJ\user_tokens.json` (Serato
account tokens) — this spike never opened it, and no CCDJ code should.

## Checks to run (CLAUDE.md Section 8.4)

### 1. Library access
Can we list tracks and crates from Serato's own files? Which fields are
available (path, BPM, key, play count)?
- **Result:** Fields located (schema read from a copy); paths and crate
  membership not yet worked through.
- **Evidence:**

  `master.sqlite` table `asset` has, among others: `file_name`, `location_id`,
  `portable_id`, `artist`, `name` (title), `bpm`, `key`, `genre`, `year`,
  `length_sec`, `dj_play_count`, `dj_recently_played`, `time_added`,
  `is_missing`, `is_corrupt`. Crates appear to be `container` +
  `container_asset`; drive roots appear to be `location` (`path`, `uuid`).
  Sample row: `ScratchBeat1.mp3 · Serato · Scratch Beat 1 · bpm 100 · key Am ·
  Hip Hop/Rap · 2021`. On the demo tracks `length_sec` was null and several
  fields were empty, so field coverage on a real library is unknown.

  The `_Serato_` export (`database V2`, `.crate` files) still exists and is the
  format community parsers target; it has not been parsed either.

  **Still to do:** work out the full-path rule (`location.path` +
  `portable_id`?), crate membership, and whether reading SQLite or the export
  is the better import path.

### 2. Deck load detection
When a track is loaded on a deck, does any file on disk change? How fast?
Can deck 1 vs deck 2 be told apart? Does it only change on play, not load?
- **Result:** Load is detectable, **with deck identity, via the database —
  read live while Serato runs, within ~1 s.** The log detects the load but not
  the deck. Play probably increments a play counter (unconfirmed).
- **Evidence (2026-10-12):**

  | Action (time) | Log | Database |
  |---|---|---|
  | Load fresh track on deck 1 (22:24:20) | `[View] The cache '…/SweepUp.mp3' was requested` ×4, then `[Library] Adding entry to history session with id 3` | `master.sqlite-wal` grew ~692 KB; `master.sqlite`, `root.sqlite` changed |
  | Play ~10 s, then pause (one write seen, 22:25:30) | No path, no history line — only a generic keyboard-shortcut notification | `master.sqlite-wal` rewritten (same size), `root.sqlite` changed |
  | Load fresh track on deck 2 (22:26:36) | Same two lines, same format, ×1 — **no deck named** | written at load time |
  | Load Sweep Up (already loaded once) on deck 2, replacing Scratch Beat 1 (22:28:37) | `[Library] Updating entry with id 5`, then the same cache + history lines | written at load time |

  Read from a copy after quit, `master.sqlite` → `history_entry` (one row per
  load) matches every action exactly:

  | id | file_name | deck | start_time | end_time |
  |---|---|---|---|---|
  | 4 | SweepUp.mp3 | 1 | 22:24:20 | 22:30:50 (quit) |
  | 5 | ScratchBeat1.mp3 | 2 | 22:26:36 | 22:28:37 (replaced) |
  | 6 | SweepUp.mp3 | 2 | 22:28:37 | 22:30:50 (quit) |

  The 2026-10-07 rows also match that session (Hey You → deck 1, Oww → deck 2).
  Other columns: `session_id` (→ `history_session`), `asset_id` (→ `asset`),
  `played`, `app_name`, `app_version`, `device`, `notes`.

  Findings:
  - **Deck identity is recoverable from `history_entry.deck`.** It is not in the
    log: the deck 1 and deck 2 log lines are identical apart from the path.
  - **The log path line fires on every load**, including a second load of the
    same track — it is not first-time-only caching. Repeat count varies (×4,
    ×1), so a log watcher must de-duplicate.
  - **`end_time` is written when a track leaves a deck** (replaced or quit); the
    log's `Updating entry with id N` line is that write.
  - **`played = 1` does not mean audio played.** Scratch Beat 1 was never
    played and has `played = 1`.
  - **Play probably increments `asset.dj_play_count`**: Sweep Up (played) = 1,
    Scratch Beat 1 (not played) = 0, consistent with the database write at
    22:25:30. Unconfirmed: one play only, count not captured before it, and it
    is unknown whether the play or the pause produced that write.

  **Live read test (2026-10-12, Serato running throughout).** A watcher copied
  `master.sqlite` with its `-wal` and `-shm` side files every ~1 s (files
  opened with shared read access, never for writing; ~40 ms per copy) and
  queried each copy read-only for new `history_entry` rows. It ran for 4
  minutes (~230 copies) with no read errors and no errors in Serato's log.

  | Action | Serato log (load) | Row seen in live copy | Delay | `deck` |
  |---|---|---|---|---|
  | Scratch Beat 2 → deck 2 | 22:43:30.998 | 22:43:31.406 | 0.4 s | 2 |
  | Scratch Beat 4 → deck 1 | 22:44:11.154 | 22:44:12.277 | 1.1 s | 1 |

  - **The row is readable while Serato runs, with the correct deck.** Deck 2
    was loaded first, so the value is not a default.
  - **Delay is bounded by the 1 s polling interval, not by Serato** — the row is
    in the WAL as soon as the load happens.
  - **`end_time = -1` while the track is still on the deck**; it is filled in
    when the track leaves (replaced or quit). This gives a "currently loaded"
    state, not just a load event.
  - **A `history_session` is created on the first load after launch**, not at
    launch.

  Not tested: long sessions, large libraries, reading the live file directly
  instead of a copy, behaviour across Serato updates, macOS, and Mike's
  version. The database is undocumented and private to Serato; a Serato
  update could change it without notice.

### 3. Drag contents
What arrives when dragging from Serato's library, crates, and decks into an
Electron (or plain browser/file-manager) window? What raw formats appear on
the drag payload?
- **Result:** **Both directions work.** Serato → window delivers the full file
  path (but nothing Serato-specific). Window → Serato loads a deck or adds to
  a crate.
- **Evidence (2026-10-13 00:23–00:27):** a throwaway Electron app,
  `spikes/serato/drag-test/`, with the same renderer security settings as
  `apps/desktop` (`sandbox`, `contextIsolation`, no `nodeIntegration`). Drop
  contents were logged; Serato's side was confirmed from a live database copy.

  **Serato → window (drag in), 3 drops** (library, crate, and — per the
  history row loaded 4 s earlier — a deck). Every drop carried the same three
  things:

  | Payload | Content |
  |---|---|
  | `text/plain` | `file:///…/_Serato_/Imported/Serato Demo Tracks/03 - House Track ….mp3` (not percent-encoded) |
  | `text/uri-list` | The same URL, percent-encoded |
  | One `File` (`audio/mpeg`) | `webUtils.getPathForFile` (from the sandboxed preload) returns the native path, e.g. `…\Music\_Serato_\Imported\Serato Demo Tracks\03 - House Track ….mp3` |

  No Serato-specific type and no deck, crate or Serato id: **a drag from a deck
  is indistinguishable from a drag from the library.** CCDJ has to map the
  path to its own `trackId`.

  **Window → Serato (drag out), via `webContents.startDrag({ file, icon })`:**

  | Drag started | Serato's database |
  |---|---|
  | 00:26:04.6 `04 - Hip Hop …` | `history_entry` id 10, **deck 1**, start 00:26:05, `end_time = -1` — loaded |
  | 00:26:26.7 `04 - Hip Hop …` | Nothing added (track already in the target crate, per the tester) |
  | 00:26:37.7 `03 - House …` | Added to crate "Serato Scratch Beats" (`container_asset.time_added` 00:26:39) |
  | 00:26:49.9 `03 - House …` | Nothing added — duplicate in that crate; crate went 5 → 6 tracks, no second copy |

  Findings:
  - **Drag out of a sandboxed Electron window onto a Serato deck loads the
    track**, and Deck Watcher (check 2) sees the load ~0.4 s after the drag
    began.
  - **Dropping onto a Serato crate adds the track via Serato's own database**,
    so — unlike a `.crate` file written while Serato runs (check 4) — it is not
    lost at the next export. This is a possible user-driven route for crates
    while Serato is open. Multi-file drags (`startDrag({ files: [...] })`) not
    tested.
  - **The window gets no drop result for a drag out.** With `startDrag` the
    renderer received no `dragend` and nothing reports where the file landed.
    The drag start is the only signal (supports R7's count-on-dragstart);
    Deck Watcher can confirm a deck load after the fact.
  - **The window's own drop zone saw its own outgoing drag** (`dragenter`
    with `["Files"]` as the drag passed over it). The real app must ignore its
    own drags (CLAUDE.md 4.1).
  - Dev note: VS Code sets `ELECTRON_RUN_AS_NODE=1` in its terminals, which
    makes `electron.exe` run as plain Node with no window. Clear it to launch
    from the IDE.

  Not tested: dragging from Serato's file browser or from a crate list as a
  whole, multi-file drags, and anything on macOS (where drag pasteboard
  formats differ).

### 4. Crate export visibility
Does a newly written `.crate` file appear in Serato while it's running, or
only after a restart? Does Serato ever overwrite a crate file we wrote?
- **Result:** A crate written **while Serato is closed** is imported on the
  next launch and kept. A crate written **while Serato is running** is not
  shown, and is **deleted** at the next export on quit.
- **Evidence (2026-10-12 22:53 – 2026-10-13 00:14):**

  Setup: Serato closed; both locations backed up and verified by hash (45
  files). Test crates were byte copies of Serato's own crates, so the test is
  about Serato's handling, not CCDJ's file format.

  | Step | Result |
  |---|---|
  | With Serato **closed**, write `CCDJ Spike Test.crate` (copy of Demo Tracks) | — |
  | Launch | Log: `Location 'C:/' DJ library status is now IMPORT_REQUIRED`, notification "Importing Serato DJ library", `Dbv2: Starting DBv2 import of '…\_Serato_/database V2'` (via a temporary `dbv2-import-….sqlite`). New `container` row "CCDJ Spike Test" with 6 tracks (same as Demo Tracks); `last_import_revision` 0 → 98; crate added to `last_seen_dbv2_library`. Shown in Serato first in the crate list, same tracks as Demo Tracks; no prompt the user had to answer. Our file was not modified. |
  | Quit, no library changes in that session | **No export** (`export status updated to: None`; `last_export_revision` unchanged). All crate files untouched, ours byte-identical. |
  | With Serato **running**, write `CCDJ Spike Live.crate` (copy of Scratch Beats, fresh timestamp) | Log 4 s later: `Dbv2 library export status updated to: None` / `All drive operations have been completed` — Serato noticed something but imported nothing. ~70 s later: not shown in Serato, no `container` row, `last_import_revision` unchanged. |
  | Load a track (library changes), quit | Export ran: `Dbv2: Exporting DBv2 library to '…\_Serato_'`; `last_export_revision` 94 → 116. **`CCDJ Spike Live.crate` deleted.** `CCDJ Spike Test.crate` rewritten from the database (same bytes, new timestamp). `neworder.pref` now lists "CCDJ Spike Test" first. |

  Before overwriting, the export zips the previous `database V2`, crates and
  `neworder.pref` into `_Serato_\Export Backups\backup-<date>_<time>.zip`; the
  deleted crate was found in that zip. It is recoverable from there, but gone
  from the user's library with no notice.

  Findings:
  - **Serato only keeps crates that are in its database.** Files in
    `Subcrates` are an export; the database is the source of truth.
  - **The import happens at launch only** (as far as observed), and imports
    the whole `database V2` export, not just the changed crate. On a large
    library this may be slow, and what a full re-import does to edits made
    since the last export is unknown.
  - **The export on quit appears to run only when the library changed** (3 of
    3 quits consistent: loads → export; no loads → no export). Inferred, not
    proven.
  - Test only covered *new* crates. Editing an existing crate's contents was
    not tested.

  **Implication for CCDJ crate export (R26, Phase 8e):** writing `.crate`
  files is only safe while Serato is closed. During a gig Serato is open and
  the library always changes, so a crate CCDJ wrote mid-gig would be silently
  deleted when Mike quits. Options to decide with the team and Mike — e.g.
  block crate export while Serato is running and explain why, or queue the
  crate and write it after CCDJ sees Serato close. Writing into Serato's SQLite
  database directly would avoid this but is not recommended: it is
  undocumented and the risk of corrupting the library is real.

  **Cleanup:** after the test, both locations were restored from the pre-test
  backup with Serato closed and verified byte-identical (45 files, no extras).
  The post-test state was kept in a separate verified backup outside the repo.

## What changed on 2026-10-12

| Topic | 2026-10-07 said | 2026-10-12 evidence |
|---|---|---|
| Library source | `_Serato_\database V2` | SQLite in `%LOCALAPPDATA%\Serato\Library`; `database V2` is an export written on quit |
| Deck identity | Unknown | Recoverable from `history_entry.deck` (not from the log), live, within ~1 s |
| Play detection | No track path and no history entry written on play | Confirmed for the log; but the database *is* written, probably `dj_play_count` |
| Keyboard-shortcut notification | Appended on play | Appears on load as well — a generic deck-action notice, not a signal |
| Log path line | Might be first-time waveform caching | Fires on every load, including reloads |
| `History` folder | Maybe written on exit | Not created even after a clean quit; history lives in `history_entry` / `history_session` |
| `DJLite.gai` | Fixed size, 16,384 bytes | Grows: 28,672 → 32,768 bytes |
| Log file | One active log | A new log per launch: `Logs\<date>-<time>.<processId>.log` |
| "Did not change on load" | From directory listings | Method unreliable for open files on Windows; replaced |
| Crate export | Not tested | Imported at launch if written while Serato is closed; deleted on export if written while running (check 4) |
| Drag in / out | Not tested | Both work: drag in gives the full path only; drag out loads a deck or adds to a crate (check 3) |

## Expected file locations to check first (per CLAUDE.md 8.3 - UNVERIFIED, do not assume)
- A `_Serato_` folder in the user's Music folder — **confirmed on Windows**, but
  it holds the DBv2 export, not the live library (see above)
- `_Serato_` folders at the root of external drives — not tested, no external drive present
- Inside: a library database file, a `Subcrates` folder of `.crate` files, a `History` folder
  — database and Subcrates confirmed as export files; **no History folder**
- Not listed in 8.3: `%LOCALAPPDATA%\Serato\Library\*.sqlite` — the live library on
  this version. **macOS location unknown.**

## Prerequisites — corrected 2026-10-07
An earlier version of this file stated "Have Serato DJ installed (already true,
per CLAUDE.md 8.1)". That was a misreading: 8.1 says *"Serato DJ runs on
Windows; folder layout may differ — VERIFY"*, which is a statement about
platform capability, not about what is installed. CLAUDE.md 12.1 independently
lists "Serato installed" as an unmet blocker for Phase 2S. Neither developer had
it installed. Serato DJ Lite was installed on 2026-10-06 to unblock this spike.

Whether Lite is sufficient, or whether the full version is needed to answer
checks 2–4 properly, is still open.

## Questions for Mike (raised by this spike)
1. **Which Serato DJ version and edition does he run, on which macOS?** The
   SQLite library found here may not exist in older versions; if his version
   only has `_Serato_`, the deck-detection route found here does not apply.
2. With his permission, where do `master.sqlite` / `root.sqlite` live on his
   Mac (only the location and file names — not the contents)?

## Next step when this resumes
1. Ask Mike the questions above; nothing here transfers to his setup until
   answered. Share this doc with him (Phase 2S gate).
2. **Check 1's remaining part** — the full-path rule (`location.path` +
   `portable_id`?). Crate membership is known: `container_asset` →
   `location_container` → `container`.
3. Raise the crate-export constraint (check 4), and the drag-onto-crate
   alternative (check 3), with the team and Mike before Phase 8e is designed.
4. Phase 8a: re-run checks 2–4 on a Mac with Mike's Serato version, using the
   same method and `spikes/serato/drag-test/`.

## Recommendation
Deck Watcher is **feasible on Serato DJ Lite 4.0.10 for Windows**: reading a
copy of Serato's own database while it runs gives the loaded track, its deck,
and whether it is still loaded, within about a second. This is the first
evidence that R19's simulated Deck Watcher can become real. It is **not yet a
recommendation to build**: it depends on Serato's private, undocumented
database, and nothing is known about macOS or Mike's version.

Crate export via `.crate` files is **feasible with a constraint**: Serato must
be closed when the file is written, or the crate is lost at the next export.
This is a design constraint for Phase 8e, not a blocker, but it needs a
decision on the user-facing behaviour. Dragging tracks from CCDJ onto a Serato
crate works while Serato runs and survives the export (check 3).

Two-way drag is **feasible**: drag in yields the full file path; drag out
loads a deck or adds to a crate. CCDJ cannot learn where a drag out landed,
other than a deck load confirmed by Deck Watcher.

**Do not build Deck Watcher or crate export against this yet.** CLAUDE.md 8.3's rule still
stands: none of this is a Serato API, and none of it may be assumed to hold on
macOS or in Mike's version until Phase 8a re-confirms it.
