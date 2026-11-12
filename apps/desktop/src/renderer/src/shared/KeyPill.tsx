// Phase 5, step 5 piece 12 (Stage 2a). Ported verbatim from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx's KeyPill (source line 925) -
// used identically by Track Cheat results, the seed card, Crate Cheat
// rows, and Library rows. A missing key renders an invisible
// same-size placeholder (not nothing) so BPM pills in a results list
// still line up vertically - his own choice, ported exactly.

import { GRAY } from "./controlStyles";
import { CAMELOT_COLORS, normalizeKey } from "./camelotColors";

export default function KeyPill({ keyVal }: { keyVal: string | null | undefined }): React.JSX.Element {
  if (!keyVal) {
    return (
      <span
        style={{
          fontSize: 11,
          padding: "3px 4px",
          borderRadius: 6,
          fontWeight: 600,
          flexShrink: 0,
          display: "inline-block",
          width: 34,
          textAlign: "center",
          boxSizing: "border-box",
          visibility: "hidden"
        }}
      >
        &nbsp;
      </span>
    );
  }
  const normalized = normalizeKey(keyVal);
  const camelotColor = CAMELOT_COLORS[normalized];
  return (
    <span
      style={{
        fontSize: 11,
        color: camelotColor || GRAY,
        background: "rgba(255,255,255,0.08)",
        padding: "3px 4px",
        borderRadius: 6,
        fontWeight: 600,
        flexShrink: 0,
        display: "inline-block",
        width: 34,
        textAlign: "center",
        boxSizing: "border-box",
        border: camelotColor ? "1px solid " + camelotColor + "44" : "none"
      }}
    >
      {keyVal}
    </span>
  );
}
