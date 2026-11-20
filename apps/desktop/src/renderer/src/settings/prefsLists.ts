// Phase 5, step 5 piece 7 (Settings). Ported from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx (source lines 1678-1703,
// addListEntry/removeListEntry). Do Play and Do Not Play entries, each
// either session-only (gone on restart, by design - CLAUDE.md 3.5: "W -
// session entries gone after quit; permanent persist") or permanent
// (saved locally, carried over every launch).

export type PrefEntryType = "artist" | "track" | "genre" | "era" | "content";

export interface PrefListEntry {
  type: PrefEntryType;
  value: string;
  persistent: boolean;
}

export function addListEntry(list: PrefListEntry[], type: PrefEntryType, value: string, persistent: boolean): PrefListEntry[] {
  const trimmed = value.trim();
  if (!trimmed) return list;
  return [...list, { type, value: trimmed, persistent }];
}

export function removeListEntry(list: PrefListEntry[], index: number): PrefListEntry[] {
  return list.filter((_, i) => i !== index);
}

// Source: persistPrefs only ever writes the persistent subset to storage
// (source lines 1518-1526) - session-only entries are real in-memory
// state but never saved, so they're gone on restart without any extra
// cleanup step needed.
export function permanentOnly(list: PrefListEntry[]): PrefListEntry[] {
  return list.filter((e) => e.persistent);
}

// Piece 4 (startup preferences reminder) added dontAskPrefsReminder to
// this shape - source's own persistPrefs (1518-1526) always writes all
// four fields together, every time, regardless of which one actually
// changed. Both StyleProfilePopup and the startup reminder read/write
// this same shape now; StyleProfilePopup doesn't use dontAskPrefsReminder
// for anything of its own, but has to round-trip it unchanged, or every
// Style Profile edit would silently reset "don't ask again" back to
// false the next time it saves.
export interface StoredPrefs {
  styleProfile: string;
  doPlayList: PrefListEntry[];
  doNotPlayList: PrefListEntry[];
  dontAskPrefsReminder: boolean;
}

export function parseStoredPrefs(raw: string | null): StoredPrefs {
  if (!raw) return { styleProfile: "", doPlayList: [], doNotPlayList: [], dontAskPrefsReminder: false };
  try {
    const parsed = JSON.parse(raw);
    return {
      styleProfile: typeof parsed.styleProfile === "string" ? parsed.styleProfile : "",
      doPlayList: Array.isArray(parsed.doPlayList) ? parsed.doPlayList : [],
      doNotPlayList: Array.isArray(parsed.doNotPlayList) ? parsed.doNotPlayList : [],
      dontAskPrefsReminder: typeof parsed.dontAskPrefsReminder === "boolean" ? parsed.dontAskPrefsReminder : false
    };
  } catch {
    return { styleProfile: "", doPlayList: [], doNotPlayList: [], dontAskPrefsReminder: false };
  }
}

// docs/decisions/0018: this is the piece the old SettingsScreen.tsx's own
// persistLocal was missing - Mike's persistPrefs filters both lists to
// permanent-only before building the object it saves; this port's
// first version saved whatever list it was handed, unfiltered, so a
// session entry sitting in state got written to disk the next time
// ANYTHING else triggered a save (a permanent add, a permanent remove,
// or just clicking out of the Style Profile box). This function is the
// one place that decision now gets made, so every caller gets it right
// by construction instead of needing to remember to filter themselves.
export function buildStoredPrefsPayload(
  styleProfile: string,
  doPlayList: PrefListEntry[],
  doNotPlayList: PrefListEntry[],
  dontAskPrefsReminder: boolean
): StoredPrefs {
  return {
    styleProfile,
    doPlayList: permanentOnly(doPlayList),
    doNotPlayList: permanentOnly(doNotPlayList),
    dontAskPrefsReminder
  };
}
