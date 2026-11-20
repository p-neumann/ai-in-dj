0020 — Track Cheat dies with HTTP 409 after a tab switch, until restart

Status: Open — investigated and root-caused, not yet fixed. Approach to be agreed with Ranjish before any code changes (see the two options below).
Date: 2026-11-20
Found by: Ranjish, real use. Confirmed and root-caused by Claude, 2026-11-20 (code reading only, not yet reproduced by an automated test).

What happened

Mid-session, with Track Cheat already in use, an "Error: HTTP 409" started appearing. Every fetch after that failed the same way. A full restart of the app cleared it completely.

Root cause

`TrackCheatScreen` keeps its own local copy of the session's ordering state (`sessionRef`, holding `clientSeq` and `stateVersion`) in a `useRef`, separate from the one `sharedSession` App.tsx creates for the whole app. Every session-changing request this screen sends (`seedDropped`, `vote`, `tryAgain`, and the `recommend` call itself) increments this local `clientSeq` and sends it to the server, which enforces that `clientSeq` must strictly increase per session (`sessionEvents.js`'s `isNewerOrDuplicate` / `StaleEventError`, CLAUDE.md 6.3).

`App.tsx` only renders this screen while Track Cheat is the active tab (`{tab === 0 && <TrackCheatScreen .../>}`). Switching to any other tab unmounts it; switching back mounts a brand-new instance. The screen's own seeding effect re-initializes `sessionRef.current` to `clientSeq: 0` on that remount, using whatever `sharedSession.stateVersion` App.tsx happened to pass down — which is itself frozen at session-creation time, since App.tsx never updates `sharedSession` after the one `createBackendSession()` call on launch.

The server's session, meanwhile, was never reset — its `lastClientSeq` is still wherever it was left before the tab switch (e.g. 5, 12, whatever). The next event the remounted screen sends starts again from `clientSeq: 1`, which is not newer than the server's `lastClientSeq`. The server rejects it as stale (`StaleEventError` → HTTP 409, `{code:"STALE_EVENT"}`).

Exact trigger

1. In Track Cheat, do anything that sends at least one session-changing request (a seed drop, a vote, a retry, a fetch) so the server's `lastClientSeq` advances past 0.
2. Switch to any other tab (Library, Crate Cheat, Settings, Account — any of them; all that matters is that Track Cheat unmounts).
3. Switch back to Track Cheat.
4. Do anything that sends another session-changing request.

Step 4 is the first 409.

Why it doesn't recover on its own

`updateSession` (the function that advances the screen's local `clientSeq`) is only called after a successful response. On the rejected request, it's never called, so the local counter stays stuck at the same value. The next attempt sends that exact same stale `clientSeq` again, gets rejected again, forever — which is why every fetch after the first failure also fails, not just the one that happened to catch the race. The only thing that clears it is a full app restart, because that calls `createBackendSession()` again and gets a brand-new server-side session with `lastClientSeq` back at 0, matching the screen's freshly-reseeded local state.

Not caused by the uncommitted piece 23 changes

Piece 23 (currently sitting uncommitted — the Try Again / manual-retry chain-break fix, R11) adds a new `tryAgain` session event type and a `seedFromSearchRef` ref. It does not touch the remount-seeding effect (`TrackCheatScreen.tsx`'s `useEffect` keyed on `[sharedSession]`) or `updateSession` at all. This bug reproduces identically on the last committed state of the branch (`29cf188`), with piece 23's changes fully reverted. It is pre-existing, not introduced by that work.

Scope check — does the same thing happen in Crate Cheat or Playlist Cheat?

No, checked directly, both screens:

- **Playlist Cheat** never touches `sharedSession` at all and sends no session-changing requests — its matcher is entirely local (CLAUDE.md 5.4), confirmed by grep: zero references to `clientSeq`, `sendSessionEvent`, or `sharedSession` anywhere in `PlaylistCheatScreen.tsx`.
- **Crate Cheat** does read `sharedSession.sessionId` (to let `/v1/crates/build` look up the session's stored prefs and per-prompt staleness set), but that route (`apps/server/src/routes/crates.js`) never calls `applyEvent`/the `clientSeq` ordering check at all — it reads `session.crateShownTracks` directly with no sequencing. There is no `clientSeq` on Crate Cheat's request, so there is nothing for it to get stale.

Track Cheat is the only screen that sends ordered session *events* (`seedDropped`/`vote`/`tryAgain`) through the `clientSeq` pipeline, so it's the only screen exposed to this bug today. Not two more landmines — just the one.

Related, but not the same bug: CLAUDE2.md's Phase 5 row on Crate Cheat's local state

CLAUDE2.md flags that Crate Cheat's `prompt`/`crateVibePrompt`/`size`/`sort`/`showExportMenu`/`selected`/`effort` are local `useState` that reset on a tab-away-and-back, same as this bug's general shape ("local state dies on unmount"). It is the same code smell, not the same underlying defect: that state is cosmetic UI (text boxes, sort order, an open menu) with zero interaction with the session/`clientSeq` protocol — losing it costs a DJ some retyping, it does not break the feature or require a restart. It stays correctly scoped as a low-priority, not-urgent item; this write-up doesn't change that classification, but the pattern is worth keeping in mind when deciding how to fix this one (see the two options under consideration, in the next message to Ranjish).

Open question, not yet resolved: server-side recovery

CLAUDE.md 6.3 says "On STALE_EVENT or STATE_CONFLICT, the client fetches current session state and re-renders" — but no endpoint exists today to fetch a session's current `lastClientSeq`/`stateVersion` (`POST /v1/sessions` only *creates* a new one), and the 409 body itself carries no session-position information (`{ok:false, error:{code:"STALE_EVENT"}}`, nothing else). Whether to add that now, as a defensive measure independent of fixing the actual bug, is discussed separately with Ranjish rather than decided here.
