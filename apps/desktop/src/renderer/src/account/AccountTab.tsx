// Phase 5, step 5 piece 11 (shared header/visual port), Stage 1 +
// piece 13 (Settings split, Stage 3).
//
// Source lines 6143-6170: full logo at maxWidth:260, swapped by theme;
// a version footer ({APP_VERSION} · Cheat Code DJ). Login, trial/
// pricing, Manage Subscription are real UI in the source but gated on
// D2 (CLAUDE.md) - our own account system doesn't exist, so per the
// user's explicit instruction this whole block is the Phase 6
// placeholder. Corrected 2026-11-11: a placeholder means "looks
// exactly like his, does nothing when clicked" - not greyed out. The
// card/button/divider styles below are his exact values (checked
// again line by line against this specific feedback, not re-trusted
// from memory); PhasePlaceholder itself no longer desaturates anything.
//
// Piece 13: "Report a Problem" moved HERE from the old consolidated
// Settings screen. Checked directly, not assumed: source's real
// "Report a Problem" button lives on the Account tab (line 6151,
// inside the signed-in card, between Manage Subscription and Sign
// Out) - not in Settings at all. This file's own comment, written back
// in piece 11, already said as much ("'Report a Problem' and 'Sign
// Out' aren't wrapped - they're real popups/state once Settings is
// split"); it just took until Settings actually being split to act on
// it. Source only shows this inside the isLoggedIn branch - since login
// itself is still fully placeholder (D2), it's placed as its own real
// section below the login card instead of gated behind a login state
// that doesn't exist yet. Content is unchanged from the old screen
// (app name/timestamp/description only) - making it richer is the
// Error Report popup's job, a separate future piece, not this one.
//
// APP_VERSION isn't ported as a literal copy of the source's string
// (that's HIS build's version, not this port's) - using this app's own
// package.json version instead (bumped off its 0.0.0 scaffold default
// in this same piece - see the package.json diff), same reasoning as
// export's versionExported field (piece 8).

import { useState } from "react";
import fullLogoDark from "../assets/logo/logo-full.png";
import fullLogoLight from "../assets/logo/logo-full-light.png";
import PhasePlaceholder from "../shared/PhasePlaceholder";
import type { DerivedTheme } from "../theme/deriveTheme";

interface AccountTabProps {
  theme: DerivedTheme;
  lightMode: boolean;
  appVersion: string;
}

export default function AccountTab({ theme, lightMode, appVersion }: AccountTabProps): React.JSX.Element {
  const [reportDesc, setReportDesc] = useState("");
  const [reportText, setReportText] = useState("");
  const [reportCopied, setReportCopied] = useState(false);

  function handleGenerateReport(): void {
    const lines = [`app: CCDJ Desktop (Phase 5)`, `timestamp: ${new Date().toISOString()}`, `description: ${reportDesc.trim() || "(none provided)"}`];
    setReportText(lines.join("\n"));
    setReportCopied(false);
  }

  const card: React.CSSProperties = {
    background: lightMode ? theme.surfaceBg : "linear-gradient(135deg," + theme.accentAlpha(0.05) + " 0%,rgba(0,0,0,0.4) 100%)",
    border: "1px solid " + theme.accentAlpha(0.2),
    borderRadius: 12,
    padding: "1.25rem"
  };
  const lbl: React.CSSProperties = { fontSize: 10, color: "#bbb", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 8 };
  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid " + theme.accentAlpha(0.3), background: theme.surfaceBg, color: "#fff", fontSize: 14, boxSizing: "border-box" };

  return (
    <div style={{ maxWidth: 380, margin: "0 auto", padding: "1.25rem 1.5rem" }}>
      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <img src={lightMode ? fullLogoLight : fullLogoDark} alt="Cheat Code DJ" style={{ width: "100%", maxWidth: 260, display: "block", margin: "0 auto" }} />
      </div>

      <PhasePlaceholder phase={6} message="Real accounts are coming in Phase 6">
        <div style={card}>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Email</label>
            <input readOnly style={inputStyle} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={lbl}>Password</label>
            <input readOnly type="password" style={inputStyle} />
          </div>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <button style={{ fontSize: 11, color: theme.accent, background: "none", border: "none", cursor: "pointer", letterSpacing: "0.06em", padding: 0 }}>
              Forgot Password?
            </button>
          </div>
          <button style={{ width: "100%", padding: 11, borderRadius: 8, border: "none", cursor: "pointer", background: theme.accent, color: "#000", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
            Sign In
          </button>
          <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 16, textAlign: "center" }}>
            <p style={{ fontSize: 12, color: "#bbb", margin: "0 0 4px" }}>14-Day Free Trial · No Credit Card Required</p>
            <p style={{ fontSize: 11, color: "#bbb", margin: "0 0 12px" }}>$9.99/mo · $99.99/yr · $999.99 Lifetime</p>
            <button style={{ fontSize: 12, color: theme.accent, background: "none", border: "1px solid " + theme.accent, borderRadius: 8, cursor: "pointer", padding: "8px 16px", letterSpacing: "0.06em" }}>
              Get Access At CheatCodeDJ.com
            </button>
          </div>
        </div>
      </PhasePlaceholder>

      <div style={{ ...card, marginTop: "1rem" }}>
        <label style={lbl}>Report a Problem</label>
        <textarea
          value={reportDesc}
          onChange={(e) => setReportDesc(e.target.value)}
          placeholder="e.g. I was building a Quiet Storm crate and it froze..."
          style={{ width: "100%", minHeight: 50, fontSize: 12, padding: "8px 10px", borderRadius: 8, border: "1px solid " + theme.accentAlpha(0.3), background: "rgba(0,0,0,0.5)", color: "#fff", outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 10 }}
        />
        <button
          onClick={handleGenerateReport}
          style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #3a3a3a", background: "transparent", color: "#bbb", cursor: "pointer", fontSize: 13, fontWeight: 600, letterSpacing: "0.06em" }}
        >
          Generate Report
        </button>
        {reportText && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>
              What's actually in this report - nothing else
            </p>
            <textarea readOnly value={reportText} style={{ width: "100%", height: 70, fontFamily: "monospace", fontSize: 11, boxSizing: "border-box", background: "rgba(255,255,255,0.03)", color: "#bbb", border: "1px solid #333", borderRadius: 8, padding: 8 }} />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(reportText);
                setReportCopied(true);
              }}
              style={{ width: "100%", padding: 9, marginTop: 6, borderRadius: 8, border: "1px solid " + theme.accentAlpha(0.3), background: reportCopied ? theme.accent : "transparent", color: reportCopied ? "#000" : theme.accent, cursor: "pointer", fontSize: 12, fontWeight: 700 }}
            >
              {reportCopied ? "Copied!" : "Copy Report"}
            </button>
          </div>
        )}
      </div>

      <p style={{ textAlign: "center", fontSize: 11, color: theme.textGray, letterSpacing: "0.1em", marginTop: "1.5rem" }}>v{appVersion} &middot; Cheat Code DJ</p>
    </div>
  );
}
