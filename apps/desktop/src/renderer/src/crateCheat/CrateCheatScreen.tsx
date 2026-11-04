// Phase 5, step 5 piece 5 - Crate Cheat core.
//
// Same division of labor as Track Cheat (piece 3): the actual crate-
// building pipeline (curated-track/era knowledge resolution, context
// building, era/type-lock filtering, Do Play/Do Not Play, the AI call,
// post-filtering) already lives in the backend, built and tested in
// Phase 3/4 (engine/crateOrchestration.js). This screen only sends a
// prompt, size, and play-count mode to the already-built
// POST /v1/crates/build route and shows what comes back - nothing here
// re-implements or changes any selection/ranking logic.
//
// docs/decisions/0011: crate build now accepts libraryRevision the same
// way Track Cheat does, so this screen reuses the SAME sync-if-needed /
// resync-on-LIBRARY_OUT_OF_SYNC flow (buildCrateWithAutoSync) instead of
// re-triggering the real HTTP 413 Track Cheat hit against a real library
// sent inline.
//
// docs/decisions/0015: now sends the app's one shared sessionId with
// every build. Before this, Crate Cheat sent no session id at all, so
// Do Not Play/Do Play and thumbs-down exclusions from the same gig never
// reached it - this is the fix for that, not a new feature.

import { useState } from "react";
import { buildCrate } from "../api/backendClient";
import type { SharedSession } from "../App";

// CLAUDE.md's own documented menu (R4) - six sizes, not an arbitrary range.
const CRATE_SIZES = [10, 25, 50, 100, 150, 200] as const;

type ResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: CcdjCrateResult }
  | { status: "error"; message: string };

interface CrateCheatScreenProps {
  sharedSession: SharedSession | null;
}

export default function CrateCheatScreen({ sharedSession }: CrateCheatScreenProps): React.JSX.Element {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<number>(10);
  const [crateVibePrompt, setCrateVibePrompt] = useState("");
  const [playCountMode, setPlayCountMode] = useState("mix");
  const [result, setResult] = useState<ResultState>({ status: "idle" });

  const isBusy = result.status === "loading";

  async function handleBuildCrate(): Promise<void> {
    if (!prompt.trim()) return;
    if (!sharedSession) {
      setResult({ status: "error", message: "Still connecting to the backend session - try again in a moment." });
      return;
    }
    setResult({ status: "loading" });
    try {
      const data = await buildCrate({
        prompt: prompt.trim(),
        size,
        crateVibePrompt: crateVibePrompt.trim() || undefined,
        playCountMode,
        sessionId: sharedSession.sessionId
      });
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
      <h2 style={{ marginTop: 0 }}>Step 5, piece 5: Crate Cheat</h2>
      <p style={{ fontSize: 13, color: "#666" }}>
        All the crate-building logic (curated-track/era resolution, context building, filtering, ranking) already
        lives in the real backend (Phase 3/4) - this screen only sends your prompt, size, and play-count mode, and
        shows what comes back.
      </p>

      <div>
        <label>
          Describe the crate: <br />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. 2000s dance floor heaters"
            style={{ width: "100%", height: 50, marginTop: "0.3rem" }}
          />
        </label>
      </div>

      <div style={{ marginTop: "0.5rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <label>
          Size:{" "}
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {CRATE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label>
          Play-count mode:{" "}
          <select value={playCountMode} onChange={(e) => setPlayCountMode(e.target.value)}>
            <option value="familiar">familiar</option>
            <option value="mix">mix</option>
            <option value="deep">deep</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: "0.5rem" }}>
        <label>
          Optional secondary vibe:{" "}
          <input
            value={crateVibePrompt}
            onChange={(e) => setCrateVibePrompt(e.target.value)}
            placeholder="e.g. prefer redrums"
            style={{ width: "50%" }}
          />
        </label>
      </div>

      <button onClick={handleBuildCrate} disabled={!prompt.trim() || isBusy} style={{ marginTop: "0.75rem" }}>
        {isBusy ? "Building crate... (can take 10-90s)" : "Build Crate"}
      </button>

      {result.status === "error" && <p style={{ color: "#c62828" }}>Error: {result.message}</p>}
      {result.status === "done" && (
        <div style={{ marginTop: "0.5rem" }}>
          <p style={{ fontSize: 13, color: "#666" }}>
            {result.data.returned ?? 0} of {result.data.requested ?? 0} requested &middot; candidate pool{" "}
            {result.data.candidatePoolSize ?? 0}
            {result.data.shortfallReason && (
              <>
                {" "}
                &middot; <span style={{ color: "#c62828" }}>shortfall: {result.data.shortfallReason}</span>
              </>
            )}
            {result.data.knowledgeCallMade && <> &middot; knowledge call: {result.data.knowledgeCallMade}</>}
            {" "}&middot; {result.data.simulated === false ? "REAL AI" : "simulated AI"}
          </p>
          {(result.data.results ?? []).length === 0 && <p>No matches.</p>}
          <ol style={{ paddingLeft: "1.2rem", fontSize: 13 }}>
            {(result.data.results ?? []).map((r) => (
              <li key={r.trackId}>
                {r.name} - {r.bpm} bpm / {r.key}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
