// Phase 5, step 5 piece 12 (Stage 2a). Ported verbatim from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx's getArtistTitle (source line
// 549) - splits a combined "Artist - Title" display name on the first
// " - " only. Used by every row template (ResultRow, and CrateRow/
// library rows in later stages) to show artist above a bold title.

export function getArtistTitle(name: string): { artist: string; title: string } {
  const idx = name.indexOf(" - ");
  if (idx !== -1) return { artist: name.slice(0, idx).trim(), title: name.slice(idx + 3).trim() };
  return { artist: "", title: name };
}
