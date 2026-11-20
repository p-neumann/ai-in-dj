0022 — Thumbs-down stays Track Cheat only; Crate Cheat is independent (supersedes 0015's framing)

Status: Done - and already true in the running code, confirmed by reading it, not by changing anything.
Date: 2026-11-21
Owner/source: Mike, reported by Ranjish, 2026-11-21.

What happened

Mike decided thumbs-down in Track Cheat should only ever affect Track Cheat. A song he's thumbed down should keep showing up as a normal candidate for Crate Cheat - the two features should stay independent on this point.

This reverses the INTENT written into `docs/decisions/0015` (2026-11-04), which framed "a thumbs-down in Track Cheat had no way to reach Crate Cheat" as the bug being fixed, and described the fix's own proof as: thumbs-down a song in Track Cheat, then build a crate, and confirm that song does NOT show up.

What we found when we actually checked the code

Nothing needs to change. `apps/server/src/routes/crates.js` and `apps/server/src/engine/crateOrchestration.js` were searched directly for `downvotedTrackIds`, `shownTrackIds`, and `playedTrackIds` - the three sets Track Cheat's thumbs-down/exclusion logic actually writes to (`sessionStore.js`). Zero references, in either file.

So 0015 unified the *session object* - Track Cheat and Crate Cheat now share one continuous session record instead of three separate ones, which is still correct and still needed for other things (chain state, drag lean, etc.). But the specific piece 0015 described as its own proof of success - Crate Cheat actually consulting Track Cheat's thumbs-down list - was never wired into `crateOrchestration.js`. The session got shared; that one exclusion check was never added to the crate-building path.

The practical result: Crate Cheat has never excluded a thumbs-downed track. Mike's new instruction describes exactly what the code already does - by omission, not by design.

What this means going forward

- No code change. Crate Cheat's build step still doesn't read thumbs-down state, and now that's correct on purpose instead of by accident.
- `docs/decisions/0015` is marked superseded below - its own text, read on its own, now implies the wrong thing (that a thumbs-down SHOULD reach Crate Cheat). The session-sharing it describes is still real and still stands; only the thumbs-down framing is reversed.
- If anyone ever wires exclusion into Crate Cheat for a DIFFERENT reason (e.g., a DJ explicitly adding a track to Do Not Play), that's the existing `doNotPlayList` mechanism, unrelated to thumbs-down, and is unaffected by this decision.

How this was checked

Direct source read of both files Crate Cheat's build path touches server-side (`routes/crates.js`, `engine/crateOrchestration.js`) - no test changes needed, since there was no incorrect behavior to fix. This is a documentation correction, not an engineering one.
