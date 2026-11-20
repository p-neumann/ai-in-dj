// Phase 5, step 5 piece 3 (core) + piece 4 (daisy-chain/votes) + piece
// 10 (Gig Mode) + piece 12 (Stage 2a real styling, Stage 2a-bis real
// Deck Watcher/drop-zone/Vibe-Prompt/Auto-Seed).
//
// All the actual recommendation logic (candidate selection, prompts,
// ranking, the R28 fallback chain) already lives in the backend server,
// built and tested in Phase 3/4. This screen does exactly one thing: let
// a DJ pick a seed, move the vibe/energy sliders, and send that to the
// already-built, already-tested recommend endpoint - nothing here
// re-implements or changes any of that logic.
//
// Render order below matches the source exactly, checked line by line
// (reference lines 5720-5826), not approximated: Gig Mode button ->
// Deck Watcher panel -> sliders -> Vibe Prompt -> play-count -> "Drop A
// Track" rule-line -> drop zone -> search+GO -> Auto-Seed -> seed card
// -> status lines -> results.
//
// Search+GO (piece 18, 2026-11-13): both of his routes now, not one
// replacing the other. Pick a dropdown row - already a real track by
// construction, no matching needed, same as before. Or type free text
// and press GO directly - resolved client-side via his own
// fetchSearchResults/fuzzyFind rule (source 3645, 532-548): exact
// display-name match first, then fuzzyFind's word-overlap score with
// its 0.4 floor. Only a real track's numeric ID ever reaches
// recommendForSeed/the backend either way - the backend contract is
// unchanged (apps/server/src/routes/trackCheat.js:209-211 still does a
// plain ID lookup, nothing else).
//
// ONE DELIBERATE DEVIATION (Ranjish's explicit call, 2026-11-13, not a
// styling gap): below the 0.4 floor, his own code fetches anyway - no
// real seed (seedBpm 0, no BPM window), genre guessed from the typed
// text itself. This port does NOT do that; it shows "No match in your
// library" and makes no AI call. Reasons on record: a real paid call
// for a song that isn't in the library; a mistyped search mid-gig
// returning ten unexplained suggestions; and this is the one place his
// own code breaks the library-first rule the rest of the app follows.
// Recorded in CLAUDE2.md as a deliberate deviation, kept isolated to
// one state branch (ResultState's "notFoundInLibrary") so it's one
// branch to change if Mike ever wants the ungrounded fetch back -
// flagged as an open question for him either way.
//
// Stage 2a-bis real scope limits, still true, flagged rather than
// silently built around:
// - The drop zone only handles an EXTERNAL file drop (resolves the
//   dropped filename against the library). His own handler also reads
//   a dragged-result's custom data for the daisy-chain-by-drag case -
//   that needs ResultRow to be draggable, which needs a real drop
//   target for it (Phase 8's OS drag-out, or a Phase-5 internal-only
//   version), neither of which exist yet.
// - Deck Watcher's Simulate Drop / deck-select both call
//   recommendForSeed(id, "external") rather than his direct
//   fetchBangerResults - CLAUDE.md 4.1's own classification rule for
//   Deck Watcher loads ("external swerve or initial seed" when not
//   clearly an internal reseed), not an invented substitute.
//
// docs/decisions/0021: everything this screen used to keep in its own
// useState (seed, results, sliders, toggles, sort, votes...) is now
// read from the `work` prop and changed via `updateWork`, lifted to
// App.tsx (trackCheat/trackCheatWork.ts) - this screen only renders
// while Track Cheat is the active tab, so a local copy of any of that
// was discarded the instant the DJ switched to another tab and back.
// Deliberately still local: allTracks (refetched fresh on every mount
// on purpose) and bangerDragOver/the drag-enter counter (meaningless
// outside an active drag gesture). The two history-tracking values are
// a REF now (`historyRef`, also lifted, but as a ref object - see
// trackCheatWork.ts's header comment for why that one couldn't become
// plain state without reopening piece 21's race fix).

