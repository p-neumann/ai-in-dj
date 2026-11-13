// Phase 5, step 5 piece 13 (Stage 2b). Ported verbatim from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx line 563 - used on Crate
// Cheat's prompt and Vibe Prompt fields. Confirmed absent from
// Playlist Cheat's own spotifyPrompt field in the source (a real
// asymmetry, not ported there either - CLAUDE2.md).

export function normalizeSmartQuotes(s: string | null | undefined): string {
  return (s || "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}
