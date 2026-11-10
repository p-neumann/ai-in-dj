# 0008 - Stable track IDs derived from the file location

**Date:** 2026-11-09
**Owner/source:** Hannah (Phase 5 SQLite milestone). Implements CLAUDE.md §5.5 ("`trackId` = stable hash of the normalized location"). Not a Mike decision; it does not touch musical behavior. To be shared with Ranjish, whose branch uses auto-numbered IDs.
**Status:** Accepted
**Numbering:** Ranjish's branch also has decisions 0006-0018 with other subjects; numbers are to be reconciled when the branches are combined.

## Decision
A track's ID is `"t_"` + the first 16 hex characters of the SHA-256 of its normalized location (`apps/desktop/src/main/db/trackId.ts`). Normalization: trim, `\` → `/`, Unicode NFC, lowercase. The `tracks` table uses it as its primary key (migration 5).

## Why
- With auto-numbered IDs, a re-import deletes and re-inserts every row, so every track gets a new number. History entries, thumbs-down, Do Not Play and server-side session state would then point at the wrong track or none.
- A location-derived ID is the same on every import of the same file.
- Text, not a number: a 64-bit hash does not fit exactly in a JavaScript number. Text also matches the `"t_…"` IDs in CLAUDE.md §6.4.
- Normalization makes spellings of one path match: Windows/macOS separators, the two Unicode forms macOS may use for accented names, and letter case (macOS and Windows file systems ignore case by default).
- Checked against the real `Crates.csv` (2026-11-09): 38,484 rows, 38,484 distinct locations, also when case is ignored. No two tracks share an ID.

## Consequences
- IDs are strings everywhere: IPC, renderer, library sync to the server. Ranjish's screens and server routes that assume numbers need checking at combine time.
- If a CSV lists the same file twice, the first row is kept and the repeats are reported by `replaceAllTracks` (`duplicateLocations`) instead of failing the import.
- `bpm` and `year` are `NULL` when unknown, not 0 (CLAUDE.md §6.1).
- **Known limit:** a drive mounted under another name gives other paths, so other IDs. CLAUDE.md §5.5 asks for a volume identifier, which a CSV does not carry. Revisit with the Serato library import (Phase 8b), where the library root is known.
- Not built yet: `songFamilyId` (§5.5, grouping versions of one song). It is not needed by the current screens.
