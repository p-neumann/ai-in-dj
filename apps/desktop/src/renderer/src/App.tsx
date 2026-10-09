// Phase 5 placeholder screen.
//
// This is NOT the real CCDJ UI - that gets ported in later (step 5), once
// the locked-door bridge's real functions exist to connect it to. For now
// this screen exists to make each step's own point visible on screen,
// live, in the actually-running app.

import { useEffect, useState } from "react";

type Check = {
  label: string;
  detail: string;
  pass: boolean;
};

function runChecks(): Check[] {
  const w = window as unknown as Record<string, unknown>;
  return [
    {
      label: "require is unreachable",
      detail: "nodeIntegration: false - the renderer cannot load Node modules",
      pass: typeof w.require === "undefined"
    },
    {
      label: "process is unreachable",
      detail: "contextIsolation: true - no Node globals leak into the page",
      pass: typeof w.process === "undefined"
    },
    {
      label: "module is unreachable",
      detail: "no CommonJS scope in the renderer",
      pass: typeof w.module === "undefined"
    },
    {
      label: "window.ccdj bridge exists",
      detail: "the preload script loaded",
      pass: typeof w.ccdj === "object" && w.ccdj !== null
    }
  ];
}

type ImportState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "saved"; count: number; sampleNames: string[] }
  | { status: "importing" }
  | {
      status: "done";
      imported: number;
      blankLinesSkipped: number;
      rowsNeedingAttention: number;
      totalRows: number;
      sampleNames: string[];
    }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export default function App(): React.JSX.Element {
  const checks = runChecks();
  const allPass = checks.every((c) => c.pass);

  const [importState, setImportState] = useState<ImportState>({ status: "loading" });

  // On startup, show whatever was already imported and saved, rather than
  // looking empty until the DJ re-imports a file that's genuinely already
  // in the database (CLAUDE.md's own Phase 5 "Expected result": a restart
  // keeps permanent data).
  useEffect(() => {
    window.ccdj.library.getStatus().then((status) => {
      setImportState(status.count > 0 ? { status: "saved", ...status } : { status: "empty" });
    });
  }, []);

  async function handleImport(): Promise<void> {
    setImportState({ status: "importing" });
    try {
      const result = await window.ccdj.library.importFromFile();
      if (result.cancelled) {
        setImportState({ status: "cancelled" });
        return;
      }
      setImportState({
        status: "done",
        imported: result.imported ?? 0,
        blankLinesSkipped: result.blankLinesSkipped ?? 0,
        rowsNeedingAttention: result.rowsNeedingAttention ?? 0,
        totalRows: result.totalRows ?? 0,
        sampleNames: result.sampleNames ?? []
      });
    } catch (error) {
      setImportState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640 }}>
      <p style={{ textTransform: "uppercase", letterSpacing: "0.08em", color: "#888", fontSize: 12 }}>
        CheatCode DJ &middot; Phase 5
      </p>
      <h1>Desktop shell</h1>
      <p>
        Step 1: window opens with the security locks on. Step 2: a real local database (resize/move this window,
        quit, reopen - it remembers). Step 3 (below): real library import, saved for good. Next: the rest of the
        locked-door bridge, then the real screens.
      </p>

      <section
        style={{
          border: `2px solid ${allPass ? "#2e7d32" : "#c62828"}`,
          borderRadius: 8,
          padding: "1rem",
          marginTop: "1rem"
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          Process isolation - {allPass ? "all passing" : "FAILING"}
        </h2>
        <ul style={{ paddingLeft: "1.2rem" }}>
          {checks.map((c) => (
            <li key={c.label}>
              <b>{c.pass ? "✓" : "✗"} {c.label}</b>
              <br />
              <span style={{ color: "#666", fontSize: 13 }}>{c.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ border: "2px solid #888", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Step 3: library import</h2>
        <button onClick={handleImport} disabled={importState.status === "importing"}>
          {importState.status === "importing" ? "Importing..." : "Import CSV library..."}
        </button>

        {importState.status === "loading" && <p style={{ color: "#666" }}>Checking saved library...</p>}
        {importState.status === "empty" && <p style={{ color: "#666" }}>Nothing imported yet.</p>}
        {importState.status === "cancelled" && <p style={{ color: "#666" }}>No file selected.</p>}
        {importState.status === "error" && <p style={{ color: "#c62828" }}>Error: {importState.message}</p>}

        {importState.status === "saved" && (
          <div style={{ marginTop: "0.5rem" }}>
            <p>
              <b>{importState.count}</b> tracks saved from before (loaded from the database, not re-imported).
            </p>
            <SampleList names={importState.sampleNames} />
          </div>
        )}

        {importState.status === "done" && (
          <div style={{ marginTop: "0.5rem" }}>
            <p>
              Imported <b>{importState.imported}</b> tracks out of {importState.totalRows} rows.
              {importState.blankLinesSkipped > 0 && (
                <> {importState.blankLinesSkipped} blank line(s) skipped.</>
              )}
              {importState.rowsNeedingAttention > 0 && (
                <>
                  {" "}
                  <span style={{ color: "#c62828" }}>
                    {importState.rowsNeedingAttention} row(s) need attention (had some data, but no usable
                    title/location).
                  </span>
                </>
              )}
            </p>
            <SampleList names={importState.sampleNames} />
          </div>
        )}
      </section>
    </main>
  );
}

function SampleList({ names }: { names: string[] }): React.JSX.Element | null {
  if (names.length === 0) return null;
  return (
    <ul style={{ paddingLeft: "1.2rem", fontSize: 13, color: "#666" }}>
      {names.map((name) => (
        <li key={name}>{name}</li>
      ))}
    </ul>
  );
}
