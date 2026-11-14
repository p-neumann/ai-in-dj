// Phase 5, step 5 piece 22 (2026-11-13) - History panel readability fix.
//
// Real-window checks (pieces 20/21) found the raw inline-JSON list cost
// two false alarms. Root cause: `JSON.stringify(entry)` with no indent
// produces almost no spaces, so the browser has nothing to wrap on - it
// lays out as one unbreakable line that gets visually cut off at the
// panel's right edge, not an actual truncation of the data. And with
// every entry rendered at that same full length, the one entry that
// actually mattered was indistinguishable from - and buried among - the
// newer ones around it.
//
// This summarizes each row into a single readable line (seed, trigger,
// resultStatus, outcome tally) so the list can be scanned quickly; the
// full entry is still available by expanding that one row (ccdj's own
// SettingsScreen.tsx renders the expand/collapse). Written defensively
// against `entry: unknown` (CcdjHistoryRow's own ambient type, and
// history.ts's own comment that this table stores whatever JSON-
// serializable value it's given) - a row that isn't the Track Cheat
// shape still gets a line, not a crash.

export interface HistoryRowSummary {
  seedName: string;
  trigger: string;
  resultStatus: string;
  resultCount: number;
  shownCount: number;
  upCount: number;
  downCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function summarizeHistoryEntry(entry: unknown): HistoryRowSummary {
  if (!isRecord(entry)) {
    return { seedName: "(unrecognized entry)", trigger: "-", resultStatus: "-", resultCount: 0, shownCount: 0, upCount: 0, downCount: 0 };
  }
  const seed = isRecord(entry.seed) ? entry.seed : null;
  const seedName = typeof seed?.name === "string" && seed.name ? seed.name : "(no seed)";
  const trigger = typeof entry.trigger === "string" ? entry.trigger : "-";
  const resultStatus = typeof entry.resultStatus === "string" ? entry.resultStatus : "-";
  const results = Array.isArray(entry.results) ? entry.results : [];

  let shownCount = 0;
  let upCount = 0;
  let downCount = 0;
  for (const r of results) {
    const outcome = isRecord(r) ? r.outcome : null;
    if (outcome === "up") upCount++;
    else if (outcome === "down") downCount++;
    else shownCount++;
  }

  return { seedName, trigger, resultStatus, resultCount: results.length, shownCount, upCount, downCount };
}

// Case-insensitive substring match against the seed name or trigger -
// enough to jump straight to "the Kanye entry" or "every search-
// triggered one" instead of scrolling through everything around it.
export function filterHistoryRows(rows: CcdjHistoryRow[], query: string): CcdjHistoryRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    const summary = summarizeHistoryEntry(r.entry);
    return summary.seedName.toLowerCase().includes(q) || summary.trigger.toLowerCase().includes(q);
  });
}
