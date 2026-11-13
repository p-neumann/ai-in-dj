// Phase 5, step 5 piece 16 (Stage 2c - Library and Duplicate Finder
// real styling, the last styling stage).
//
// This screen now owns the WHOLE Library tab, not just the search
// list, because source's real render order (reference 5943-6141) is
// one continuous flow: import -> (if library.length>0) Library
// Enrichment -> Artist Era Resolver -> Library Management (Duplicate
// Finder lives HERE, inside this tab, not as a separately-stacked
// section) -> Your Library (count, search, Clear Library, the list).
// App.tsx used to render LibraryScreen and DuplicateFinderScreen as
// two independent stacked blocks with placeholder styling - that
// matched neither his order nor his look. DuplicateFinderScreen stays
// its own file with all its real scan/keep-trash/recycle-bin/restore/
// Apply-Permanently logic completely untouched; only its position and
// appearance change here.
//
// Virtualization (CLAUDE.md R25, kept exactly as before this piece):
// his own list is `sortedLibrary.slice(0,500)` - a real limitation of
// his app, not something to port. This screen's real virtualizer
// (@tanstack/react-virtual) already lets the full ~38k-track library
// scroll smoothly with no cap, so his "Showing 500 Of N Tracks"
// footer line is deliberately NOT ported - it describes a limitation
// we don't have.
//
// Real drag-and-drop import (piece 16, Ranjish's call 2026-11-12/13):
// built for real, not a decorative shell that only opens the dialog.
// The dropped File's own .text() (standard browser API) is read here
// and sent to the new library:importFromText IPC handler - never a
// path - so CLAUDE.md 5.4/7.5's path-privacy rule holds exactly the
// same way the existing dialog-based import already does.
//
// Clear Library (piece 16): ported literally per source's
// setLibrary([]) - no confirmation dialog. His own setPlaylist([])
// also clears what HE calls "playlist," which is actually the Crate
// (confirmed earlier this engagement) - onClearLibrary (from App.tsx)
// does the equivalent, clearing crateList. Still an open question for
// Mike (docs/QUESTIONS.md) whether a real database-backed clear
// deserves more friction than his in-memory one; porting his behavior
// faithfully in the meantime per Ranjish's explicit instruction.
//
// "Can't find my software" and the DJ_SOURCES buttons (including the
// 1.5s fake "Reading Library..." spinner): decorative in his own app
// too (confirmed, CLAUDE2.md) - ported exactly as decorative, not
// upgraded into something real.

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { filterTracks } from "./filterTracks";
import DuplicateFinderScreen from "../duplicateFinder/DuplicateFinderScreen";
import SectionRule from "../shared/SectionRule";
import PhasePlaceholder from "../shared/PhasePlaceholder";
import KeyPill from "../shared/KeyPill";
import { getArtistTitle } from "../shared/getArtistTitle";
import { cardStyle, dropZoneStyle, searchInputStyle, bpmBorder, smBtnStyle, WHITE, GRAY } from "../shared/controlStyles";
import type { DerivedTheme } from "../theme/deriveTheme";

const ROW_HEIGHT = 32;

// Source DJ_SOURCES (line 417).
const DJ_SOURCES = [
  { id: "serato", name: "Serato DJ", icon: "🎛️" },
  { id: "rekordbox", name: "Rekordbox", icon: "🎵" },
  { id: "traktor", name: "Traktor", icon: "🎧" },
  { id: "virtualdj", name: "Virtual DJ", icon: "💿" },
  { id: "engine", name: "Engine DJ", icon: "🔊" }
] as const;

interface ImportSummaryLike {
  imported: number;
  totalRows: number;
}

interface LibraryScreenProps {
  theme: DerivedTheme;
  onClearLibrary: () => void;
}

