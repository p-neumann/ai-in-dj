0021 — Track Cheat and Crate Cheat lost their own screen state on a tab switch

Status: Done, pending Ranjish's real-window check.
Date: 2026-11-20
Found by: Ranjish, real use, immediately after the 0020 fix shipped.

What happened

On Track Cheat: search for a seed, pick it, get results. Switch to any other tab. Switch back. Everything is gone — the results, the seed card, even the typed search text. Back to a blank screen.

First question: did the 0020 fix (lifting the session's clientSeq/stateVersion/chainDepth) cause this? Checked directly before touching any code, per Ranjish's instruction: stashed every uncommitted change, ran the actual committed code (`29cf188`) through typecheck and the full test suite, and read the committed `TrackCheatScreen.tsx` directly. `seedSearch`, `seedTrackId`, `vibe`, `energy`, `playCountMode`, `trackVibePrompt`, `autoSeedEnabled`, `deckWatchOn`, `deck1`, `deck2`, `activeDeck`, `result`, `votes`, and `sort` were already plain `useState` *inside* `TrackCheatScreen` in the committed version — 0020 never touched any of them, only the session ref/display state. **Pre-existing, not a regression.** `App.tsx` only renders `TrackCheatScreen` while Track Cheat is the active tab (`{tab === 0 && <TrackCheatScreen .../>}`) — unchanged by 0020 too. React discards a component's own state unconditionally on unmount; that part doesn't need a live click to confirm once the structural facts are established the same way 0020 itself needed confirming.

This is the same root cause as Playlist Cheat's "Finding 3" (`docs/decisions/0019`'s own `PlaylistCheatWork`), just not caught for Track Cheat until now, and not caught for the half of Crate Cheat that wasn't already lifted either (see below).

The fix

Everything Track Cheat's screen showed is now read from a `work` prop (`trackCheat/trackCheatWork.ts`'s `TrackCheatWork`) and changed via an `updateWork` callback, lifted into `App.tsx` the same way `crateList`/`playlistCheatWork` already were — `App.tsx` never unmounts, so this genuinely survives a tab switch now. Lifted: `seedSearch`, `seedTrackId`, `vibe`, `energy`, `playCountMode`, `trackVibePrompt`, `autoSeedEnabled`, `deckWatchOn`/`deck1`/`deck2`/`activeDeck`, `result`, `votes`, `sort`, and `seedFromSearch` (piece 23's own ref, still uncommitted — lifted too, since leaving it local would have reintroduced a quieter version of the same bug the moment piece 23 ships: Try Again would forget a search-originated seed after a tab switch and misclassify the retry).

Deliberately NOT lifted:
- `allTracks` — refetched fresh on every mount, on purpose. If the DJ cleared or reimported the library on another tab, Track Cheat needs to see that, not a stale copy from before the switch.
- `bangerDragOver` and the drag-enter counter — meaningless outside an active drag gesture; there's no "tab switch mid-drag" scenario where losing this would be noticed.
- Which history DB row the current results came from, and its results array (the old `currentHistoryEntryIdRef`/`currentHistoryResultsRef`). These stayed **refs** — created in `App.tsx` now instead of inside `TrackCheatScreen`, and passed down as the ref object itself, not converted into `TrackCheatWork` state. Piece 21's thumbs-up race fix depends on reading the truly-live value after an await (a closure only ever sees what was current when it was created; a ref doesn't have that limitation). Converting this pair to plain state/props would have silently reopened that exact race. Lifting the ref object itself — not its value, into a plain object — gets the same "survives a remount" benefit without touching the invariant the race fix relies on.
- `effort` (the 0017 testing-only dropdown) — lifted anyway, on reflection. Its whole point was never accidentally *shipping* on low, which is about surviving a restart; it still defaults to "high" the instant the app launches either way. Lifting it just means a tab switch mid-comparison doesn't force Ranjish to keep re-selecting "low."

Crate Cheat, checked rather than assumed

`crateList` (the actual built crate) was already lifted (`docs/decisions/0019`), so the crate itself never disappeared. But the rest of the screen wasn't, and it was a real bug, not just the cosmetic gap `CLAUDE2.md`'s own row 27 already flagged:

- `selected` (which tracks are checked for export) was local, recomputed to "select all" by an effect that ran on every mount. A DJ who deselected specific tracks before switching tabs got them silently **reselected** on return — real, if quieter than Track Cheat's blank screen.
- `result` (the error/diagnostic line) was local and just vanished on a tab switch.

Fixed in the same piece, folding in row 27's already-known cosmetic list while restructuring this screen's state anyway: `prompt`, `size`, `crateVibePrompt`, `playCountMode`, `result`, `sort`, `selected`, and `effort` are now `crateCheat/crateCheatWork.ts`'s `CrateCheatWork`, lifted the same way. The mount-keyed "select all" effect is gone — replaced with explicit updates at each real mutation site: a successful build selects everything in the new crate (`CrateCheatScreen.tsx`'s `handleBuildCrate`), Playlist Cheat's "Add To Crate" marks only the newly appended tracks selected without touching existing selections (`App.tsx`'s `onAddToCrate`), and Clear Library resets `selected` to empty alongside clearing `crateList` (`App.tsx`'s `onClearLibrary` — otherwise the selected-count would keep counting indices that no longer exist). Deliberately left local: `libraryCount` (refetched fresh, same reasoning as Track Cheat's `allTracks`) and `showExportMenu`/`exportBusy`/`exportMessage` (transient UI feedback for an action that just happened — normal for a dropdown or a "Copied" toast to close on navigating away).

What did not change

Nothing about recommendations, ranking, prompts, or pool selection. Every value that used to live in a `useState` now lives in the exact same shape one level up, read and written through a prop instead of a hook — the actual Track Cheat/Crate Cheat feature logic (search/GO, free-typed resolution, the drop zone, Auto-Seed, Deck Watcher, Vibe Prompt, sliders, play count, thumbs-up reseed, thumbs-down, daisy-chain, sorting, Gig Mode, crate building, export) is unchanged. The 0020 session fix is untouched and composes cleanly with this — `sharedSession`/`updateSession` is a separate lifted object from `trackCheatWork`/`updateWork`, with no interaction between them.

A standing rule for this class of bug is now recorded in `CLAUDE2.md` (right after its existing Phase 5 standing rule): any screen state a DJ would expect to survive a tab switch gets lifted to `App.tsx` from the start, not discovered missing later.

How this was checked

241/241 desktop tests pass (unchanged - no new tests added for this piece specifically; this is a structural wiring fix with no new algorithmic logic to unit-test, same as Playlist Cheat's own "Finding 3" fix, which also shipped on a real-window check alone, not a new test file). Both typecheck projects pass. A real build succeeds. The actual proof - that Track Cheat's and Crate Cheat's state now survives a real tab switch, and that nothing listed above regressed - is Ranjish's real-window check, described separately, before this is committed.
