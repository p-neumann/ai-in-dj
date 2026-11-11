// Phase 5, step 5 piece 11 (shared header/visual port), Stage 1.
//
// Replaces the stacked-page shell with the source's real structure:
// a sticky header + icon row, a real 5-tab bar (reference line 33),
// launching on Account (tab index 4 - his own deliberate 8/17/26 fix,
// not Track Cheat). Colors/fonts for the screens BEHIND each tab are
// Stage 2's job, not this one - this stage only themes the header,
// tab bar, and Account tab itself.
//
// The old "hide every sibling while gigMode" trick (piece 10) is gone -
// with real tabs, only the active tab's content ever renders, so Gig
// Mode now only has to do what the source actually does: hide the tab
// bar (AppHeader's own job, matching gigMode&&tab===0 exactly).

import { useEffect, useState } from "react";
import { checkBackendHealth, createBackendSession } from "./api/backendClient";
import LibraryScreen from "./library/LibraryScreen";
import DuplicateFinderScreen from "./duplicateFinder/DuplicateFinderScreen";
import TrackCheatScreen from "./trackCheat/TrackCheatScreen";
import CrateCheatScreen from "./crateCheat/CrateCheatScreen";
import PlaylistCheatScreen from "./playlistCheat/PlaylistCheatScreen";
import SettingsScreen from "./settings/SettingsScreen";
import AppHeader from "./header/AppHeader";
import AccountTab from "./account/AccountTab";
import { useSavedTheme } from "./theme/useSavedTheme";
import { deriveTheme } from "./theme/deriveTheme";

// docs/decisions/0015: ONE session, created once here, shared by every
// screen that talks to the backend - Track Cheat, Crate Cheat, and later
// Settings. Before this, each screen created its own session, so a
// thumbs-down in Track Cheat had no way to reach Crate Cheat's Do Not
// Play/staleness checks. That was never Mike's design; it was a side
// effect of building each screen separately. Plumbing only - no
// recommendation logic changes here.
export interface SharedSession {
  sessionId: string;
  chainId: string | null;
  stateVersion: number;
}

