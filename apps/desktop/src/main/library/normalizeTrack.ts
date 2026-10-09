// Turns one raw CSV row into a consistent Track shape (CLAUDE.md Section
// 6.1). A row is only kept if it has a title, location, or filename -
// same rule the prototype itself used - everything else is reported as
// rejected with a reason, never silently dropped or crashed on.
//
// normalizeKey here is copied faithfully from the project's own reference
// spec (reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx) - it does not
// convert musical notes to Camelot notation, it only cleans up the
// DJ-software notation variants that are already Camelot-shaped ("8M" ->
// "8A", "2D" -> "2B", stray characters stripped).

const CAMELOT_KEYS = new Set([
  "1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B", "5A", "5B", "6A", "6B",
  "7A", "7B", "8A", "8B", "9A", "9B", "10A", "10B", "11A", "11B", "12A", "12B"
]);

export function normalizeKey(key: string | undefined | null): string {
  if (!key) return "";
  const k = key.toString().toUpperCase().trim().replace(/\s+/g, "");
  if (CAMELOT_KEYS.has(k)) return k;
  const noM = k.replace(/M$/, "A");
  if (CAMELOT_KEYS.has(noM)) return noM;
  const noD = k.replace(/D$/, "B");
  if (CAMELOT_KEYS.has(noD)) return noD;
  const stripped = k.replace(/[^0-9AB]/g, "");
  if (CAMELOT_KEYS.has(stripped)) return stripped;
  return k;
}

// Same rule as the project's own getDisplayName: prefer the real filename
// from the library path (what Serato itself shows), fall back to
// "artist - title", then just the title.
export function getDisplayName(row: { location?: string; artist?: string; title?: string }): string {
  if (row.location) {
    const parts = row.location.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1].replace(/\.[^.]+$/, "");
  }
  return row.artist ? `${row.artist} - ${row.title ?? ""}` : row.title || "Unknown";
}

function parseDurationToSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d+):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export interface Track {
  displayName: string;
  artist: string;
  title: string;
  bpm: number;
  key: string;
  genre: string;
  year: number;
  playcount: number | null;
  durationSec: number | null;
  location: string;
  extra: Record<string, string>;
}

export interface NormalizeResult {
  track: Track | null;
  rejectedReason: string | null;
  isBlankLine: boolean;
}

const KNOWN_COLUMNS = new Set([
  "title", "artist", "bpm", "key", "genre", "playcount", "play count",
  "duration", "year", "energy", "danceability", "location", "dateadded", "filename"
]);

export function normalizeTrack(row: Record<string, string>): NormalizeResult {
  const title = row.title?.trim() || "";
  const location = row.location?.trim() || "";
  const filename = row.filename?.trim() || "";

  if (!title && !location && !filename) {
    // Tell apart a genuinely empty row (every field blank - harmless, not
    // worth alarming a DJ about) from a row that has SOME real data but
    // is still unusable (worth a clearer "this row has a real problem"
    // signal). Collapsed doubled line-endings (the parser-level fix)
    // should already prevent most blank rows from reaching here at all -
    // this check stays as a second, defensive layer for any CSV that has
    // a genuinely blank line some other way.
    const isBlankLine = Object.values(row).every((v) => !v || v.trim() === "");
    return {
      track: null,
      rejectedReason: isBlankLine ? "blank line" : "no title, location, or filename",
      isBlankLine
    };
  }

  const artist = row.artist?.trim() || "";
  const effectiveLocation = location || filename;

  const bpm = Number.parseFloat(row.bpm);
  const year = Number.parseInt(row.year, 10);

  // CLAUDE.md 6.1: a real 0 play count is valid data - only empty/absent
  // means "unknown," so these must be told apart, not both collapsed to 0.
  const rawPlaycount = row.playcount ?? row["play count"];
  const playcount =
    rawPlaycount === undefined || rawPlaycount === "" ? null : Number.parseInt(rawPlaycount, 10);

  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!KNOWN_COLUMNS.has(k)) extra[k] = v;
  }

  const track: Track = {
    displayName: getDisplayName({ location: effectiveLocation, artist, title }),
    artist,
    title,
    bpm: Number.isFinite(bpm) ? bpm : 0,
    key: normalizeKey(row.key),
    genre: row.genre?.trim() || "",
    year: Number.isFinite(year) ? year : 0,
    playcount: playcount !== null && Number.isFinite(playcount) ? playcount : null,
    durationSec: parseDurationToSeconds(row.duration),
    location: effectiveLocation,
    extra
  };

  return { track, rejectedReason: null, isBlankLine: false };
}
