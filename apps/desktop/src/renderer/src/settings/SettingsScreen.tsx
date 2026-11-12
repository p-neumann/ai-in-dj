// Phase 5, step 5 piece 7 - Settings (consolidated).
//
// Mike's real app spreads this across SIX separate popups (CLAUDE2.md's
// own correction: Settings theme/referral; Style Profile & Play Lists;
// History; a startup Preferences-active reminder; Error Report; Rating
// + Post-Session Nudge), each opened from an icon in a header bar that
// sits on every tab. Piece 11 built that real header - as a Stage 1
// bridge, its style-profile/history/settings-gear icons all open THIS
// one screen for now, unchanged, rather than the real split. Piece 13
// does that split; this comment stays accurate until then.
//
// Always On Top moved to the header's own pin icon (piece 11) - the
// header is the only place it lives now, matching the source exactly
// (it was never a Settings-popup control in his app either).
//
// Left out on purpose, per CLAUDE.md and docs/QUESTIONS.md: login,
// pricing/Manage Subscription/referral code (all Phase 6 or blocked on
// D2), the rating prompt (tied to Track Cheat usage, not a setting),
// DEBUG_MODE (not a real toggle in the source).

import { useEffect, useState } from "react";
import { savePreferences } from "../api/backendClient";
import type { SharedSession } from "../App";
import { SWATCHES_ACCENT, SWATCHES_BG, type ThemePrefs } from "./theme";
import { addListEntry, removeListEntry, permanentOnly, buildStoredPrefsPayload, type PrefListEntry, type PrefEntryType } from "./prefsLists";
import { formatHistoryAsJson, formatHistoryAsCsv } from "./historyExport";

const PREFS_KEY = "settingsPrefs";
const CONTENT_VALUES = ["Dirty", "Clean"] as const;

interface SettingsScreenProps {
  sharedSession: SharedSession | null;
  // Piece 11 fix (2026-11-11): the SAME shared theme App.tsx's header
  // reads from - not a second copy loaded independently in here.
  theme: ThemePrefs;
  setTheme: (next: ThemePrefs) => void;
}

interface StoredPrefs {
  styleProfile: string;
  doPlayList: PrefListEntry[];
  doNotPlayList: PrefListEntry[];
}

function parseStoredPrefs(raw: string | null): StoredPrefs {
  if (!raw) return { styleProfile: "", doPlayList: [], doNotPlayList: [] };
  try {
    const parsed = JSON.parse(raw);
    return {
      styleProfile: typeof parsed.styleProfile === "string" ? parsed.styleProfile : "",
      doPlayList: Array.isArray(parsed.doPlayList) ? parsed.doPlayList : [],
      doNotPlayList: Array.isArray(parsed.doNotPlayList) ? parsed.doNotPlayList : []
    };
  } catch {
    return { styleProfile: "", doPlayList: [], doNotPlayList: [] };
  }
}

