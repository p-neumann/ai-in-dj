// Phase 5, step 5 piece 12 (Stage 2a). Ported verbatim from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx's SortHeader (source line 923).
// Default sort direction is deliberately "none" (the ⬍ glyph) - his
// own 8/17 fix comment: equally-strong matches aren't meant to look
// pre-ranked until the DJ actually asks for a sort.

import { GRAY } from "./controlStyles";
import type { SortField, SortDir } from "./sortResults";

export interface SortHeaderProps {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  accent: string;
}

export default function SortHeader({ field, label, sortField, sortDir, onSort, accent }: SortHeaderProps): React.JSX.Element {
  const active = sortField === field;
  return (
    <button
      onClick={() => onSort(field)}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: 10,
        fontWeight: 700,
        color: active ? accent : GRAY,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "4px 6px",
        display: "flex",
        alignItems: "center",
        gap: 3
      }}
    >
      {label}
      <span style={{ fontSize: 8 }}>{active ? (sortDir === "asc" ? "▲" : "▼") : "⬍"}</span>
    </button>
  );
}
