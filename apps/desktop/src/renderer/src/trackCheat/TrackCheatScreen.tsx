// Phase 5, step 5 piece 3 (core) + piece 4 (daisy-chain/votes).
//
// All the actual recommendation logic (candidate selection, prompts,
// ranking, the R28 fallback chain) already lives in the backend server,
// built and tested in Phase 3/4. This screen does exactly one thing: let
// a DJ pick a seed, move the vibe/energy sliders, and send that to the
// already-built, already-tested recommend endpoint - nothing here
// re-implements or changes any of that logic.
//
// Piece 4 adds the session the route already knows how to use: a
// session is created once, and every seed change or vote is sent as one
// event (CLAUDE.md 6.4) before the next recommend call. Chain depth,
// bridge/drift detection, and thumbs-down exclusions are all DERIVED
// server-side from that event history (Phase 4, sessionEvents.js) - this
// screen only sends the right event at the right moment and shows what
// the server decided.

import { useEffect, useMemo, useRef, useState } from "react";
import { filterTracks } from "../library/filterTracks";
import { recommendTrackCheat, sendSessionEvent } from "../api/backendClient";
import { getVibeLabel } from "./vibeLabels";
import type { SharedSession } from "../App";

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
}

export default function TrackCheatScreen({ sharedSession }: TrackCheatScreenProps): React.JSX.Element {
  const [allTracks, setAllTracks] = useState<CcdjLibraryRow[] | null>(null);
  const [seedSearch, setSeedSearch] = useState("");
  const [seedTrackId, setSeedTrackId] = useState<string | null>(null);
  const [vibe, setVibe] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [playCountMode, setPlayCountMode] = useState("mix");
  const [result, setResult] = useState<ResultState>({ status: "idle" });
  const [votes, setVotes] = useState<Record<string, "up" | "down">>({});
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
  // Computed once, outside the `result.status === "done"` narrowing below -
  // inside that branch TS already knows result.status is "done", so
  // re-comparing it to "loading" there is a type error, not just redundant.
  const isBusy = result.status === "loading";

  function setSeedTo(trackId: string): void {
    setSeedTrackId(trackId);
    const match = allTracks?.find((t) => t.id === trackId);
    setSeedSearch(match ? match.displayName : "");
  }

  // The one thing both a fresh manual pick (origin "external") and a
  // daisy chain (origin "ccdjResult") have in common: tell the server
  // what just happened, THEN ask for recommendations using the server's
  // updated session state (CLAUDE.md 4.1 - these are genuinely different
  // events, not the same action with a different label).
  async function recommendForSeed(trackId: string, origin: "external" | "ccdjResult"): Promise<void> {
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

  async function handleDaisyChain(trackId: string): Promise<void> {
    setSeedTo(trackId);
    await recommendForSeed(trackId, "ccdjResult");
  }

  // Thumbs down reaches the server's REAL exclusion bookkeeping (R12):
  // this track will not reappear in any future recommendation this
  // session, on any path - not just hidden in this screen. Clicking the
  // same vote again clears it (sends value: null, same as the source's
  // own un-vote behavior).
  async function handleVote(trackId: string, value: "up" | "down"): Promise<void> {
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

  return (
    <section style={{ border: "2px solid #888", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Step 5, piece 3+4: Track Cheat</h2>
      <p style={{ fontSize: 13, color: "#666" }}>
        All the recommendation logic (candidate selection, ranking, fallback chain, chain/bridge/drift derivation,
        thumbs-down exclusion) already lives in the real backend (Phase 3/4) - this screen sends your seed, sliders,
        daisy-chain picks and votes, and shows what comes back.
      </p>
      <p style={{ fontSize: 12, color: "#888" }}>
        Session: {sessionDisplay ? sessionDisplay.sessionId : "creating..."}
        {sessionDisplay && (
          <>
            {" "}
            &middot; chain {sessionDisplay.chainId ?? "none"} &middot; depth {sessionDisplay.chainDepth}
          </>
        )}
      </p>

      <label style={{ fontSize: 12, color: "#a15c00", display: "block", marginBottom: "0.5rem" }}>
        <b>TESTING CONTROL</b> - effort (default stays high; this does not change ranking, prompts, or pool
        selection):{" "}
        <select value={effort} onChange={(e) => setEffort(e.target.value as "high" | "low")}>
          <option value="high">high (default)</option>
          <option value="low">low</option>
        </select>
      </label>

      <div>
        <label>
          Seed song:{" "}
          <input
            value={seedSearch}
            onChange={(e) => {
              setSeedSearch(e.target.value);
              setSeedTrackId(null);
            }}
            placeholder="Search your library..."
            style={{ width: "50%" }}
          />
        </label>
        {seedTrack && <span style={{ marginLeft: "0.5rem", color: "#2e7d32" }}>✓ {seedTrack.displayName}</span>}
      </div>
      {!seedTrack && seedSearch.trim() !== "" && (
        <ul
          style={{
            paddingLeft: "1.2rem",
            fontSize: 13,
            maxHeight: 150,
            overflow: "auto",
            border: "1px solid #ccc",
            marginTop: "0.3rem"
          }}
        >
          {seedMatches.map((t) => (
            <li
              key={t.id}
              style={{ cursor: "pointer", listStyle: "none" }}
              onClick={() => setSeedTo(t.id)}
            >
              {t.displayName}
            </li>
          ))}
          {seedMatches.length === 0 && <li style={{ listStyle: "none", color: "#666" }}>No matches.</li>}
        </ul>
      )}

      <div style={{ marginTop: "0.75rem" }}>
        <label>
          Vibe: {vibe} {vibeLabel && <b>- {vibeLabel[0]}</b>}
          <input
            type="range"
            min={-8}
            max={8}
            value={vibe}
            onChange={(e) => setVibe(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        {vibeLabel && <p style={{ fontSize: 12, color: "#666", margin: "0.2rem 0" }}>{vibeLabel[1]}</p>}
      </div>

      <div style={{ marginTop: "0.5rem" }}>
        <label>
          Energy: {energy}
          <input
            type="range"
            min={-16}
            max={16}
            value={energy}
            onChange={(e) => setEnergy(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
      </div>

      <div style={{ marginTop: "0.5rem" }}>
        <label>
          Play-count mode:{" "}
          <select value={playCountMode} onChange={(e) => setPlayCountMode(e.target.value)}>
            <option value="familiar">familiar</option>
            <option value="mix">mix</option>
            <option value="deep">deep</option>
          </select>
        </label>
      </div>

      <button
        onClick={handleGetRecommendations}
        disabled={seedTrackId === null || isBusy}
        style={{ marginTop: "0.75rem" }}
      >
        {isBusy ? "Getting recommendations... (can take 10-90s)" : "Get Recommendations"}
      </button>

      {result.status === "error" && <p style={{ color: "#c62828" }}>Error: {result.message}</p>}
      {result.status === "done" && (
        <div style={{ marginTop: "0.5rem" }}>
          <p style={{ fontSize: 13, color: "#666" }}>
            {result.data.returned ?? 0} of {result.data.requested ?? 0} requested &middot; candidate pool{" "}
            {result.data.candidatePoolSize ?? 0} &middot; fallback depth {result.data.fallbackDepth ?? 0} &middot;{" "}
            {result.data.simulated === false ? "REAL AI" : "simulated AI"} &middot; trigger {result.data.trigger ?? "n/a"}{" "}
            &middot; mode {result.data.mode ?? "none"} &middot; chain depth {result.data.chain?.depth ?? 0} &middot; effort{" "}
            {result.data.effortUsed ?? "n/a"}
            {result.data.retried && (
              <span style={{ color: "#a15c00" }}>
                {" "}
                &middot; retried automatically (reason: {result.data.retryReason}) - used reduced thinking
              </span>
            )}
          </p>
          {(result.data.results ?? []).length === 0 && <p>No matches.</p>}
          <ol style={{ paddingLeft: "1.2rem", fontSize: 13 }}>
            {(result.data.results ?? []).map((r) => (
              <li key={r.trackId} style={{ marginBottom: "0.3rem" }}>
                {r.name} - {r.bpm ?? "-"} bpm / {r.key}
                {r.lane && <span style={{ marginLeft: 6, fontSize: 11, color: "#888" }}>[{r.lane}]</span>}
                {r.camp && <span style={{ marginLeft: 6, fontSize: 11, color: "#888" }}>camp:{r.camp}</span>}
                <button
                  onClick={() => handleVote(r.trackId, "up")}
                  disabled={isBusy}
                  style={{
                    marginLeft: 8,
                    background: votes[r.trackId] === "up" ? "#c8e6c9" : undefined
                  }}
                >
                  👍
                </button>
                <button
                  onClick={() => handleVote(r.trackId, "down")}
                  disabled={isBusy}
                  style={{
                    marginLeft: 4,
                    background: votes[r.trackId] === "down" ? "#ffcdd2" : undefined
                  }}
                >
                  👎
                </button>
                <button onClick={() => handleDaisyChain(r.trackId)} disabled={isBusy} style={{ marginLeft: 4 }}>
                  Daisy-chain &rarr; use as new seed
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
