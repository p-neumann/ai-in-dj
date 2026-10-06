// Phase 5 guard: the process-isolation flags in the main process are security
// settings (CLAUDE.md Section 7.5), not preferences. If someone turns one off
// to work around a problem, this test fails instead of the problem shipping.
//
// These are source assertions, not a running-app check — deliberate, so they
// run in CI with no Electron binary and no display. The live check is the
// panel the renderer draws on screen (src/renderer/src/App.tsx).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const mainSource = readFileSync(
  join(__dirname, "..", "src", "main", "index.ts"),
  "utf8"
);
const preloadSource = readFileSync(
  join(__dirname, "..", "src", "preload", "index.ts"),
  "utf8"
);

test("renderer runs with contextIsolation on", () => {
  assert.match(mainSource, /contextIsolation:\s*true/);
});

test("renderer runs with nodeIntegration off", () => {
  assert.match(mainSource, /nodeIntegration:\s*false/);
});

test("renderer runs sandboxed", () => {
  assert.match(mainSource, /sandbox:\s*true/);
});

test("the window refuses to open child windows", () => {
  assert.match(mainSource, /setWindowOpenHandler/);
  assert.match(mainSource, /action:\s*"deny"/);
});

test("the preload bridge is the only thing reaching the renderer", () => {
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld/);
});

test("the preload refuses to expose anything without contextIsolation", () => {
  assert.match(preloadSource, /process\.contextIsolated/);
});

test("Phase 5 gate: no artifact-era APIs in the desktop source", () => {
  // CLAUDE.md Phase 5 gate — "no window.storage or api.anthropic.com strings
  // in the desktop bundle". This checks the source; the build output is
  // checked by the Section 11.3 packaged-app exclusion check before release.
  for (const source of [mainSource, preloadSource]) {
    assert.doesNotMatch(source, /window\.storage/);
    assert.doesNotMatch(source, /api\.anthropic\.com/);
  }
});
