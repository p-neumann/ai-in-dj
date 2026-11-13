// Phase 5, step 5 piece 6 (core) + piece 8 (export) + piece 13, Stage
// 2b (real styling) + Stage 2b state-lift fix + piece 14 (export menu,
// see shared/ExportMenu.tsx) + piece 15 (Vibe Prompt, see
// ./typeLock.ts) (2026-11-12).
//
// Piece 15: the Vibe Prompt field was entirely missing from Stage 2b's
// restyle - found during the real-window check, 2026-11-12. Ported his
// exact placeholder/position (between the text-file import block and
// Results Per Track, source lines 5842-5845) and the real hard type-
// lock filter behind it (buildCandidatePools' new typeLock param,
// ./typeLock.ts) - not just the input box. One correction to how this
// was asked for: it does NOT thread through to apps/server, because
// nothing on this screen calls the backend at all (CLAUDE.md 5.4 - the
// plain-text/file matching path is local-only by design, same as
// before this piece). The filter runs client-side, same place as the
// rest of this screen's matching logic.
//
// CLAUDE.md Section 5.4 explicitly lists "Playlist Cheat local matcher"
// under client-side, unprotected logic - this screen makes NO call to
// apps/server at all for the plain-text/file path. It fetches the
// already-imported library once and does all matching locally.
//
// Render order matches the source exactly (reference 5828-5882): rule-
// line -> card (Spotify URL [placeholder], Import From Text File [real
// drop/browse, ported], Vibe Prompt [real, piece 15], Results Per Track
// [radio pills], Build Crate) -> selected-count/Select All/Export
// Crate/Add To Crate -> results list.
//
// Deliberate addition to his design, recorded in CLAUDE2.md (Ranjish's
// call, flagged for Mike alongside the file-vs-paste decision): his
// text-file import is file-drop/browse ONLY. This screen keeps the
// paste textarea we already had AND adds his real file-drop/browse
// zone - both feed the exact same plainText state and the exact same
// matching logic, so a DJ can paste from an email or drop a .txt file,
// whichever is actually in front of them. Additive, not a fork.
//
// Stage 2b state-lift fix (2026-11-12, "Finding 3" from the real-window
// check): plainText/resultCount/results/selected used to be local
// useState here, so switching tabs and back (App.tsx unmounts this
// component on every tab change) wiped a DJ's matched results and
// selections. Source never had this problem because its whole app is
// one component that never unmounts between tabs. Fixed by lifting
// this state to App.tsx (PlaylistCheatWork, same pattern as crateList -
// docs/decisions/0019) and receiving it as props instead. The library
// fetch itself (just reference data, cheap to redo) and transient UI-
// only state (export menu open, drag-over highlight, export status
// message, sort order) stay local - losing those on tab-away is
// cosmetic, not data loss, same judgment call already made for Crate
// Cheat's own still-local prompt/sort/showExportMenu (CLAUDE2.md).
//
// Same piece also fixes two bugs the state-lift work exposed:
// - Deselect: onToggle used to only ever ASSIGN a selection, never
//   clear one - a DJ could never un-pick a song's match. Source's
//   handlePlaylistMatchToggle (line 1973) clears the key first and only
//   re-adds it if it wasn't already selected, so clicking the selected
//   match again drops that song to zero. Ported that exactly.
// - Select All: was a no-op, because every song already gets a default
//   selection the instant results come in (matches source's own
//   sel2[ri+"-0"]=true default, lines 4926/4972 - not a divergence) and
//   nothing could ever become deselected to restore. Now that deselect
//   is possible, Select All restores each song's current-or-default
//   pick. Deliberately NOT porting source's own Select All (line 5866,
//   setting every match of every song true at once) - that bypasses his
//   own one-per-song click rule and is the same inconsistency already
//   flagged in docs/QUESTIONS.md as a suspected source bug. Ranjish's
//   call (2026-11-12): ship the restore-only version, keep the question
//   open for Mike rather than copy a bug we already doubt is intended.

import { useEffect, useRef, useState } from "react";
import { matchPlaylistFromPlainText } from "./matchPlaylist.ts";
import { buildPlaylistExportData } from "./buildPlaylistExportData.ts";
import type { CrateTrack, PlaylistCheatWork } from "../App";
import type { DerivedTheme } from "../theme/deriveTheme";
import SectionRule from "../shared/SectionRule";
import EmptyLib from "../shared/EmptyLib";
import PhasePlaceholder from "../shared/PhasePlaceholder";
import RadioPillPicker, { type RadioPillOption } from "../shared/RadioPillPicker";
import { CheckboxListHeader } from "../shared/ResultRow";
import CheckboxTrackRow from "../shared/CheckboxTrackRow";
import ExportMenu, { type ReadyExportFormat } from "../shared/ExportMenu";
import { restoreSelectAll } from "./selectAll.ts";
import { applySort, handleSort, DEFAULT_SORT_STATE, type SortField, type SortState } from "../shared/sortResults";
import { cardStyle, lblStyle, inputStyle, buildBtnStyle, WHITE, GRAY } from "../shared/controlStyles";

