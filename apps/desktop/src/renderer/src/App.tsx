// Phase 5, step 1 placeholder screen.
//
// This is NOT the real CCDJ UI - that gets ported in later, once there's a
// real database and library import for it to show. For now this screen
// exists to make step 1's whole point visible on screen: prove, while the
// app is actually running, that the renderer really can't reach Node or
// the filesystem, even though main/index.ts's webPreferences say so.

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
      detail: "the preload script loaded (it exposes nothing yet)",
      pass: typeof w.ccdj === "object" && w.ccdj !== null
    }
  ];
}

export default function App(): React.JSX.Element {
  const checks = runChecks();
  const allPass = checks.every((c) => c.pass);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640 }}>
      <p style={{ textTransform: "uppercase", letterSpacing: "0.08em", color: "#888", fontSize: 12 }}>
        CheatCode DJ &middot; Phase 5
      </p>
      <h1>Desktop shell</h1>
      <p>Step 1: the window opens with the security locks on from the start. Next: a real local database.</p>

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
    </main>
  );
}
