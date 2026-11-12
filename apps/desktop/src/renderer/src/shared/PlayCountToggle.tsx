// Phase 5, step 5 piece 12 (Stage 2a). Ported verbatim from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx's PlayCountToggle (source line
// 901) - three radio pills, not a dropdown. Confirmed real call sites:
// exactly 2 in the source, both on Track Cheat (gig + normal) - his own
// comment claims this is "shared across Track Cheat and Crate Cheat,"
// which his code doesn't actually do (CLAUDE2.md's decisions table).
// This component is still built once here and reused (restyled into
// Crate Cheat's own, independent playCountMode state) in Stage 2b.

import { WHITE, GRAY } from "./controlStyles";

const OPTIONS = [
  { val: "familiar", label: "High Play Count" },
  { val: "mix", label: "Mix" },
  { val: "deep", label: "Low Play Count" }
] as const;

export interface PlayCountToggleProps {
  mode: string;
  setMode: (next: string) => void;
  accent: string;
  ia: (a: number) => string;
}

export default function PlayCountToggle({ mode, setMode, accent, ia }: PlayCountToggleProps): React.JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: "1rem", flexWrap: "wrap" }}>
      {OPTIONS.map((o) => {
        const active = mode === o.val;
        return (
          <div key={o.val} onClick={() => setMode(o.val)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "2px solid " + (active ? accent : ia(0.5)),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxSizing: "border-box"
              }}
            >
              {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: accent }} />}
            </div>
            <span style={{ fontSize: 12, color: active ? WHITE : GRAY, fontWeight: active ? 700 : 400 }}>{o.label}</span>
          </div>
        );
      })}
    </div>
  );
}
