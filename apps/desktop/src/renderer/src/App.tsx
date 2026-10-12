// Phase 5 placeholder screen.
//
// This is NOT the real CCDJ UI - that gets ported in later (step 5), once
// the locked-door bridge's real functions exist to connect it to. For now
// this screen exists to make each step's own point visible on screen,
// live, in the actually-running app.

import { useEffect, useState } from "react";
import { checkBackendHealth, createBackendSession } from "./api/backendClient";
import LibraryScreen from "./library/LibraryScreen";
import TrackCheatScreen from "./trackCheat/TrackCheatScreen";

type Check = {
  label: string;
  detail: string;
  pass: boolean;
};

function runChecks(): Check[] {
  const w = window as unknown as Record<string, unknown>;
  return [
    {
      label: "require is unreachable",
      detail: "nodeIntegration: false - the renderer cannot load Node modules",
      pass: typeof w.require === "undefined"
    },
    {
      label: "process is unreachable",
      detail: "contextIsolation: true - no Node globals leak into the page",
      pass: typeof w.process === "undefined"
    },
    {
      label: "module is unreachable",
      detail: "no CommonJS scope in the renderer",
      pass: typeof w.module === "undefined"
    },
    {
      label: "window.ccdj bridge exists",
      detail: "the preload script loaded",
      pass: typeof w.ccdj === "object" && w.ccdj !== null
    }
  ];
}

