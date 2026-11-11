// Phase 5, step 5 piece 11. Ported verbatim from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx (source lines 1886-1897) - the
// exact formulas the header, tab bar, and every screen's colors derive
// from. Deliberately split from the real theme's SAVED value: the
// source computes `bg`/`accent` from `showSettings?pendingAccent:...`
// while the Settings popup is open (so the popup live-previews an
// unsaved pick), but every OTHER screen - including this header - only
// ever sees the SAVED value. That "pending vs. saved" split belongs to
// the Settings popup itself (piece 12/13), not here.

import { darkenHex, makeAlpha } from "./colorUtils.ts";
import type { ThemePrefs } from "../settings/theme.ts";

export interface DerivedTheme {
  accent: string;
  bg: string;
  ruleColor: string;
  accentAlpha: (a: number) => string;
  ia: (a: number) => string;
  rowEven: string;
  rowOdd: string;
  borderCol: string;
  surfaceBg: string;
  textGray: string;
  sliderLabelColor: string;
}

const GRAY = "#bbb";

export function deriveTheme(theme: ThemePrefs): DerivedTheme {
  const accent = theme.accentColor;
  const bg = theme.lightMode ? "#f0f0f0" : theme.bgColor;
  const ruleColor = theme.lightMode ? darkenHex(accent, 0.35) : accent;
  return {
    accent,
    bg,
    ruleColor,
    accentAlpha: makeAlpha(accent),
    ia: makeAlpha(ruleColor),
    rowEven: theme.lightMode ? "#2a2a2a" : "rgba(0,0,0,0.3)",
    rowOdd: theme.lightMode ? "#222222" : "rgba(113,228,1,0.04)",
    borderCol: theme.lightMode ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)",
    surfaceBg: theme.lightMode ? "#2a2a2a" : "rgba(0,0,0,0.6)",
    textGray: theme.lightMode ? "#555" : GRAY,
    sliderLabelColor: theme.lightMode ? "#444" : GRAY
  };
}
