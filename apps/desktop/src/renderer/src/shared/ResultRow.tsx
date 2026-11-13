// Phase 5, step 5 piece 12 (Stage 2a). Ported from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx's ResultRow (933) and ResHeader
// (5333).
//
// Two deliberate differences from his version, both because the real
// feature behind his styling doesn't exist yet in this port - not
// because the styling itself was approximated:
// - Not `draggable` here. His row is draggable so dragging it OUT is
//   itself the daisy-chain/outward-drag signal (R7, Phase 8's real OS
//   drag, and the still-unbuilt Phase 5 drop-back-in). Making this row
//   draggable with no real drag target behind it would be exactly the
//   "looks live, does nothing" problem - so this keeps the explicit
//   "Daisy-chain" button our port already has instead, styled quietly
//   rather than invisibly replaced by a drag gesture that doesn't work.
// - The crossover/native camp badge always uses his own FALLBACK text
//   ("other genre" / "Other Genre") rather than a real crossoverGenre
//   value - our backend's TrackCheatResult shape doesn't expose that
//   field to the renderer today. This is still a real path through his
//   own code (what he shows when his own crossoverGenre is falsy), not
//   an invented substitute.
// 👍 now also calls onLikeAsSeed (piece 17, 2026-11-13) - his own
// button does both unconditionally, every click, confirmed verbatim
// (source line 951): `handleVote(t.name,"up");if(handleLikeAsSeed)
// handleLikeAsSeed(t.name);` - no special-casing for "only when
// turning the vote ON." Clicking 👍 a second time to un-vote still
// re-triggers the reseed, same as his. Ported that exactly, not
// smoothed over.

import { WHITE, GRAY, bpmBorder } from "./controlStyles";
import KeyPill from "./KeyPill";
import SortHeader from "./SortHeader";
import { getArtistTitle } from "./getArtistTitle";
import type { SortField, SortDir } from "./sortResults";
import type { DerivedTheme } from "../theme/deriveTheme";

export interface ResultRowTrack {
  trackId: number;
  name: string;
  bpm: number;
  key: string;
  camp: string | null;
  lane: string | null;
}

function voteBtnStyle(theme: DerivedTheme, active: boolean, type: "up" | "down"): React.CSSProperties {
  const color = type === "up" ? theme.accent : "#c0392b";
  return {
    fontSize: 13,
    padding: "4px 8px",
    background: "transparent",
    border: "2px solid " + (active ? color : "#333"),
    borderRadius: 6,
    cursor: "pointer",
    color: active ? color : "#444",
    transition: "all 0.15s",
    lineHeight: 1,
    flexShrink: 0,
    fontWeight: active ? 700 : 400
  };
}

function campBadge(t: ResultRowTrack, accent: string): { label: string; color: string } | null {
  if (t.camp === "bridge") return { label: "🌉 Bridge", color: "#facc15" };
  if (t.camp === "new") return { label: "↳ New Vibe", color: accent };
  if (t.lane === "crossover") return { label: "🔀 Crossover — other genre", color: "#facc15" };
  if (t.lane === "native") return { label: "🌍 Other Genre", color: "#e879f9" };
  return null;
}

export interface ResultRowProps {
  t: ResultRowTrack;
  vote: "up" | "down" | null;
  theme: DerivedTheme;
  rowBg: string;
  disabled: boolean;
  onVote: (trackId: number, value: "up" | "down") => void;
  onDaisyChain: (trackId: number) => void;
  onLikeAsSeed: (trackId: number) => void;
}

export function ResultRow({ t, vote, theme, rowBg, disabled, onVote, onDaisyChain, onLikeAsSeed }: ResultRowProps): React.JSX.Element {
  const at = getArtistTitle(t.name);
  const badge = campBadge(t, theme.accent);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: rowBg,
        borderBottom: "1px solid " + theme.borderCol,
        opacity: vote === "down" ? 0.3 : 1
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {badge && (
          <span style={{ fontSize: 9, fontWeight: 700, color: badge.color, letterSpacing: "0.04em", display: "block", marginBottom: 2 }}>
            {badge.label}
          </span>
        )}
        {at.artist && (
          <p style={{ margin: "0 0 1px", fontSize: 11, color: GRAY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {at.artist}
          </p>
        )}
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: WHITE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
        <button
          onClick={() => {
            onVote(t.trackId, "up");
            onLikeAsSeed(t.trackId);
          }}
          disabled={disabled}
          style={voteBtnStyle(theme, vote === "up", "up")}
        >
          👍
        </button>
        <button onClick={() => onVote(t.trackId, "down")} disabled={disabled} style={voteBtnStyle(theme, vote === "down", "down")}>
          👎
        </button>
        <button
          onClick={() => onDaisyChain(t.trackId)}
          disabled={disabled}
          title="Use as new seed"
          style={{ fontSize: 11, padding: "4px 8px", background: "transparent", border: "1px solid " + theme.accentAlpha(0.3), borderRadius: 6, color: theme.accent, cursor: "pointer" }}
        >
          ⛓
        </button>
      </div>
    </div>
  );
}

export interface ResHeaderProps {
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  theme: DerivedTheme;
}

export function ResHeader({ sortField, sortDir, onSort, theme }: ResHeaderProps): React.JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "4px 14px", background: "rgba(0,0,0,0.5)", borderBottom: "1px solid " + theme.accentAlpha(0.15), gap: 10 }}>
      <div style={{ flex: 1 }}>
        <SortHeader field="name" label="Artist / Title" sortField={sortField} sortDir={sortDir} onSort={onSort} accent={theme.accent} />
      </div>
      <SortHeader field="bpm" label="BPM" sortField={sortField} sortDir={sortDir} onSort={onSort} accent={theme.accent} />
      <SortHeader field="key" label="Key" sortField={sortField} sortDir={sortDir} onSort={onSort} accent={theme.accent} />
      <div style={{ width: 80, flexShrink: 0 }} />
    </div>
  );
}

// Source: CrateHeader (line 5334) - identical to ResHeader but with a
// 20px spacer before the sort headers, for the checkbox column
// CheckboxTrackRow has and ResultRow doesn't. Used by both Crate Cheat
// and Playlist Cheat's results list, not just "crates".
export function CheckboxListHeader({ sortField, sortDir, onSort, theme }: ResHeaderProps): React.JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "4px 14px", background: "rgba(0,0,0,0.5)", borderBottom: "1px solid " + theme.accentAlpha(0.15), gap: 10 }}>
      <div style={{ width: 20, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <SortHeader field="name" label="Artist / Title" sortField={sortField} sortDir={sortDir} onSort={onSort} accent={theme.accent} />
      </div>
      <SortHeader field="bpm" label="BPM" sortField={sortField} sortDir={sortDir} onSort={onSort} accent={theme.accent} />
      <SortHeader field="key" label="Key" sortField={sortField} sortDir={sortDir} onSort={onSort} accent={theme.accent} />
    </div>
  );
}
