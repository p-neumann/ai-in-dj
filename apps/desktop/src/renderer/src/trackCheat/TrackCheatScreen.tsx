// Phase 5, step 5 piece 3 - Track Cheat core.
//
// All the actual recommendation logic (candidate selection, prompts,
// ranking, the R28 fallback chain) already lives in the backend server,
// built and tested in Phase 3/4. This screen does exactly one thing: let
// a DJ pick a seed, move the vibe/energy sliders, and send that to the
// already-built, already-tested recommend endpoint - nothing here
// re-implements or changes any of that logic.
//
// No session yet on purpose (CLAUDE.md: the real route runs fully
// stateless without one) - chain/bridge/drift/daisy-chain memory is
// piece 4, kept deliberately separate.

import { useEffect, useMemo, useState } from "react";
import { filterTracks } from "../library/filterTracks";
import { recommendTrackCheat } from "../api/backendClient";
import { getVibeLabel } from "./vibeLabels";

type ResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: CcdjTrackCheatResult }
  | { status: "error"; message: string };

export default function TrackCheatScreen(): React.JSX.Element {
  const [allTracks, setAllTracks] = useState<CcdjLibraryRow[] | null>(null);
  const [seedSearch, setSeedSearch] = useState("");
  const [seedTrackId, setSeedTrackId] = useState<number | null>(null);
  const [vibe, setVibe] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [playCountMode, setPlayCountMode] = useState("mix");
  const [result, setResult] = useState<ResultState>({ status: "idle" });

  useEffect(() => {
    window.ccdj.library.getAllTracks().then(setAllTracks);
  }, []);

  const seedMatches = useMemo(
    () => (allTracks ? filterTracks(allTracks, seedSearch).slice(0, 20) : []),
    [allTracks, seedSearch]
  );
  const seedTrack = useMemo(() => allTracks?.find((t) => t.id === seedTrackId) ?? null, [allTracks, seedTrackId]);
  const vibeLabel = getVibeLabel(vibe);

  async function handleGetRecommendations(): Promise<void> {
    if (seedTrackId === null) return;
    setResult({ status: "loading" });
    try {
      const data = await recommendTrackCheat({ seedTrackId, vibe, energy, playCountMode });
      if (!data.ok) {
        setResult({ status: "error", message: data.error ?? "Unknown error" });
        return;
      }
      setResult({ status: "done", data });
    } catch (error) {
      setResult({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <section style={{ border: "2px solid #888", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Step 5, piece 3: Track Cheat</h2>
      <p style={{ fontSize: 13, color: "#666" }}>
        All the recommendation logic (candidate selection, ranking, fallback chain) already lives in the real
        backend (Phase 3/4) - this screen only sends your seed and sliders, and shows what comes back.
      </p>

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
              onClick={() => {
                setSeedTrackId(t.id);
                setSeedSearch(t.displayName);
              }}
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
        disabled={seedTrackId === null || result.status === "loading"}
        style={{ marginTop: "0.75rem" }}
      >
        {result.status === "loading" ? "Getting recommendations... (can take 10-90s)" : "Get Recommendations"}
      </button>

      {result.status === "error" && <p style={{ color: "#c62828" }}>Error: {result.message}</p>}
      {result.status === "done" && (
        <div style={{ marginTop: "0.5rem" }}>
          <p style={{ fontSize: 13, color: "#666" }}>
            {result.data.returned ?? 0} of {result.data.requested ?? 0} requested &middot; candidate pool{" "}
            {result.data.candidatePoolSize ?? 0} &middot; fallback depth {result.data.fallbackDepth ?? 0} &middot;{" "}
            {result.data.simulated === false ? "REAL AI" : "simulated AI"}
          </p>
          {(result.data.results ?? []).length === 0 && <p>No matches.</p>}
          <ol style={{ paddingLeft: "1.2rem", fontSize: 13 }}>
            {(result.data.results ?? []).map((r) => (
              <li key={r.trackId}>
                {r.name} - {r.bpm} bpm / {r.key}
                {r.lane && <span style={{ marginLeft: 6, fontSize: 11, color: "#888" }}>[{r.lane}]</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
