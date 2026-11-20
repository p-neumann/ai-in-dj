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

import { useEffect, useRef, useState } from "react";
import { checkBackendHealth, createBackendSession } from "./api/backendClient";
import { initialSessionState } from "./trackCheat/sessionLifecycle";
import { createInitialTrackCheatWork, type TrackCheatWork } from "./trackCheat/trackCheatWork";
import type { HistoryResultRow } from "./trackCheat/historyEntry";
import LibraryScreen from "./library/LibraryScreen";
import TrackCheatScreen from "./trackCheat/TrackCheatScreen";
import CrateCheatScreen from "./crateCheat/CrateCheatScreen";
import { createInitialCrateCheatWork, type CrateCheatWork } from "./crateCheat/crateCheatWork";
import PlaylistCheatScreen from "./playlistCheat/PlaylistCheatScreen";
import type { MatchedResult } from "./playlistCheat/matchPlaylist.ts";
import SettingsPopup from "./settings/SettingsPopup";
import StyleProfilePopup from "./settings/StyleProfilePopup";
import HistoryPopup from "./settings/HistoryPopup";
import StartupPrefsReminder from "./settings/StartupPrefsReminder";
import { parseStoredPrefs, buildStoredPrefsPayload, type PrefListEntry } from "./settings/prefsLists";
import AppHeader from "./header/AppHeader";
import AccountTab from "./account/AccountTab";
import { useSavedTheme } from "./theme/useSavedTheme";
import { deriveTheme } from "./theme/deriveTheme";

// Same key StyleProfilePopup.tsx uses - the two files read/write this
// independently (see the startupPrefs comment below for why), but must
// agree on the key itself.
const PREFS_KEY = "settingsPrefs";

// docs/decisions/0015: ONE session, created once here, shared by every
// screen that talks to the backend - Track Cheat, Crate Cheat, and later
// Settings. Before this, each screen created its own session, so a
// thumbs-down in Track Cheat had no way to reach Crate Cheat's Do Not
// Play/staleness checks. That was never Mike's design; it was a side
// effect of building each screen separately. Plumbing only - no
// recommendation logic changes here.
//
// docs/decisions/0020: clientSeq/chainDepth were previously owned by
// TrackCheatScreen's own local ref, re-seeded every time that screen
// mounted (including a remount after a tab switch) - the root cause of
// a permanent HTTP 409 after switching tabs and back. They live here now
// for the same reason sessionId/chainId/stateVersion already did: this
// component never unmounts, so this state genuinely survives a tab
// switch. See trackCheat/sessionLifecycle.ts.
export interface SharedSession {
  sessionId: string;
  chainId: string | null;
  stateVersion: number;
  clientSeq: number;
  chainDepth: number;
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
  // Piece 19 (2026-11-14) - source's spotifyToPlaylist (line 4980)
  // tags every track it pushes with reason:"From Spotify"; a track
  // Crate Cheat's own AI build adds has no reason at all (his
  // reason:"" default). Surfaced only in the JSON export, same as his
  // (confirmed: his CSV/M3U/TXT export never includes it either).
  reason?: string;
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

  // Piece 13 (Settings split): while the Settings popup is open, EVERY
  // themed pixel in the app shows the pending (unsaved) pick, not just
  // the popup - source line 1886, `accent = showSettings ? pendingAccent
  // : accentColor`. null = no popup open (or nothing staged yet), so
  // the whole app falls back to the saved theme, which is also exactly
  // what happens the instant the popup closes without saving (Cancel/
  // click-outside never commits - see cancelSettingsPopup below).
  //
  // Deliberately NOT a full ThemePrefs - lightMode is never part of
  // source's pending/staged mechanism (its own line 1887 reads
  // `lightMode` straight from committed state even while showSettings
  // is true, never from anything staged). Keeping only accentColor/
  // bgColor here means toggling light mode from the header still works
  // live while this popup is open, instead of freezing at whatever
  // lightMode was when the popup was opened.
  const [pendingTheme, setPendingTheme] = useState<{ accentColor: string; bgColor: string } | null>(null);
  const derived = deriveTheme(pendingTheme ? { ...theme, ...pendingTheme } : theme);

  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  // Piece 13 (Settings split, Stage 3): the header's style-profile/
  // history/settings-gear icons now open three distinct real popups,
  // replacing the single bridge screen piece 11 used as a stand-in.
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [showStyleProfilePopup, setShowStyleProfilePopup] = useState(false);
  const [showHistoryPopup, setShowHistoryPopup] = useState(false);

