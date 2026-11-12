// Phase 5, step 5 piece 12 (Stage 2a). Ported verbatim from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx's rule-line section header -
// confirmed byte-identical across all 7 real usages ("Drop A Track",
// both crate-building headers, "Import Library", "Library
// Enrichment", "Library Management", "Your Library"), only the label
// text ever changes (e.g. source line 5776). Not his "Duplicate
// Finder" card title, which is a different, plain style - don't use
// this for that.

import type { DerivedTheme } from "../theme/deriveTheme";

export default function SectionRule({ theme, children }: { theme: DerivedTheme; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "0.75rem" }}>
      <div style={{ flex: 1, height: 1, background: theme.ia(0.6) }} />
      <span style={{ fontSize: 11, color: theme.textGray, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: theme.ia(0.6) }} />
    </div>
  );
}