import { useEffect, useMemo, useRef, useState } from "react";
import { filterTracks } from "../library/filterTracks";
import { recommendTrackCheat, sendSessionEvent } from "../api/backendClient";
import { getVibeLabel } from "./vibeLabels";
import { buildLikeAsSeedMatches } from "./likeAsSeed";
import { resolveSeedTrack } from "./fuzzyFind";
import { buildHistorySeedEntry, resolveVotePatch, type HistoryResultRow, type HistoryTrigger } from "./historyEntry";
import type { TrackCheatWork } from "./trackCheatWork";
import type { SharedSession } from "../App";
import type { DerivedTheme } from "../theme/deriveTheme";
import GlobalAccentStyle from "../shared/GlobalAccentStyle";
import SectionRule from "../shared/SectionRule";
import DualSliders from "../shared/DualSliders";
import PlayCountToggle from "../shared/PlayCountToggle";
import { ResultRow, ResHeader } from "../shared/ResultRow";
import { applySort, handleSort, DEFAULT_SORT_STATE, type SortField } from "../shared/sortResults";
import { cardStyle, lblStyle, inputStyle, searchInputStyle, goBtnStyle, dropZoneStyle, WHITE, GRAY, bpmBorder, glowSweepStyle } from "../shared/controlStyles";
import KeyPill from "../shared/KeyPill";
import EmptyLib from "../shared/EmptyLib";

interface TrackCheatScreenProps {
  sharedSession: SharedSession | null;
  // docs/decisions/0020: the only way this screen ever changes the
  // session now - it no longer keeps its own copy to mutate. Same
  // lifted-state pattern as setCrateList/setPlaylistCheatWork.
  updateSession: (patch: Partial<SharedSession>) => void;
  // docs/decisions/0021.
  work: TrackCheatWork;
  updateWork: (patch: Partial<TrackCheatWork> | ((prev: TrackCheatWork) => Partial<TrackCheatWork>)) => void;
  historyRef: React.RefObject<{ entryId: number | null; results: HistoryResultRow[] }>;
  gigMode: boolean;
  setGigMode: (next: boolean) => void;
  theme: DerivedTheme;
  // Source: {!library.length?<EmptyLib/>:(...)} (line 5722) replaces
  // the WHOLE tab body, including the Gig Mode button itself, whenever
  // the library is empty - ported the same way here.
  onGoToLibrary: () => void;
}

