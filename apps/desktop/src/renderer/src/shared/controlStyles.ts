// Phase 5, step 5 piece 12 (Stage 2a). Ported verbatim from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx's shared style helpers (source
// lines 5312-5328) - parameterized on `theme` instead of closing over
// component-local `accent`/`bg`/`ia`, since those are now the shared
// DerivedTheme passed as a prop rather than render-scope variables.
// WHITE/GRAY are his own constants (source line 437) - true constants
// regardless of light/dark mode, not part of the theme itself (his
// "light mode" only lightens the page background; cards/rows/text stay
// dark-themed either way - confirmed directly, not assumed).

import type { DerivedTheme } from "../theme/deriveTheme";

export const WHITE = "#fff";
export const GRAY = "#bbb";

export function cardStyle(theme: DerivedTheme): React.CSSProperties {
  return {
    background: theme.lightMode ? theme.surfaceBg : "linear-gradient(135deg," + theme.accentAlpha(0.05) + " 0%,rgba(0,0,0,0.4) 100%)",
    border: "1px solid " + theme.accentAlpha(0.2),
    borderRadius: 12,
    padding: "1.25rem",
    marginBottom: "1rem"
  };
}

export const lblStyle: React.CSSProperties = {
  fontSize: 10,
  color: GRAY,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontWeight: 700,
  display: "block",
  marginBottom: 8
};

export function inputStyle(theme: DerivedTheme): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid " + theme.accentAlpha(0.3),
    background: theme.surfaceBg,
    color: WHITE,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box"
  };
}

export function searchInputStyle(theme: DerivedTheme): React.CSSProperties {
  return {
    width: "100%",
    fontSize: 15,
    padding: "13px 16px 13px 44px",
    borderRadius: 10,
    border: "1px solid " + theme.accentAlpha(0.4),
    background: "rgba(0,0,0,0.6)",
    color: WHITE,
    outline: "none",
    boxSizing: "border-box"
  };
}

export function dropZoneStyle(theme: DerivedTheme, over: boolean): React.CSSProperties {
  return {
    border: "2px dashed " + (over ? theme.accent : theme.accentAlpha(0.3)),
    borderRadius: 16,
    padding: "2rem",
    textAlign: "center",
    background: over ? theme.accentAlpha(0.08) : theme.surfaceBg,
    transition: "all 0.2s",
    cursor: "pointer"
  };
}

export function goBtnStyle(theme: DerivedTheme, disabled: boolean): React.CSSProperties {
  return {
    padding: "0 18px",
    height: 48,
    borderRadius: 10,
    border: disabled ? "1px solid #444" : "none",
    cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? "#2a2a2a" : theme.accent,
    color: disabled ? "#888" : theme.bg,
    fontSize: 13,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    transition: "all 0.15s"
  };
}

export function buildBtnStyle(theme: DerivedTheme, disabled: boolean): React.CSSProperties {
  return {
    fontSize: 13,
    fontWeight: 700,
    padding: "10px 28px",
    background: disabled ? "#2a2a2a" : theme.accent,
    color: disabled ? "#888" : theme.bg,
    border: disabled ? "1px solid #444" : "none",
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    transition: "all 0.15s"
  };
}

export function sizeBtnStyle(theme: DerivedTheme, active: boolean): React.CSSProperties {
  return {
    fontSize: 13,
    fontWeight: active ? 700 : 400,
    padding: "6px 16px",
    background: active ? theme.accent : "transparent",
    color: active ? theme.bg : GRAY,
    border: "1px solid " + (active ? theme.accent : theme.ia(0.4)),
    borderRadius: 6,
    cursor: "pointer",
    transition: "all 0.15s"
  };
}

export const bpmBorder = (theme: DerivedTheme): string => "1px solid " + theme.accent;

// Source line 5311 (smBtn) - the small outlined button used for Clear
// Library, Select All, Export Crate, etc. `danger` is his dark-red
// variant (Clear Library uses smBtn(true)).
export function smBtnStyle(theme: DerivedTheme, danger = false): React.CSSProperties {
  return {
    fontSize: 12,
    padding: "6px 14px",
    background: "transparent",
    border: "1px solid " + (danger ? "#5a2a2a" : theme.accentAlpha(0.3)),
    borderRadius: 8,
    color: danger ? "#a44" : theme.accent,
    cursor: "pointer",
    letterSpacing: "0.04em"
  };
}

// Source line 5331 - the gradient-sweep text used for "Finding What
// Plays Next," animated via GlobalAccentStyle's injected .glow-sweep
// keyframes (piece 12).
export function glowSweepStyle(theme: DerivedTheme): React.CSSProperties {
  return {
    backgroundImage: "linear-gradient(90deg," + theme.accentAlpha(0.3) + " 0%," + theme.accent + " 40%,#fff 50%," + theme.accent + " 60%," + theme.accentAlpha(0.3) + " 100%)",
    backgroundSize: "200% auto",
    animation: "glowSweep 2s linear infinite",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase"
  } as React.CSSProperties;
}
