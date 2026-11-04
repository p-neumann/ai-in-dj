// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 4958-4961, inside buildFromPlainText). "Artist - Title"
// per line; a line with no " - " separator is treated as title-only
// (artist blank) rather than rejected, matching the source exactly.

export interface SourceTrack {
  artist: string;
  name: string;
}

export function parsePlainText(text: string): SourceTrack[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const parts = line.split(/\s+-\s+/);
    if (parts.length >= 2) return { artist: parts[0].trim(), name: parts.slice(1).join(" - ").trim() };
    return { artist: "", name: line };
  });
}
