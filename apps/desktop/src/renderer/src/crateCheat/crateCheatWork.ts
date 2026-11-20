// Crate Cheat's screen-level work state (docs/decisions/0021).
//
// crateList (the actual built crate) was already lifted to App.tsx
// (docs/decisions/0019), so the crate itself survives a tab switch. But
// the REST of this screen's state was still local useState, which
// produced a real, if quieter, version of the same bug: `selected`
// (which tracks are checked for export) is recomputed to "select all"
// by an effect that runs on every mount - so a DJ who deselected
// specific tracks before switching tabs got them silently RESELECTED
// on return. `result` (the error/diagnostic line) just vanished.
//
// Lifted here: prompt, size, crateVibePrompt, playCountMode, result,
// sort, effort, selected. Deliberately NOT lifted (see docs/decisions/
// 0021): libraryCount (refetched fresh on every mount, same reasoning
// as Track Cheat's allTracks), and showExportMenu/exportBusy/
// exportMessage (transient UI feedback for an action that just
// happened - normal for a dropdown/toast to close on navigating away).

import { DEFAULT_SORT_STATE, type SortState } from "../shared/sortResults";

export type CrateCheatResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: CcdjCrateResult }
  | { status: "error"; message: string };

export interface CrateCheatWork {
  prompt: string;
  size: number;
  crateVibePrompt: string;
  playCountMode: string;
  result: CrateCheatResultState;
  sort: SortState;
  selected: Record<number, boolean>;
  // docs/decisions/0017's testing control - lifted for the same reason
  // Track Cheat's is (see trackCheat/trackCheatWork.ts).
  effort: "high" | "low";
}

export function createInitialCrateCheatWork(): CrateCheatWork {
  return {
    prompt: "",
    size: 10,
    crateVibePrompt: "",
    playCountMode: "mix",
    result: { status: "idle" },
    sort: DEFAULT_SORT_STATE,
    selected: {},
    effort: "high"
  };
}
