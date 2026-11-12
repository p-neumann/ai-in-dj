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
// Stage 2a-bis real scope limits, flagged rather than silently built
// around:
// - Search+GO stays two steps (pick a match, then press the button) -
//   his GO button resolves text AND fetches in one click
//   (handleSearchSeed, source line 2547). Collapsing that would be a
//   behavior change, not styling (CLAUDE2.md).
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

import { useEffect, useMemo, useRef, useState } from "react";
import { filterTracks } from "../library/filterTracks";
import { recommendTrackCheat, sendSessionEvent } from "../api/backendClient";
import { getVibeLabel } from "./vibeLabels";
import type { SharedSession } from "../App";
import type { DerivedTheme } from "../theme/deriveTheme";
import GlobalAccentStyle from "../shared/GlobalAccentStyle";
import SectionRule from "../shared/SectionRule";
import DualSliders from "../shared/DualSliders";
import PlayCountToggle from "../shared/PlayCountToggle";
import { ResultRow, ResHeader } from "../shared/ResultRow";
import { applySort, handleSort, DEFAULT_SORT_STATE, type SortField, type SortState } from "../shared/sortResults";
import { cardStyle, lblStyle, inputStyle, searchInputStyle, goBtnStyle, dropZoneStyle, WHITE, GRAY, bpmBorder, glowSweepStyle } from "../shared/controlStyles";
import KeyPill from "../shared/KeyPill";
import EmptyLib from "../shared/EmptyLib";

type ResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: CcdjTrackCheatResult }
  | { status: "error"; message: string };

interface SessionState {
  sessionId: string;
  clientSeq: number;
  stateVersion: number;
  chainId: string | null;
  chainDepth: number;
}

interface TrackCheatScreenProps {
  sharedSession: SharedSession | null;
  gigMode: boolean;
  setGigMode: (next: boolean) => void;
  theme: DerivedTheme;
  // Source: {!library.length?<EmptyLib/>:(...)} (line 5722) replaces
  // the WHOLE tab body, including the Gig Mode button itself, whenever
  // the library is empty - ported the same way here.
  onGoToLibrary: () => void;
}