  const [sharedSession, setSharedSession] = useState<SharedSession | null>(null);
  const [crateList, setCrateList] = useState<CrateTrack[]>([]);
  const [playlistCheatWork, setPlaylistCheatWork] = useState<PlaylistCheatWork>({
    plainText: "",
    resultCount: 3,
    vibePromptText: "",
    results: [],
    selected: {}
  });
  // docs/decisions/0021: everything Track Cheat's screen itself showed
  // was local useState, so it vanished on every tab-away-and-back the
  // same way Playlist Cheat's results used to (docs/decisions/0019) -
  // lifted here for the same reason, and by the same pattern.
  const [trackCheatWork, setTrackCheatWork] = useState<TrackCheatWork>(createInitialTrackCheatWork());
  // docs/decisions/0021: the part of Crate Cheat's own screen state that
  // was still local (result/selected/prompt/size/crateVibePrompt/sort/
  // effort) - crateList itself was already lifted (0019), but a DJ who
  // deselected specific tracks before switching tabs got them silently
  // RESELECTED on return (the recompute-on-mount effect re-ran against
  // the persisted crateList). Transient UI feedback (showExportMenu/
  // exportBusy/exportMessage) stays local on purpose - see 0021.
  const [crateCheatWork, setCrateCheatWork] = useState<CrateCheatWork>(createInitialCrateCheatWork());
  // docs/decisions/0021: which history DB row Track Cheat's CURRENT
  // results came from, and the exact results array last written to it.
  // Stays a REF, not state - piece 21's thumbs-up race fix (historyEntry.ts)
  // depends on reading the truly-live value after an await, which only a
  // ref gives; converting this to state/props would reintroduce that
  // exact race (a closure only ever sees what was current when it was
  // created). Created here instead of inside TrackCheatScreen so the ref
  // OBJECT ITSELF survives a remount, same effect as lifting a value.
  const trackCheatHistoryRef = useRef<{ entryId: number | null; results: HistoryResultRow[] }>({ entryId: null, results: [] });

  // Piece 4 (startup preferences reminder). App.tsx's OWN load of the
  // same stored-prefs blob StyleProfilePopup independently loads when
  // opened - this is a deliberate, separate read, not a lift of
  // StyleProfilePopup's state, same cross-boundary judgment call
  // already used elsewhere in this port (typeLock.ts etc.). This copy
  // is a one-time snapshot used only to decide/render this one popup;
  // it's never read again afterward, so it never needs to stay in
  // sync with whatever StyleProfilePopup does once it's opened.
  const [startupPrefs, setStartupPrefs] = useState<{ styleProfile: string; doPlayList: PrefListEntry[]; doNotPlayList: PrefListEntry[]; dontAskPrefsReminder: boolean }>({
    styleProfile: "",
    doPlayList: [],
    doNotPlayList: [],
    dontAskPrefsReminder: false
  });
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [showPrefsReminder, setShowPrefsReminder] = useState(false);
  // Source's prefsReminderShownRef (1295) - once per real app launch,
  // not once per render/tab-visit. A plain useRef here gives exactly
  // that guarantee for the same reason sharedSession/trackCheatWork do
  // (docs/decisions/0020/0021): App.tsx itself never unmounts during
  // the app's lifetime, only the screens underneath it do.
  const prefsReminderShownRef = useRef(false);

  useEffect(() => {
    window.ccdj.getAppVersion().then(setAppVersion);
  }, []);

