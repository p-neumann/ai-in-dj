// Phase 5, step 5 piece 9 - Duplicate Finder.
//
// Preview playback is deliberately NOT built here - the source's own
// `new Audio("file://...")` doesn't work in Electron's renderer, and
// CLAUDE.md 8.2 calls for a real `ccdj-media://` streaming protocol in
// the main process to replace it. That's genuine new native-integration
// plumbing, not specific to this screen, so it's its own later piece;
// scan/group/keep-trash/recycle-bin all work fully without it.
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

import { useEffect, useState } from "react";
import { findDuplicateGroups } from "./findDuplicates.ts";
import type { DuplicateGroup } from "./findDuplicates.ts";

type Action = "keep" | "trash";

function fmtDur(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export default function DuplicateFinderScreen({ refreshSignal }: { refreshSignal: number }): React.JSX.Element {
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

  const sections: Array<{ label: string; conf: "likely" | "possible"; color: string }> = [
    { label: "Likely Duplicates", conf: "likely", color: "#c62828" },
    { label: "Possible Duplicates", conf: "possible", color: "#a15c00" }
  ];

  return (
    <section style={{ border: "2px solid #888", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Step 5, piece 9: Duplicate Finder</h2>
      <p style={{ fontSize: 13, color: "#666" }}>
        Scans for repeated tracks by title, duration, and BPM. Removing a track here only ever changes what CCDJ
        shows you - your actual audio/video files on disk are never touched, deleted, or moved.
      </p>

      {allTracks === null && <p style={{ color: "#666" }}>Loading library...</p>}

      {allTracks !== null && (
        <>
          <button onClick={runScan} disabled={scanning || allTracks.length === 0}>
            {scanning ? "Scanning..." : "Scan Library"}
          </button>

          {message && <p style={{ fontSize: 13, color: "#666" }}>{message}</p>}

          {groups !== null &&
            (groups.length === 0 ? (
              <p style={{ color: "#2e7d32", fontWeight: 700 }}>No duplicates found.</p>
            ) : (
              <div style={{ marginTop: "0.75rem" }}>
                <p style={{ fontSize: 13 }}>
                  <b>{groups.length}</b> duplicate group{groups.length === 1 ? "" : "s"} found.
                </p>
                {(() => {
                  const marked = trashMarkedTracks();
                  return (
                    marked.length > 0 && (
                      <button onClick={handleSendToRecycleBin} style={{ marginBottom: "0.5rem" }}>
                        🗑 Send {marked.length} To Recycle Bin (This Session Only)
                      </button>
                    )
                  );
                })()}

                {sections.map((section) => {
                  const sectionGroups = groups.map((g, gi) => ({ g, gi })).filter((x) => x.g.confidence === section.conf);
                  if (sectionGroups.length === 0) return null;
                  return (
                    <div key={section.conf} style={{ marginTop: "0.75rem" }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: section.color, textTransform: "uppercase" }}>
                        {section.label} ({sectionGroups.length})
                      </p>
                      {sectionGroups.map(({ g, gi }) => {
                        const isExpanded = !!expanded[gi];
                        const seed = g.tracks[0];
                        return (
                          <div key={gi} style={{ border: `1px solid ${section.color}`, borderRadius: 6, marginBottom: "0.4rem", padding: "0.4rem" }}>
                            <div
                              onClick={() => toggleExpand(gi)}
                              style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: section.color }}
                            >
                              <span>{isExpanded ? "▼" : "▶"} {g.tracks.length} copies</span>
                            </div>
                            <TrackRow
                              track={seed.track}
                              selKey={`${gi}-0`}
                              action={selected[`${gi}-0`]}
                              setAction={setAction}
                            />
                            {isExpanded &&
                              g.tracks.slice(1).map((entry, ti) => (
                                <TrackRow
                                  key={ti + 1}
                                  track={entry.track}
                                  selKey={`${gi}-${ti + 1}`}
                                  action={selected[`${gi}-${ti + 1}`]}
                                  setAction={setAction}
                                />
                              ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}

          {sessionRemoved.size > 0 && (
            <div style={{ marginTop: "1rem", borderTop: "1px solid #ccc", paddingTop: "0.5rem" }}>
              <p style={{ fontSize: 13, fontWeight: 700 }}>
                Removed this session ({sessionRemoved.size}) - not deleted. Your files, and CCDJ's permanent library
                record, are untouched. This list (and the removal itself) resets the next time you restart CCDJ.
              </p>
              <button onClick={handleRestoreAll} style={{ marginRight: "0.5rem" }}>
                Restore All
              </button>
              <button onClick={handleApplyPermanently} disabled={permanentBusy} style={{ color: "#c62828", fontWeight: 700 }}>
                {permanentBusy ? "Deleting..." : `Apply Permanently - Delete ${sessionRemoved.size} For Good`}
              </button>
              <ul style={{ fontSize: 13, paddingLeft: "1.2rem" }}>
                {Array.from(sessionRemoved.values()).map((t) => (
                  <li key={t.id}>
                    {t.displayName}{" "}
                    <button onClick={() => handleRestore(t.id)}>Restore</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TrackRow({
  track,
  selKey,
  action,
  setAction
}: {
  track: CcdjDuplicateScanRow;
  selKey: string;
  action: Action | undefined;
  setAction: (key: string, action: Action) => void;
}): React.JSX.Element {
  const isKeep = action === undefined || action === "keep";
  const isTrash = action === "trash";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: 13, padding: "0.2rem 0" }}>
      <button onClick={() => setAction(selKey, "keep")} style={{ fontWeight: isKeep ? 700 : 400, color: isKeep ? "#2e7d32" : "#888" }}>
        ✓ Keep
      </button>
      <button onClick={() => setAction(selKey, "trash")} style={{ fontWeight: isTrash ? 700 : 400, color: isTrash ? "#c62828" : "#888" }}>
        🗑 Trash
      </button>
      <span>{track.displayName}</span>
      {fmtDur(track.durationSec) && <span style={{ color: "#666" }}>{fmtDur(track.durationSec)}</span>}
      {track.bpm ? <span style={{ color: "#666" }}>{Math.round(track.bpm)} bpm</span> : null}
      {track.key && <span style={{ color: "#666" }}>{track.key}</span>}
    </div>
  );
}
