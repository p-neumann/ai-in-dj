// Phase 5, step 5 piece 12 (Stage 2a). Ported verbatim from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx - CAMELOT_COLORS (line 66) and
// normalizeKey (line 442). A renderer-local copy, not a shared import
// from main/library/normalizeTrack.ts's own normalizeKey - that one
// runs in the main process and isn't reachable from here (process
// isolation); this is purely a display concern (which color a Key
// pill renders), not the import-time normalization that function does.

export const CAMELOT_COLORS: Record<string, string> = {
  "1A": "#e74c3c", "1B": "#c0392b",
  "2A": "#e67e22", "2B": "#d35400",
  "3A": "#f39c12", "3B": "#e67e22",
  "4A": "#f1c40f", "4B": "#f39c12",
  "5A": "#d4e157", "5B": "#cddc39",
  "6A": "#a3e635", "6B": "#8bc34a",
  "7A": "#2ecc71", "7B": "#27ae60",
  "8A": "#1abc9c", "8B": "#16a085",
  "9A": "#00bcd4", "9B": "#0097a7",
  "10A": "#3498db", "10B": "#2980b9",
  "11A": "#9b59b6", "11B": "#8e44ad",
  "12A": "#e91e8c", "12B": "#c2185b"
};

export function normalizeKey(key: string | undefined | null): string {
  if (!key) return "";
  const k = key.toString().toUpperCase().trim().replace(/\s+/g, "");
  if (CAMELOT_COLORS[k]) return k;
  const noM = k.replace(/M$/, "A");
  if (CAMELOT_COLORS[noM]) return noM;
  const noD = k.replace(/D$/, "B");
  if (CAMELOT_COLORS[noD]) return noD;
  const stripped = k.replace(/[^0-9AB]/g, "");
  if (CAMELOT_COLORS[stripped]) return stripped;
  return k;
}
