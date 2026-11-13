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
import TrackCheatScreen from "./trackCheat/TrackCheatScreen";
import CrateCheatScreen from "./crateCheat/CrateCheatScreen";
import PlaylistCheatScreen from "./playlistCheat/PlaylistCheatScreen";
import type { MatchedResult } from "./playlistCheat/matchPlaylist.ts";
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

// Stage 2b fix (2026-11-12, "Finding 3"): source holds spotifyResults/
// spotifySelected/plainTextPlaylist/spotifyResultCount as top-level App
// state (lines 1240/1052/1043 area) because its whole UI is one
// component that never unmounts between tabs. Our split-screen
// architecture DOES unmount PlaylistCheatScreen on every tab change
// ({tab===1 && <PlaylistCheatScreen/>}), so without lifting this the
// exact same way crateList already is (docs/decisions/0019), a DJ's
// matched results and selections vanished the instant they looked at
// another tab. Lifted here for the same reason sharedSession/crateList
// are: PlaylistCheatScreen needs this to survive its own unmount.
export interface PlaylistCheatWork {
  plainText: string;
  resultCount: number;
  vibePromptText: string;
  results: MatchedResult[];
  selected: Record<number, number>;
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

  const [sharedSession, setSharedSession] = useState<SharedSession | null>(null);
  const [crateList, setCrateList] = useState<CrateTrack[]>([]);
  const [playlistCheatWork, setPlaylistCheatWork] = useState<PlaylistCheatWork>({
    plainText: "",
    resultCount: 3,
    vibePromptText: "",
    results: [],
    selected: {}
  });

  useEffect(() => {
    window.ccdj.getAppVersion().then(setAppVersion);
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

  async function handleToggleAlwaysOnTop(): Promise<void> {
    const confirmed = await window.ccdj.setAlwaysOnTop(!alwaysOnTop);
    setAlwaysOnTop(confirmed);
  }

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
        {tab === 0 && <TrackCheatScreen sharedSession={sharedSession} gigMode={gigMode} setGigMode={setGigMode} theme={derived} onGoToLibrary={() => setTab(3)} />}

        {tab === 1 && (
          <PlaylistCheatScreen
            // Source's spotifyToPlaylist (line 4980) does setTab(2) right
            // after adding - jumps the DJ to Crate Cheat to see what just
            // landed, rather than leaving them on Playlist Cheat wondering
            // if the click did anything. Stage 2b fix (2026-11-12).
            onAddToCrate={(tracks) => {
              setCrateList((prev) => [...prev, ...tracks]);
              setTab(2);
            }}
            work={playlistCheatWork}
            setWork={setPlaylistCheatWork}
            theme={derived}
            onGoToLibrary={() => setTab(3)}
          />
        )}

        {tab === 2 && <CrateCheatScreen sharedSession={sharedSession} crateList={crateList} setCrateList={setCrateList} theme={derived} onGoToLibrary={() => setTab(3)} />}

        {tab === 3 && <LibraryScreen theme={derived} onClearLibrary={() => setCrateList([])} />}

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
