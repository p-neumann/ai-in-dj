// Phase 5, step 5 piece 13 (Settings split, Stage 3). Ported from
// reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx lines 5480-5534
// (render) - the logic itself (addListEntry/removeListEntry/session-
// vs-permanent/Apply-to-session) was already real and correct in the
// old consolidated SettingsScreen.tsx (piece 7/19); this piece moves it
// into its real popup and gives it real styling for the first time -
// pill chips (5494/5500), not plain <li> text.
//
// Panel chrome (source 5480-5482): backdrop 0.5 (NOT Settings' 0.4 -
// checked directly, these two popups use different backdrops), zIndex
// 100, click-outside closes plainly (nothing staged here to revert,
// unlike Settings), border uses the SAVED theme's accent (this popup
// doesn't live-preview an unsaved theme pick, so there's no "pending"
// concept to read) - width 560, maxWidth 94vw, maxHeight 86vh, padding
// 1.25rem, flexDirection column with the header fixed and the body
// scrolling inside (source wraps the body in its own overflowY:auto
// div, line 5487) - a different shape from Settings' single
// overflowY:auto on the whole panel.
//
// "Apply to this session" is NOT in source - his single-component app
// has no server session to push to, so his lists are just read
// directly. Real, necessary addition for this port's architecture
// (unchanged from piece 7), kept and restyled, not removed.

import { useEffect, useState } from "react";
import { savePreferences } from "../api/backendClient";
import type { SharedSession } from "../App";
import type { DerivedTheme } from "../theme/deriveTheme";
import { addListEntry, removeListEntry, permanentOnly, buildStoredPrefsPayload, type PrefListEntry, type PrefEntryType } from "./prefsLists";
import PopupOverlay from "../shared/PopupOverlay";
import { sectionLblStyle, WHITE, GRAY } from "../shared/controlStyles";

const PREFS_KEY = "settingsPrefs";
const CONTENT_VALUES = ["Dirty", "Clean"] as const;

interface StyleProfilePopupProps {
  sharedSession: SharedSession | null;
  theme: DerivedTheme;
  onClose: () => void;
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

export default function StyleProfilePopup({ sharedSession, theme, onClose }: StyleProfilePopupProps): React.JSX.Element {
  const [styleProfile, setStyleProfile] = useState("");
  const [doPlayList, setDoPlayList] = useState<PrefListEntry[]>([]);
  const [doNotPlayList, setDoNotPlayList] = useState<PrefListEntry[]>([]);
  const [newListTarget, setNewListTarget] = useState<"doPlay" | "doNotPlay">("doPlay");
  const [newListType, setNewListType] = useState<PrefEntryType>("artist");
  const [newListValue, setNewListValue] = useState("");
  const [applyStatus, setApplyStatus] = useState<"idle" | "applying" | "applied" | "error">("idle");
  const [applyError, setApplyError] = useState("");

  useEffect(() => {
    window.ccdj.prefs.get(PREFS_KEY).then((raw) => {
      const stored = parseStoredPrefs(raw);
      setStyleProfile(stored.styleProfile);
      setDoPlayList(stored.doPlayList);
      setDoNotPlayList(stored.doNotPlayList);
    });
  }, []);

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

  return (
    <PopupOverlay
      backdropOpacity={0.5}
      zIndex={100}
      onBackdropClick={onClose}
      panelStyle={{ border: "1px solid " + theme.accentAlpha(0.3), padding: "1.25rem", width: 560, maxWidth: "94vw", maxHeight: "86vh", display: "flex", flexDirection: "column" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: WHITE, letterSpacing: "0.06em" }}>Style Profile & Play Lists</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: GRAY, fontSize: 20, cursor: "pointer" }}>
          ×
        </button>
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        <p style={sectionLblStyle}>Style Profile</p>
        <p style={{ fontSize: 11, color: GRAY, margin: "0 0 8px", lineHeight: 1.5 }}>
          Tell Cheat Code how you play, in your own words. Only what you type here is ever used - nothing is
          inferred automatically. e.g. "I favor remixes over extended versions. I like deep cuts over obvious
          singles."
        </p>
        <textarea
          value={styleProfile}
          onChange={(e) => setStyleProfile(e.target.value)}
          onBlur={handleStyleProfileBlur}
          placeholder="Describe your style, taste, and preferences here..."
          style={{ width: "100%", minHeight: 80, fontSize: 13, padding: "10px 12px", borderRadius: 8, border: "1px solid " + theme.accentAlpha(0.3), background: "rgba(0,0,0,0.5)", color: WHITE, resize: "vertical", boxSizing: "border-box", outline: "none", marginBottom: "1.25rem" }}
        />

