// Phase 5, step 5 piece 9 (core) + piece 16, Stage 2c (real styling).
//
// Preview playback is deliberately NOT built here - the source's own
// `new Audio("file://...")` doesn't work in Electron's renderer, and
// CLAUDE.md 8.2 calls for a real `ccdj-media://` streaming protocol in
// the main process to replace it. That's genuine new native-integration
// plumbing, not specific to this screen, so it's its own later piece;
// scan/group/keep-trash/recycle-bin all work fully without it. Shown
// here as a real-looking, inert PhasePlaceholder (phase 8) rather than
// omitted, matching his own Preview button's position exactly.
//
// Show In Finder (new this piece): real, wired to the existing
// window.ccdj.showInFinder - no native blocker, unlike Preview, so
// there's no reason to leave it decorative.
//
// Removal is session-only by default, exactly like the source (R20) -
// not because our library happens to be a real SQLite table instead of
// a browser tab's in-memory array, but on purpose: duplicate detection
// is a best guess, not a certainty, and a DJ's library represents years
// of work that often can't be re-downloaded. A Clean and a Dirty version
// a second apart in duration can look identical to this algorithm and
// still both be ones he needs. Session-only means exploring costs
// nothing - every removed track is listed below with its own Restore
// button, and nothing is actually gone until "Apply Permanently" is
// used, deliberately, with its own warning. See docs/QUESTIONS.md for
// the open question this raises for Mike: his own app could never make
// permanent removal possible at all, so whether CCDJ should offer it is
// his call, not an engineering default.
//
// Stage 2c real-window finding (2026-11-12): his Duplicate Finder does
// NOT scroll the whole page - each confidence section (Likely/Possible)
// has its own scroll container, maxHeight:520, overflowY:"auto" (source
// line 6059). Ported both scroll boxes exactly - this was a real
// divergence from his layout, not a styling preference.

import { useEffect, useState } from "react";
import { findDuplicateGroups } from "./findDuplicates.ts";
import type { DuplicateGroup } from "./findDuplicates.ts";
import PhasePlaceholder from "../shared/PhasePlaceholder";
import { cardStyle, smBtnStyle, WHITE, GRAY } from "../shared/controlStyles";
import { hex2rgb } from "../theme/colorUtils";
import type { DerivedTheme } from "../theme/deriveTheme";

type Action = "keep" | "trash";

