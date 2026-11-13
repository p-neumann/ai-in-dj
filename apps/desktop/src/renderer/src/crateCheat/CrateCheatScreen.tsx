// Phase 5, step 5 piece 5 (core) + piece 8 (export) + piece 13, Stage
// 2b (real styling).
//
// Same division of labor as Track Cheat (piece 3): the actual crate-
// building pipeline already lives in the backend, built and tested in
// Phase 3/4 (engine/crateOrchestration.js). This screen only sends a
// prompt, size, and play-count mode to the already-built, already-
// tested POST /v1/crates/build route and shows what comes back -
// nothing here re-implements or changes any selection/ranking logic.
//
// Render order matches the source exactly, checked directly (reference
// 5884-5941): rule-line "Build Your Own Crate From Your Own Words" ->
// card (prompt textarea + mic, Vibe Prompt, size buttons, Build Crate
// right-aligned) -> selected-count/Select All/Export Crate dropdown ->
// crate list.
//
// Real, confirmed difference from his screen, kept deliberately (CLAUDE2.md,
// Ranjish's call, recorded for Mike): his Crate Cheat tab has NO play-
// count control at all - only Track Cheat does. This screen keeps its
// own, independent play-count control anyway (restyled as his radio
// pills), because the backend feature is real and a DJ choosing "deep
// cuts" for a crate while Track Cheat stays on "mix" is a genuine,
// wanted scenario - not a styling gap to silently remove.

import { useEffect, useState } from "react";
import { buildCrate } from "../api/backendClient";
import type { SharedSession, CrateTrack } from "../App";
import type { DerivedTheme } from "../theme/deriveTheme";
import SectionRule from "../shared/SectionRule";
import EmptyLib from "../shared/EmptyLib";
import PlayCountToggle from "../shared/PlayCountToggle";
import PhasePlaceholder from "../shared/PhasePlaceholder";
import { CheckboxListHeader } from "../shared/ResultRow";
import CheckboxTrackRow from "../shared/CheckboxTrackRow";
import ExportMenu, { type ReadyExportFormat } from "../shared/ExportMenu";
import { normalizeSmartQuotes } from "../shared/normalizeSmartQuotes";
import { applySort, handleSort, DEFAULT_SORT_STATE, type SortField, type SortState } from "../shared/sortResults";
import { cardStyle, lblStyle, inputStyle, buildBtnStyle, sizeBtnStyle, WHITE, GRAY } from "../shared/controlStyles";

// CLAUDE.md's own documented menu (R4) - six sizes, not an arbitrary range.
const CRATE_SIZES = [10, 25, 50, 100, 150, 200] as const;

type ResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: CcdjCrateResult }
  | { status: "error"; message: string };

interface CrateCheatScreenProps {
  sharedSession: SharedSession | null;
  crateList: CrateTrack[];
  setCrateList: (next: CrateTrack[]) => void;
  theme: DerivedTheme;
  onGoToLibrary: () => void;
}

