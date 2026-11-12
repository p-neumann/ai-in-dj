// Phase 5, step 5 piece 11. One shared source of truth for the SAVED
// theme (not "pending" - that's the Settings popup's own local state
// while a pick is staged, piece 12/13), so the header and every screen
// see a change the instant Settings saves one, instead of each reading
// its own stale copy of the same preference key.

import { useEffect, useState } from "react";
import { DEFAULT_THEME, parseThemePrefs, serializeThemePrefs, type ThemePrefs } from "../settings/theme";

const THEME_KEY = "theme";

export function useSavedTheme(): { theme: ThemePrefs; setTheme: (next: ThemePrefs) => void } {
  const [theme, setThemeState] = useState<ThemePrefs>(DEFAULT_THEME);

  useEffect(() => {
    window.ccdj.prefs.get(THEME_KEY).then((raw) => setThemeState(parseThemePrefs(raw)));
  }, []);

  function setTheme(next: ThemePrefs): void {
    setThemeState(next);
    window.ccdj.prefs.set(THEME_KEY, serializeThemePrefs(next));
  }

  return { theme, setTheme };
}
