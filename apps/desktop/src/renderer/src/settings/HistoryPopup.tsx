// Phase 5, step 5 piece 13 (Settings split, Stage 3). Moves the
// existing History recording/filter/tally content (piece 20-22, real
// and unchanged) into its real popup chrome.
//
// Panel chrome (source 5377-5379): backdrop 0.5, zIndex 100, click-
// outside closes plainly, width 680, maxWidth 94vw, maxHeight 84vh,
// padding 1.25rem, flexDirection column (header fixed, body scrolls).
//
// NOT built this piece, deliberately (CLAUDE2.md's own "History Piece
// B" row, sized separately as Multi-day before this piece existed):
// the period-grouped date sidebar (source 5400-5431), outcome-colored
// chips, per-entry notes, session tagging, and real file-based exports
// (Force Save Now / Export JSON / Export CSV / Export All History /
// Clear All History all write real files or clear real state in
// source - ours still only renders into a textarea + Copy, a pre-
// existing gap, not something this piece introduces). This popup is
// the real CHROME around the real recording - the real detail-pane
// redesign is still its own future piece.

import { useEffect, useState } from "react";
import { formatHistoryAsJson, formatHistoryAsCsv } from "./historyExport";
import { summarizeHistoryEntry, filterHistoryRows } from "./historySummary";
import type { DerivedTheme } from "../theme/deriveTheme";
import PopupOverlay from "../shared/PopupOverlay";
import { WHITE, GRAY } from "../shared/controlStyles";

interface HistoryPopupProps {
  theme: DerivedTheme;
  onClose: () => void;
}

export default function HistoryPopup({ theme, onClose }: HistoryPopupProps): React.JSX.Element {
  const [historyRows, setHistoryRows] = useState<CcdjHistoryRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [exportedText, setExportedText] = useState("");
  const [historyFilter, setHistoryFilter] = useState("");
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    // Piece 22's own bump from 50 - the entry that matters is routinely
    // older than the 50 most recent once a session runs long.
    window.ccdj.history.list(200).then((rows) => {
      setHistoryRows(rows);
      setLoaded(true);
    });
  }, []);

  function toggleHistoryExpanded(id: number): void {
    setExpandedHistoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refreshHistory(): Promise<void> {
    setHistoryRows(await window.ccdj.history.list(200));
  }

  function copyToClipboard(text: string): void {
    navigator.clipboard?.writeText(text);
  }

  const filtered = filterHistoryRows(historyRows, historyFilter);

  return (
    <PopupOverlay
      backdropOpacity={0.5}
      zIndex={100}
      onBackdropClick={onClose}
      panelStyle={{ border: "1px solid " + theme.accentAlpha(0.3), padding: "1.25rem", width: 680, maxWidth: "94vw", maxHeight: "84vh", display: "flex", flexDirection: "column" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: WHITE, letterSpacing: "0.06em" }}>Session History</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: GRAY, fontSize: 20, cursor: "pointer" }}>
          ×
        </button>
      </div>

      <p style={{ fontSize: 11, color: "#c62828", flexShrink: 0, marginTop: 0 }}>
        Piece A (recording) is done - this still shows the raw entries, not the real panel (period-grouped sidebar,
        outcome colors, per-entry notes, real file exports - Piece B, not built yet). Each entry records the seed's
        bpm/key/genre/year, vibe/energy, an honest trigger, chain/mode, and a real per-result outcome that updates
        live when you vote.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: "0.75rem", flexShrink: 0, flexWrap: "wrap" }}>
        <button onClick={refreshHistory} style={smBtn(theme)}>
          Refresh
        </button>
        <button onClick={() => setExportedText(formatHistoryAsJson(historyRows))} style={smBtn(theme)}>
          Export JSON
        </button>
        <button onClick={() => setExportedText(formatHistoryAsCsv(historyRows))} style={smBtn(theme)}>
          Export CSV
        </button>
      </div>

      <input
        value={historyFilter}
        onChange={(e) => setHistoryFilter(e.target.value)}
        placeholder="Filter by seed name or trigger..."
        style={{ width: "100%", fontSize: 11, padding: "7px 10px", borderRadius: 8, border: "1px solid " + theme.accentAlpha(0.25), background: "rgba(0,0,0,0.4)", color: WHITE, outline: "none", boxSizing: "border-box", marginBottom: "0.75rem", flexShrink: 0 }}
      />

      <div style={{ overflowY: "auto", flex: 1, border: "1px solid " + theme.accentAlpha(0.15), borderRadius: 10 }}>
        {!loaded ? (
          <div style={{ padding: "2rem", textAlign: "center", fontSize: 12, color: GRAY }}>Loading history...</div>
        ) : (
          <>
            {!historyRows.length && <div style={{ padding: "2rem", textAlign: "center", fontSize: 12, color: GRAY }}>Nothing recorded yet.</div>}
            {historyRows.length > 0 && filtered.length === 0 && (
              <div style={{ padding: "2rem", textAlign: "center", fontSize: 12, color: GRAY }}>No entries match that filter.</div>
            )}
            {filtered.map((r, i) => {
              const summary = summarizeHistoryEntry(r.entry);
              const isExpanded = expandedHistoryIds.has(r.id);
              return (
                <div key={r.id} style={{ padding: "8px 12px", borderBottom: i === filtered.length - 1 ? "none" : "1px solid " + theme.borderCol }}>
                  <div onClick={() => toggleHistoryExpanded(r.id)} style={{ cursor: "pointer", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline", fontSize: 12 }}>
                    <span style={{ color: GRAY }}>{isExpanded ? "▾" : "▸"}</span>
                    <span style={{ color: GRAY }}>{new Date(r.timestamp).toLocaleString()}</span>
                    <span style={{ color: GRAY }}>&middot;</span>
                    <span>{summary.trigger}</span>
                    <span style={{ color: GRAY }}>&middot;</span>
                    <span style={{ fontWeight: 700, color: theme.accent }}>{summary.seedName}</span>
                    <span style={{ color: GRAY }}>&middot;</span>
                    <span>{summary.resultStatus}</span>
                    {summary.resultCount > 0 && (
                      <span style={{ color: GRAY }}>
                        ({summary.resultCount} results &middot; {summary.upCount} up &middot; {summary.downCount} down)
                      </span>
                    )}
                  </div>
                  {isExpanded && (
                    <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", overflowX: "auto", fontSize: 11, background: "rgba(0,0,0,0.4)", padding: 8, borderRadius: 4, marginTop: 4, color: GRAY }}>
                      {JSON.stringify(r.entry, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {exportedText && (
        <div style={{ flexShrink: 0, marginTop: "0.75rem" }}>
          <textarea readOnly value={exportedText} style={{ width: "100%", height: 90, fontFamily: "monospace", fontSize: 11, boxSizing: "border-box" }} />
          <button onClick={() => copyToClipboard(exportedText)} style={smBtn(theme)}>
            Copy
          </button>
        </div>
      )}
    </PopupOverlay>
  );
}

function smBtn(theme: DerivedTheme): React.CSSProperties {
  return { fontSize: 12, padding: "6px 14px", background: "transparent", border: "1px solid " + theme.accentAlpha(0.3), borderRadius: 8, color: theme.accent, cursor: "pointer", letterSpacing: "0.04em" };
}
