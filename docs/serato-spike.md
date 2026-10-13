# Serato feasibility spike (Phase 2S)

**Status: in progress.** Sessions on 2026-10-07 and 2026-10-12. Check 2 answered
on this platform, including a live read while Serato runs; check 1 partly
answered; checks 3 and 4 not started. The 2026-10-12 session
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
copies** (SHA-256 verified) taken after a clean quit, opened read-only.
Nothing in either Serato location was written or modified by this spike.

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
| `%USERPROFILE%\Music\_Serato_\` | `database V2`, `Subcrates\*.crate`, `neworder.pref`, `Logs\`, and others. `database V2` and the crates are an **export** of the SQLite library, written on quit (log: `Dbv2: Exporting DBv2 library to '…\_Serato_'`; every crate file rewritten at the same moment). |

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
- **Result:** Not tested
- **Evidence:**

### 4. Crate export visibility
Does a newly written `.crate` file appear in Serato while it's running, or
only after a restart? Does Serato ever overwrite a crate file we wrote?
- **Result:** Not tested. **Risk raised by check 1/2 evidence.**
- **Evidence so far (indirect):** Serato rewrites every `.crate` file in
  `_Serato_\Subcrates` on quit as part of its DBv2 export, so a crate written
  by CCDJ may be overwritten. `root.sqlite` → `last_seen_dbv2_library`
  records the size (and an MD5) of `database V2`, each `.crate`, and
  `neworder.pref`, and `dbv2_status` records import/export revisions
  (`last_import_revision = 0`, `last_export_revision = 69`). This suggests
  Serato detects external changes to those files and imports them — a
  hypothesis, not tested. Test only on this disposable library, with a backup
  of `Subcrates` first.

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
1. **Check 3 (drag contents)** — what Serato puts on the drag payload into a
   test window, and whether a file dragged from a test window lands in Serato.
2. **Check 4 (crate visibility)** — with a backup of `Subcrates` first, write a
   test `.crate` and see whether Serato imports it, when, and whether it
   overwrites it on quit (see the fingerprint hypothesis above).
3. **Check 1's remaining parts** — full-path rule and crate membership.
4. Ask Mike the questions above; nothing here transfers to his setup until
   answered.

## Recommendation
Deck Watcher is **feasible on Serato DJ Lite 4.0.10 for Windows**: reading a
copy of Serato's own database while it runs gives the loaded track, its deck,
and whether it is still loaded, within about a second. This is the first
evidence that R19's simulated Deck Watcher can become real. It is **not yet a
recommendation to build**: it depends on Serato's private, undocumented
database, and nothing is known about macOS or Mike's version. **Do not build
Deck Watcher or crate export against this yet.** CLAUDE.md 8.3's rule still
stands: none of this is a Serato API, and none of it may be assumed to hold on
macOS or in Mike's version until Phase 8a re-confirms it.
