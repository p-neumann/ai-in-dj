// Phase 5, step 5 piece 7 (Settings). Ported verbatim from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx (source lines 415-416) - Mike's
// own fixed color choices, not invented ones.
//
// docs/decisions/0016: the real prototype never actually saves these
// anywhere - accentColor/bgColor/lightMode are plain useState, reset to
// these same defaults on every reload. CLAUDE.md's own Phase 5 goal line
// ("restart keeps permanent prefs, history, theme, window bounds")
// already requires persistence, so this piece adds it - a small, non-
// musical addition against an already-stated requirement, not a new ask.

export const SWATCHES_ACCENT = ["#71e401", "#a78bfa", "#f472b6", "#e03c3c", "#38bdf8", "#f5a623", "#facc15", "#ffffff"];
export const SWATCHES_BG = ["#0a0a0a", "#000814", "#0a1a0a", "#1a0a00", "#1a0020", "#1a0000", "#1a1a1a", "#2a2010"];

export const DEFAULT_ACCENT_COLOR = SWATCHES_ACCENT[0];
export const DEFAULT_BG_COLOR = SWATCHES_BG[0];
export const DEFAULT_LIGHT_MODE = false;

export interface ThemePrefs {
  accentColor: string;
  bgColor: string;
  lightMode: boolean;
}

export const DEFAULT_THEME: ThemePrefs = {
  accentColor: DEFAULT_ACCENT_COLOR,
  bgColor: DEFAULT_BG_COLOR,
  lightMode: DEFAULT_LIGHT_MODE
};

export function parseThemePrefs(raw: string | null): ThemePrefs {
  if (!raw) return DEFAULT_THEME;
  try {
    const parsed = JSON.parse(raw);
    return {
      accentColor: typeof parsed.accentColor === "string" ? parsed.accentColor : DEFAULT_ACCENT_COLOR,
      bgColor: typeof parsed.bgColor === "string" ? parsed.bgColor : DEFAULT_BG_COLOR,
      lightMode: typeof parsed.lightMode === "boolean" ? parsed.lightMode : DEFAULT_LIGHT_MODE
    };
  } catch {
    return DEFAULT_THEME;
  }
}

export function serializeThemePrefs(theme: ThemePrefs): string {
  return JSON.stringify(theme);
}
