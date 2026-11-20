// Phase 5, step 5 piece 11 (shared header/visual port), Stage 1 +
// piece 13 (Settings split, Stage 3).
//
// Ported from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx:
// - the sticky wrapper + header gradient + icon row: lines 5616-5633
// - the tab bar + tabStyle: lines 33 (TABS), 5325 (tabStyle), 5635-5639
// - topIconStyle: lines 5316-5322 (grey/quiet by default, accent +
//   glow pill once active). Source's History icon self-reports status
//   (storageWarning/lastVerifiedSaveRef) regardless of click state -
//   NOT ported here on purpose: our SQLite write either resolves or
//   throws the instant it's called, with no "local vs. unconfirmed
//   remote" distinction to report (same reasoning already recorded for
//   the History icon health indicator, CLAUDE2.md). This icon just
//   opens the popup.
//
// Source hides the WHOLE tab bar while gigMode&&tab===0 (line 5635) -
// ported exactly, same condition, same effect: Gig Mode traps the DJ
// on Track Cheat until they tap Exit. The icon row itself is NEVER
// gated on gigMode in source - confirmed directly, not assumed -
// so it isn't here either.
//
// Piece 13: the style-profile/history/settings-gear icons now open
// three distinct real popups instead of one shared bridge screen.

import wordmarkDark from "../assets/logo/logo-wordmark.png";
import wordmarkLight from "../assets/logo/logo-wordmark-light.png";
import type { DerivedTheme } from "../theme/deriveTheme";

export const TABS = ["Track Cheat", "Playlist Cheat", "Crate Cheat", "Library", "Account"] as const;

interface AppHeaderProps {
  tab: number;
  setTab: (n: number) => void;
  gigMode: boolean;
  theme: DerivedTheme;
  lightMode: boolean;
  alwaysOnTop: boolean;
  onToggleAlwaysOnTop: () => void;
  onToggleLightMode: () => void;
  onOpenStyleProfile: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  // Source lines 5627/5630: topIconStyle(showPrefsPanel) / topIconStyle
  // (showSettings) - these two icons highlight while their own popup is
  // open. History's icon (5628) uses a completely different, health-
  // status-only style with no reference to showHistory at all - it
  // never reflects open/closed in source either, so it isn't wired here.
  isStyleProfileOpen: boolean;
  isSettingsOpen: boolean;
}

function topIconStyle(theme: DerivedTheme, active: boolean): React.CSSProperties {
  return {
    background: active ? theme.accentAlpha(0.15) : "none",
    border: "1px solid " + (active ? theme.accent : theme.accentAlpha(0.25)),
    borderRadius: 8,
    cursor: "pointer",
    color: active ? theme.accent : "#bbb",
    fontSize: 16,
    padding: "6px 8px",
    lineHeight: 1,
    boxShadow: active ? "0 0 8px " + theme.accentAlpha(0.55) : "none",
    transition: "all 0.2s"
  };
}

function tabStyle(theme: DerivedTheme, active: boolean): React.CSSProperties {
  return {
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid " + theme.accent : "2px solid transparent",
    padding: "10px 14px",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: active ? 700 : 400,
    color: active ? theme.accent : "#bbb",
    marginBottom: -1,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    transition: "color 0.15s"
  };
}

export default function AppHeader({
  tab,
  setTab,
  gigMode,
  theme,
  lightMode,
  alwaysOnTop,
  onToggleAlwaysOnTop,
  onToggleLightMode,
  onOpenStyleProfile,
  onOpenHistory,
  onOpenSettings,
  isStyleProfileOpen,
  isSettingsOpen
}: AppHeaderProps): React.JSX.Element {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 50 }}>
      <div
        style={{
          background: "linear-gradient(180deg,#000 0%," + theme.bg + " 100%)",
          borderBottom: "1px solid " + theme.accentAlpha(0.3),
          padding: "1rem 1.5rem 0.75rem",
          boxShadow: "0 4px 20px " + theme.accentAlpha(0.15),
          position: "relative"
        }}
      >
        <div style={{ position: "absolute", top: "50%", right: "1.5rem", transform: "translateY(-60%)", display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={onToggleAlwaysOnTop} title="Always On Top" style={topIconStyle(theme, alwaysOnTop)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a5 5 0 0 0-5 5c0 3 2 4.5 2 7l-3 3h16l-3-3c0-2.5 2-4 2-7a5 5 0 0 0-5-5z" />
              <line x1="12" y1="17" x2="12" y2="22" />
            </svg>
          </button>
          <button onClick={onOpenStyleProfile} title="Style Profile & Play Lists" style={topIconStyle(theme, isStyleProfileOpen)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          </button>
          <button onClick={onOpenHistory} title="Session History" style={topIconStyle(theme, false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
          <button onClick={onToggleLightMode} style={topIconStyle(theme, lightMode)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </button>
          <button onClick={onOpenSettings} title="Settings" style={topIconStyle(theme, isSettingsOpen)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
        <img src={lightMode ? wordmarkLight : wordmarkDark} alt="Cheat Code DJ" style={{ height: 24, display: "block" }} />
      </div>

      {!(gigMode && tab === 0) && (
        <div style={{ display: "flex", justifyContent: "center", gap: 20, borderBottom: "1px solid " + theme.accentAlpha(0.2), background: lightMode ? theme.surfaceBg : theme.bg }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)} style={tabStyle(theme, tab === i)}>
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
