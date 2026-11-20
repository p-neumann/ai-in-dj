// Phase 5, step 5 piece 14 (startup preferences reminder). Ported from
// reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx lines 5536-5551
// (render). Gating lives in App.tsx (1486-1517's load-effect +
// ref-guarded show-effect) - this component is just the popup itself.
//
// Panel chrome (source 5536-5538) - deliberately NOT the same as the
// other three popups, checked directly rather than flattened to match:
// backdrop 0.6 (darker than Style Profile/History's 0.5), zIndex 200
// (above them), NO onClick on the backdrop at all - there is no
// click-outside close, on purpose. Border uses accentAlpha(0.4), not
// 0.3 like Style Profile/History. No maxHeight/overflow - the content
// is short and fixed, unlike the two scrolling popups.
//
// The checkbox (5544-5547) is a real, live controlled input, not a
// fire-once action - checking it calls onToggleDontAsk(true) and
// persists immediately (source's own onChange calls persistPrefs
// directly, not on close); unchecking it while still open calls
// onToggleDontAsk(false) and persists that too. Only "Got It"
// (5548) closes - it does not touch the flag at all.

import type { DerivedTheme } from "../theme/deriveTheme";
import type { PrefListEntry } from "./prefsLists";
import PopupOverlay from "../shared/PopupOverlay";
import { WHITE, GRAY } from "../shared/controlStyles";

interface StartupPrefsReminderProps {
  theme: DerivedTheme;
  styleProfile: string;
  doPlayList: PrefListEntry[];
  doNotPlayList: PrefListEntry[];
  dontAskChecked: boolean;
  onToggleDontAsk: (checked: boolean) => void;
  onDismiss: () => void;
}

export default function StartupPrefsReminder({
  theme,
  styleProfile,
  doPlayList,
  doNotPlayList,
  dontAskChecked,
  onToggleDontAsk,
  onDismiss
}: StartupPrefsReminderProps): React.JSX.Element {
  const permanentDoPlay = doPlayList.filter((e) => e.persistent);
  const permanentDoNotPlay = doNotPlayList.filter((e) => e.persistent);

  return (
    <PopupOverlay backdropOpacity={0.6} zIndex={200} panelStyle={{ border: "1px solid " + theme.accentAlpha(0.4), padding: "1.5rem", width: 420, maxWidth: "90vw" }}>
      <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: WHITE }}>Your Saved Preferences Are Active</p>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: GRAY, lineHeight: 1.5 }}>
        These carried over from last time and will affect every crate you build until you change them:
      </p>
      {styleProfile && styleProfile.trim() && (
        <p style={{ fontSize: 12, color: WHITE, margin: "0 0 8px", lineHeight: 1.5 }}>
          <b>Style:</b> {styleProfile}
        </p>
      )}
      {permanentDoPlay.length > 0 && (
        <p style={{ fontSize: 12, color: theme.accent, margin: "0 0 8px", lineHeight: 1.5 }}>
          <b>Do Play:</b> {permanentDoPlay.map((e) => e.type + ": " + e.value).join(", ")}
        </p>
      )}
      {permanentDoNotPlay.length > 0 && (
        <p style={{ fontSize: 12, color: "#e03c3c", margin: "0 0 12px", lineHeight: 1.5 }}>
          <b>Do Not Play:</b> {permanentDoNotPlay.map((e) => e.type + ": " + e.value).join(", ")}
        </p>
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: GRAY, margin: "4px 0 16px", cursor: "pointer" }}>
        <input type="checkbox" checked={dontAskChecked} onChange={(e) => onToggleDontAsk(e.target.checked)} />
        Don't ask me again (until I change these)
      </label>
      <button onClick={onDismiss} style={{ width: "100%", padding: 11, borderRadius: 8, border: "none", background: theme.accent, color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
        Got It
      </button>
    </PopupOverlay>
  );
}
