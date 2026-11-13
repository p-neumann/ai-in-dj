// Phase 5, step 5 piece 13 (Stage 2b). Ported from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx's CrateRow (954) and
// PlaylistMatchRow (973) - 95% identical, unified into one component
// with the two confirmed real differences as props rather than
// silently picked one way: PlaylistMatchRow is indented under its own
// song header (`indent`) and dims to a different opacity when
// unselected (0.45 vs CrateRow's 0.35, `dimOpacity`) - not a typo,
// his own two values really differ.
//
// Not `draggable` here - his rows are (dragging out to Serato), but
// that's a real, separate decision pending (CLAUDE2.md): the native
// handoff needs Electron's webContents.startDrag from the main
// process, confirmed NOT Serato-specific, genuinely buildable in
// Phase 5 - just not decided yet whether this piece builds it.

import { WHITE, GRAY, bpmBorder } from "./controlStyles";
import KeyPill from "./KeyPill";
import { getArtistTitle } from "./getArtistTitle";
import type { DerivedTheme } from "../theme/deriveTheme";

export interface CheckboxTrackRowTrack {
  name: string;
  bpm: number;
  key: string;
}

export interface CheckboxTrackRowProps {
  t: CheckboxTrackRowTrack;
  isSelected: boolean;
  theme: DerivedTheme;
  rowBg: string;
  onToggle: () => void;
  indent?: boolean;
  dimOpacity?: number;
}

export default function CheckboxTrackRow({ t, isSelected, theme, rowBg, onToggle, indent, dimOpacity = 0.35 }: CheckboxTrackRowProps): React.JSX.Element {
  const at = getArtistTitle(t.name);
  return (
    <div
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        paddingLeft: indent ? 28 : 14,
        background: rowBg,
        borderBottom: "1px solid " + theme.borderCol,
        cursor: "pointer",
        opacity: isSelected ? 1 : dimOpacity
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: "1px solid " + (isSelected ? theme.accent : "#333"),
          background: isSelected ? theme.accent : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 3
        }}
      >
        {isSelected && <span style={{ fontSize: 10, color: theme.bg, fontWeight: 700 }}>✓</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {at.artist && (
          <p style={{ margin: "0 0 1px", fontSize: indent ? 10 : 11, color: GRAY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {at.artist}
          </p>
        )}
        <p style={{ margin: "0 0 1px", fontSize: 13, fontWeight: 600, color: WHITE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {at.title}
        </p>
      </div>
      <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
        {t.bpm ? (
          <span style={{ fontSize: 11, color: WHITE, background: "rgba(0,0,0,0.5)", padding: "3px 4px", borderRadius: 6, border: bpmBorder(theme), fontWeight: 600, flexShrink: 0, width: 34, textAlign: "center", boxSizing: "border-box", display: "inline-block" }}>
            {Math.round(t.bpm)}
          </span>
        ) : (
          <span style={{ fontSize: 11, padding: "3px 4px", borderRadius: 6, border: bpmBorder(theme), fontWeight: 600, flexShrink: 0, width: 34, textAlign: "center", boxSizing: "border-box", display: "inline-block", visibility: "hidden" }}>
            &nbsp;
          </span>
        )}
        <KeyPill keyVal={t.key} />
      </div>
    </div>
  );
}
