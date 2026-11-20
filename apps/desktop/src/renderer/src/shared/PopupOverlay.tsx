// Phase 5, step 5 piece 13 (Settings split, Stage 3). The one shared
// shell behind all of Mike's popups - but NOT one fixed set of values.
// Checked each of his six directly (reference lines 5377-5606, 1012-
// 1013) rather than assuming a single pattern:
//
//   Popup          backdrop  zIndex  click-outside closes?  width   maxH
//   Style Profile    0.5      100    yes (plain close)       560    86vh
//   History          0.5      100    yes (plain close)       680    84vh
//   Settings         0.4      100    yes (REVERTS pending)    420    85vh
//   Prefs reminder   0.6      200    NO                       420    none
//   Error Report     0.6      210    NO                       480    85vh
//   Rating/Nudge     0.7      200    NO                       320    none
//
// Only #0d0d0d background and 16px radius are actually identical across
// all six - baked in here. Everything else (backdrop opacity, zIndex,
// whether the backdrop even has a click handler, width/maxWidth/
// maxHeight/padding/flexDirection, border color) is deliberately left
// to the caller, because his own differences are deliberate: the prefs
// reminder and Error Report can't be dismissed by clicking away, Error
// Report sits above everything else. Flattening these into one default
// would silently undo that.
//
// stopPropagation on the inner panel is unconditional, matching every
// one of his six - harmless even when the backdrop has no click handler
// of its own to stop.

export interface PopupOverlayProps {
  backdropOpacity: number;
  zIndex: number;
  // Omit entirely for a popup that can't be dismissed by clicking
  // outside (his prefs reminder, Error Report, Rating/Nudge).
  onBackdropClick?: () => void;
  // Caller supplies width/maxWidth/maxHeight/padding/border/
  // flexDirection - these are the values that genuinely differ per
  // popup, not boilerplate to hide here.
  panelStyle: React.CSSProperties;
  children: React.ReactNode;
}

export default function PopupOverlay({ backdropOpacity, zIndex, onBackdropClick, panelStyle, children }: PopupOverlayProps): React.JSX.Element {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: `rgba(0,0,0,${backdropOpacity})`, zIndex, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onBackdropClick}
    >
      <div style={{ background: "#0d0d0d", borderRadius: 16, ...panelStyle }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
