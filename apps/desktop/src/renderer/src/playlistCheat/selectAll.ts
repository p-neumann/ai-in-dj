// Phase 5, step 5 piece 15 follow-up (2026-11-12) - extracted from
// PlaylistCheatScreen's handleSelectAll so the restore-only Select All
// behavior (Ranjish's call, 2026-11-12 - see PlaylistCheatScreen.tsx's
// header comment) can be verified directly against real sequences of
// state, not just read as code and assumed correct.

export interface SelectAllResult {
  matches: unknown[];
}

// Re-selects every matched song's current pick, or its default first
// match (index 0) if that song was deselected. Does NOT select more
// than one match per song, even if the song has several - see the
// header comment in PlaylistCheatScreen.tsx for why that's deliberate.
export function restoreSelectAll(results: readonly SelectAllResult[], selected: Readonly<Record<number, number>>): Record<number, number> {
  const next: Record<number, number> = {};
  results.forEach((r, ri) => {
    if (r.matches.length) next[ri] = selected[ri] ?? 0;
  });
  return next;
}
