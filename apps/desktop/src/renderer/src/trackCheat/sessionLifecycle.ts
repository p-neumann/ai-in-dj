// Session-state ownership for Track Cheat (docs/decisions/0020).
//
// This is the whole fix for 0020. Before this file existed,
// TrackCheatScreen seeded its OWN copy of this state in a useRef, inside
// a useEffect that ran "the first time sharedSession arrives and this
// screen's own ref is still null." That guard is true both on the very
// first mount AND on every remount, because a brand-new component
// instance's useRef always starts null - React gives a fresh instance no
// memory of the old one's ref. App.tsx only renders TrackCheatScreen
// while Track Cheat is the active tab, so switching away and back
// remounts it, which re-ran that effect and reset clientSeq back to 0
// against a server session whose lastClientSeq had already moved on.
// Every session event after that was rejected as stale (HTTP 409),
// forever - the local counter only ever advances on a successful
// response, so the same stale value kept getting resent. See
// docs/decisions/0020 for the full root-cause writeup.
//
// The fix: this state now lives in App.tsx (same lifted-state pattern
// already used for crateList/playlistCheatWork), which never unmounts,
// so it genuinely survives a Track Cheat tab switch. initialSessionState
// is called exactly once, right after POST /v1/sessions returns - never
// again for that session's lifetime, no matter how many times
// TrackCheatScreen itself mounts and unmounts.
//
// Exported as its own function (not just inlined in App.tsx) so this
// exact logic is directly testable - there's no React/jsdom harness in
// this repo to literally mount/unmount TrackCheatScreen for a test (same
// limitation noted in historyVoteRace.test.js), so the regression test
// for 0020 drives this function itself.

import type { SharedSession } from "../App";

export function initialSessionState(created: {
  sessionId: string;
  chainId: string | null;
  stateVersion: number;
}): SharedSession {
  return {
    sessionId: created.sessionId,
    clientSeq: 0,
    stateVersion: created.stateVersion,
    chainId: created.chainId,
    chainDepth: 0
  };
}