export default function CrateCheatScreen({ sharedSession, crateList, setCrateList, theme, onGoToLibrary }: CrateCheatScreenProps): React.JSX.Element {
  const [libraryCount, setLibraryCount] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<number>(10);
  const [crateVibePrompt, setCrateVibePrompt] = useState("");
  const [playCountMode, setPlayCountMode] = useState("mix");
  const [result, setResult] = useState<ResultState>({ status: "idle" });
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT_STATE);
  const [showExportMenu, setShowExportMenu] = useState(false);
  // docs/decisions/0017: a TESTING CONTROL, not a real setting - default
  // stays "high" (Anthropic's own default), nothing about ranking,
  // prompts, or pool selection changes.
  const [effort, setEffort] = useState<"high" | "low">("high");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Just the count, not the whole library - this screen never needs
  // real track data client-side, only whether EmptyLib should show.
  useEffect(() => {
    window.ccdj.library.getStatus().then((status) => setLibraryCount(status.count));
  }, []);

  useEffect(() => {
    const all: Record<number, boolean> = {};
    crateList.forEach((_, i) => (all[i] = true));
    setSelected(all);
  }, [crateList]);

  const isBusy = result.status === "loading";
  const selectedCount = Object.values(selected).filter(Boolean).length;
  const sortedCrate = applySort(
    crateList.map((t, origIdx) => ({ ...t, origIdx })),
    sort
  );

  function onSort(field: SortField): void {
    setSort((prev) => handleSort(prev, field));
  }

  function handleSelectAll(): void {
    const all: Record<number, boolean> = {};
    crateList.forEach((_, i) => (all[i] = true));
    setSelected(all);
  }

  function selectedTracks(): CrateTrack[] {
    return crateList.filter((_, i) => selected[i]);
  }

  function handleExportUnavailable(label: string): void {
    setExportMessage(`${label} will be available in the desktop app.`);
    setShowExportMenu(false);
  }

  async function handleExportFile(format: ReadyExportFormat): Promise<void> {
    const tracks = selectedTracks();
    setExportBusy(true);
    setExportMessage(null);
    try {
      // "reason" (piece 19) is renderer-only state, never a DB column,
      // so it has to go over the wire itself - main can't look it up
      // by trackId the way it does displayName/bpm/key/location.
      const reasons: Record<number, string> = {};
      tracks.forEach((t) => {
        if (t.reason) reasons[t.trackId] = t.reason;
      });
      const outcome = await window.ccdj.export.exportCrateTracks({
        format,
        trackIds: tracks.map((t) => t.trackId),
        prompt,
        reasons
      });
      setExportMessage(outcome.cancelled ? null : `Saved: ${outcome.filePath}`);
    } catch (error) {
      setExportMessage(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExportBusy(false);
      setShowExportMenu(false);
    }
  }

  async function handleCopy(): Promise<void> {
    const text = selectedTracks()
      .map((t) => t.name)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setExportMessage("Copied to clipboard.");
    setShowExportMenu(false);
  }

  async function handleBuildCrate(): Promise<void> {
    if (!prompt.trim()) return;
    if (!sharedSession) {
      setResult({ status: "error", message: "Still connecting to the backend session - try again in a moment." });
      return;
    }
    setResult({ status: "loading" });
    try {
      const data = await buildCrate({
        prompt: prompt.trim(),
        size,
        crateVibePrompt: crateVibePrompt.trim() || undefined,
        playCountMode,
        sessionId: sharedSession.sessionId,
        debugOverride: { effort }
      });
      if (!data.ok) {
        setResult({ status: "error", message: data.error ?? "Unknown error" });
        return;
      }
      setResult({ status: "done", data });
      setCrateList((data.results ?? []).map((r) => ({ trackId: r.trackId, name: r.name, bpm: r.bpm, key: r.key })));
    } catch (error) {
      setResult({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (libraryCount === null) {
    return <p style={{ color: GRAY }}>Loading library...</p>;
  }
  if (libraryCount === 0) {
    return <EmptyLib theme={theme} onGoToLibrary={onGoToLibrary} />;
  }

  return (
    <div>
      {!sharedSession && (
        <p style={{ fontSize: 11, color: "#a15c00" }}>Connecting to backend session...</p>
      )}
      <p style={{ fontSize: 11, color: "#a15c00", marginBottom: "0.5rem" }}>
        <b>TESTING CONTROL</b> - effort (default stays high; this does not change ranking, prompts, or pool
        selection):{" "}
        <select value={effort} onChange={(e) => setEffort(e.target.value as "high" | "low")}>
          <option value="high">high (default)</option>
          <option value="low">low</option>
        </select>
      </p>

      <SectionRule theme={theme}>Build Your Own Crate From Your Own Words</SectionRule>

      <div style={cardStyle(theme)}>
        <label style={lblStyle}>Describe The Crate You Want To Build</label>
        <div style={{ position: "relative" }}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(normalizeSmartQuotes(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isBusy && libraryCount && prompt.trim() && size) void handleBuildCrate();
              }
            }}
            placeholder="e.g. playlist of 2000s hip hop bangers... deep cuts I haven't played much..."
            style={{ width: "100%", minHeight: 90, fontSize: 14, padding: "10px 48px 10px 12px", borderRadius: 8, border: "1px solid " + theme.accentAlpha(0.3), background: "rgba(0,0,0,0.6)", color: WHITE, resize: "vertical", boxSizing: "border-box", outline: "none" }}
          />
          <PhasePlaceholder phase={8} message="Voice input is coming in Phase 8">
            <button
              style={{ position: "absolute", bottom: 10, right: 10, width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer", background: "rgba(255,255,255,0.05)", color: GRAY, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              🎤
            </button>
          </PhasePlaceholder>
        </div>

        <label style={{ ...lblStyle, marginTop: 12 }}>
          Vibe Prompt <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: theme.accentAlpha(0.5) }}>— Optional</span>
        </label>
        <input
          value={crateVibePrompt}
          onChange={(e) => setCrateVibePrompt(normalizeSmartQuotes(e.target.value))}
          placeholder="e.g. give me redrums, hype intros only, more energy..."
          style={inputStyle(theme)}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: GRAY, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.12em" }}>Tracks</span>
          {CRATE_SIZES.map((n) => (
            <button key={n} onClick={() => setSize(n)} style={sizeBtnStyle(theme, size === n)}>
              {n}
            </button>
          ))}
        </div>

        {/* Deliberate departure from his layout (CLAUDE2.md, recorded for
            Mike): his Crate Cheat tab has no play-count control at all.
            Kept here anyway, restyled as his radio pills, since the
            underlying feature is real and independent of Track Cheat's
            own setting. */}
        <div style={{ marginTop: 12 }}>
          <PlayCountToggle mode={playCountMode} setMode={setPlayCountMode} accent={theme.accent} ia={theme.ia} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={handleBuildCrate} disabled={isBusy || !prompt.trim() || !size} style={{ ...buildBtnStyle(theme, isBusy || !prompt.trim() || !size), display: "flex", alignItems: "center", gap: 4 }}>
            {isBusy ? `Building${size > 50 ? ` (${Math.ceil(size / 50)} Batches)` : ""}...` : "Build Crate"}
          </button>
        </div>
      </div>

      {result.status === "error" && <p style={{ color: "#e03c3c", fontSize: 13 }}>Error: {result.message}</p>}
      {result.status === "done" && (
        <p style={{ fontSize: 12, color: GRAY, marginTop: "0.5rem" }}>
          {result.data.returned ?? 0} of {result.data.requested ?? 0} requested &middot; candidate pool{" "}
          {result.data.candidatePoolSize ?? 0}
          {result.data.shortfallReason && (
            <>
              {" "}
              &middot; <span style={{ color: "#e03c3c" }}>shortfall: {result.data.shortfallReason}</span>
            </>
          )}
          {" "}&middot; {result.data.simulated === false ? "REAL AI" : "simulated AI"}
        </p>
      )}

      {crateList.length === 0 && <p style={{ color: GRAY, fontSize: 13, marginTop: "1rem" }}>Nothing in the crate yet.</p>}

      {crateList.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: theme.accent, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              {selectedCount} / {crateList.length} Selected
            </span>
            <div style={{ display: "flex", gap: 8, position: "relative" }}>
              <button onClick={handleSelectAll} style={{ fontSize: 12, padding: "6px 14px", background: "transparent", border: "1px solid " + theme.accentAlpha(0.3), borderRadius: 8, color: theme.accent, cursor: "pointer" }}>
                Select All
              </button>
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowExportMenu((m) => !m)}
                  disabled={selectedCount === 0}
                  style={{ fontSize: 12, padding: "6px 14px", background: "transparent", border: "1px solid " + theme.ia(0.5), borderRadius: 8, color: theme.accent, cursor: "pointer" }}
                >
                  Export Crate ▾
                </button>
                {showExportMenu && (
                  <ExportMenu theme={theme} busy={exportBusy} onExportFile={handleExportFile} onCopy={handleCopy} onUnavailable={handleExportUnavailable} />
                )}
              </div>
            </div>
          </div>
          {exportMessage && <p style={{ fontSize: 12, color: GRAY, textAlign: "right" }}>{exportMessage}</p>}

          <div style={{ border: "1px solid " + theme.accentAlpha(0.15), borderRadius: 12, overflow: "hidden" }}>
            <CheckboxListHeader sortField={sort.field} sortDir={sort.dir} onSort={onSort} theme={theme} />
            {sortedCrate.map((t, i) => (
              <CheckboxTrackRow
                key={t.origIdx}
                t={t}
                isSelected={!!selected[t.origIdx]}
                theme={theme}
                rowBg={i % 2 === 0 ? theme.rowEven : theme.rowOdd}
                onToggle={() => setSelected((prev) => ({ ...prev, [t.origIdx]: !prev[t.origIdx] }))}
                dimOpacity={0.35}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