export default function SettingsScreen({ sharedSession, theme, setTheme }: SettingsScreenProps): React.JSX.Element {
  // Theme - the SAVED value is a prop now (App.tsx's useSavedTheme,
  // piece 11), not a second independent copy loaded here. That split
  // was the actual bug Ranjish found 2026-11-11: saving here updated
  // only this screen's own copy, so the header (reading App.tsx's
  // copy) never found out until the next restart re-loaded it fresh.
  // His own source never has this problem at all - accentColor/bgColor
  // are state in the ONE component his whole app is, so there's only
  // ever one copy to begin with (and he never persists it - docs/
  // decisions/0016). Pending/staged values stay local here, same two-
  // step pattern as his Settings popup - that part was never the bug.
  const [pendingAccent, setPendingAccent] = useState(theme.accentColor);
  const [pendingBg, setPendingBg] = useState(theme.bgColor);

  // Style Profile + Do Play / Do Not Play - loaded once, saved locally on
  // every edit so nothing is lost (matches Mike's persistPrefs), pushed
  // to the live server session only when "Apply to this session" is
  // clicked explicitly.
  const [styleProfile, setStyleProfile] = useState("");
  const [doPlayList, setDoPlayList] = useState<PrefListEntry[]>([]);
  const [doNotPlayList, setDoNotPlayList] = useState<PrefListEntry[]>([]);
  const [newListTarget, setNewListTarget] = useState<"doPlay" | "doNotPlay">("doPlay");
  const [newListType, setNewListType] = useState<PrefEntryType>("artist");
  const [newListValue, setNewListValue] = useState("");
  const [applyStatus, setApplyStatus] = useState<"idle" | "applying" | "applied" | "error">("idle");
  const [applyError, setApplyError] = useState("");

  // History
  const [historyRows, setHistoryRows] = useState<CcdjHistoryRow[]>([]);
  const [exportedText, setExportedText] = useState("");

  // Report a Problem
  const [reportDesc, setReportDesc] = useState("");
  const [reportText, setReportText] = useState("");
  const [reportCopied, setReportCopied] = useState(false);

  useEffect(() => {
    window.ccdj.prefs.get(PREFS_KEY).then((raw) => {
      const stored = parseStoredPrefs(raw);
      setStyleProfile(stored.styleProfile);
      setDoPlayList(stored.doPlayList);
      setDoNotPlayList(stored.doNotPlayList);
    });
    window.ccdj.history.list(50).then(setHistoryRows);
  }, []);

  const themeChanged = pendingAccent !== theme.accentColor || pendingBg !== theme.bgColor;

  // setTheme (App.tsx's useSavedTheme) both persists AND updates the
  // one shared state the header reads from - this is what makes Save
  // actually live now, not just saved.
  function saveTheme(): void {
    setTheme({ accentColor: pendingAccent, bgColor: pendingBg, lightMode: theme.lightMode });
  }

  function toggleLightMode(): void {
    setTheme({ ...theme, lightMode: !theme.lightMode });
  }

  // docs/decisions/0018: was writing nextDoPlay/nextDoNotPlay straight
  // through, unfiltered - a session-only entry sitting in state got
  // saved to disk the next time anything else triggered a save. Mike's
  // own persistPrefs filters to permanent-only before writing; this now
  // does the same, via the one shared, tested function.
  function persistLocal(nextStyle: string, nextDoPlay: PrefListEntry[], nextDoNotPlay: PrefListEntry[]): void {
    const payload = buildStoredPrefsPayload(nextStyle, nextDoPlay, nextDoNotPlay);
    window.ccdj.prefs.set(PREFS_KEY, JSON.stringify(payload));
  }

  function handleAddEntry(): void {
    if (!newListValue.trim()) return;
    if (newListTarget === "doPlay") {
      const next = addListEntry(doPlayList, newListType, newListValue, true);
      setDoPlayList(next);
      persistLocal(styleProfile, next, doNotPlayList);
    } else {
      const next = addListEntry(doNotPlayList, newListType, newListValue, true);
      setDoNotPlayList(next);
      persistLocal(styleProfile, doPlayList, next);
    }
    setNewListValue("");
  }

  function handleAddSessionEntry(): void {
    if (!newListValue.trim()) return;
    if (newListTarget === "doPlay") {
      setDoPlayList(addListEntry(doPlayList, newListType, newListValue, false));
    } else {
      setDoNotPlayList(addListEntry(doNotPlayList, newListType, newListValue, false));
    }
    setNewListValue("");
  }

  function handleRemoveEntry(target: "doPlay" | "doNotPlay", index: number): void {
    if (target === "doPlay") {
      const removed = doPlayList[index];
      const next = removeListEntry(doPlayList, index);
      setDoPlayList(next);
      if (removed?.persistent) persistLocal(styleProfile, next, doNotPlayList);
    } else {
      const removed = doNotPlayList[index];
      const next = removeListEntry(doNotPlayList, index);
      setDoNotPlayList(next);
      if (removed?.persistent) persistLocal(styleProfile, doPlayList, next);
    }
  }

  function handleStyleProfileBlur(): void {
    persistLocal(styleProfile, doPlayList, doNotPlayList);
  }

  // Sends Style Profile + both lists to the live server session - the
  // one real AI call this screen makes (Phase 4's existing Style Profile
  // enrichment). Deliberately a separate, explicit action rather than
  // firing on every keystroke/list edit, since the server route re-runs
  // that real AI call any time Style Profile is non-empty - an edit here
  // should not silently cost a repeat AI call the DJ didn't ask for.
  async function handleApplyToSession(): Promise<void> {
    if (!sharedSession) {
      setApplyStatus("error");
      setApplyError("Still connecting to the backend session - try again in a moment.");
      return;
    }
    setApplyStatus("applying");
    const result = await savePreferences({
      sessionId: sharedSession.sessionId,
      styleProfile,
      doPlay: permanentOnly(doPlayList).concat(doPlayList.filter((e) => !e.persistent)),
      doNotPlay: permanentOnly(doNotPlayList).concat(doNotPlayList.filter((e) => !e.persistent))
    });
    if (!result.ok) {
      setApplyStatus("error");
      setApplyError(result.error ?? "Unknown error");
      return;
    }
    setApplyStatus("applied");
  }

  async function refreshHistory(): Promise<void> {
    setHistoryRows(await window.ccdj.history.list(50));
  }

  function copyToClipboard(text: string): void {
    navigator.clipboard?.writeText(text);
  }

  function handleGenerateReport(): void {
    const lines = [
      `app: CCDJ Desktop (Phase 5)`,
      `timestamp: ${new Date().toISOString()}`,
      `description: ${reportDesc.trim() || "(none provided)"}`
    ];
    setReportText(lines.join("\n"));
    setReportCopied(false);
  }

  return (
    <section style={{ border: "2px solid #888", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Step 5, piece 7: Settings</h2>
      <p style={{ fontSize: 13, color: "#666" }}>
        Consolidated for now - Mike's real app spreads these across separate popups hanging off a header bar that
        doesn't exist in this app yet (that's piece 8). Everything here does the same thing his popups do; only the
        packaging is different.
      </p>

      {/* Theme - swatch shape/border and the Save button's own color
          react ported exactly from the source's SwatchRow (line 1006)
          and Save Theme button (line 5599) - a disabled HTML button
          with no custom coloring looks nearly identical to an enabled
          one against a dark popup, which is exactly what made this
          look broken even though the underlying state wiring (pending
          vs. saved, swatch onClick -> setPendingX) was already correct. */}
      <h3>Theme</h3>
      <p style={{ fontSize: 12, color: "#666" }}>Highlight color</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {SWATCHES_ACCENT.map((c) => (
          <div
            key={c}
            onClick={() => setPendingAccent(c)}
            title={c}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: c,
              cursor: "pointer",
              border: "2px solid " + (pendingAccent === c ? "#fff" : "#333"),
              boxSizing: "border-box",
              flexShrink: 0
            }}
          />
        ))}
      </div>
      <p style={{ fontSize: 12, color: "#666", marginTop: 10 }}>Background color</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {SWATCHES_BG.map((c) => (
          <div
            key={c}
            onClick={() => setPendingBg(c)}
            title={c}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: c,
              cursor: "pointer",
              border: "2px solid " + (pendingBg === c ? "#fff" : "#333"),
              boxSizing: "border-box",
              flexShrink: 0
            }}
          />
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <button
          onClick={saveTheme}
          disabled={!themeChanged}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: themeChanged ? "none" : "1px solid #444",
            cursor: themeChanged ? "pointer" : "not-allowed",
            background: themeChanged ? pendingAccent : "#2a2a2a",
            color: themeChanged ? "#000" : "#888",
            fontWeight: 700
          }}
        >
          Save Theme
        </button>{" "}
        <label>
          <input type="checkbox" checked={theme.lightMode} onChange={toggleLightMode} /> Light mode
        </label>
      </div>
      <p style={{ fontSize: 11, color: "#666" }}>
        Saved locally and remembered after you restart the app (Mike's own prototype doesn't actually save this -
        see docs/decisions/0016).
      </p>

      {/* Style Profile */}
      <h3>Style Profile</h3>
      <p style={{ fontSize: 12, color: "#666" }}>
        Tell Cheat Code how you play, in your own words. Only what you type here is ever used.
      </p>
      <textarea
        value={styleProfile}
        onChange={(e) => setStyleProfile(e.target.value)}
        onBlur={handleStyleProfileBlur}
        placeholder="Describe your style, taste, and preferences here..."
        style={{ width: "100%", height: 70 }}
      />

      {/* Do Play / Do Not Play */}
      <h3>Do Play / Do Not Play</h3>
      <p style={{ fontSize: 11, color: "#666" }}>
        Do Play is favored, never excludes others. Do Not Play is a hard block, no exceptions.
      </p>
      <p style={{ fontSize: 10, color: "#888", fontStyle: "italic" }}>
        The Content (Dirty/Clean) filter checks a real explicit/content tag if your library data has one - but
        standard CSV exports usually don't include that field, so in practice it currently checks whether the words
        "dirty" or "explicit" literally appear in the track's title, nothing else. It doesn't listen to the audio or
        check lyrics. Accuracy depends entirely on your own filename conventions.
      </p>

      <p style={{ fontWeight: 600, fontSize: 12 }}>Do Play</p>
      <ul>
        {doPlayList.map((e, i) => (
          <li key={i}>
            {e.type}: {e.value} {!e.persistent && <i>(session)</i>}{" "}
            <button onClick={() => handleRemoveEntry("doPlay", i)}>×</button>
          </li>
        ))}
        {!doPlayList.length && <li style={{ color: "#888" }}>No entries yet.</li>}
      </ul>

      <p style={{ fontWeight: 600, fontSize: 12, color: "#e03c3c" }}>Do Not Play</p>
      <ul>
        {doNotPlayList.map((e, i) => (
          <li key={i}>
            {e.type}: {e.value} {!e.persistent && <i>(session)</i>}{" "}
            <button onClick={() => handleRemoveEntry("doNotPlay", i)}>×</button>
          </li>
        ))}
        {!doNotPlayList.length && <li style={{ color: "#888" }}>No entries yet.</li>}
      </ul>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <select value={newListTarget} onChange={(e) => setNewListTarget(e.target.value as "doPlay" | "doNotPlay")}>
          <option value="doPlay">Do Play</option>
          <option value="doNotPlay">Do Not Play</option>
        </select>
        <select
          value={newListType}
          onChange={(e) => {
            setNewListType(e.target.value as PrefEntryType);
            setNewListValue("");
          }}
        >
          <option value="artist">Artist</option>
          <option value="track">Track</option>
          <option value="genre">Genre</option>
          <option value="era">Era</option>
          <option value="content">Content</option>
        </select>
        {newListType === "content" ? (
          <select value={newListValue} onChange={(e) => setNewListValue(e.target.value)}>
            <option value="">Select...</option>
            {CONTENT_VALUES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={newListValue}
            onChange={(e) => setNewListValue(e.target.value)}
            placeholder={newListType === "era" ? "e.g. 70s" : newListType === "genre" ? "e.g. disco" : "e.g. Drake"}
          />
        )}
        <button onClick={handleAddSessionEntry} disabled={!newListValue.trim()} title="Applies for this session only">
          + Session
        </button>
        <button onClick={handleAddEntry} disabled={!newListValue.trim()} title="Saved permanently">
          + Permanent
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <button onClick={handleApplyToSession} disabled={applyStatus === "applying"}>
          {applyStatus === "applying" ? "Applying..." : "Apply to this session"}
        </button>{" "}
        {applyStatus === "applied" && <span style={{ color: "#2e7d32" }}>Applied - Crate Cheat will use this now.</span>}
        {applyStatus === "error" && <span style={{ color: "#c62828" }}>Error: {applyError}</span>}
        <p style={{ fontSize: 11, color: "#666" }}>
          Saving above only saves to this computer. This button sends Style Profile and both lists to the active
          session so tonight's Crate Cheat results actually use them - and it's the one action on this screen that
          makes a real AI call (to turn your Style Profile text into something the recommendation engine can use),
          so it only runs when you click it, not on every small edit.
        </p>
      </div>

      {/* History */}
      <h3>History</h3>
      <p style={{ fontSize: 11, color: "#c62828" }}>
        Simplified first version - records only the seed name, what triggered the fetch, how many results came
        back, and when. Not yet recorded: what happened to each result (dragged/thumbs up/down), chain/bridge/drift
        detail, or notes. See docs/QUESTIONS.md, "History panel: Phase 5 remaining work."
      </p>
      <button onClick={refreshHistory}>Refresh</button>{" "}
      <button onClick={() => setExportedText(formatHistoryAsJson(historyRows))}>Export JSON</button>{" "}
      <button onClick={() => setExportedText(formatHistoryAsCsv(historyRows))}>Export CSV</button>
      <ul style={{ maxHeight: 200, overflowY: "auto" }}>
        {historyRows.map((r) => (
          <li key={r.id} style={{ fontSize: 12 }}>
            {new Date(r.timestamp).toLocaleString()}: {JSON.stringify(r.entry)}
          </li>
        ))}
        {!historyRows.length && <li style={{ color: "#888" }}>Nothing recorded yet.</li>}
      </ul>
      {exportedText && (
        <div>
          <textarea readOnly value={exportedText} style={{ width: "100%", height: 100, fontFamily: "monospace", fontSize: 11 }} />
          <button onClick={() => copyToClipboard(exportedText)}>Copy</button>
        </div>
      )}

      {/* Report a Problem */}
      <h3>Report a Problem</h3>
      <textarea
        value={reportDesc}
        onChange={(e) => setReportDesc(e.target.value)}
        placeholder="e.g. I was building a Quiet Storm crate and it froze..."
        style={{ width: "100%", height: 50 }}
      />
      <div>
        <button onClick={handleGenerateReport}>Generate Report</button>
      </div>
      {reportText && (
        <div>
          <p style={{ fontSize: 10, color: "#666", textTransform: "uppercase" }}>
            What's actually in this report - nothing else
          </p>
          <textarea readOnly value={reportText} style={{ width: "100%", height: 70, fontFamily: "monospace", fontSize: 11 }} />
          <button
            onClick={() => {
              copyToClipboard(reportText);
              setReportCopied(true);
            }}
          >
            {reportCopied ? "Copied!" : "Copy Report"}
          </button>
        </div>
      )}
    </section>
  );
}
