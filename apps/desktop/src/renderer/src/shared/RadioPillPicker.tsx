// Phase 5, step 5 piece 13 (Stage 2b). Ported verbatim from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx's SpotifyResultPicker (line
// 1004) - a vertical list of bordered rows with a circular radio dot,
// a bold label, and an italic description. Genuinely different shape
// from both PlayCountToggle's plain dot+label and the size buttons
// (`sizeBtnStyle`) - three distinct control styles in his app, not one
// pattern reused three ways. Generalized here (his version was
// Spotify-result-count-specific) since Playlist Cheat's "Results Per
// Track" is the only real usage today, but the shape itself isn't
// tied to Spotify.

import { WHITE } from "./controlStyles";
import type { DerivedTheme } from "../theme/deriveTheme";

export interface RadioPillOption {
  value: number;
  label: string;
  desc: string;
}

export interface RadioPillPickerProps {
  options: readonly RadioPillOption[];
  value: number;
  onChange: (next: number) => void;
  theme: DerivedTheme;
  disabled?: boolean;
}

export default function RadioPillPicker({ options, value, onChange, theme, disabled }: RadioPillPickerProps): React.JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
      {options.map((opt) => {
        const isActive = value === opt.value && !disabled;
        return (
          <div
            key={opt.value}
            onClick={() => !disabled && onChange(opt.value)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid " + (isActive ? theme.accent : theme.ia(0.4)),
              background: isActive ? theme.ia(0.08) : "transparent",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.35 : 1,
              transition: "all 0.15s"
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: "2px solid " + (isActive ? theme.accent : theme.ia(0.5)),
                background: isActive ? theme.accent : "transparent",
                flexShrink: 0
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? theme.accent : WHITE }}>{opt.label}</span>
            <span style={{ fontSize: 12, color: WHITE, fontStyle: "italic" }}>{opt.desc}</span>
          </div>
        );
      })}
    </div>
  );
}
