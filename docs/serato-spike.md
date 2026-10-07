# Serato feasibility spike (Phase 2S)

**Status: in progress.** Checks 1 and 2 partially answered with evidence on
2026-10-07. Checks 3 and 4 not started.

**Environment for every finding below:** Serato DJ **Lite**, Windows 11,
against Serato's own bundled demo tracks and scratch samples — a disposable
set, never a real collection. CLAUDE.md 8.1 warns the folder layout may differ
on macOS, and the product owner runs the full version, so **everything here is
provisional until re-confirmed in Phase 8a**.

**Method:** snapshot every file under `_Serato_` with size and modification
time, perform one action in Serato, snapshot again, diff. Read-only throughout —
nothing in the Serato folder was written or modified by this spike.

Time box per CLAUDE.md: ~3 working days.

## Checks to run (CLAUDE.md Section 8.4)

### 1. Library access
Can we list tracks and crates from Serato's own files? Which fields are
available (path, BPM, key, play count)?
- **Result:** Partially answered — structure located, contents not yet parsed.
- **Evidence:** The folder is at `C:\Users\Hannah\Music\_Serato_`, confirming
  CLAUDE.md 8.3's first guess. Contents against 8.3's expectations:

  | 8.3 expected | Found |
  |---|---|
  | `_Serato_` in the user's Music folder | yes |
  | a library database file | yes — `database V2`, 11,397 bytes |
  | a `Subcrates` folder of `.crate` files | yes — 3 crates present |
  | a `History` folder with session files | **no — not present** |

  Also present and not mentioned in 8.3: `DJLite.gai` (16,384 bytes, fixed
  size), `SmartCrates/`, `neworder.pref`, `Logs/`, `Auto Import/`,
  `Export Backups/`, `Recording/`, `SeratoVideo/`, `Effects/`,
  `Remotes.database` (0 bytes).

  **Still to do:** parse `database V2` and a `.crate` file to establish which
  fields are actually available. No parsing has been attempted yet.

### 2. Deck load detection
When a track is loaded on a deck, does any file on disk change? How fast?
Can deck 1 vs deck 2 be told apart? Does it only change on play, not load?
- **Result:** Load is detectable. Play is not. Deck identity unknown.
- **Evidence:**

  **Loading a track, without pressing play,** changed exactly one file — the
  active log in `Logs/` — and wrote two relevant lines:

  ```
  00:04:49.280  [View]    The cache `C:/Users/Hannah/Music/_Serato_/Imported/
                          ScratchBankSamples/SeratoScratchSampleHeyYou.mp3`
                          was requested
  00:04:49.612  [Library] Adding entry to history session with id 1
  ```

  The full absolute path of the loaded track appears in the log. The write is
  effectively immediate — the action occurred at 00:04:49 and the lines were
  present when read at 00:05:10.

  `DJLite.gai` and `database V2` did **not** change on load.

  **Pressing play** changed `DJLite.gai`'s timestamp (size unchanged at exactly
  16,384 bytes) and appended only a repeated UI notification about keyboard
  shortcuts. **No track path, and no new history entry, is written on play.**

  So the detectable event is the *load*, which is what Deck Watcher needs
  anyway.

  **Open, and the most important remaining question for this check: neither log
  line identifies which deck.** Loading onto deck 2 has not been tested. If the
  log cannot distinguish left from right, CCDJ could know a track was loaded but
  not where — a real limitation needing the product owner's input.

  **Caveats, not yet resolved:**
  - The path line is a `[View]` "cache was requested" message, which may be
    waveform caching rather than deck loading specifically. It may also fire on
    preview or hover. Unconfirmed.
  - The log is undocumented, unstable across versions, and extremely noisy —
    `AudioRenderSummary`, `FrameRenderSummary` and `PerformanceMetrics` lines
    every ~30 seconds. Any watcher would need filtering.
  - No `History` folder appeared even after playing, despite the log's reference
    to a history session. It may be held in memory and written on exit — worth
    re-checking after quitting Serato.

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
- A `_Serato_` folder in the user's Music folder — **confirmed on Windows, see check 1**
- `_Serato_` folders at the root of external drives — not tested, no external drive present
- Inside: a library database file, a `Subcrates` folder of `.crate` files, a `History` folder
  — database and Subcrates confirmed; **History folder absent in Lite**

## Prerequisites — corrected 2026-10-07
An earlier version of this file stated "Have Serato DJ installed (already true,
per CLAUDE.md 8.1)". That was a misreading: 8.1 says *"Serato DJ runs on
Windows; folder layout may differ — VERIFY"*, which is a statement about
platform capability, not about what is installed. CLAUDE.md 12.1 independently
lists "Serato installed" as an unmet blocker for Phase 2S. Neither developer had
it installed. Serato DJ Lite was installed on 2026-10-06 to unblock this spike.

Whether Lite is sufficient, or whether the full version is needed to answer
checks 2–4 properly, is itself an open question — Lite's lack of a `History`
folder may be a feature difference rather than a behavioural finding.

## Next step when this resumes
Load a track onto **deck 2** (right deck) and diff the log against the deck 1
result above, to establish whether deck identity is recoverable. Then checks 3
and 4.

## Recommendation
Too early to recommend. Load detection via the log is a promising lead and the
first real evidence that Deck Watcher is possible at all — but it is one
undocumented log line, on Lite, on Windows, with no deck identity, and with the
caveats above unresolved. **Do not build Deck Watcher or crate export against
this yet.** CLAUDE.md 8.3's rule still stands: nothing here constitutes a
Serato API, and none of it may be assumed to hold on macOS or in the full
version until Phase 8a re-confirms it.