type ImportState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "saved"; count: number; sampleTracks: CcdjSampleTrack[] }
  | { status: "importing" }
  | {
      status: "done";
      imported: number;
      blankLinesSkipped: number;
      rowsNeedingAttention: number;
      totalRows: number;
      sampleTracks: CcdjSampleTrack[];
    }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export default function App(): React.JSX.Element {
  const checks = runChecks();
  const allPass = checks.every((c) => c.pass);

  const [importState, setImportState] = useState<ImportState>({ status: "loading" });
  const [libraryRefreshSignal, setLibraryRefreshSignal] = useState(0);

  // On startup, show whatever was already imported and saved, rather than
  // looking empty until the DJ re-imports a file that's genuinely already
  // in the database (CLAUDE.md's own Phase 5 "Expected result": a restart
  // keeps permanent data).
  useEffect(() => {
    window.ccdj.library.getStatus().then((status) => {
      setImportState(status.count > 0 ? { status: "saved", ...status } : { status: "empty" });
    });
  }, []);

  async function handleImport(): Promise<void> {
    setImportState({ status: "importing" });
    try {
      const result = await window.ccdj.library.importFromFile();
      if (result.cancelled) {
        setImportState({ status: "cancelled" });
        return;
      }
      setImportState({
        status: "done",
        imported: result.imported ?? 0,
        blankLinesSkipped: result.blankLinesSkipped ?? 0,
        rowsNeedingAttention: result.rowsNeedingAttention ?? 0,
        totalRows: result.totalRows ?? 0,
        sampleTracks: result.sampleTracks ?? []
      });
      setLibraryRefreshSignal((n) => n + 1);
    } catch (error) {
      setImportState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  const sampleTracksToShow =
    importState.status === "saved" || importState.status === "done" ? importState.sampleTracks : [];

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640 }}>
      <p style={{ textTransform: "uppercase", letterSpacing: "0.08em", color: "#888", fontSize: 12 }}>
        CheatCode DJ &middot; Phase 5
      </p>
      <h1>Desktop shell</h1>
      <p>
        Step 1: window opens with the security locks on. Step 2: a real local database. Step 3: real library
        import, saved for good. Step 4: the rest of the locked-door bridge. Step 5, piece 1: a real, proven
        connection to the backend server, no AI yet. Step 5, piece 2 (below): the real, searchable, virtualized
        Library screen - all tracks scroll smoothly, not just the first 500. Step 5, piece 3 (below): Track
        Cheat core - seed, sliders, one real recommend call through the already-built backend. Next:
        daisy-chain/votes.
      </p>

      <section
        style={{
          border: `2px solid ${allPass ? "#2e7d32" : "#c62828"}`,
          borderRadius: 8,
          padding: "1rem",
          marginTop: "1rem"
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          Process isolation - {allPass ? "all passing" : "FAILING"}
        </h2>
        <ul style={{ paddingLeft: "1.2rem" }}>
          {checks.map((c) => (
            <li key={c.label}>
              <b>{c.pass ? "✓" : "✗"} {c.label}</b>
              <br />
              <span style={{ color: "#666", fontSize: 13 }}>{c.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ border: "2px solid #888", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Step 3: library import</h2>
        <button onClick={handleImport} disabled={importState.status === "importing"}>
          {importState.status === "importing" ? "Importing..." : "Import CSV library..."}
        </button>

        {importState.status === "loading" && <p style={{ color: "#666" }}>Checking saved library...</p>}
        {importState.status === "empty" && <p style={{ color: "#666" }}>Nothing imported yet.</p>}
        {importState.status === "cancelled" && <p style={{ color: "#666" }}>No file selected.</p>}
        {importState.status === "error" && <p style={{ color: "#c62828" }}>Error: {importState.message}</p>}

        {importState.status === "saved" && (
          <p>
            <b>{importState.count}</b> tracks saved from before (loaded from the database, not re-imported).
          </p>
        )}

        {importState.status === "done" && (
          <p>
            Imported <b>{importState.imported}</b> tracks out of {importState.totalRows} rows.
            {importState.blankLinesSkipped > 0 && <> {importState.blankLinesSkipped} blank line(s) skipped.</>}
            {importState.rowsNeedingAttention > 0 && (
              <>
                {" "}
                <span style={{ color: "#c62828" }}>
                  {importState.rowsNeedingAttention} row(s) need attention (had some data, but no usable
                  title/location).
                </span>
              </>
            )}
          </p>
        )}

        <SampleTrackList tracks={sampleTracksToShow} />
      </section>

      <LibraryScreen refreshSignal={libraryRefreshSignal} />
      <TrackCheatScreen />

      <PreferencesSection />
      <HistorySection />
      <AlwaysOnTopSection />
      <BackendConnectionSection />
    </main>
  );
}

function SampleTrackList({ tracks }: { tracks: CcdjSampleTrack[] }): React.JSX.Element | null {
  const [revealResult, setRevealResult] = useState<Record<number, string>>({});

  if (tracks.length === 0) return null;

  async function handleReveal(id: number): Promise<void> {
    const result = await window.ccdj.showInFinder(id);
    setRevealResult((prev) => ({
      ...prev,
      [id]: result.ok ? "Opened." : `Could not open: ${result.reason}`
    }));
  }

  return (
    <ul style={{ paddingLeft: "1.2rem", fontSize: 13, color: "#666", marginTop: "0.5rem" }}>
      {tracks.map((t) => (
        <li key={t.id} style={{ marginBottom: "0.3rem" }}>
          {t.displayName}{" "}
          <button onClick={() => handleReveal(t.id)} style={{ fontSize: 11 }}>
            Reveal in Finder
          </button>
          {revealResult[t.id] && <span style={{ marginLeft: "0.5rem" }}>{revealResult[t.id]}</span>}
        </li>
      ))}
    </ul>
  );
}

function PreferencesSection(): React.JSX.Element {
  const PREF_KEY = "step4TestPreference";
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    window.ccdj.prefs.get(PREF_KEY).then((v) => setSaved(v));
  }, []);

  async function handleSave(): Promise<void> {
    await window.ccdj.prefs.set(PREF_KEY, value);
    setSaved(value);
  }

  return (
    <section style={{ border: "2px solid #888", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Step 4: preferences</h2>
      <p style={{ fontSize: 13, color: "#666" }}>
        Currently saved: <b>{saved === null ? "(nothing saved yet)" : saved === "" ? "(empty string)" : saved}</b>
      </p>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Type anything..." />
      <button onClick={handleSave} style={{ marginLeft: "0.5rem" }}>
        Save (then restart the app to prove it persists)
      </button>
    </section>
  );
}

function HistorySection(): React.JSX.Element {
  const [entries, setEntries] = useState<CcdjHistoryRow[]>([]);

  async function refresh(): Promise<void> {
    setEntries(await window.ccdj.history.list(10));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAppend(): Promise<void> {
    await window.ccdj.history.append({ note: "manual test entry", at: new Date().toISOString() });
    await refresh();
  }

  return (
    <section style={{ border: "2px solid #888", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Step 4: history</h2>
      <button onClick={handleAppend}>Append a test entry</button>
      <ul style={{ paddingLeft: "1.2rem", fontSize: 13, color: "#666", marginTop: "0.5rem" }}>
        {entries.map((e) => (
          <li key={e.id}>
            #{e.id} ({new Date(e.timestamp).toLocaleTimeString()}): {JSON.stringify(e.entry)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AlwaysOnTopSection(): React.JSX.Element {
  const [pinned, setPinned] = useState(false);

  async function handleToggle(): Promise<void> {
    const confirmed = await window.ccdj.setAlwaysOnTop(!pinned);
    setPinned(confirmed);
  }

  return (
    <section style={{ border: "2px solid #888", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Step 4: always on top</h2>
      <label>
        <input type="checkbox" checked={pinned} onChange={handleToggle} /> Pin this window above other windows
      </label>
    </section>
  );
}

type BackendState =
  | { status: "checking" }
  | { status: "reachable" }
  | { status: "unreachable"; error?: string }
  | { status: "session-created"; sessionId: string }
  | { status: "session-error"; error?: string };

function BackendConnectionSection(): React.JSX.Element {
  const [state, setState] = useState<BackendState>({ status: "checking" });

  async function checkNow(): Promise<void> {
    setState({ status: "checking" });
    const health = await checkBackendHealth();
    setState(health.reachable ? { status: "reachable" } : { status: "unreachable", error: health.error });
  }

  useEffect(() => {
    checkNow();
  }, []);

  async function handleCreateSession(): Promise<void> {
    const result = await createBackendSession();
    setState(
      result.ok && result.sessionId
        ? { status: "session-created", sessionId: result.sessionId }
        : { status: "session-error", error: result.error }
    );
  }

  return (
    <section style={{ border: "2px solid #888", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Step 5, piece 1: backend connection</h2>
      <p style={{ fontSize: 13, color: "#666" }}>
        No AI involved here - this only proves the app can reach the real backend server (started separately with{" "}
        <code>npm start</code> in <code>apps/server</code>) and get a real response back.
      </p>

      {state.status === "checking" && <p>Checking...</p>}
      {state.status === "reachable" && <p style={{ color: "#2e7d32" }}>✓ Connected to the backend server.</p>}
      {state.status === "unreachable" && (
        <p style={{ color: "#c62828" }}>
          ✗ Not reachable{state.error ? `: ${state.error}` : ""}. Is <code>apps/server</code> running?
        </p>
      )}
      {(state.status === "session-created" || state.status === "session-error") && (
        <p style={{ color: "#2e7d32" }}>✓ Connected to the backend server.</p>
      )}

      <button onClick={checkNow} style={{ marginRight: "0.5rem" }}>
        Check again
      </button>
      <button onClick={handleCreateSession}>Create a real session</button>

      {state.status === "session-created" && (
        <p style={{ marginTop: "0.5rem" }}>
          Real session created: <code>{state.sessionId}</code>
        </p>
      )}
      {state.status === "session-error" && (
        <p style={{ marginTop: "0.5rem", color: "#c62828" }}>Session creation failed: {state.error}</p>
      )}
    </section>
  );
}