function fmtDur(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

interface DuplicateFinderScreenProps {
  theme: DerivedTheme;
  refreshSignal: number;
}

export default function DuplicateFinderScreen({ theme, refreshSignal }: DuplicateFinderScreenProps): React.JSX.Element {
  const [allTracks, setAllTracks] = useState<CcdjDuplicateScanRow[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [selected, setSelected] = useState<Record<string, Action>>({});
  // Session-only (R20): a track removed here is hidden from this
  // screen's own view and future scans for the rest of this run of
  // CCDJ, never written to the database, and never touches the real
  // file. Keeps the real row (not just the id) so the Restore list
  // below can show what it's restoring.
  const [sessionRemoved, setSessionRemoved] = useState<Map<number, CcdjDuplicateScanRow>>(new Map());
  const [permanentBusy, setPermanentBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setAllTracks(null);
    setGroups(null);
    setExpanded({});
    setSelected({});
    setSessionRemoved(new Map());
    setMessage(null);
    window.ccdj.library.getTracksForDuplicateScan().then(setAllTracks);
  }, [refreshSignal]);

  function runScan(): void {
    if (!allTracks) return;
    setScanning(true);
    setExpanded({});
    setSelected({});
    const visible = allTracks.filter((t) => !sessionRemoved.has(t.id));
    setGroups(findDuplicateGroups(visible));
    setScanning(false);
  }

  function toggleExpand(groupIdx: number): void {
    setExpanded((prev) => ({ ...prev, [groupIdx]: !prev[groupIdx] }));
  }

  function setAction(key: string, action: Action): void {
    setSelected((prev) => ({ ...prev, [key]: action }));
  }

  function trashMarkedTracks(): CcdjDuplicateScanRow[] {
    if (!groups) return [];
    const out: CcdjDuplicateScanRow[] = [];
    groups.forEach((g, gi) => {
      g.tracks.forEach((entry, ti) => {
        if (selected[`${gi}-${ti}`] === "trash") out.push(entry.track);
      });
    });
    return out;
  }

  // Source's own R20 behavior: no real file is touched, only this
  // screen's view for the rest of the session - and the result list
  // clears after, so you'd rescan to see anything again.
  function handleSendToRecycleBin(): void {
    const toRemove = trashMarkedTracks();
    if (toRemove.length === 0) return;
    setSessionRemoved((prev) => {
      const next = new Map(prev);
      toRemove.forEach((t) => next.set(t.id, t));
      return next;
    });
    setGroups(null);
    setSelected({});
    setExpanded({});
    setMessage(
      `${toRemove.length} removed from view for this session only. Your audio/video files were never touched, and CCDJ's library record wasn't either - restart CCDJ and they're back, or restore them below any time before then.`
    );
  }

  function handleRestore(id: number): void {
    setSessionRemoved((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  function handleRestoreAll(): void {
    setSessionRemoved(new Map());
  }

  async function handleApplyPermanently(): Promise<void> {
    const ids = Array.from(sessionRemoved.keys());
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Permanently delete ${ids.length} track${ids.length === 1 ? "" : "s"} from CCDJ's library?\n\n` +
        "This cannot be undone from within CCDJ - you would need to re-import your library to get them back. " +
        "Your actual audio/video files on disk are never touched either way - this only ever affects CCDJ's own list of them."
    );
    if (!ok) return;
    setPermanentBusy(true);
    try {
      const result = await window.ccdj.library.permanentlyDeleteTracks(ids);
      setSessionRemoved(new Map());
      const fresh = await window.ccdj.library.getTracksForDuplicateScan();
      setAllTracks(fresh);
      setMessage(`${result.deleted} permanently removed from CCDJ's library. Your audio/video files were never touched.`);
    } finally {
      setPermanentBusy(false);
    }
  }

  const sections: Array<{ label: string; conf: "likely" | "possible"; color: string; headerBg: string; borderCol: string }> = [
    { label: "Likely Duplicate", conf: "likely", color: "#e03c3c", headerBg: "rgba(224,60,60,0.12)", borderCol: "rgba(224,60,60,0.3)" },
    { label: "Possible Duplicate", conf: "possible", color: "#facc15", headerBg: "rgba(250,204,21,0.08)", borderCol: "rgba(250,204,21,0.2)" }
  ];

  const trashCount = Object.values(selected).filter((v) => v === "trash").length;

  return (
    <div style={{ ...cardStyle(theme), marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: groups !== null ? 12 : 0 }}>
        <div>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: WHITE }}>Duplicate Finder</p>
          <p style={{ margin: 0, fontSize: 11, color: GRAY }}>Scans for repeated tracks by title, duration, and BPM</p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning || !allTracks || allTracks.length === 0}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: scanning ? "not-allowed" : "pointer", background: scanning ? "#333" : theme.accent, color: scanning ? "#888" : theme.bg, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", width: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
        >
          {scanning ? (
            <>
              <span>Scanning</span>
              <span className="dot1" style={{ display: "inline-block", fontSize: 16, lineHeight: "0.8" }}>.</span>
              <span className="dot2" style={{ display: "inline-block", fontSize: 16, lineHeight: "0.8" }}>.</span>
              <span className="dot3" style={{ display: "inline-block", fontSize: 16, lineHeight: "0.8" }}>.</span>
            </>
          ) : (
            "Scan Library"
          )}
        </button>
      </div>

      {message && <p style={{ fontSize: 12, color: GRAY, marginTop: 8 }}>{message}</p>}

      {groups !== null &&
        (groups.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: theme.accent, fontWeight: 700 }}>✓ No duplicates found in your library.</p>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: theme.accent, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Duplicate Groups Found <span style={{ color: GRAY }}>({groups.length})</span>
              </span>
              {trashCount > 0 && (
                <button
                  onClick={handleSendToRecycleBin}
                  style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8, border: "1px solid #e03c3c", background: "rgba(224,60,60,0.1)", color: "#e03c3c", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                >
                  🗑 Send {trashCount} To Recycle Bin
                </button>
              )}
            </div>

            {sections.map((section) => {
              const sectionGroups = groups.map((g, gi) => ({ g, gi })).filter((x) => x.g.confidence === section.conf);
              if (sectionGroups.length === 0) return null;
              return (
                <div key={section.conf} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: section.color, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                      {section.label === "Likely Duplicate" ? "Likely Duplicates" : "Possible Duplicates"}
                    </span>
                    <span style={{ fontSize: 10, color: GRAY }}>({sectionGroups.length})</span>
                    <div style={{ flex: 1, height: 1, background: section.color, opacity: 0.3 }} />
                  </div>
                  {/* Source line 6059: his own per-section scroll box, not a
                      page-wide scroll - confirmed real, ported exactly. */}
                  <div style={{ maxHeight: 520, overflowY: "auto", borderRadius: 10, border: "1px solid " + section.borderCol }}>
                    {sectionGroups.map(({ g, gi }) => {
                      const isExpanded = !!expanded[gi];
                      const seed = g.tracks[0];
                      return (
                        <div key={gi} style={{ borderBottom: "1px solid " + section.borderCol }}>
                          <div onClick={() => toggleExpand(gi)} style={{ padding: "3px 10px 0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: section.color, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                              {isExpanded ? "▼" : "▶"} {section.label}
                            </span>
                            <span style={{ fontSize: 9, fontWeight: 700, color: section.color, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                              {g.tracks.length} Copies {isExpanded ? "▼" : "▶"}
                            </span>
                          </div>
                          <TrackRow theme={theme} track={seed.track} selKey={`${gi}-0`} action={selected[`${gi}-0`]} setAction={setAction} headerBg={section.headerBg} onToggleExpand={() => toggleExpand(gi)} />
                          {isExpanded &&
                            g.tracks.slice(1).map((entry, ti) => (
                              <TrackRow
                                key={ti + 1}
                                theme={theme}
                                track={entry.track}
                                selKey={`${gi}-${ti + 1}`}
                                action={selected[`${gi}-${ti + 1}`]}
                                setAction={setAction}
                                rowBg={(ti + 1) % 2 === 0 ? theme.rowEven : theme.rowOdd}
                              />
                            ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      {sessionRemoved.size > 0 && (
        <div style={{ marginTop: "1rem", borderTop: "1px solid " + theme.borderCol, paddingTop: "0.75rem" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: WHITE, margin: "0 0 8px", lineHeight: 1.5 }}>
            Removed this session ({sessionRemoved.size}) - not deleted. Your files, and CCDJ's permanent library record, are untouched. This list (and the removal itself) resets the next time you restart CCDJ.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button onClick={handleRestoreAll} style={smBtnStyle(theme)}>
              Restore All
            </button>
            <button onClick={handleApplyPermanently} disabled={permanentBusy} style={smBtnStyle(theme, true)}>
              {permanentBusy ? "Deleting..." : `Apply Permanently - Delete ${sessionRemoved.size} For Good`}
            </button>
          </div>
          <div>
            {Array.from(sessionRemoved.values()).map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: GRAY, padding: "3px 0" }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.displayName}</span>
                <button onClick={() => handleRestore(t.id)} style={{ fontSize: 11, color: theme.accent, background: "none", border: "none", cursor: "pointer" }}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TrackRow({
  theme,
  track,
  selKey,
  action,
  setAction,
  headerBg,
  rowBg,
  onToggleExpand
}: {
  theme: DerivedTheme;
  track: CcdjDuplicateScanRow;
  selKey: string;
  action: Action | undefined;
  setAction: (key: string, action: Action) => void;
  headerBg?: string;
  rowBg?: string;
  onToggleExpand?: () => void;
}): React.JSX.Element {
  const dur = fmtDur(track.durationSec);
  const path = track.location || "";
  return (
    <div style={{ padding: "8px 14px", background: headerBg ?? rowBg ?? "transparent", borderTop: headerBg ? undefined : "1px solid " + theme.borderCol }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <DupActionBtns theme={theme} selKey={selKey} action={action} setAction={setAction} path={path} trackId={track.id} />
        <div onClick={onToggleExpand} style={{ flex: 1, minWidth: 0, cursor: onToggleExpand ? "pointer" : "default" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: WHITE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.displayName}</p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {dur && <span style={{ fontSize: 11, color: GRAY }}>{dur}</span>}
          {track.bpm ? <span style={{ fontSize: 11, color: GRAY, background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: 4 }}>{Math.round(track.bpm)}</span> : null}
          {track.key && <span style={{ fontSize: 11, color: GRAY, background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: 4 }}>{track.key}</span>}
        </div>
      </div>
      {path && (
        <p style={{ margin: "4px 0 0", fontSize: 10, color: theme.accentAlpha(0.5), fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>
          {path.replace(/\\/g, "/").split("/").slice(-2).join("/")}
        </p>
      )}
    </div>
  );
}

// Source's DupActionBtns (line 5337) - Keep/Trash radio pills, default
// Keep when unset, plus Preview and Show In Finder. Preview stays a
// real-looking, inert PhasePlaceholder (phase 8 - needs the ccdj-media://
// protocol, see this file's header); Show In Finder is real.
function DupActionBtns({
  theme,
  selKey,
  action,
  setAction,
  path,
  trackId
}: {
  theme: DerivedTheme;
  selKey: string;
  action: Action | undefined;
  setAction: (key: string, action: Action) => void;
  path: string;
  trackId: number;
}): React.JSX.Element {
  return (
    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
      {(["keep", "trash"] as const).map((act) => {
        const isTrash = act === "trash";
        const isSel = action === act || (action === undefined && !isTrash);
        const col = isTrash ? "#e03c3c" : theme.accent;
        return (
          <div
            key={act}
            onClick={() => setAction(selKey, act)}
            style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "3px 7px", borderRadius: 6, border: "1px solid " + (isSel ? col : "#444"), background: isSel ? `rgba(${hex2rgb(col).join(",")},0.12)` : "transparent", transition: "all 0.15s" }}
          >
            <div style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid " + (isSel ? col : "#555"), background: isSel ? col : "transparent", flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: isSel ? col : "#555" }}>{isTrash ? "🗑" : "✓"}</span>
          </div>
        );
      })}
      {path && (
        <PhasePlaceholder phase={8} message="Audio/video preview is coming in Phase 8">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 6, border: "1px solid #444", cursor: "pointer", flexShrink: 0 }} title="Preview">
            <span style={{ fontSize: 12, color: GRAY }}>▶</span>
          </div>
        </PhasePlaceholder>
      )}
      {path && (
        <div
          onClick={() => void window.ccdj.showInFinder(trackId)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 6, border: "1px solid #444", cursor: "pointer", flexShrink: 0 }}
          title="Show In Finder"
        >
          <span style={{ fontSize: 12, color: GRAY }}>📁</span>
        </div>
      )}
    </div>
  );
}