  // Source lines 1486-1507 (the load effect) + 1513-1517 (the gated
  // show effect), split the same way here: load once, then a separate
  // effect decides whether to show, gated on prefsLoaded/the ref/
  // dontAskPrefsReminder exactly like his.
  useEffect(() => {
    window.ccdj.prefs.get(PREFS_KEY).then((raw) => {
      setStartupPrefs(parseStoredPrefs(raw));
      setPrefsLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (!prefsLoaded || prefsReminderShownRef.current || startupPrefs.dontAskPrefsReminder) return;
    const hasPermanentPrefs =
      startupPrefs.doPlayList.some((e) => e.persistent) ||
      startupPrefs.doNotPlayList.some((e) => e.persistent) ||
      !!(startupPrefs.styleProfile && startupPrefs.styleProfile.trim());
    if (hasPermanentPrefs) {
      setShowPrefsReminder(true);
      prefsReminderShownRef.current = true;
    }
  }, [prefsLoaded, startupPrefs]);

  // Source's checkbox onChange (5545) - persists immediately, every
  // toggle, not just once on close. Writes all four fields together
  // (buildStoredPrefsPayload), matching persistPrefs exactly, so this
  // never silently drops whatever Style Profile/Do Play/Do Not Play
  // already held.
  function handleToggleDontAskPrefsReminder(checked: boolean): void {
    setStartupPrefs((prev) => {
      const next = { ...prev, dontAskPrefsReminder: checked };
      const payload = buildStoredPrefsPayload(next.styleProfile, next.doPlayList, next.doNotPlayList, checked);
      window.ccdj.prefs.set(PREFS_KEY, JSON.stringify(payload));
      return next;
    });
  }

  // One session for the whole app, created once (docs/decisions/0015).
  // Every screen that needs the server gets this same one as a prop,
  // instead of making its own.
  useEffect(() => {
    createBackendSession().then((created) => {
      if (created.ok && created.sessionId) {
        // docs/decisions/0020: the ONLY place this state is ever seeded
        // from scratch - once, right here, for the lifetime of this
        // real backend session. TrackCheatScreen no longer does this
        // itself on mount.
        setSharedSession(
          initialSessionState({
            sessionId: created.sessionId,
            chainId: created.chainId ?? null,
            stateVersion: created.stateVersion ?? 0
          })
        );
      }
    });
  }, []);

  // docs/decisions/0020: the one place anything merges a patch into the
  // shared session - TrackCheatScreen no longer keeps its own copy to
  // mutate, so this is now the only writer, matching the setCrateList
  // pattern already used for the crate list.
  function updateSharedSession(patch: Partial<SharedSession>): void {
    setSharedSession((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  // docs/decisions/0021: same merge-a-patch pattern as updateSharedSession.
  // Accepts a function too (not just a plain patch) for the one case that
  // needs it (handleVote's votes update, replacing its old setVotes(prev
  // => ...) functional form) - everywhere else a plain object is simpler.
  function updateTrackCheatWork(patch: Partial<TrackCheatWork> | ((prev: TrackCheatWork) => Partial<TrackCheatWork>)): void {
    setTrackCheatWork((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  }

  function updateCrateCheatWork(patch: Partial<CrateCheatWork> | ((prev: CrateCheatWork) => Partial<CrateCheatWork>)): void {
    setCrateCheatWork((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  }

  async function handleToggleAlwaysOnTop(): Promise<void> {
    const confirmed = await window.ccdj.setAlwaysOnTop(!alwaysOnTop);
    setAlwaysOnTop(confirmed);
  }

  // Piece 13 (Settings split). Ported from source's openSettings/
  // saveSettings/cancelSettings (lines 1906-1908): opening seeds the
  // pending pick from whatever's currently saved; Cancel (or clicking
  // outside, which also calls this - PopupOverlay's onBackdropClick)
  // just closes without committing, so the app-wide preview above falls
  // straight back to the saved theme; Save commits pending -> saved.
  function openSettingsPopup(): void {
    setPendingTheme({ accentColor: theme.accentColor, bgColor: theme.bgColor });
    setShowSettingsPopup(true);
  }
  function saveSettingsPopup(): void {
    if (pendingTheme) setTheme({ ...theme, ...pendingTheme });
    setPendingTheme(null);
    setShowSettingsPopup(false);
  }
  function cancelSettingsPopup(): void {
    setPendingTheme(null);
    setShowSettingsPopup(false);
  }
  function updatePendingTheme(patch: Partial<{ accentColor: string; bgColor: string }>): void {
    setPendingTheme((prev) => (prev ? { ...prev, ...patch } : prev));
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
        onOpenStyleProfile={() => setShowStyleProfilePopup(true)}
        onOpenHistory={() => setShowHistoryPopup(true)}
        onOpenSettings={openSettingsPopup}
        isStyleProfileOpen={showStyleProfilePopup}
        isSettingsOpen={showSettingsPopup}
      />

      <main style={{ padding: "1.5rem", maxWidth: 720, margin: "0 auto" }}>
        {tab === 0 && (
          <TrackCheatScreen
            sharedSession={sharedSession}
            updateSession={updateSharedSession}
            work={trackCheatWork}
            updateWork={updateTrackCheatWork}
            historyRef={trackCheatHistoryRef}
            gigMode={gigMode}
            setGigMode={setGigMode}
            theme={derived}
            onGoToLibrary={() => setTab(3)}
          />
        )}

        {tab === 1 && (
          <PlaylistCheatScreen
            // Source's spotifyToPlaylist (line 4980) does setTab(2) right
            // after adding - jumps the DJ to Crate Cheat to see what just
            // landed, rather than leaving them on Playlist Cheat wondering
            // if the click did anything. Stage 2b fix (2026-11-12).
            onAddToCrate={(tracks) => {
              // docs/decisions/0021: appending must also mark the newly
              // added tracks selected, same as a fresh build does - the
              // old mount-keyed effect inside CrateCheatScreen used to
              // do this for free (it fired on every crateList change,
              // mount or not); replaced with explicit updates at each
              // real mutation site now that selection persists.
              const startIndex = crateList.length;
              setCrateList((prev) => [...prev, ...tracks]);
              updateCrateCheatWork({
                selected: tracks.reduce(
                  (acc, _, i) => ({ ...acc, [startIndex + i]: true }),
                  { ...crateCheatWork.selected }
                )
              });
              setTab(2);
            }}
            work={playlistCheatWork}
            setWork={setPlaylistCheatWork}
            theme={derived}
            onGoToLibrary={() => setTab(3)}
          />
        )}

        {tab === 2 && (
          <CrateCheatScreen
            sharedSession={sharedSession}
            crateList={crateList}
            setCrateList={setCrateList}
            work={crateCheatWork}
            updateWork={updateCrateCheatWork}
            theme={derived}
            onGoToLibrary={() => setTab(3)}
          />
        )}

        {tab === 3 && (
          <LibraryScreen
            theme={derived}
            onClearLibrary={() => {
              setCrateList([]);
              // docs/decisions/0021: selected is keyed by crate index -
              // leaving it as-is after a clear would make selectedCount
              // show stale true-entries for tracks that no longer exist.
              updateCrateCheatWork({ selected: {} });
            }}
          />
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

      {showSettingsPopup && pendingTheme && (
        <SettingsPopup
          savedTheme={{ accentColor: theme.accentColor, bgColor: theme.bgColor }}
          pendingTheme={pendingTheme}
          updatePendingTheme={updatePendingTheme}
          onSave={saveSettingsPopup}
          onCancel={cancelSettingsPopup}
        />
      )}
      {showStyleProfilePopup && (
        <StyleProfilePopup sharedSession={sharedSession} theme={derived} onClose={() => setShowStyleProfilePopup(false)} />
      )}
      {showHistoryPopup && <HistoryPopup theme={derived} onClose={() => setShowHistoryPopup(false)} />}

      {showPrefsReminder && (
        <StartupPrefsReminder
          theme={derived}
          styleProfile={startupPrefs.styleProfile}
          doPlayList={startupPrefs.doPlayList}
          doNotPlayList={startupPrefs.doNotPlayList}
          dontAskChecked={startupPrefs.dontAskPrefsReminder}
          onToggleDontAsk={handleToggleDontAskPrefsReminder}
          onDismiss={() => setShowPrefsReminder(false)}
        />
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
