// Phase 5, step 1 guard. These are security settings (CLAUDE.md Section
// 7.5), not preferences someone can quietly turn off to fix a bug - if one
// of these flags is removed from main/index.ts or preload/index.ts, this
// test fails instead of the problem shipping silently.
//
// Deliberately a source check, not a running-app check - it runs in CI
// with no Electron binary and no display. The real, built-app proof is a
// separate step: grep the compiled output in out/ after `npm run build`.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const mainSource = readFileSync(join(__dirname, "..", "src", "main", "index.ts"), "utf8");
const preloadSource = readFileSync(join(__dirname, "..", "src", "preload", "index.ts"), "utf8");

test("the window is created with contextIsolation on", () => {
  assert.match(mainSource, /contextIsolation:\s*true/);
});

test("the window is created with nodeIntegration off", () => {
  assert.match(mainSource, /nodeIntegration:\s*false/);
});

test("the window is created sandboxed", () => {
  assert.match(mainSource, /sandbox:\s*true/);
});

test("the window refuses to open new windows of its own", () => {
  assert.match(mainSource, /setWindowOpenHandler/);
  assert.match(mainSource, /action:\s*"deny"/);
});

test("the preload bridge is the only thing exposed to the renderer", () => {
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld/);
});

test("the preload refuses to expose anything if isolation is somehow off", () => {
  assert.match(preloadSource, /process\.contextIsolated/);
});

test("only one copy of the app may run at once (two copies would fight over the same database file)", () => {
  // Found for real: a second instance running by accident produced
  // "Unable to move the cache: Access is denied" GPU-cache errors, and
  // would mean two processes writing the same SQLite file at once.
  assert.match(mainSource, /requestSingleInstanceLock/);
  assert.match(mainSource, /second-instance/);
});

test("Phase 5 gate: no artifact-era shortcuts anywhere in the desktop source", () => {
  // CLAUDE.md's own Phase 5 gate: "no window.storage or api.anthropic.com
  // strings in the desktop bundle." Checked here against source as a fast
  // first check; the authoritative check is against the real built output
  // in out/, done separately after `npm run build`.
  for (const source of [mainSource, preloadSource]) {
    assert.doesNotMatch(source, /window\.storage/);
    assert.doesNotMatch(source, /api\.anthropic\.com/);
  }
});
