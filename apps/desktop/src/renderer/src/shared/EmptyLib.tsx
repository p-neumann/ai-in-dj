// Phase 5, step 5 piece 12 (completing Track Cheat before Stage 2b).
// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source line 5335) - shown in place of the whole tab body on Track
// Cheat, Crate Cheat, and Playlist Cheat whenever the library is empty
// (`{!library.length?<EmptyLib/>:(...)}`). Built here, in `shared/`,
// since all three screens need it - Stage 2b (Crate Cheat/Playlist
// Cheat) reuses this same component rather than rebuilding it.

import { WHITE, GRAY } from "./controlStyles";
import type { DerivedTheme } from "../theme/deriveTheme";

export default function EmptyLib({ theme, onGoToLibrary }: { theme: DerivedTheme; onGoToLibrary: () => void }): React.JSX.Element {
  return (
    <div style={{ textAlign: "center", padding: "4rem 2rem", borderRadius: 12, background: "#2a2a2a", border: "1px solid " + theme.accentAlpha(0.25) }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
      <p style={{ fontSize: 16, fontWeight: 700, color: WHITE, margin: "0 0 8px" }}>No Library Loaded</p>
      <p style={{ fontSize: 13, color: GRAY, margin: "0 0 1.5rem", lineHeight: 1.5 }}>Import your DJ library before continuing.</p>
      <button
        onClick={onGoToLibrary}
        style={{ padding: "10px 24px", borderRadius: 8, border: "none", cursor: "pointer", background: theme.accent, color: "#000", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}
      >
        Go To Library →
      </button>
    </div>
  );
}