// Source line 419, confirmed verbatim.
const RESULT_OPTIONS: readonly RadioPillOption[] = [
  { value: 1, label: "1 Match", desc: "Best match only. I trust you." },
  { value: 3, label: "3 Matches", desc: "Give me some options." },
  { value: 5, label: "5 Matches", desc: "I'm shopping my own groceries." }
];

type LibraryState = { status: "loading" } | { status: "ready"; library: CcdjLibraryRow[] };

interface PlaylistCheatScreenProps {
  onAddToCrate: (tracks: CrateTrack[]) => void;
  work: PlaylistCheatWork;
  setWork: (updater: PlaylistCheatWork | ((prev: PlaylistCheatWork) => PlaylistCheatWork)) => void;
  theme: DerivedTheme;
  onGoToLibrary: () => void;
}

export default function PlaylistCheatScreen({ onAddToCrate, work, setWork, theme, onGoToLibrary }: PlaylistCheatScreenProps): React.JSX.Element {
  const [libraryState, setLibraryState] = useState<LibraryState>({ status: "loading" });
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT_STATE);
  // Source's spRef (line 1337/5862) - scrolls the results into view
  // after a build, same as both buildFromSpotify (line 4929) and
  // buildFromPlainText (line 4975) do. Without it a DJ with a tall card
  // above (file loaded, Vibe Prompt filled in) could easily not notice
  // results landed below the fold.
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.ccdj.library.getAllTracks().then((library) => setLibraryState({ status: "ready", library }));
  }, []);

  const library = libraryState.status === "ready" ? libraryState.library : [];
  const isBusy = libraryState.status === "loading";
  const { results, selected } = work;

  function setPlainText(plainText: string): void {
    setWork((w) => ({ ...w, plainText }));
  }

  function setResultCount(resultCount: number): void {
    setWork((w) => ({ ...w, resultCount }));
  }

  function setVibePromptText(vibePromptText: string): void {
    setWork((w) => ({ ...w, vibePromptText }));
  }

  function handleMatch(): void {
    if (!work.plainText.trim() || isBusy) return;
    const matched = matchPlaylistFromPlainText(work.plainText, library, work.resultCount, work.vibePromptText);
    const defaults: Record<number, number> = {};
    matched.forEach((r, i) => {
      if (r.matches.length) defaults[i] = 0;
    });
    setWork((w) => ({ ...w, results: matched, selected: defaults }));
    // Same 100ms delay as source (lines 4929/4975) - lets the results
    // list actually render before measuring where to scroll to.
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  function loadTextFile(file: File): void {
    if (!file.name.endsWith(".txt")) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPlainText(String(ev.target?.result ?? ""));
    reader.readAsText(file);
  }

  function selectedCount(): number {
    return Object.keys(selected).length;
  }

  // Select All is restore-only (see the header comment above) - it has
  // nothing to do whenever every matched song already has a selection,
  // which is true the instant a build finishes (handleMatch's own
  // defaults). Dimming/disabling it in that state (Ranjish's call,
  // 2026-11-12) so its inertness reads as "nothing to restore," not as
  // a broken button - confirmed by reproduction in test/selectAll.test.js
  // that clicking it in that state is otherwise visually a no-op.
  const hasDeselected = results.some((r, ri) => r.matches.length > 0 && selected[ri] === undefined);

  // Source's handlePlaylistMatchToggle (line 1973): clear this song's
  // other match keys, then only re-add the clicked one if it wasn't
  // already selected - so clicking the selected match again deselects
  // the whole song, same as his.
  function handleToggle(ri: number, mi: number): void {
    setWork((w) => {
      const next = { ...w.selected };
      if (next[ri] === mi) {
        delete next[ri];
      } else {
        next[ri] = mi;
      }
      return { ...w, selected: next };
    });
  }

  // Restore-only Select All (Ranjish's call, 2026-11-12): re-selects
  // every matched song's current pick, or its default first match if it
  // was deselected. Deliberately NOT his literal "select every match of
  // every song at once" (source line 5866) - that conflicts with his own
  // one-per-song click rule and is an open suspected bug (docs/
  // QUESTIONS.md), not something to copy.
  function handleSelectAll(): void {
    setWork((w) => ({ ...w, selected: restoreSelectAll(w.results, w.selected) }));
  }

  function handleAddToCrate(): void {
    const tracks: CrateTrack[] = [];
    results.forEach((r, ri) => {
      const mi = selected[ri];
      if (mi === undefined) return;
      const m = r.matches[mi];
      if (!m) return;
      // Source's spotifyToPlaylist (line 4980): reason:"From Spotify"
      // on every pushed track, unconditionally - even for plain-text/
      // file-sourced matches, same as his hardcoded string.
      tracks.push({ trackId: m.id, name: m.displayName, bpm: m.bpm, key: m.key, reason: "From Spotify" });
    });
    if (tracks.length) onAddToCrate(tracks);
  }

  function handleExportUnavailable(label: string): void {
    setExportMessage(`${label} will be available in the desktop app.`);
    setShowExportMenu(false);
  }

  async function handleExportFile(format: ReadyExportFormat): Promise<void> {
    const data = buildPlaylistExportData(results, selected);
    setExportBusy(true);
    setExportMessage(null);
    try {
      const outcome = await window.ccdj.export.exportPlaylistTracks({ format, ...data });
      setExportMessage(outcome.cancelled ? null : `Saved: ${outcome.filePath}`);
    } catch (error) {
      setExportMessage(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExportBusy(false);
      setShowExportMenu(false);
    }
  }

  async function handleCopy(): Promise<void> {
    const { tracks } = buildPlaylistExportData(results, selected);
    await navigator.clipboard.writeText(tracks.map((t) => t.name).join("\n"));
    setExportMessage("Copied to clipboard.");
    setShowExportMenu(false);
  }

  function onSort(field: SortField): void {
    setSort((prev) => handleSort(prev, field));
  }

  if (!isBusy && library.length === 0) {
    return <EmptyLib theme={theme} onGoToLibrary={onGoToLibrary} />;
  }
  if (isBusy) {
    return <p style={{ color: GRAY }}>Loading library...</p>;
  }

  return (
    <div>
      <SectionRule theme={theme}>Build Your Own Crate From Spotify Playlist Or Text File</SectionRule>

      <div style={cardStyle(theme)}>
        <PhasePlaceholder phase={6} message="Real Spotify playlist import is coming in Phase 6">
          <label style={lblStyle}>Spotify Playlist URL</label>
          <input placeholder="https://open.spotify.com/playlist/..." style={{ ...inputStyle(theme), marginBottom: 16 }} readOnly />
        </PhasePlaceholder>

        <label style={lblStyle}>Import From Text File</label>
        <p style={{ fontSize: 11, color: GRAY, margin: "0 0 8px", lineHeight: 1.5 }}>
          One track per line, "Artist - Title" — runs through the exact same matching logic as a Spotify playlist.
        </p>
        <input
          type="file"
          accept=".txt"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) loadTextFile(f);
          }}
          style={{ display: "none" }}
          id="crateTextFileInput"
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) loadTextFile(f);
          }}
          style={{
            display: "inline-block",
            padding: "10px 16px",
            marginBottom: 16,
            borderRadius: 8,
            border: "1px dashed " + (dragOver ? theme.accent : theme.accentAlpha(0.4)),
            background: dragOver ? theme.accentAlpha(0.1) : "rgba(0,0,0,0.3)",
            color: work.plainText.trim() ? theme.accent : GRAY,
            fontSize: 12,
            fontWeight: 600,
            textAlign: "left",
            cursor: "pointer",
            boxSizing: "border-box",
            transition: "all 0.2s",
            width: "100%"
          }}
        >
          <label htmlFor="crateTextFileInput" style={{ display: "block", cursor: "pointer" }}>
            {work.plainText.trim() ? `✓ Text file loaded — ${work.plainText.trim().split("\n").filter((l) => l.trim()).length} lines` : "📁 Drag .txt file here or click to browse"}
          </label>
        </div>

        {/* Our own addition alongside his file-only mechanism (CLAUDE2.md,
            flagged for Mike) - same plainText state, same matching logic
            either way. */}
        <label style={lblStyle}>Or Paste Directly</label>
        <textarea
          value={work.plainText}
          onChange={(e) => setPlainText(e.target.value)}
          placeholder={"Daft Punk - One More Time\nBlackstreet - No Diggity"}
          style={{ width: "100%", minHeight: 80, fontSize: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid " + theme.accentAlpha(0.3), background: "rgba(0,0,0,0.6)", color: WHITE, resize: "vertical", boxSizing: "border-box", outline: "none", marginBottom: 16 }}
        />

        {/* Source line 5842-5843: Vibe Prompt sits between the text-file
            import block and Results Per Track. No normalizeSmartQuotes
            here - checked directly, his spotifyPrompt input (unlike
            Crate Cheat's prompt/crateVibePrompt) never calls it. */}
        <label style={lblStyle}>
          Vibe Prompt <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: theme.accentAlpha(0.5) }}>— Optional</span>
        </label>
        <input
          value={work.vibePromptText}
          onChange={(e) => setVibePromptText(e.target.value)}
          placeholder="e.g. give me redrums, hype intros only, more energy..."
          style={{ ...inputStyle(theme), marginBottom: 16 }}
        />

        <label style={lblStyle}>Results Per Track</label>
        <RadioPillPicker options={RESULT_OPTIONS} value={work.resultCount} onChange={setResultCount} theme={theme} disabled={!work.plainText.trim()} />

        <button onClick={handleMatch} disabled={!work.plainText.trim()} style={{ ...buildBtnStyle(theme, !work.plainText.trim()), width: "100%" }}>
          Build Crate
        </button>
      </div>

      {results.length > 0 && (
        <div ref={resultsRef} style={{ marginTop: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: theme.accent, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              {selectedCount()} / {results.reduce((sum, r) => sum + r.matches.length, 0)} Selected
            </span>
            <div style={{ display: "flex", gap: 8, position: "relative" }}>
              <button
                onClick={handleSelectAll}
                disabled={!hasDeselected}
                title={hasDeselected ? undefined : "Nothing deselected to restore"}
                style={{ fontSize: 12, padding: "6px 14px", background: "transparent", border: "1px solid " + theme.accentAlpha(0.3), borderRadius: 8, color: theme.accent, cursor: hasDeselected ? "pointer" : "not-allowed", opacity: hasDeselected ? 1 : 0.4 }}
              >
                Select All
              </button>
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowExportMenu((m) => !m)}
                  disabled={selectedCount() === 0}
                  style={{ fontSize: 12, padding: "6px 14px", background: "transparent", border: "1px solid " + theme.ia(0.5), borderRadius: 8, color: theme.accent, cursor: "pointer" }}
                >
                  Export Crate
                </button>
                {showExportMenu && (
                  <ExportMenu theme={theme} busy={exportBusy} onExportFile={handleExportFile} onCopy={handleCopy} onUnavailable={handleExportUnavailable} />
                )}
              </div>
              <button
                onClick={handleAddToCrate}
                disabled={selectedCount() === 0}
                style={{ fontSize: 12, padding: "6px 14px", background: "transparent", border: "1px solid " + theme.ia(0.5), borderRadius: 8, color: theme.accent, cursor: "pointer" }}
              >
                Add To Crate →
              </button>
            </div>
          </div>
          {exportMessage && <p style={{ fontSize: 12, color: GRAY, textAlign: "right" }}>{exportMessage}</p>}

          <div style={{ border: "1px solid " + theme.accentAlpha(0.15), borderRadius: 12, overflow: "hidden" }}>
            <CheckboxListHeader sortField={sort.field} sortDir={sort.dir} onSort={onSort} theme={theme} />
            {results.map((r, ri) => (
              <div key={ri}>
                <div style={{ padding: "8px 14px", background: "rgba(113,228,1,0.06)", borderBottom: "1px solid " + theme.accentAlpha(0.1) }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: theme.accentAlpha(0.7), textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {r.sourceArtist && <span style={{ color: GRAY, fontWeight: 400, textTransform: "none" }}>{r.sourceArtist} — </span>}
                    {r.sourceName}
                  </p>
                </div>
                {r.matches.length === 0 ? (
                  <div style={{ padding: "10px 28px", background: theme.rowEven, borderBottom: "1px solid " + theme.borderCol }}>
                    <p style={{ margin: 0, fontSize: 12, color: GRAY, fontStyle: "italic" }}>
                      {r.sourceArtist === "" ? "No Title Found In This Line" : "No Results Found In Your Library"}
                    </p>
                  </div>
                ) : (
                  applySort(
                    r.matches.map((m, mi) => ({ name: m.displayName, bpm: m.bpm, key: m.key, mi })),
                    sort
                  ).map((m, i) => (
                    <CheckboxTrackRow
                      key={m.mi}
                      t={m}
                      isSelected={selected[ri] === m.mi}
                      theme={theme}
                      rowBg={i % 2 === 0 ? theme.rowEven : theme.rowOdd}
                      onToggle={() => handleToggle(ri, m.mi)}
                      indent
                      dimOpacity={0.45}
                    />
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
