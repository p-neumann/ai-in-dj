// Phase 5, step 5 piece 7 (Settings). Export for whatever is actually in
// the local history table right now.
//
// docs/decisions/0016 / docs/QUESTIONS.md ("History panel: Phase 5
// remaining work"): history entries logged today are a deliberately
// simplified first version - seed name, trigger, result count, and
// timestamp. Mike's full design (CLAUDE.md Section 6.5) also tracks what
// happened to each individual result (dragged/thumbs up/thumbs down),
// chain/bridge/drift detail, and notes - none of that exists yet, so
// this export can only ever export what was actually recorded. Written
// generically (dump whatever `entry` shape is there) so it doesn't need
// to change again the day richer logging is added.

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function formatHistoryAsJson(rows: CcdjHistoryRow[]): string {
  return JSON.stringify(rows, null, 2);
}

export function formatHistoryAsCsv(rows: CcdjHistoryRow[]): string {
  const header = "id,timestamp,entry";
  const lines = rows.map((r) => {
    const iso = new Date(r.timestamp).toISOString();
    const entryJson = JSON.stringify(r.entry);
    return [csvEscape(String(r.id)), csvEscape(iso), csvEscape(entryJson)].join(",");
  });
  return [header, ...lines].join("\n");
}