        <p style={sectionLblStyle}>
          Do Play <span style={{ color: GRAY, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— favored, never excludes others</span>
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {doPlayList.map((e, i) => (
            <span key={i} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: theme.accentAlpha(0.1), border: "1px solid " + theme.accentAlpha(0.4), color: theme.accent, display: "flex", alignItems: "center", gap: 6 }}>
              {e.type}: {e.value}
              {!e.persistent && <span style={{ fontSize: 9, color: GRAY, fontStyle: "italic" }}>(session)</span>}
              <span onClick={() => handleRemoveEntry("doPlay", i)} style={{ cursor: "pointer", color: GRAY }}>
                ×
              </span>
            </span>
          ))}
          {!doPlayList.length && <p style={{ fontSize: 11, color: GRAY, fontStyle: "italic", margin: 0 }}>No entries yet.</p>}
        </div>

        <p style={sectionLblStyle}>
          Do Not Play <span style={{ color: "#e03c3c", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— hard block, no exceptions</span>
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {doNotPlayList.map((e, i) => (
            <span key={i} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "rgba(224,60,60,0.1)", border: "1px solid rgba(224,60,60,0.4)", color: "#e03c3c", display: "flex", alignItems: "center", gap: 6 }}>
              {e.type}: {e.value}
              {!e.persistent && <span style={{ fontSize: 9, color: GRAY, fontStyle: "italic" }}>(session)</span>}
              <span onClick={() => handleRemoveEntry("doNotPlay", i)} style={{ cursor: "pointer", color: GRAY }}>
                ×
              </span>
            </span>
          ))}
          {!doNotPlayList.length && <p style={{ fontSize: 11, color: GRAY, fontStyle: "italic", margin: 0 }}>No entries yet.</p>}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          <select value={newListTarget} onChange={(e) => setNewListTarget(e.target.value as "doPlay" | "doNotPlay")} style={{ fontSize: 12, padding: 8, borderRadius: 6, border: "1px solid " + theme.accentAlpha(0.3), background: "rgba(0,0,0,0.5)", color: WHITE }}>
            <option value="doPlay">Do Play</option>
            <option value="doNotPlay">Do Not Play</option>
          </select>
          <select
            value={newListType}
            onChange={(e) => {
              setNewListType(e.target.value as PrefEntryType);
              setNewListValue("");
            }}
            style={{ fontSize: 12, padding: 8, borderRadius: 6, border: "1px solid " + theme.accentAlpha(0.3), background: "rgba(0,0,0,0.5)", color: WHITE }}
          >
            <option value="artist">Artist</option>
            <option value="track">Track</option>
            <option value="genre">Genre</option>
            <option value="era">Era</option>
            <option value="content">Content</option>
          </select>
          {newListType === "content" ? (
            <select value={newListValue} onChange={(e) => setNewListValue(e.target.value)} style={{ flex: 1, minWidth: 120, fontSize: 12, padding: "8px 10px", borderRadius: 6, border: "1px solid " + theme.accentAlpha(0.3), background: "rgba(0,0,0,0.5)", color: WHITE }}>
              <option value="">Select...</option>
              {CONTENT_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v === "Dirty" ? "Dirty / Explicit" : "Clean Only"}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={newListValue}
              onChange={(e) => setNewListValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newListValue.trim()) {
                  handleAddEntry();
                }
              }}
              placeholder={newListType === "era" ? "e.g. 70s" : newListType === "genre" ? "e.g. disco, Southern hip hop" : newListType === "track" ? "e.g. Hotline Bling" : "e.g. Drake"}
              style={{ flex: 1, minWidth: 120, fontSize: 12, padding: "8px 10px", borderRadius: 6, border: "1px solid " + theme.accentAlpha(0.3), background: "rgba(0,0,0,0.5)", color: WHITE, outline: "none" }}
            />
          )}
          <button
            onClick={handleAddSessionEntry}
            disabled={!newListValue.trim()}
            title="Applies for this session only — gone when you close or reload"
            style={{ fontSize: 11, padding: "8px 10px", borderRadius: 6, border: "1px solid " + (newListValue.trim() ? theme.accentAlpha(0.4) : "#333"), background: "transparent", color: newListValue.trim() ? theme.accent : "#666", cursor: newListValue.trim() ? "pointer" : "not-allowed", fontWeight: 700, whiteSpace: "nowrap" }}
          >
            + Session
          </button>
          <button
            onClick={handleAddEntry}
            disabled={!newListValue.trim()}
            title="Saved permanently, carries over every time you log in"
            style={{ fontSize: 11, padding: "8px 10px", borderRadius: 6, border: "none", background: newListValue.trim() ? theme.accent : "#333", color: newListValue.trim() ? "#000" : "#888", cursor: newListValue.trim() ? "pointer" : "not-allowed", fontWeight: 700, whiteSpace: "nowrap" }}
          >
            + Permanent
          </button>
        </div>

        <p style={{ fontSize: 10, color: GRAY, margin: "1rem 0 0", lineHeight: 1.5, fontStyle: "italic" }}>
          ⚠ Do Not Play accuracy depends on your library's filename conventions and tags (e.g. "(Dirty)" markers).
          Always preview before playing - this is not a substitute for checking yourself.
        </p>
        <p style={{ fontSize: 10, color: GRAY, margin: "6px 0 0", lineHeight: 1.5, fontStyle: "italic" }}>
          ⚠ The Content (Clean/Dirty) filter checks a real explicit/content tag if your library data has one - but as
          of today, standard CSV exports don't include that field, so in practice it's currently checking whether the
          words "dirty" or "explicit" literally appear in the track's title, nothing else. It doesn't listen to the
          audio or check lyrics. If your library marks explicit tracks a different way (or doesn't mark them at
          all), this filter won't catch them. Accuracy currently depends entirely on your own filename conventions.
        </p>

        {/* "Apply to this session" - real, necessary addition for our
            architecture (piece 7), not in source. His single-component
            app has no server session to push to; see header comment. */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid " + theme.accentAlpha(0.15) }}>
          <button
            onClick={handleApplyToSession}
            disabled={applyStatus === "applying"}
            style={{ fontSize: 12, padding: "8px 14px", borderRadius: 8, border: "1px solid " + theme.accentAlpha(0.4), background: "transparent", color: theme.accent, cursor: applyStatus === "applying" ? "wait" : "pointer", fontWeight: 700 }}
          >
            {applyStatus === "applying" ? "Applying..." : "Apply to this session"}
          </button>{" "}
          {applyStatus === "applied" && <span style={{ color: theme.accent, fontSize: 12 }}>Applied - Crate Cheat will use this now.</span>}
          {applyStatus === "error" && <span style={{ color: "#e03c3c", fontSize: 12 }}>Error: {applyError}</span>}
          <p style={{ fontSize: 10, color: GRAY, margin: "6px 0 0", lineHeight: 1.5 }}>
            Saving above only saves to this computer. This button sends Style Profile and both lists to the active
            session so tonight's Crate Cheat results actually use them - and it's the one action on this screen that
            makes a real AI call, so it only runs when you click it, not on every small edit.
          </p>
        </div>
      </div>
    </PopupOverlay>
  );
}