// docs/decisions/0019: Mike's Crate Cheat tab is a persisting, editable
// crate, not a one-shot "show the last build" screen - a build replaces
// this list (source: setPlaylist(deduped)), but Playlist Cheat's "Add To
// Crate ->" button (source: spotifyToPlaylist) adds to it without
// erasing what's there. Lifted here, same reason sharedSession is -
// both Crate Cheat and Playlist Cheat need to see and change the same
// list, not two separate copies.
export interface CrateTrack {
  trackId: number;
  name: string;
  bpm: number;
  key: string;
}

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
  // Source: var [tab,setTab]=s(4) - launches on Account, a deliberate
  // 8/17/26 fix (CLAUDE2.md's own "where CLAUDE.md gets it wrong"
  // table, #1). Not a guess - confirmed directly against the code.
  const [tab, setTab] = useState(4);
  const [gigMode, setGigMode] = useState(false);
  const { theme, setTheme } = useSavedTheme();
  const derived = deriveTheme(theme);

  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  // Stage 1 bridge (piece 11), not the final design: the header's
  // style-profile/history/settings-gear icons all open this one real
  // SettingsScreen for now, since the source's 3 separate popups for
  // those don't exist as their own components yet (piece 13 splits
  // them apart). Nothing stops working in the meantime.
  const [showSettingsBridge, setShowSettingsBridge] = useState(false);

  const [importState, setImportState] = useState<ImportState>({ status: "loading" });
  const [libraryRefreshSignal, setLibraryRefreshSignal] = useState(0);
  const [sharedSession, setSharedSession] = useState<SharedSession | null>(null);
  const [crateList, setCrateList] = useState<CrateTrack[]>([]);

  useEffect(() => {
    window.ccdj.getAppVersion().then(setAppVersion);
  }, []);

  // On startup, show whatever was already imported and saved, rather than
  // looking empty until the DJ re-imports a file that's genuinely already
  // in the database (CLAUDE.md's own Phase 5 "Expected result": a restart
  // keeps permanent data).
  useEffect(() => {
    window.ccdj.library.getStatus().then((status) => {
      setImportState(status.count > 0 ? { status: "saved", ...status } : { status: "empty" });
    });
  }, []);

  // One session for the whole app, created once (docs/decisions/0015).
  // Every screen that needs the server gets this same one as a prop,
  // instead of making its own.
  useEffect(() => {
    createBackendSession().then((created) => {
      if (created.ok && created.sessionId) {
        setSharedSession({
          sessionId: created.sessionId,
          chainId: created.chainId ?? null,
          stateVersion: created.stateVersion ?? 0
        });
      }
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

  async function handleToggleAlwaysOnTop(): Promise<void> {
    const confirmed = await window.ccdj.setAlwaysOnTop(!alwaysOnTop);
    setAlwaysOnTop(confirmed);
  }

  const sampleTracksToShow =
    importState.status === "saved" || importState.status === "done" ? importState.sampleTracks : [];

  return (
    <div style={{ fontFamily: "Arial,sans-serif", background: derived.bg, minHeight: "100vh", color: "#fff" }}>
      <AppHeader
        tab={tab}
        setTab={setTab}
        gigMode={gigMode}
        theme={derived}
        lightMode={theme.lightMode}
        alwaysOnTop={alwaysOnTop}
        onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
        onToggleLightMode={() => setTheme({ ...theme, lightMode: !theme.lightMode })}
        onOpenSettingsBridge={() => setShowSettingsBridge(true)}
      />

      <main style={{ padding: "1.5rem", maxWidth: 720, margin: "0 auto" }}>
        {tab === 0 && <TrackCheatScreen sharedSession={sharedSession} gigMode={gigMode} setGigMode={setGigMode} />}

        {tab === 1 && <PlaylistCheatScreen onAddToCrate={(tracks) => setCrateList((prev) => [...prev, ...tracks])} />}

        {tab === 2 && <CrateCheatScreen sharedSession={sharedSession} crateList={crateList} setCrateList={setCrateList} />}

        {tab === 3 && (
          <>
            <section style={{ border: "2px solid #888", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
              <h2 style={{ marginTop: 0 }}>Import library</h2>
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
            <DuplicateFinderScreen refreshSignal={libraryRefreshSignal} />
          </>
        )}

        {tab === 4 && <AccountTab theme={derived} lightMode={theme.lightMode} appVersion={appVersion} />}

        {!gigMode && (
          <section style={{ border: "1px solid #444", borderRadius: 8, padding: "1rem", marginTop: "2rem" }}>
            <h2 style={{ marginTop: 0, fontSize: 13, color: "#888" }}>Desktop shell diagnostics</h2>
            <p style={{ fontSize: 12, color: "#666" }}>
              Our own internal checks, not part of Mike's app - kept visible for debugging, hidden in Gig Mode.
            </p>
            <DiagnosticsPanel />
          </section>
        )}
      </main>

      {showSettingsBridge && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowSettingsBridge(false)}
        >
          <div
            style={{ background: "#0d0d0d", border: "1px solid #444", borderRadius: 16, padding: "1rem", width: 680, maxWidth: "94vw", maxHeight: "84vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setShowSettingsBridge(false)} style={{ float: "right" }}>
              × Close
            </button>
            <SettingsScreen sharedSession={sharedSession} theme={theme} setTheme={setTheme} />
          </div>
        </div>
      )}
    </div>
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

type BackendState =
  | { status: "checking" }
  | { status: "reachable" }
  | { status: "unreachable"; error?: string };

// Step 5, piece 11: folds the old separate "process isolation" and
// "backend connection" scratch sections (step 4/5-piece-1) into one
// quiet diagnostics panel. The step4TestPreference/history-append/
// always-on-top scratch sections from that same era are gone entirely -
// they're fully superseded now by real Settings (piece 7) and the
// header's own pin icon (piece 11), not by this panel.
function DiagnosticsPanel(): React.JSX.Element {
  const checks = runChecks();
  const allPass = checks.every((c) => c.pass);
  const [backend, setBackend] = useState<BackendState>({ status: "checking" });

  useEffect(() => {
    checkBackendHealth().then((health) => {
      setBackend(health.reachable ? { status: "reachable" } : { status: "unreachable", error: health.error });
    });
  }, []);

  return (
    <div style={{ fontSize: 12, color: "#888" }}>
      <p>
        Process isolation: <b style={{ color: allPass ? "#2e7d32" : "#c62828" }}>{allPass ? "all passing" : "FAILING"}</b>
        {!allPass && (
          <ul style={{ paddingLeft: "1.2rem" }}>
            {checks.filter((c) => !c.pass).map((c) => (
              <li key={c.label}>{c.label}: {c.detail}</li>
            ))}
          </ul>
        )}
      </p>
      <p>
        Backend:{" "}
        {backend.status === "checking" && "checking..."}
        {backend.status === "reachable" && <span style={{ color: "#2e7d32" }}>✓ reachable</span>}
        {backend.status === "unreachable" && (
          <span style={{ color: "#c62828" }}>✗ not reachable{backend.error ? `: ${backend.error}` : ""}</span>
        )}
      </p>
    </div>
  );
}
