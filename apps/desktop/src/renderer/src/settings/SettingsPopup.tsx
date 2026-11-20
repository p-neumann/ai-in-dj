// Phase 5, step 5 piece 13 (Settings split, Stage 3). Ported from
// reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx lines 5592-5606
// (render), 1906-1909 (openSettings/saveSettings/cancelSettings/
// settingsChanged), 1886-1887 (the live-preview formula).
//
// His own trick, confirmed by reading the code rather than assumed:
// while this popup is open, EVERY themed pixel in the whole app shows
// the PENDING color, not just this popup (line 1886: accent = showSettings
// ? pendingAccent : accentColor). Cancel/backdrop-click just closes -
// nothing commits, so the preview reverts instantly because that same
// formula falls back to accentColor the moment the popup is gone. This
// is why pendingAccent/pendingBg live in App.tsx now (same reason
// sharedSession/trackCheatWork do, docs/decisions/0020/0021) - a value
// that needs to affect rendering OUTSIDE this component can't be local
// state here.
//
// Panel chrome (source 5592-5594): backdrop 0.4 (lighter than History/
// Style Profile's 0.5 - his own deliberate difference, not ported as
// one flat value), zIndex 100, click-outside closes via cancel (reverts
// pending, same as the x/nothing-committed path), border uses the
// PENDING accent's own alpha, not the saved theme's - width 420,
// maxWidth 90vw, maxHeight 85vh, overflowY auto (single scroll, not the
// flex-column + inner-scroll shape History/Style Profile use), padding
// 1.5rem.
//
// Referral section (source 5600-5603): real layout/wording, wrapped in
// PhasePlaceholder per Ranjish's explicit instruction - looks exactly
// like his, says "coming in Phase 6" on click, same pattern as the
// Spotify box (PlaylistCheatScreen) and the Sign In card (AccountTab).

import { useState } from "react";
import { makeAlpha } from "../theme/colorUtils";
import { SWATCHES_ACCENT, SWATCHES_BG } from "./theme";
import PopupOverlay from "../shared/PopupOverlay";
import PhasePlaceholder from "../shared/PhasePlaceholder";
import { sectionLblStyle, WHITE, GRAY } from "../shared/controlStyles";

// Deliberately not the full ThemePrefs - lightMode is never part of
// source's pending/staged mechanism (App.tsx's own comment explains
// why). Only accent/bg are ever staged.
type PendingAccentBg = { accentColor: string; bgColor: string };

interface SettingsPopupProps {
  savedTheme: PendingAccentBg;
  pendingTheme: PendingAccentBg;
  updatePendingTheme: (patch: Partial<PendingAccentBg>) => void;
  onSave: () => void;
  onCancel: () => void;
}

// Source's referralCode (line 1241) - a real-looking random code, same
// shape as his, since the box isn't blank even though it's inert. Fresh
// per mount (which is fine - this popup only exists while open).
function makeReferralCode(): string {
  return "CHEAT-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function SettingsPopup({ savedTheme, pendingTheme, updatePendingTheme, onSave, onCancel }: SettingsPopupProps): React.JSX.Element {
  const [referralCode] = useState(makeReferralCode);
  const [refCopied, setRefCopied] = useState(false);
  const pendingAlpha = makeAlpha(pendingTheme.accentColor);
  const settingsChanged = pendingTheme.accentColor !== savedTheme.accentColor || pendingTheme.bgColor !== savedTheme.bgColor;

  return (
    <PopupOverlay
      backdropOpacity={0.4}
      zIndex={100}
      onBackdropClick={onCancel}
      panelStyle={{ border: "1px solid " + pendingAlpha(0.3), padding: "1.5rem", width: 420, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: WHITE, letterSpacing: "0.1em", textTransform: "uppercase" }}>Settings</span>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: GRAY, fontSize: 20, cursor: "pointer" }}>
          ×
        </button>
      </div>

      <p style={sectionLblStyle}>Theme</p>
      <p style={{ fontSize: 12, color: GRAY, margin: "0 0 8px" }}>Highlight Color</p>
      <SwatchRow swatches={SWATCHES_ACCENT} value={pendingTheme.accentColor} onChange={(c) => updatePendingTheme({ accentColor: c })} />
      <p style={{ fontSize: 12, color: GRAY, margin: "0 0 8px" }}>Background Color</p>
      <SwatchRow swatches={SWATCHES_BG} value={pendingTheme.bgColor} onChange={(c) => updatePendingTheme({ bgColor: c })} />
      <button
        onClick={onSave}
        disabled={!settingsChanged}
        style={{
          width: "100%",
          padding: 11,
          borderRadius: 8,
          border: settingsChanged ? "none" : "1px solid #444",
          cursor: settingsChanged ? "pointer" : "not-allowed",
          background: settingsChanged ? pendingTheme.accentColor : "#2a2a2a",
          color: settingsChanged ? "#000" : "#888",
          fontSize: 13,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginTop: 4,
          marginBottom: "1.5rem"
        }}
      >
        Save Theme
      </button>

      <p style={sectionLblStyle}>Referral Program</p>
      <PhasePlaceholder phase={6} message="Real referrals are coming in Phase 6">
        <p style={{ fontSize: 12, color: GRAY, margin: "0 0 12px", lineHeight: 1.5 }}>
          Share your code. When a friend subscribes, you get 30 days free.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid " + pendingAlpha(0.3),
              background: "rgba(0,0,0,0.4)",
              fontFamily: "monospace",
              fontSize: 15,
              fontWeight: 700,
              color: pendingTheme.accentColor,
              letterSpacing: "0.1em"
            }}
          >
            {referralCode}
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(referralCode);
              setRefCopied(true);
              setTimeout(() => setRefCopied(false), 2000);
            }}
            style={{ padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer", background: pendingTheme.accentColor, color: "#000", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}
          >
            {refCopied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p style={{ fontSize: 11, color: GRAY, margin: "8px 0 0" }}>Friend Gets 14 Days Free · You Get 30 Days Free After They Subscribe</p>
      </PhasePlaceholder>
    </PopupOverlay>
  );
}

// Source's SwatchRow (line 1006) - the fixed swatches plus the custom
// conic-gradient picker (piece 19), reused verbatim here rather than
// rebuilt, since the old SettingsScreen.tsx already had this exactly
// right.
function SwatchRow({ swatches, value, onChange }: { swatches: string[]; value: string; onChange: (c: string) => void }): React.JSX.Element {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
      {swatches.map((c) => (
        <div
          key={c}
          onClick={() => onChange(c)}
          title={c}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: c,
            cursor: "pointer",
            border: "2px solid " + (value === c ? "#fff" : "#333"),
            boxSizing: "border-box",
            flexShrink: 0
          }}
        />
      ))}
      <CustomColorSwatch value={value} onChange={onChange} />
    </div>
  );
}

// Source's SwatchRow (line 1006), custom-color half (piece 19): a
// conic-gradient circle with a real, invisible <input type="color">
// overlaid - clicking opens the OS color picker, any color, not just
// the 8 presets.
function CustomColorSwatch({ value, onChange }: { value: string; onChange: (c: string) => void }): React.JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: 32, height: 32, flexShrink: 0 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)",
            cursor: "pointer",
            border: "2px solid transparent",
            boxSizing: "border-box"
          }}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%", borderRadius: "50%" }}
        />
      </div>
      <span style={{ fontSize: 11, color: "#bbb", whiteSpace: "nowrap" }}>Custom</span>
    </div>
  );
}
