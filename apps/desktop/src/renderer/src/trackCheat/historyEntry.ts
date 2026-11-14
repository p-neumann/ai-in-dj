// Phase 5, step 5 piece 20 (History panel, Piece A - recording,
// 2026-11-14). Ported from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx's
// logSeedEvent (1611-1631), logResultsForSeed (1632-1652), and logOutcome
// (1656-1666) - scoped to what this port can honestly record today.
//
// Deliberate limits (Ranjish's call, 2026-11-14), recorded here and in
// CLAUDE2.md so Piece B's scope stays honest:
// - Outcome is "shown" | "up" | "down" only - his real five are shown/
//   up/down/dragged/prepared. "dragged" can't fire until ResultRow is
//   actually draggable (Phase 8, already tracked elsewhere). "prepared"
//   is a whole separate feature (a "mark as queued" control) nobody
//   has asked for - not invented here just to fill a value.
// - chainId/chainDepth/mode are the FLAT values the recommend response
//   already returns (CcdjTrackCheatResult.chain/.mode) - his own
//   richer bridgeInfo/driftInfo/phase detail (oldSeedName,
//   crossoverGenre, detected/continuing/resolved) is computed
//   server-side (apps/server/src/routes/trackCheat.js:254-263) but
//   never included in the response sent back to this screen - that's
//   a server API gap, tracked separately, not something to fake here.
// - Force Save Now is not ported at all - his version verifies a
//   round-trip against window.storage, which can silently fail; our
//   SQLite write via IPC either resolves (durably committed) or
//   throws (caught) the instant it's called, so there's nothing left
//   to verify after the fact. Porting the button would just be theater.

export type HistoryTrigger = "freshSeed" | "search" | "daisyChain" | "manualRetry" | "likedAsSeed";

export type HistoryOutcome = "shown" | "up" | "down";

export interface HistoryResultRow {
  trackId: number;
  name: string;
  bpm: number;
  key: string;
  outcome: HistoryOutcome;
}

export interface HistorySeedEntry {
  seed: { name: string; bpm: number | null; key: string | null; genre: string | null; year: number | null };
  vibeOffset: number;
  energyOffset: number;
  trigger: HistoryTrigger;
  chainId: string | null;
  chainDepth: number | null;
  mode: string | null;
  resultStatus: "pending" | "ok" | "empty" | "error";
  results: HistoryResultRow[];
  note: string | null;
  at: string;
}

export function buildHistorySeedEntry(
  seedTrack: { displayName: string; bpm: number; key: string; genre: string; year: number } | null,
  fallbackSeedName: string,
  vibeOffset: number,
  energyOffset: number,
  trigger: HistoryTrigger
): HistorySeedEntry {
  return {
    seed: {
      name: seedTrack?.displayName ?? fallbackSeedName,
      bpm: seedTrack?.bpm ?? null,
      key: seedTrack?.key ?? null,
      genre: seedTrack?.genre ?? null,
      year: seedTrack?.year ?? null
    },
    vibeOffset,
    energyOffset,
    trigger,
    chainId: null,
    chainDepth: null,
    mode: null,
    resultStatus: "pending",
    results: [],
    note: null,
    at: new Date().toISOString()
  };
}

// Source's logOutcome (1656-1666): finds the result by name and patches
// only its outcome (plus outcomeAt, which this port skips - no feature
// reads it yet, and it's trivial to add alongside a real reader later).
// We patch by trackId instead of name - more precise, and we have the
// id on hand since these are our own just-fetched results, not a
// lookup backward through unrelated history the way his code needs.
export function patchResultOutcome(results: HistoryResultRow[], trackId: number, outcome: HistoryOutcome): HistoryResultRow[] {
  return results.map((r) => (r.trackId === trackId ? { ...r, outcome } : r));
}

// Piece 21 (2026-11-13) - fixes a race between handleVote and
// handleLikeAsSeed in TrackCheatScreen. The thumbs-up button fires both
// unconditionally and synchronously (source line 951's own
// unconditional double-call). handleVote is async and awaits a backend
// session-event call (an HTTP round trip) before it reads the shared
// "current history entry" refs; handleLikeAsSeed's own async step is a
// local SQLite write over IPC, which resolves faster and overwrites
// those refs to point at a brand-new entry first. If handleVote simply
// re-read the refs after its own await, it would patch the wrong
// (newly-created) entry with a no-op, and the entry actually on screen
// would never be touched.
//
// The fix: the caller snapshots the refs synchronously, before its
// first await (so the snapshot can only reflect the entry that was
// actually on screen when the vote was clicked, regardless of what
// runs afterward). This function then decides, at write time, whether
// the live refs still point at that same entry:
// - if so, patch the live accumulated results (so two votes on the
//   same entry in a row both land, instead of the second one patching
//   from a stale pre-first-vote base and dropping the first outcome);
// - if not (the race), patch the snapshot alone, and tell the caller
//   not to write the result back into the ref - the ref has already
//   moved on to a different entry's data, and must not be clobbered.
export function resolveVotePatch(
  snapshot: { entryId: number | null; results: HistoryResultRow[] },
  liveEntryId: number | null,
  liveResults: HistoryResultRow[],
  trackId: number,
  outcome: HistoryOutcome
): { entryId: number; results: HistoryResultRow[]; shouldWriteRef: boolean } | null {
  if (snapshot.entryId === null) return null;
  const stillCurrent = liveEntryId === snapshot.entryId;
  const base = stillCurrent ? liveResults : snapshot.results;
  return { entryId: snapshot.entryId, results: patchResultOutcome(base, trackId, outcome), shouldWriteRef: stillCurrent };
}
