// Phase 5, step 5 piece 15 (Playlist Cheat Vibe Prompt, 2026-11-12).
//
// Ported from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx lines
// 739-744 (getEditDescriptor), 2163-2167 (typeTokenMatches), 2672-2709
// (detectStyleTypeLock) - the same functions already ported server-side
// in apps/server/src/engine/typeLock.js for Track/Crate Cheat's own
// Vibe Prompts. Duplicated here rather than imported: this screen's
// matching is deliberately local-only (CLAUDE.md 5.4 - no server call
// for the plain-text/file path at all), and the renderer can't reach
// across into apps/server's own tsconfig project anyway (same reason
// buildPlaylistExportData.ts duplicates ExportTrack instead of
// importing it). Shapes/logic must stay in sync by hand with the
// server copy.
//
// Source's real mechanism (buildCandidatePools, lines 4507-4718): each
// pool here is already "every version of THIS one song in my library,"
// not different songs - so a straight hard filter on each pool by edit
// descriptor is the correct fit, no balancing needed. Zero matches for
// a given song is the honest result (the DJ doesn't own an EDM/house
// edit of THIS song), never a substitution.

const CONTENT_KEYWORD_STOPWORDS = [
  "the", "and", "for", "with", "some", "need", "needs", "tracks", "track", "remix", "remixes", "only",
  "give", "gimme", "any", "want", "wanna", "like", "please", "help", "build", "playlist", "songs", "song",
  "music", "vibe", "vibes", "turn", "dj", "set", "party", "bangers", "banger", "hits", "hit", "ideas",
  "idea", "good", "great", "best", "more", "less", "new", "old", "have", "has", "get", "got", "really",
  "just", "kind", "kinda", "that", "this", "those", "these", "from", "about", "into", "out", "not", "but",
  "are", "was", "were", "would", "could", "should", "can", "will", "play", "playing", "let", "lets"
];

export function getEditDescriptor(name: string): string {
  let s = (name || "").replace(/\s*-\s*(dirty|clean|explicit|radio|instrumental)\s*$/i, "").trim();
  s = s.replace(/^[([][^)\]]*[)\]]\s*/, "").trim();
  const parts = s.match(/[([]([^)\]]*)[)\]]/g);
  return parts ? parts.join(" ").toLowerCase() : "";
}

export function typeTokenMatches(editDescriptor: string, k: string): boolean {
  if (editDescriptor.indexOf(k) !== -1) return true;
  const alt = k.endsWith("s") ? k.slice(0, -1) : k + "s";
  return editDescriptor.indexOf(alt) !== -1;
}

export function detectStyleTypeLock(styleText: string): string[] | null {
  const p = (styleText || "").toLowerCase();
  const stopSet = new Set(CONTENT_KEYWORD_STOPWORDS);
  const genericTypeWords = new Set(["version", "versions", "remix", "remixes", "edit", "edits"]);

  function tokenize(rawTokens: string[]): string[] {
    const tokens: string[] = [];
    rawTokens.forEach((raw) => {
      let t = raw.trim();
      if (!t || genericTypeWords.has(t)) return;
      t = t.replace(/\s+(versions?|remixes?|edits?)$/, "").trim();
      if (!t || genericTypeWords.has(t)) return;
      if (t.indexOf(" ") === -1) {
        if (t.length >= 2 && t.length < 25) tokens.push(t);
        return;
      }
      t.split(/\s+/).forEach((w) => {
        if (w.length >= 2 && w.length < 25 && !stopSet.has(w)) tokens.push(w);
      });
    });
    return tokens;
  }

  const m = p.match(/\bonly\s+(?:show|play|use|include|want|display|give me|need|prefer|keep|pick)\s+(.+?)(?:\s+versions?\b|\s+of\s+tracks?\b|\s+of\s+songs?\b|[.!]|$)/i);
  if (m) {
    const rawTokens = m[1].split(/\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+/i).map((t) => t.trim()).filter(Boolean);
    const tokens = tokenize(rawTokens);
    if (tokens.length) return tokens;
  }

  const m2 = p.match(/^(.+?)\s+only\b/i);
  if (m2 && m2[1].split(/\s+/).length <= 6) {
    const rawTokens2 = m2[1].split(/\s*\/\s*|\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+/i).map((t) => t.trim()).filter(Boolean);
    const tokens2 = tokenize(rawTokens2);
    if (tokens2.length) return tokens2;
  }

  return null;
}

// Source folds the DJ's permanent Style Profile into this tab's own
// Vibe Prompt (styleProfile+" "+spotifyPrompt, v1.0.22011) so a standing
// preference doesn't need retyping into every tab separately. Our
// Style Profile is saved by settings/SettingsScreen.tsx into
// localStorage under this same key - duplicated here rather than
// imported (same cross-feature-folder judgment call as everywhere else
// in this file), must stay in sync by hand if that key/shape changes.
const SETTINGS_PREFS_KEY = "settingsPrefs";

export function getSavedStyleProfile(): string {
  // Guards for `node --test` running this as a plain module with no
  // DOM - the real Electron renderer always has localStorage, so this
  // never changes real behavior, only lets unit tests call this
  // function without a browser environment behind it.
  if (typeof localStorage === "undefined") return "";
  const raw = localStorage.getItem(SETTINGS_PREFS_KEY);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.styleProfile === "string" ? parsed.styleProfile : "";
  } catch {
    return "";
  }
}