export default function LibraryScreen({ theme, onClearLibrary }: LibraryScreenProps): React.JSX.Element {
  const [allTracks, setAllTracks] = useState<CcdjLibraryRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [showManualImport, setShowManualImport] = useState(false);
  const [importSource, setImportSource] = useState<string | null>(null);
  const [importSourceLoading, setImportSourceLoading] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAllTracks(null);
    window.ccdj.library.getAllTracks().then(setAllTracks);
  }, [refreshSignal]);

  const filtered = useMemo(() => (allTracks ? filterTracks(allTracks, search) : []), [allTracks, search]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  });

  function onImported(summary: ImportSummaryLike): void {
    setImportMessage(`Imported ${summary.imported} tracks out of ${summary.totalRows} rows.`);
    setRefreshSignal((n) => n + 1);
  }

  async function handleBrowse(): Promise<void> {
    setImportBusy(true);
    setImportMessage(null);
    try {
      const result = await window.ccdj.library.importFromFile();
      if (!result.cancelled) onImported({ imported: result.imported ?? 0, totalRows: result.totalRows ?? 0 });
    } catch (error) {
      setImportMessage(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setImportBusy(false);
    }
  }

  async function handleDropFile(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportMessage(`"${file.name}" isn't a .csv file.`);
      return;
    }
    setImportBusy(true);
    setImportMessage(null);
    try {
      const text = await file.text();
      const summary = await window.ccdj.library.importFromText(text);
      onImported(summary);
    } catch (error) {
      setImportMessage(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setImportBusy(false);
    }
  }

  async function handleClearLibrary(): Promise<void> {
    await window.ccdj.library.clear();
    onClearLibrary();
    setSearch("");
    setImportMessage(null);
    setRefreshSignal((n) => n + 1);
  }

  return (
    <div>
      <SectionRule theme={theme}>Import Library</SectionRule>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleDropFile(file);
        }}
        onClick={() => {
          if (!importBusy) void handleBrowse();
        }}
        style={dropZoneStyle(theme, dragOver)}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ display: "block", margin: "0 auto 10px" }}>
          <path d="M3 7C3 5.9 3.9 5 5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke={theme.accent} strokeWidth="1.5" />
          <path d="M3 7l9 6 9-6" stroke={theme.accent} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p style={{ fontSize: 16, fontWeight: 700, color: dragOver ? theme.accent : WHITE, margin: "0 0 6px" }}>
          {importBusy ? "Importing..." : "Import Library"}
        </p>
        <p style={{ fontSize: 12, color: WHITE, margin: 0 }}>Drag and drop your library CSV here</p>
      </div>
      {importMessage && <p style={{ fontSize: 12, color: GRAY, margin: "8px 0 0" }}>{importMessage}</p>}

      <div style={{ marginTop: 12, marginBottom: "1.25rem" }}>
        <div
          onClick={() => setShowManualImport((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: "1px solid " + theme.accentAlpha(0.2), background: theme.surfaceBg, cursor: "pointer" }}
        >
          <span style={{ fontSize: 13, color: WHITE, flexShrink: 0 }}>{showManualImport ? "▼" : "▶"}</span>
          <span style={{ fontSize: 12, color: WHITE, fontWeight: 600 }}>Can't find my software — browse manually</span>
        </div>
        {showManualImport && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {DJ_SOURCES.map((source) => (
              <button
                key={source.id}
                onClick={() => {
                  setImportSource(source.id);
                  setImportSourceLoading(true);
                  setTimeout(() => setImportSourceLoading(false), 1500);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  background: importSource === source.id ? theme.accentAlpha(0.06) : "rgba(0,0,0,0.3)",
                  border: "1px solid " + (importSource === source.id ? theme.accentAlpha(0.4) : theme.accentAlpha(0.15)),
                  borderRadius: 10,
                  cursor: "pointer",
                  textAlign: "left"
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>{source.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: importSource === source.id ? theme.accent : WHITE }}>{source.name}</p>
                  {importSource === source.id && importSourceLoading && (
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: theme.accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>Reading Library...</p>
                  )}
                  {importSource === source.id && !importSourceLoading && (
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: "#e03c3c" }}>Direct import available in the desktop app.</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {allTracks !== null && allTracks.length > 0 && (
        <>
          <SectionRule theme={theme}>Library Enrichment</SectionRule>
          <PhasePlaceholder phase={6} message="Spotify enrichment is coming in Phase 6">
            <div style={cardStyle(theme)}>
              <p style={{ fontSize: 12, color: GRAY, margin: "0 0 12px", lineHeight: 1.5 }}>Enrich your library with year and genre data from Spotify.</p>
              {[
                { mode: "smart", label: "🔒 Smart Only — Improve recommendations without touching my files" },
                { mode: "write", label: "✏️ Write To Files — Update my tags with enriched data" },
                { mode: "restore", label: "🔄 Restore Original Tags — Revert all changes" }
              ].map((opt, i) => (
                <div
                  key={opt.mode}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid " + (i === 0 ? theme.accent : theme.accentAlpha(0.2)), background: i === 0 ? theme.accentAlpha(0.08) : "transparent", marginBottom: 8 }}
                >
                  <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid " + (i === 0 ? theme.accent : "#444"), background: i === 0 ? theme.accent : "transparent", flexShrink: 0, marginTop: 2 }} />
                  <p style={{ margin: 0, fontSize: 12, color: i === 0 ? theme.accent : GRAY, lineHeight: 1.5 }}>{opt.label}</p>
                </div>
              ))}
            </div>
          </PhasePlaceholder>

          <PhasePlaceholder phase={7} message="Library enrichment is coming in Phase 7">
            <div style={{ ...cardStyle(theme), marginTop: "1rem" }}>
              <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: WHITE }}>Artist Era Resolver</p>
                  <p style={{ margin: 0, fontSize: 11, color: GRAY }}>Resolves real release eras + name aliases for your collection.</p>
                </div>
                <div style={{ width: 40, height: 24, borderRadius: 12, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "flex-start", padding: 2, flexShrink: 0 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: "white", boxShadow: "0 2px 4px rgba(0,0,0,0.3)" }} />
                </div>
              </div>
            </div>
          </PhasePlaceholder>

          <SectionRule theme={theme}>Library Management</SectionRule>
          <DuplicateFinderScreen theme={theme} refreshSignal={refreshSignal} />

          <SectionRule theme={theme}>Your Library</SectionRule>
          <div style={{ fontSize: 11, color: theme.accent, letterSpacing: "0.06em", marginBottom: "0.5rem" }}>{allTracks.length.toLocaleString()} Tracks Loaded</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: "0.75rem" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: theme.accentAlpha(0.5), pointerEvents: "none" }}>🔍</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your library..." style={{ ...searchInputStyle(theme), paddingLeft: 36 }} />
              {search && (
                <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: GRAY, fontSize: 16, cursor: "pointer" }}>
                  ×
                </button>
              )}
            </div>
            <button onClick={handleClearLibrary} style={smBtnStyle(theme, true)}>
              Clear Library
            </button>
          </div>

          <div ref={parentRef} style={{ border: "1px solid " + theme.accentAlpha(0.15), borderRadius: 12, overflow: "hidden", maxHeight: 400, overflowY: "auto" }}>
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const t = filtered[virtualRow.index];
                const at = getArtistTitle(t.displayName);
                return (
                  <div
                    key={t.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: ROW_HEIGHT,
                      transform: `translateY(${virtualRow.start}px)`,
                      padding: "8px 14px",
                      background: virtualRow.index % 2 === 0 ? theme.rowEven : theme.rowOdd,
                      borderBottom: "1px solid " + theme.borderCol,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      boxSizing: "border-box"
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {at.artist && <p style={{ margin: "0 0 1px", fontSize: 11, color: GRAY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{at.artist}</p>}
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: WHITE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{at.title}</p>
                    </div>
                    <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
                      {t.bpm ? (
                        <span style={{ fontSize: 11, color: WHITE, background: "rgba(0,0,0,0.5)", padding: "3px 4px", borderRadius: 6, border: bpmBorder(theme), fontWeight: 600, width: 34, textAlign: "center", boxSizing: "border-box", display: "inline-block" }}>
                          {Math.round(t.bpm)}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, padding: "3px 4px", borderRadius: 6, border: bpmBorder(theme), fontWeight: 600, width: 34, textAlign: "center", boxSizing: "border-box", display: "inline-block", visibility: "hidden" }}>
                          &nbsp;
                        </span>
                      )}
                      <KeyPill keyVal={t.key} />
                    </div>
                  </div>
                );
              })}
            </div>
            {filtered.length === 0 && search && (
              <div style={{ padding: "24px 14px", textAlign: "center", fontSize: 12, color: GRAY }}>No tracks matching "{search}"</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
