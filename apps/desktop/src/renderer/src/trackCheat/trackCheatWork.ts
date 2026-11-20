// Track Cheat's screen-level work state (docs/decisions/0021).
//
// App.tsx only renders TrackCheatScreen while Track Cheat is the active
// tab ({tab === 0 && <TrackCheatScreen .../>}), so anything this screen
// kept in its own useState/useRef was discarded the instant the DJ
// switched to another tab - a seed, a result set, slider positions, all
// of it, gone on return. That's the same root cause as Playlist Cheat's
// "Finding 3" (docs/decisions/0019's own PlaylistCheatWork) and the
// 0020 session-clientSeq bug: local state does not survive a remount.
//
// Lifted here, same pattern as PlaylistCheatWork/crateList: App.tsx
// never unmounts, so this genuinely survives a tab switch. Deliberately
// NOT included (see docs/decisions/0021 for why): allTracks (refetched
// fresh on every mount on purpose - a library change on another tab
// must be reflected, not hidden behind a stale copy) and bangerDragOver/
// the drag-enter counter (meaningless outside an active drag gesture).
//
// Also NOT here: the two history-tracking values (which DB row the
// current results came from, and its results array). Those stay as
// REFS, now created in App.tsx and passed down, not converted to state
// - piece 21's thumbs-up race fix depends on reading the truly-live
// value after an await, which a ref gives for free and props/state
// can't (a closure only ever sees what was current when IT was
// created). Lifting the REF ITSELF (not its value into this object) is
// what survives a remount here.

import type { LikeAsSeedMatch } from "./likeAsSeed";
import { DEFAULT_SORT_STATE, type SortState } from "../shared/sortResults";

export type TrackCheatResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: CcdjTrackCheatResult }
  | { status: "likedAsSeed"; matches: LikeAsSeedMatch[] }
  | { status: "notFoundInLibrary"; query: string }
  | { status: "error"; message: string };

export interface TrackCheatWork {
  seedSearch: string;
  seedTrackId: number | null;
  vibe: number;
  energy: number;
  playCountMode: string;
  trackVibePrompt: string;
  autoSeedEnabled: boolean;
  deckWatchOn: boolean;
  deck1: CcdjLibraryRow | null;
  deck2: CcdjLibraryRow | null;
  activeDeck: 1 | 2;
  result: TrackCheatResultState;
  votes: Record<number, "up" | "down">;
  sort: SortState;
  // Piece 23 (uncommitted, R11) - tracks whether the active seed came
  // from the search box, so Try Again knows which branch to take. Was
  // a plain useRef; lifted for the same reason as everything else here
  // - a remount must not silently reset it back to false mid-chain.
  seedFromSearch: boolean;
  // docs/decisions/0017's testing control. Lifted too: its own point was
  // never accidentally SHIPPING on low (surviving a restart) - it still
  // defaults to "high" the moment the app launches, lifting it only
  // means a tab switch mid-comparison doesn't force re-selecting "low".
  effort: "high" | "low";
}

export function createInitialTrackCheatWork(): TrackCheatWork {
  return {
    seedSearch: "",
    seedTrackId: null,
    vibe: 0,
    energy: 0,
    playCountMode: "mix",
    trackVibePrompt: "",
    autoSeedEnabled: true,
    deckWatchOn: false,
    deck1: null,
    deck2: null,
    activeDeck: 1,
    result: { status: "idle" },
    votes: {},
    sort: DEFAULT_SORT_STATE,
    seedFromSearch: false,
    effort: "high"
  };
}
