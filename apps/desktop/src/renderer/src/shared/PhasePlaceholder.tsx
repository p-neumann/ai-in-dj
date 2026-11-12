// Phase 5, step 5 piece 11 (shared header/visual port) and every piece
// after it that defers something to a later phase.
//
// The ONE marker for "this looks real but isn't wired yet" - every
// future-phase placeholder in this app wraps its control in this
// component, so a future phase's first step (per CLAUDE2.md's own
// standing rule) can find every one of its placeholders with a single
// search for `phase={N}` or `data-phase-placeholder`, instead of
// hunting through screens by eye.
//
// Never a popup (clicking several placeholders in a row would be
// irritating) - a short, specific message appears beside the control
// and toggles off on a second click. Never "coming soon" alone: the
// message always names what it will do and which phase.
//
// Deliberately does NOT grey out or desaturate its children (2026-11-
// 11 correction, Ranjish: a greyed-out card reads as "unfinished,"
// which is the wrong signal - the goal is "looks exactly like the
// real thing, does nothing yet," not "looks broken"). Real inertness
// comes from the children themselves (readOnly inputs, buttons with
// no onClick of their own), not from a visual filter here. `display:
// contents` means this wrapper never affects layout at all - whatever
// it wraps renders exactly as if this component weren't there.

import { useState } from "react";

export interface PhasePlaceholderProps {
  phase: 6 | 7 | 8;
  message: string;
  children: React.ReactNode;
}

export default function PhasePlaceholder({ phase, message, children }: PhasePlaceholderProps): React.JSX.Element {
  const [showMessage, setShowMessage] = useState(false);

  return (
    <div
      data-phase-placeholder={phase}
      onClickCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setShowMessage((v) => !v);
      }}
      style={{ display: "contents" }}
    >
      {children}
      {showMessage && (
        <div style={{ fontSize: 12, color: "#a15c00", marginTop: 8 }}>
          {message} (Phase {phase})
        </div>
      )}
    </div>
  );
}