export default function TrackCheatScreen({ sharedSession, updateSession, work, updateWork, historyRef, gigMode, setGigMode, theme, onGoToLibrary }: TrackCheatScreenProps): React.JSX.Element {
  const {
    seedSearch, seedTrackId, vibe, energy, playCountMode, trackVibePrompt, autoSeedEnabled,
    deckWatchOn, deck1, deck2, activeDeck, result, votes, sort, seedFromSearch, effort
  } = work;

  const [allTracks, setAllTracks] = useState<CcdjLibraryRow[] | null>(null);
  const [bangerDragOver, setBangerDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    window.ccdj.library.getAllTracks().then(setAllTracks);
  }, []);

  const seedMatches = useMemo(
    () => (allTracks ? filterTracks(allTracks, seedSearch).slice(0, 20) : []),
    [allTracks, seedSearch]
  );
  const seedTrack = useMemo(() => allTracks?.find((t) => t.id === seedTrackId) ?? null, [allTracks, seedTrackId]);
  const vibeLabel = getVibeLabel(vibe);
  const isBusy = result.status === "loading";
  const activeResults =
    result.status === "done"
      ? result.data.results ?? []
      : result.status === "likedAsSeed"
        ? result.matches.map((m) => ({ ...m, camp: null, lane: null }))
        : [];
  const sortedResults = useMemo(() => applySort(activeResults, sort), [activeResults, sort]);
  const hasResults = activeResults.length > 0;

  function setSeedTo(trackId: number): void {
    const match = allTracks?.find((t) => t.id === trackId);
    updateWork({ seedTrackId: trackId, seedSearch: match ? match.displayName : "" });
  }

  // The one thing both a fresh manual pick (origin "external") and a
  // daisy chain (origin "ccdjResult") have in common: tell the server
  // what just happened, THEN ask for recommendations using the server's
  // updated session state (CLAUDE.md 4.1 - these are genuinely different
  // events, not the same action with a different label).
  //
  // Piece 20 (History panel, Piece A, 2026-11-14): `trigger` is now an
  // explicit, honest label per call site (search/daisyChain/
  // manualRetry/freshSeed) instead of the old two-way guess from
  // `origin` alone - `origin` is a SEPARATE concept the server's own
  // chain state machine needs (CLAUDE.md 4.1), `trigger` is purely a
  // history/display label, and conflating them was losing real
  // information (e.g. Try Again and a fresh GO both used to log as
  // the same thing). The history entry is created BEFORE the fetch
  // (matching his own logSeedEvent-then-logResultsForSeed order,
  // source 1611/1632) specifically so a failed fetch still leaves a
  // real record instead of silently logging nothing, same as his.
  async function recommendForSeed(
    trackId: number,
    origin: "external" | "ccdjResult",
    trigger: HistoryTrigger,
    // Piece 23 (2026-11-14, R11) - Try Again on a seed that did NOT come
    // from the search box must tell the server this is a retry via a
    // dedicated tryAgain event (sessionEvents.js's handleTryAgain), not
    // another seedDropped - sending seedDropped here was misclassifying
    // every retry mid-chain as an external swerve (see the Decisions
    // table / CLAUDE2.md for the full bug writeup). Every other caller
    // leaves this at its default, so nothing else changes.
    sessionEventType: "seedDropped" | "tryAgain" = "seedDropped"
  ): Promise<void> {
    // docs/decisions/0015: no longer creates a fallback session of its
    // own here - doing that was exactly the bug being fixed (a second,
    // divergent session Crate Cheat would never see). If the app's one
    // shared session hasn't arrived yet, wait for it instead.
    //
    // docs/decisions/0020: `session` is a local variable tracking THIS
    // call's own in-flight progress (a seedDropped/tryAgain event, then
    // a recommend call, each needing to see the other's result before
    // it runs) - it is deliberately not re-read from the sharedSession
    // prop between the two awaits below, since a prop update from
    // updateSession() below doesn't land synchronously. The persisted
    // copy (what survives a remount) is written via updateSession().
    let session = sharedSession;
    if (!session) {
      updateWork({ result: { status: "error", message: "Still connecting to the backend session - try again in a moment." } });
      return;
    }
    updateWork({ result: { status: "loading" } });

    const seedTrackRow = allTracks?.find((t) => t.id === trackId) ?? null;
    const entryId = await window.ccdj.history.append(
      buildHistorySeedEntry(seedTrackRow, `track ${trackId}`, vibe, energy, trigger)
    );
    historyRef.current.entryId = entryId;
    historyRef.current.results = [];

    try {
      const seedSeq = session.clientSeq + 1;
      const eventRes = await sendSessionEvent(
        session.sessionId,
        sessionEventType === "tryAgain"
          ? { type: "tryAgain", clientSeq: seedSeq }
          : { type: "seedDropped", trackId, origin, clientSeq: seedSeq }
      );
      if (!eventRes.ok) {
        void window.ccdj.history.update(entryId, { resultStatus: "error" });
        // docs/decisions/0020: a STALE_EVENT now says exactly what was
        // out of sync (what we sent vs. where the server actually is),
        // instead of just the bare code - this is the whole point of
        // the richer error body, not cosmetic.
        const message =
          eventRes.errorCode === "STALE_EVENT"
            ? `Session out of sync - we sent clientSeq ${seedSeq}, server is at ${eventRes.serverLastClientSeq ?? "?"} (stateVersion ${eventRes.serverStateVersion ?? "?"}). Restart the app to get a fresh session.`
            : eventRes.error ?? "Could not record the seed change";
        updateWork({ result: { status: "error", message } });
        return;
      }
      session = { ...session, clientSeq: seedSeq, stateVersion: eventRes.stateVersion ?? session.stateVersion };
      updateSession({ clientSeq: session.clientSeq, stateVersion: session.stateVersion });

      const recommendSeq = session.clientSeq + 1;
      const data = await recommendTrackCheat({
        seedTrackId: trackId,
        vibe,
        energy,
        playCountMode,
        vibePromptText: trackVibePrompt.trim() || undefined,
        sessionId: session.sessionId,
        clientSeq: recommendSeq,
        expectedStateVersion: session.stateVersion,
        debugOverride: { effort }
      });
      if (!data.ok) {
        void window.ccdj.history.update(entryId, { resultStatus: "error" });
        updateWork({ result: { status: "error", message: data.error ?? "Unknown error" } });
        return;
      }
      session = {
        ...session,
        clientSeq: recommendSeq,
        stateVersion: data.stateVersion ?? session.stateVersion,
        chainId: data.chain?.chainId ?? session.chainId,
        chainDepth: data.chain?.depth ?? session.chainDepth
      };
      updateSession(session);
      updateWork({ result: { status: "done", data }, sort: DEFAULT_SORT_STATE });

      const resultRows: HistoryResultRow[] = (data.results ?? []).map((r) => ({
        trackId: r.trackId,
        name: r.name,
        bpm: r.bpm,
        key: r.key,
        outcome: "shown"
      }));
      historyRef.current.results = resultRows;
      void window.ccdj.history.update(entryId, {
        chainId: data.chain?.chainId ?? null,
        chainDepth: data.chain?.depth ?? null,
        mode: data.mode ?? null,
        resultStatus: resultRows.length > 0 ? "ok" : "empty",
        results: resultRows
      });
    } catch (error) {
      void window.ccdj.history.update(entryId, { resultStatus: "error" });
      updateWork({ result: { status: "error", message: error instanceof Error ? error.message : String(error) } });
    }
  }

  // Piece 18 (2026-11-13) - keeps the dropdown pick (seedTrackId
  // already set, exact by construction - no matching needed) AND adds
  // his free-typed path (fetchSearchResults/fuzzyFind, source
  // 3645/532-548): exact display-name match first, then fuzzyFind's
  // word-overlap scoring with its 0.4 floor. Either way, only a real
  // track's own numeric ID ever reaches recommendForSeed/the backend -
  // the contract there is unchanged.
  async function handleGetRecommendations(): Promise<void> {
    if (seedTrackId !== null) {
      updateWork({ seedFromSearch: true });
      await recommendForSeed(seedTrackId, "external", "search");
      return;
    }
    const query = seedSearch.trim();
    if (!query || !allTracks) return;
    const found = resolveSeedTrack(query, allTracks);
    if (!found) {
      updateWork({ result: { status: "notFoundInLibrary", query } });
      return;
    }
    setSeedTo(found.id);
    updateWork({ seedFromSearch: true });
    await recommendForSeed(found.id, "external", "search");
  }

  async function handleDaisyChain(trackId: number): Promise<void> {
    setSeedTo(trackId);
    updateWork({ seedFromSearch: false });
    await recommendForSeed(trackId, "ccdjResult", "daisyChain");
  }

  // Thumbs down reaches the server's REAL exclusion bookkeeping (R12):
  // this track will not reappear in any future recommendation this
  // session, on any path - not just hidden in this screen. Clicking the
  // same vote again clears it (sends value: null, same as the source's
  // own un-vote behavior).
  async function handleVote(trackId: number, value: "up" | "down"): Promise<void> {
    const session = sharedSession;
    if (!session) return;
    // Piece 21 (2026-11-13) - snapshot the history target BEFORE the
    // first await, synchronously. ResultRow's thumbs-up fires this and
    // handleLikeAsSeed back to back; handleLikeAsSeed's own async
    // write (local IPC) resolves faster than this function's await
    // below (a backend HTTP round trip) and overwrites the SAME ref.
    // Reading the ref only after the await would race it and patch the
    // wrong, brand-new entry. See resolveVotePatch for why the
    // write-back is also guarded. historyRef still being a real ref
    // (docs/decisions/0021) is exactly what keeps this race fix intact
    // after lifting everything else to props.
    const voteSnapshot = { entryId: historyRef.current.entryId, results: historyRef.current.results };
    const nextValue = votes[trackId] === value ? null : value;
    const seq = session.clientSeq + 1;
    const res = await sendSessionEvent(session.sessionId, { type: "vote", trackId, value: nextValue, clientSeq: seq });
    if (!res.ok) return;
    updateSession({ clientSeq: seq, stateVersion: res.stateVersion ?? session.stateVersion });
    updateWork((prev) => {
      const next = { ...prev.votes };
      if (nextValue) next[trackId] = nextValue;
      else delete next[trackId];
      return { votes: next };
    });
    // Piece 20 (History panel, Piece A) - his logOutcome (source
    // 2478/1656-1666), patching the outcome of the result this vote
    // was on in whichever history entry it actually came from.
    const patch = resolveVotePatch(
      voteSnapshot,
      historyRef.current.entryId,
      historyRef.current.results,
      trackId,
      nextValue ?? "shown"
    );
    if (patch) {
      if (patch.shouldWriteRef) historyRef.current.results = patch.results;
      void window.ccdj.history.update(patch.entryId, { results: patch.results });
    }
  }

  // Piece 17 (2026-11-13) - his handleLikeAsSeed (source 2489-2546),
  // ported exactly: a direct client-side library search by title, no
  // AI call. Called unconditionally by ResultRow's 👍 button alongside
  // handleVote, every click, matching his own unconditional double-
  // call (confirmed verbatim, source line 951) - including when the
  // click is actually un-voting, same as his.
  //
  // Chain-depth reset is LOCAL/display-only, not sent to the server.
  // His own reset (setDaisyChainDepth(0); chainIdRef.current=
  // makeHistoryId()) is pure local state, since his whole app has no
  // server. Our session/chain state is server-authoritative - and the
  // server's own sessionEvents.js already documents (its own SCOPE
  // NOTE, lines 7-13) that "likedAsSeed" isn't a distinct origin in
  // the event contract: sending a generic seedDropped{origin:
  // "external"} while a real chain is active would be read as an
  // external swerve (bridge-mode detection), not a clean reset - a
  // musical-behavior risk (Top Rule 5), not something to guess at
  // here. So this only clears the LOCAL chain-depth display (hides the
  // "chained (N links)" line immediately, matching his visual reset);
  // the server's own chain/bridge/drift state is untouched until the
  // next real recommend call reports its own chain info. Flagged to
  // Ranjish, not silently decided.
  function handleLikeAsSeed(trackId: number): void {
    if (!allTracks) return;
    const track = allTracks.find((t) => t.id === trackId);
    if (!track) return;
    const matches = buildLikeAsSeedMatches(track.displayName, allTracks, vibe, energy);
    setSeedTo(trackId);
    updateWork({
      seedFromSearch: false, // matches his setSearchSeedTrack(null) at source 2538
      result: { status: "likedAsSeed", matches },
      sort: DEFAULT_SORT_STATE
    });
    if (sharedSession) updateSession({ chainId: null, chainDepth: 0 });

    // Piece 20 (History panel, Piece A) - same richer entry shape as
    // a real fetch, minus chain/mode (there's no recommend response
    // here to report them from - no AI call at all, confirmed in this
    // function's own header comment).
    const resultRows: HistoryResultRow[] = matches.map((m) => ({ trackId: m.trackId, name: m.name, bpm: m.bpm, key: m.key, outcome: "shown" }));
    const entry = buildHistorySeedEntry(track, track.displayName, vibe, energy, "likedAsSeed");
    entry.resultStatus = resultRows.length > 0 ? "ok" : "empty";
    entry.results = resultRows;
    window.ccdj.history.append(entry).then((entryId) => {
      historyRef.current = { entryId, results: resultRows };
    });
  }

  function onSort(field: SortField): void {
    updateWork({ sort: handleSort(sort, field) });
  }

  // Source: handleWindowDragEnter/Leave/Over/Drop (4982-5011) - only the
  // external-file-drop half (see header comment for the other half).
  function handleDragEnter(e: React.DragEvent): void {
    e.preventDefault();
    dragCounterRef.current++;
    setBangerDragOver(true);
  }
  function handleDragLeave(): void {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setBangerDragOver(false);
    }
  }
  function handleDragOver(e: React.DragEvent): void {
    e.preventDefault();
  }
  async function handleDrop(e: React.DragEvent): Promise<void> {
    e.preventDefault();
    dragCounterRef.current = 0;
    setBangerDragOver(false);
    if (!autoSeedEnabled) return;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const stripped = file.name.replace(/\.[^.]+$/, "");
    const match = allTracks?.find((t) => t.displayName.toLowerCase() === stripped.toLowerCase());
    if (!match) {
      updateWork({ result: { status: "error", message: `No library match for dropped file "${stripped}".` } });
      return;
    }
    setSeedTo(match.id);
    updateWork({ seedFromSearch: false }); // matches his setSearchSeedTrack(null) at source 5086
    await recommendForSeed(match.id, "external", "freshSeed");
  }

  // Source: simulateDeckDrop (3708-3722) / handleDeckSelect (3724-3731).
  function simulateDeckDrop(deckNum: 1 | 2): void {
    if (!allTracks || allTracks.length === 0) return;
    const idx = Math.floor(Math.random() * Math.min(allTracks.length, 200));
    const randomTrack = allTracks[idx];
    if (!randomTrack) return;
    updateWork(deckNum === 1 ? { deck1: randomTrack, activeDeck: deckNum } : { deck2: randomTrack, activeDeck: deckNum });
    if (deckWatchOn) {
      setSeedTo(randomTrack.id);
      updateWork({ seedFromSearch: false }); // matches his setSearchSeedTrack(null) at source 3719
      void recommendForSeed(randomTrack.id, "external", "freshSeed");
    }
  }
  function handleDeckSelect(deckNum: 1 | 2): void {
    updateWork({ activeDeck: deckNum });
    const track = deckNum === 1 ? deck1 : deck2;
    if (!track || !deckWatchOn) return;
    setSeedTo(track.id);
    updateWork({ seedFromSearch: false }); // matches his setSearchSeedTrack(null) at source 3729
    void recommendForSeed(track.id, "external", "freshSeed");
  }

  if (allTracks === null) {
    return <p style={{ color: GRAY }}>Loading library...</p>;
  }
  if (allTracks.length === 0) {
    return <EmptyLib theme={theme} onGoToLibrary={onGoToLibrary} />;
  }

  return (
    <div onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      <GlobalAccentStyle accent={theme.accent} />

      {/* Source: the "🎤 Gig Mode" button (reference line 5725) lives
          inside Track Cheat's own body, not Settings - confirmed
          directly. Gated on sharedSession the way the source gates its
          button on the library being loaded (!library.length) - the
          equivalent "nothing to gig with yet" condition in this port. */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: gigMode ? "0.5rem" : "0.75rem" }}>
        {gigMode ? (
          <button
            onClick={() => setGigMode(false)}
            style={{ fontSize: 11, padding: "5px 20px", background: theme.accentAlpha(0.12), border: "1px solid #e03c3c", borderRadius: 8, color: "#e03c3c", cursor: "pointer", fontWeight: 700, letterSpacing: "0.04em" }}
          >
            ✕ Exit Gig Mode
          </button>
        ) : (
          sharedSession && (
            <button
              onClick={() => setGigMode(true)}
              style={{ fontSize: 12, padding: "7px 22px", background: "transparent", border: "1px solid " + theme.ia(0.6), borderRadius: 8, color: theme.ruleColor, cursor: "pointer", fontWeight: 700, letterSpacing: "0.04em" }}
            >
              🎤 Gig Mode
            </button>
          )
        )}
      </div>

      {!gigMode && (
        <p style={{ fontSize: 11, color: "#a15c00", marginBottom: "0.5rem" }}>
          <b>TESTING CONTROL</b> - effort (default stays high; this does not change ranking, prompts, or pool
          selection):{" "}
          <select value={effort} onChange={(e) => updateWork({ effort: e.target.value as "high" | "low" })}>
            <option value="high">high (default)</option>
            <option value="low">low</option>
          </select>
          {" "}&middot; session {sharedSession ? sharedSession.sessionId.slice(0, 8) : "creating..."}
          {sharedSession && ` · chain ${sharedSession.chainId ?? "none"} · depth ${sharedSession.chainDepth}`}
        </p>
      )}

      {/* Deck Watcher shell (source 5728-5768) - real toggle/state,
          honest caption. Only the live Serato feed is unbuilt. */}
      <div style={{ marginBottom: gigMode ? "0.4rem" : "1rem", borderRadius: 12, border: "1px solid " + theme.ia(0.3), background: theme.lightMode ? theme.surfaceBg : "rgba(0,0,0,0.3)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px solid " + theme.ia(0.2) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: deckWatchOn ? theme.accent : "#444", boxShadow: deckWatchOn ? "0 0 6px " + theme.accent : "none", transition: "all 0.3s" }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: deckWatchOn ? theme.accent : GRAY, letterSpacing: "0.06em" }}>Deck Watcher {deckWatchOn ? "— Live" : "— Off"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 9, color: GRAY, fontStyle: "italic" }}>Live feed requires desktop app</span>
            <div onClick={() => updateWork({ deckWatchOn: !deckWatchOn })} style={{ width: 36, height: 20, borderRadius: 10, background: deckWatchOn ? theme.accent : "#333", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 3, left: deckWatchOn ? 19 : 3, width: 14, height: 14, borderRadius: "50%", background: WHITE, transition: "left 0.2s" }} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex" }}>
          {([1, 2] as const).map((deckNum) => {
            const isActive = activeDeck === deckNum;
            const deckTrack = deckNum === 1 ? deck1 : deck2;
            return (
              <div
                key={deckNum}
                onClick={() => deckTrack && handleDeckSelect(deckNum)}
                style={{ flex: 1, padding: "10px 14px", borderRight: deckNum === 1 ? "1px solid " + theme.ia(0.2) : "none", background: isActive && deckTrack ? theme.ia(0.08) : "transparent", cursor: deckTrack ? "pointer" : "default", transition: "background 0.15s", borderBottom: isActive && deckTrack ? "2px solid " + theme.accent : "2px solid transparent" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: isActive && deckTrack ? theme.accent : GRAY }}>Deck {deckNum}</span>
                  {deckTrack && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: isActive ? theme.accent : "#444" }} />
                      <span style={{ fontSize: 9, color: isActive ? theme.accent : GRAY, letterSpacing: "0.04em" }}>{isActive ? "Playing" : "Cue"}</span>
                    </div>
                  )}
                </div>
                {deckTrack ? (
                  <div>
                    {deckTrack.artist && <p style={{ margin: "0 0 1px", fontSize: 10, color: GRAY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{deckTrack.artist}</p>}
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: WHITE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{deckTrack.title}</p>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 11, color: "#444", fontStyle: "italic" }}>No track loaded</p>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    simulateDeckDrop(deckNum);
                  }}
                  style={{ marginTop: 6, fontSize: 9, padding: "3px 8px", borderRadius: 5, border: "1px solid " + theme.ia(0.3), background: "transparent", color: GRAY, cursor: "pointer", letterSpacing: "0.04em" }}
                >
                  Simulate Drop
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <DualSliders
        energyOffset={energy}
        setEnergyOffset={(next) => updateWork({ energy: next })}
        vibeOffset={vibe}
        setVibeOffset={(next) => updateWork({ vibe: next })}
        accent={theme.accent}
        ia={theme.ia}
        sliderLabelColor={theme.sliderLabelColor}
      />

      {/* Vibe Prompt (source line 5772) - real param, threaded through
          to the already-built, already-tested server-side type-lock. */}
      <input
        value={trackVibePrompt}
        onChange={(e) => updateWork({ trackVibePrompt: e.target.value })}
        placeholder="Vibe Prompt — e.g. give me more remixes, hype intros only... (optional)"
        style={{ ...inputStyle(theme), marginBottom: 12 }}
      />

      <PlayCountToggle mode={playCountMode} setMode={(next) => updateWork({ playCountMode: next })} accent={theme.accent} ia={theme.ia} />

      <SectionRule theme={theme}>Drop A Track</SectionRule>

      <div style={{ ...dropZoneStyle(theme, bangerDragOver), padding: hasResults ? "1rem 2rem" : "3rem 2rem", marginBottom: "0.75rem" }}>
        <svg width={hasResults ? 32 : 48} height={hasResults ? 32 : 48} viewBox="0 0 24 24" fill="none" style={{ display: "block", margin: "0 auto " + (hasResults ? "6px" : "12px") }}>
          <path d="M9 18V5l12-2v13" stroke={theme.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="6" cy="18" r="3" stroke={theme.accent} strokeWidth="1.5" />
          <circle cx="18" cy="16" r="3" stroke={theme.accent} strokeWidth="1.5" />
        </svg>
        <p style={{ fontSize: hasResults ? 13 : 18, fontWeight: 700, color: bangerDragOver ? theme.accent : WHITE, margin: 0 }}>
          {bangerDragOver ? "Drop It!" : hasResults ? "Drop New Track To Daisy Chain" : "Drop Track"}
        </p>
        {!hasResults && <p style={{ fontSize: 13, color: GRAY, margin: "6px 0 0" }}>Drag a file here or drag a result below to daisy chain</p>}
      </div>

      {/* Search + GO (source 5784-5791) - still two steps here (pick a
          match, then press the button), not his one-click GO; see
          header comment / CLAUDE2.md. */}
      <div style={{ position: "relative", marginBottom: "1rem", display: "flex", gap: 8 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: theme.accentAlpha(0.5), pointerEvents: "none" }}>🔍</span>
          <input
            value={seedSearch}
            onChange={(e) => updateWork({ seedSearch: e.target.value, seedTrackId: null })}
            placeholder="Search for an artist or title to get Cheat Code recommendations"
            style={searchInputStyle(theme)}
          />
          {seedSearch && (
            <button
              // Source (lines 5682/5788): setSearchQuery(""); setSearchSeedTrack(null);
              // setSearchBangerResults([]) - clears the text, the seed, AND whatever
              // results are showing. Ours only cleared the first two; piece 19 adds
              // the third.
              onClick={() =>
                updateWork({
                  seedSearch: "",
                  seedTrackId: null,
                  seedFromSearch: false, // matches his setSearchSeedTrack(null) at source 5682/5788
                  result: { status: "idle" }
                })
              }
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: GRAY, fontSize: 18, cursor: "pointer" }}
            >
              ×
            </button>
          )}
        </div>
        <button
          onClick={handleGetRecommendations}
          disabled={(seedTrackId === null && seedSearch.trim() === "") || isBusy}
          style={goBtnStyle(theme, (seedTrackId === null && seedSearch.trim() === "") || isBusy)}
        >
          Go
        </button>
      </div>
      {seedTrack && <p style={{ margin: "-0.75rem 0 0.75rem", fontSize: 12, color: theme.accent }}>✓ {seedTrack.displayName}</p>}
      {!seedTrack && seedSearch.trim() !== "" && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 0.75rem", fontSize: 13, maxHeight: 150, overflow: "auto", border: "1px solid " + theme.accentAlpha(0.2), borderRadius: 8, background: theme.surfaceBg }}>
          {seedMatches.map((t) => (
            <li key={t.id} style={{ cursor: "pointer", padding: "6px 10px", color: WHITE }} onClick={() => setSeedTo(t.id)}>
              {t.displayName}
            </li>
          ))}
          {seedMatches.length === 0 && <li style={{ padding: "6px 10px", color: GRAY }}>No matches.</li>}
        </ul>
      )}

      {/* Auto-Seed (source 5795-5799) - real gate on the drop handler above. */}
      <div
        onClick={() => updateWork({ autoSeedEnabled: !autoSeedEnabled })}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, border: "1px solid " + (autoSeedEnabled ? theme.accentAlpha(0.25) : "#e03c3c"), background: autoSeedEnabled ? "transparent" : "rgba(224,60,60,0.08)", cursor: "pointer", marginBottom: "0.5rem" }}
      >
        <div style={{ width: 30, height: 17, borderRadius: 9, background: autoSeedEnabled ? theme.accent : "#333", position: "relative", flexShrink: 0, transition: "background 0.15s" }}>
          <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#000", position: "absolute", top: 2, left: autoSeedEnabled ? 15 : 2, transition: "left 0.15s" }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: autoSeedEnabled ? GRAY : "#e03c3c" }}>Auto-Seed {autoSeedEnabled ? "On" : "Off"}</span>
        <span style={{ fontSize: 10, color: GRAY }}>— {autoSeedEnabled ? "dropping a track replaces your current results" : "drops won't touch your current results"}</span>
      </div>

      {seedTrack && (
        <div style={{ ...cardStyle(theme), display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={lblStyle}>
              Seed Track{" "}
              {sharedSession && sharedSession.chainDepth > 0 && (
                <span style={{ color: theme.accent, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>
                  · 🔗 chained ({sharedSession.chainDepth} link{sharedSession.chainDepth === 1 ? "" : "s"} · locked to same era/feel)
                </span>
              )}
            </label>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: theme.accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {seedTrack.displayName}
            </p>
          </div>
          <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center", marginLeft: 8 }}>
            {seedTrack.bpm ? (
              <span style={{ fontSize: 11, color: WHITE, background: "rgba(0,0,0,0.5)", padding: "3px 4px", borderRadius: 6, border: bpmBorder(theme), fontWeight: 600, width: 34, textAlign: "center", boxSizing: "border-box", display: "inline-block" }}>
                {Math.round(seedTrack.bpm)}
              </span>
            ) : null}
            <KeyPill keyVal={seedTrack.key} />
            {!isBusy && (
              <button
                // Piece 23 (2026-11-14, R11) - his own if(searchSeedTrack)
                // bypass (source 5697/5806): a seed from the search box
                // skips the whole retry-counter/chain-break mechanism.
                onClick={() =>
                  recommendForSeed(
                    seedTrack.id,
                    "external",
                    "manualRetry",
                    seedFromSearch ? "seedDropped" : "tryAgain"
                  )
                }
                style={{ fontSize: 12, padding: "4px 10px", background: "transparent", border: "2px solid " + theme.accentAlpha(0.3), borderRadius: 6, color: theme.accent, cursor: "pointer", letterSpacing: "0.04em", fontWeight: 700 }}
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      )}

      {result.status === "error" && <p style={{ color: "#e03c3c", fontSize: 13 }}>Error: {result.message}</p>}
      {result.status === "notFoundInLibrary" && (
        <p style={{ color: "#e03c3c", fontSize: 13 }}>No match in your library for "{result.query}".</p>
      )}
      {isBusy && <p style={{ textAlign: "center", padding: "2rem 1rem" }}><span style={glowSweepStyle(theme)}>Finding What Plays Next</span></p>}
      {(result.status === "done" || result.status === "likedAsSeed") && (
        <div style={{ marginTop: "0.5rem" }}>
          {!gigMode && result.status === "done" && (
            <p style={{ fontSize: 12, color: GRAY }}>
              {result.data.returned ?? 0} of {result.data.requested ?? 0} requested &middot; candidate pool{" "}
              {result.data.candidatePoolSize ?? 0} &middot; {result.data.simulated === false ? "REAL AI" : "simulated AI"}
              {result.data.retried && <span style={{ color: "#a15c00" }}> &middot; retried automatically</span>}
            </p>
          )}
          {sortedResults.length === 0 && (
            <p style={{ color: GRAY, fontSize: 13 }}>
              {result.status === "likedAsSeed" ? "No Other Versions Found In Your Library." : "No matches."}
            </p>
          )}
          {sortedResults.length > 0 && (
            <div style={{ border: "1px solid " + theme.accentAlpha(0.15), borderRadius: 10, overflow: "hidden" }}>
              <ResHeader sortField={sort.field} sortDir={sort.dir} onSort={onSort} theme={theme} />
              {sortedResults.map((r, i) => (
                <ResultRow
                  key={r.trackId}
                  t={r}
                  vote={votes[r.trackId] ?? null}
                  theme={theme}
                  rowBg={i % 2 === 0 ? theme.rowEven : theme.rowOdd}
                  disabled={isBusy}
                  onVote={handleVote}
                  onDaisyChain={handleDaisyChain}
                  onLikeAsSeed={handleLikeAsSeed}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
