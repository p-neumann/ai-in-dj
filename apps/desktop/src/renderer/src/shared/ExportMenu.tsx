// Phase 5, step 5 piece 14 (Stage 2b, export menu fix, 2026-11-12).
// Ported from the source's Export Crate dropdown body (lines 5869/5927,
// identical markup both places) - replaces the stripped 4-format menu
// both Crate Cheat and Playlist Cheat shipped with in Stage 2b's first
// pass. One shared component since his own menu is identical on both
// screens; only the handlers it's wired to differ per screen.
//
// Real (ready:true) entries call onExportFile/onCopy, the same real
// export plumbing both screens already had. Unready DJ-software entries
// call onUnavailable(opt.label) instead of alert() - his own inline
// alert() is a blocking native dialog this port doesn't use anywhere
// else; onUnavailable lets each screen show the message the same way
// it already shows export status (CrateCheatScreen/PlaylistCheatScreen's
// own exportMessage line), not a different interaction pattern just for
// this one case.

import { WHITE, GRAY } from "./controlStyles";
import { EXPORT_OPTIONS } from "./exportOptions";
import type { DerivedTheme } from "../theme/deriveTheme";

export type ReadyExportFormat = "csv" | "m3u" | "json" | "txt";

export interface ExportMenuProps {
  theme: DerivedTheme;
  busy: boolean;
  onExportFile: (format: ReadyExportFormat) => void;
  onCopy: () => void;
  onUnavailable: (label: string) => void;
}

export default function ExportMenu({ theme, busy, onExportFile, onCopy, onUnavailable }: ExportMenuProps): React.JSX.Element {
  return (
    <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#0d0d0d", border: "1px solid " + theme.accentAlpha(0.3), borderRadius: 12, padding: "0.5rem", zIndex: 50, width: 280, boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
      {EXPORT_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          disabled={busy}
          onClick={() => {
            if (!opt.ready) {
              onUnavailable(opt.label);
              return;
            }
            if (opt.id === "copy") {
              onCopy();
              return;
            }
            onExportFile(opt.id as ReadyExportFormat);
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = theme.accentAlpha(0.08);
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "transparent", border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left" }}
        >
          <span style={{ fontSize: 18, flexShrink: 0 }}>{opt.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: WHITE }}>{opt.label}</p>
              {!opt.ready && (
                <span style={{ fontSize: 9, color: theme.accent, border: "1px solid " + theme.accentAlpha(0.4), borderRadius: 4, padding: "1px 5px", letterSpacing: "0.06em", fontWeight: 700 }}>
                  Desktop
                </span>
              )}
            </div>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: GRAY }}>{opt.note}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
