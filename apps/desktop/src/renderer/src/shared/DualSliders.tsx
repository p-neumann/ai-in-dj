// Phase 5, step 5 piece 12 (Stage 2a). Ported verbatim from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx's LabelBox (892), SliderRow
// (893), and DualSliders (897) - his real Energy (±16) and Vibe (±8)
// sliders. Confirmed end-labels, not guessed: Energy's are the literal
// strings "-16"/"+16"; Vibe's are the literal strings "Genre Lock"/
// "Flip Genre". The native thumb is hidden (GlobalAccentStyle, piece
// 12) so this can draw its own track/tick underneath; a click anywhere
// on the track jumps the value to that position (handleTrackClick),
// not just drag.

import { GRAY } from "./controlStyles";
import { VIBE_LABELS, type VibeLabel } from "../trackCheat/vibeLabels";

interface LabelBoxProps {
  accent: string;
  grayColor: string;
  line1: string | null;
  line2: string | null;
}

function LabelBox({ accent, grayColor, line1, line2 }: LabelBoxProps): React.JSX.Element {
  return (
    <div style={{ height: 36, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", marginBottom: 2 }}>
      <p style={{ textAlign: "center", fontSize: 11, fontFamily: "Arial,sans-serif", fontWeight: 700, color: line1 ? accent : "transparent", margin: 0, whiteSpace: "nowrap", lineHeight: 1.3 }}>
        {line1 || "."}
      </p>
      <p
        style={{
          textAlign: "center",
          fontSize: 11,
          fontFamily: "Arial,sans-serif",
          fontWeight: 400,
          color: line2 ? grayColor : "transparent",
          margin: "1px 0 0",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
          lineHeight: 1.3
        }}
      >
        {line2 || "."}
      </p>
    </div>
  );
}

interface SliderRowProps {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  leftLabel: string;
  rightLabel: string;
  line1: string | null;
  line2: string | null;
  accent: string;
  ia: (a: number) => string;
  grayColor: string;
}

function SliderRow({ value, min, max, onChange, leftLabel, rightLabel, line1, line2, accent, ia, grayColor }: SliderRowProps): React.JSX.Element {
  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    let pct = (e.clientX - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));
    onChange(Math.round(min + pct * (max - min)));
  }

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <LabelBox accent={accent} line1={line1} line2={line2} grayColor={grayColor} />
      <div style={{ position: "relative", padding: "8px 0" }}>
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, background: ia(0.35), borderRadius: 2, transform: "translateY(-50%)" }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", width: 1, height: 10, background: ia(0.6), transform: "translateY(-50%)" }} />
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          onClick={handleTrackClick}
          style={{ width: "100%", appearance: "none", WebkitAppearance: "none", background: "transparent", cursor: "pointer", position: "relative", zIndex: 1, margin: 0, padding: 0, height: 20 }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: 11, fontFamily: "Arial,sans-serif", color: grayColor, fontWeight: 600 }}>{leftLabel}</span>
        <span style={{ fontSize: 11, fontFamily: "Arial,sans-serif", color: grayColor, fontWeight: 600 }}>{rightLabel}</span>
      </div>
    </div>
  );
}

export interface DualSlidersProps {
  energyOffset: number;
  setEnergyOffset: (next: number) => void;
  vibeOffset: number;
  setVibeOffset: (next: number) => void;
  accent: string;
  ia: (a: number) => string;
  sliderLabelColor: string;
}

export default function DualSliders({ energyOffset, setEnergyOffset, vibeOffset, setVibeOffset, accent, ia, sliderLabelColor }: DualSlidersProps): React.JSX.Element {
  const energyLine1 = energyOffset === 0 ? null : energyOffset > 0 ? "Build It Up" : "Bring It Down";
  const energyLine2 = energyOffset === 0 ? null : (energyOffset > 0 ? "+" : "") + energyOffset;
  const vibeEntry: VibeLabel = VIBE_LABELS[String(vibeOffset)] ?? null;

  return (
    <div style={{ display: "flex", gap: 16, marginBottom: "1rem", alignItems: "flex-start" }}>
      <SliderRow
        value={energyOffset}
        min={-16}
        max={16}
        onChange={setEnergyOffset}
        leftLabel="-16"
        rightLabel="+16"
        line1={energyLine1}
        line2={energyLine2}
        accent={accent}
        ia={ia}
        grayColor={sliderLabelColor || GRAY}
      />
      <div style={{ width: 1, background: ia(0.3), alignSelf: "stretch", marginTop: 38 }} />
      <SliderRow
        value={vibeOffset}
        min={-8}
        max={8}
        onChange={setVibeOffset}
        leftLabel="Genre Lock"
        rightLabel="Flip Genre"
        line1={vibeEntry ? vibeEntry[0] : null}
        line2={vibeEntry ? vibeEntry[1] : null}
        accent={accent}
        ia={ia}
        grayColor={sliderLabelColor || GRAY}
      />
    </div>
  );
}
