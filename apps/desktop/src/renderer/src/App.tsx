// Placeholder renderer for the Phase 5 shell.
//
// This is NOT the CCDJ UI — the prototype's React tree gets ported into
// src/renderer/** later in Phase 5, split into components, with every
// window.storage call and every api.anthropic.com fetch replaced.
//
// For now it runs Phase 5's own stated test: "renderer cannot call fs or
// require". Each row below is a live check against the running window, so a
// regression in the main process's webPreferences shows up on screen.

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
      detail: "nodeIntegration: false — the renderer cannot load Node modules",
      pass: typeof w.require === "undefined"
    },
    {
      label: "process is unreachable",
      detail: "contextIsolation: true — no Node globals leak into the page",
      pass: typeof w.process === "undefined"
    },
    {
      label: "module is unreachable",
      detail: "no CommonJS scope in the renderer",
      pass: typeof w.module === "undefined"
    },
    {
      label: "window.ccdj bridge exists",
      detail: "the preload contextBridge loaded (currently exposing nothing)",
      pass: typeof w.ccdj === "object" && w.ccdj !== null
    }
  ];
}

export default function App(): React.JSX.Element {
  const checks = runChecks();
  const allPass = checks.every((c) => c.pass);

  return (
    <main className="shell">
      <header>
        <p className="eyebrow">CheatCode DJ · Phase 5</p>
        <h1>Desktop shell</h1>
        <p className="lede">
          Electron main, preload and renderer are wired. Next: SQLite
          persistence, then the library import, then the UI port.
        </p>
      </header>

      <section
        className={allPass ? "panel panel--ok" : "panel panel--bad"}
        aria-live="polite"
      >
        <h2>
          Process isolation
          <span className="verdict">{allPass ? "all passing" : "FAILING"}</span>
        </h2>
        <ul>
          {checks.map((c) => (
            <li key={c.label} className={c.pass ? "ok" : "bad"}>
              <span className="mark" aria-hidden="true">
                {c.pass ? "✓" : "✗"}
              </span>
              <span>
                <b>{c.label}</b>
                <em>{c.detail}</em>
              </span>
            </li>
          ))}
        </ul>
        <p className="foot">
          These mirror CLAUDE.md §7.5. If any row turns red, a security flag was
          removed from <code>src/main/index.ts</code>.
        </p>
      </section>
    </main>
  );
}