export default function TrackCheatScreen({ sharedSession, gigMode, setGigMode, theme, onGoToLibrary }: TrackCheatScreenProps): React.JSX.Element {
  const [allTracks, setAllTracks] = useState<CcdjLibraryRow[] | null>(null);
  const [seedSearch, setSeedSearch] = useState("");
  const [seedTrackId, setSeedTrackId] = useState<number | null>(null);
  const [vibe, setVibe] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [playCountMode, setPlayCountMode] = useState("mix");
  const [trackVibePrompt, setTrackVibePrompt] = useState("");
  const [autoSeedEnabled, setAutoSeedEnabled] = useState(true);
  const [bangerDragOver, setBangerDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // Deck Watcher (shell - real local state/logic, honest "Live feed
  // requires desktop app" caption; CLAUDE2.md marks this Phase 5/done,
  // only the real Serato feed is Phase 8).
  const [deckWatchOn, setDeckWatchOn] = useState(false);
  const [deck1, setDeck1] = useState<CcdjLibraryRow | null>(null);
  const [deck2, setDeck2] = useState<CcdjLibraryRow | null>(null);
  const [activeDeck, setActiveDeck] = useState<1 | 2>(1);

  const [result, setResult] = useState<ResultState>({ status: "idle" });
  const [votes, setVotes] = useState<Record<number, "up" | "down">>({});
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT_STATE);
  // docs/decisions/0017: a TESTING CONTROL, not a real setting - default
  // stays "high" (Anthropic's own default), nothing about ranking/
  // prompts/pool selection changes. Lets Ranjish compare high vs. low
  // effort himself, in one session, before taking the question to Mike.
  const [effort, setEffort] = useState<"high" | "low">("high");

  // Source of truth for the session is a ref, not state: a single click
  // can fire two sequential network calls (a seedDropped event, then
  // recommend), and each must see the OTHER's result before it runs, not
  // a stale value captured when the handler started. sessionDisplay is
  // only for rendering.
  const sessionRef = useRef<SessionState | null>(null);
  const [sessionDisplay, setSessionDisplay] = useState<SessionState | null>(null);

  function updateSession(patch: Partial<SessionState>): SessionState {
    const next = { ...(sessionRef.current as SessionState), ...patch };
    sessionRef.current = next;
    setSessionDisplay(next);
    return next;
  }

  useEffect(() => {
    window.ccdj.library.getAllTracks().then(setAllTracks);
  }, []);

  // docs/decisions/0015: this screen no longer creates its own session -
  // it's seeded from the one shared session App.tsx creates once for the
  // whole app, so a thumbs-down here is visible to Crate Cheat too. Only
  // seeds on the FIRST time the shared session arrives (sessionRef still
  // null) - this screen's own clientSeq/chainDepth evolve independently
  // after that as the DJ uses Track Cheat, and must not be reset every
  // time App.tsx happens to re-render.
  useEffect(() => {
    if (sharedSession && !sessionRef.current) {
      const initial: SessionState = {
        sessionId: sharedSession.sessionId,
        clientSeq: 0,
        stateVersion: sharedSession.stateVersion,
        chainId: sharedSession.chainId,
        chainDepth: 0
      };
      sessionRef.current = initial;
      setSessionDisplay(initial);
    }
  }, [sharedSession]);

  const seedMatches = useMemo(
    () => (allTracks ? filterTracks(allTracks, seedSearch).slice(0, 20) : []),
    [allTracks, seedSearch]
  );
  const seedTrack = useMemo(() => allTracks?.find((t) => t.id === seedTrackId) ?? null, [allTracks, seedTrackId]);
  const vibeLabel = getVibeLabel(vibe);
  const isBusy = result.status === "loading";
  const activeResults = result.status === "done" ? result.data.results ?? [] : [];
  const sortedResults = useMemo(() => applySort(activeResults, sort), [activeResults, sort]);
  const hasResults = activeResults.length > 0;

  function setSeedTo(trackId: number): void {
    setSeedTrackId(trackId);
    const match = allTracks?.find((t) => t.id === trackId);
    setSeedSearch(match ? match.displayName : "");
  }

  // The one thing both a fresh manual pick (origin "external") and a
  // daisy chain (origin "ccdjResult") have in common: tell the server
  // what just happened, THEN ask for recommendations using the server's
  // updated session state (CLAUDE.md 4.1 - these are genuinely different
  // events, not the same action with a different label).
  async function recommendForSeed(trackId: number, origin: "external" | "ccdjResult"): Promise<void> {
    // docs/decisions/0015: no longer creates a fallback session of its
    // own here - doing that was exactly the bug being fixed (a second,
    // divergent session Crate Cheat would never see). If the app's one
    // shared session hasn't arrived yet, wait for it instead.
    let session = sessionRef.current;
    if (!session) {
      setResult({ status: "error", message: "Still connecting to the backend session - try again in a moment." });
      return;
    }
    setResult({ status: "loading" });
    try {
      const seedSeq = session.clientSeq + 1;
      const eventRes = await sendSessionEvent(session.sessionId, {
        type: "seedDropped",
        trackId,
        origin,
        clientSeq: seedSeq
      });
      if (!eventRes.ok) {
        setResult({ status: "error", message: eventRes.error ?? "Could not record the seed change" });
        return;
      }
      session = updateSession({ clientSeq: seedSeq, stateVersion: eventRes.stateVersion ?? session.stateVersion });

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
        setResult({ status: "error", message: data.error ?? "Unknown error" });
        return;
      }
      updateSession({
        clientSeq: recommendSeq,
        stateVersion: data.stateVersion ?? session.stateVersion,
        chainId: data.chain?.chainId ?? session.chainId,
        chainDepth: data.chain?.depth ?? session.chainDepth
      });
      setResult({ status: "done", data });
      setSort(DEFAULT_SORT_STATE);

      // Step 5, piece 7 (Settings): the first real history logging in
      // the app - deliberately simplified (docs/QUESTIONS.md, "History
      // panel: Phase 5 remaining work"). No per-result outcome, no
      // chain/bridge/drift detail, no notes yet - just enough for the
      // History panel to show and export something real.
      const seedName = allTracks?.find((t) => t.id === trackId)?.displayName ?? `track ${trackId}`;
      window.ccdj.history.append({
        seedName,
        trigger: origin === "ccdjResult" ? "daisyChain" : "freshSeed",
        resultCount: data.results?.length ?? 0,
        at: new Date().toISOString()
      });
    } catch (error) {
      setResult({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function handleGetRecommendations(): Promise<void> {
    if (seedTrackId === null) return;
    await recommendForSeed(seedTrackId, "external");
  }

  async function handleDaisyChain(trackId: number): Promise<void> {
    setSeedTo(trackId);
    await recommendForSeed(trackId, "ccdjResult");
  }

  // Thumbs down reaches the server's REAL exclusion bookkeeping (R12):
  // this track will not reappear in any future recommendation this
  // session, on any path - not just hidden in this screen. Clicking the
  // same vote again clears it (sends value: null, same as the source's
  // own un-vote behavior).
  async function handleVote(trackId: number, value: "up" | "down"): Promise<void> {
    const session = sessionRef.current;
    if (!session) return;
    const nextValue = votes[trackId] === value ? null : value;
    const seq = session.clientSeq + 1;
    const res = await sendSessionEvent(session.sessionId, { type: "vote", trackId, value: nextValue, clientSeq: seq });
    if (!res.ok) return;
    updateSession({ clientSeq: seq, stateVersion: res.stateVersion ?? session.stateVersion });
    setVotes((prev) => {
      const next = { ...prev };
      if (nextValue) next[trackId] = nextValue;
      else delete next[trackId];
      return next;
    });
  }

  function onSort(field: SortField): void {
    setSort((prev) => handleSort(prev, field));
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
      setResult({ status: "error", message: `No library match for dropped file "${stripped}".` });
      return;
    }
    setSeedTo(match.id);
    await recommendForSeed(match.id, "external");
  }

  // Source: simulateDeckDrop (3708-3722) / handleDeckSelect (3724-3731).
  function simulateDeckDrop(deckNum: 1 | 2): void {
    if (!allTracks || allTracks.length === 0) return;
    const idx = Math.floor(Math.random() * Math.min(allTracks.length, 200));
    const randomTrack = allTracks[idx];
    if (!randomTrack) return;
    if (deckNum === 1) setDeck1(randomTrack);
    else setDeck2(randomTrack);
    setActiveDeck(deckNum);
    if (deckWatchOn) {
      setSeedTo(randomTrack.id);
      void recommendForSeed(randomTrack.id, "external");
    }
  }
  function handleDeckSelect(deckNum: 1 | 2): void {
    setActiveDeck(deckNum);
    const track = deckNum === 1 ? deck1 : deck2;
    if (!track || !deckWatchOn) return;
    setSeedTo(track.id);
    void recommendForSeed(track.id, "external");
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
          <select value={effort} onChange={(e) => setEffort(e.target.value as "high" | "low")}>
            <option value="high">high (default)</option>
            <option value="low">low</option>
          </select>
          {" "}&middot; session {sessionDisplay ? sessionDisplay.sessionId.slice(0, 8) : "creating..."}
          {sessionDisplay && ` · chain ${sessionDisplay.chainId ?? "none"} · depth ${sessionDisplay.chainDepth}`}
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
            <div onClick={() => setDeckWatchOn((v) => !v)} style={{ width: 36, height: 20, borderRadius: 10, background: deckWatchOn ? theme.accent : "#333", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
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
        setEnergyOffset={setEnergy}
        vibeOffset={vibe}
        setVibeOffset={setVibe}
        accent={theme.accent}
        ia={theme.ia}
        sliderLabelColor={theme.sliderLabelColor}
      />

      {/* Vibe Prompt (source line 5772) - real param, threaded through
          to the already-built, already-tested server-side type-lock. */}
      <input
        value={trackVibePrompt}
        onChange={(e) => setTrackVibePrompt(e.target.value)}
        placeholder="Vibe Prompt — e.g. give me more remixes, hype intros only... (optional)"
        style={{ ...inputStyle(theme), marginBottom: 12 }}
      />

      <PlayCountToggle mode={playCountMode} setMode={setPlayCountMode} accent={theme.accent} ia={theme.ia} />

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
            onChange={(e) => {
              setSeedSearch(e.target.value);
              setSeedTrackId(null);
            }}
            placeholder="Search for an artist or title to get Cheat Code recommendations"
            style={searchInputStyle(theme)}
          />
          {seedSearch && (
            <button
              onClick={() => {
                setSeedSearch("");
                setSeedTrackId(null);
              }}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: GRAY, fontSize: 18, cursor: "pointer" }}
            >
              ×
            </button>
          )}
        </div>
        <button onClick={handleGetRecommendations} disabled={seedTrackId === null || isBusy} style={goBtnStyle(theme, seedTrackId === null || isBusy)}>
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
        onClick={() => setAutoSeedEnabled((v) => !v)}
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
              {sessionDisplay && sessionDisplay.chainDepth > 0 && (
                <span style={{ color: theme.accent, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>
                  · 🔗 chained ({sessionDisplay.chainDepth} link{sessionDisplay.chainDepth === 1 ? "" : "s"} · locked to same era/feel)
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
                onClick={() => recommendForSeed(seedTrack.id, "external")}
                style={{ fontSize: 12, padding: "4px 10px", background: "transparent", border: "2px solid " + theme.accentAlpha(0.3), borderRadius: 6, color: theme.accent, cursor: "pointer", letterSpacing: "0.04em", fontWeight: 700 }}
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      )}

      {result.status === "error" && <p style={{ color: "#e03c3c", fontSize: 13 }}>Error: {result.message}</p>}
      {isBusy && <p style={{ textAlign: "center", padding: "2rem 1rem" }}><span style={glowSweepStyle(theme)}>Finding What Plays Next</span></p>}
      {result.status === "done" && (
        <div style={{ marginTop: "0.5rem" }}>
          {!gigMode && (
            <p style={{ fontSize: 12, color: GRAY }}>
              {result.data.returned ?? 0} of {result.data.requested ?? 0} requested &middot; candidate pool{" "}
              {result.data.candidatePoolSize ?? 0} &middot; {result.data.simulated === false ? "REAL AI" : "simulated AI"}
              {result.data.retried && <span style={{ color: "#a15c00" }}> &middot; retried automatically</span>}
            </p>
          )}
          {sortedResults.length === 0 && <p style={{ color: GRAY, fontSize: 13 }}>No matches.</p>}
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
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
