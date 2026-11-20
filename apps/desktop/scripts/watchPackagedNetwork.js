// CLAUDE.md 11.3's packaged-app exclusion check, network half - piece
// 15, 2026-11-21. The static checks (exclusionCheck.js) prove what's in
// the files; this proves what the RUNNING app actually talks to, which
// is a different question - a clean bundle could still be configured to
// call something else at runtime.
//
// This launches the packaged app and watches its real OS-level network
// connections for a window of time. It does NOT automate clicking
// anything inside the app - that would mean building and trusting a
// second piece of UI automation just to test the first, and this repo
// has no tooling for that. Drive the app yourself during the watch
// window: load the library if it isn't already, and run a real Track
// Cheat fetch (or a Crate Cheat build) - anything that would normally
// trigger a real AI call is exactly what you want happening while this
// is watching.
//
// Usage (from apps/desktop, with the real backend already running -
// `cd ../server && npm run dev` in another terminal):
//   node scripts/watchPackagedNetwork.js [seconds]
// Default watch window: 90 seconds. The app launches, you interact with
// it, and after the window closes this prints every distinct remote
// address:port the process actually connected to, split into "expected
// (loopback - our own backend)" and "ANYTHING ELSE", with a clear
// verdict. Needs PowerShell (Get-NetTCPConnection) - Windows only, same
// as the rest of this development machine's tooling.
//
// NOT checked here: code signing/notarization - Phase 10, out of scope.

const { spawn, execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "..");

// Found 2026-11-21 (Ranjish's real-window check): the PACKAGED app has
// no .env to load (correctly - it must never ship), so BACKEND_DEV_TOKEN
// is empty at runtime, the server's dev-token check rejects it with 401,
// and the app sits on "Still connecting to the backend session" forever.
// That's the right outcome for the shipped package. This TEST SCRIPT is
// not the shipped package - it's local tooling, so it's fine for it to
// read the local .env itself and hand the values to the spawned process
// as real env vars, the same way backendClient.test.js already sets
// BACKEND_DEV_TOKEN directly for its own tests. The .env file itself
// still never goes anywhere near dist-unsigned/.
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  console.warn("No apps/desktop/.env found - the spawned app will have no dev token and will fail to connect.");
}
const DIST_DIR = path.join(ROOT, "dist-unsigned");
const WATCH_SECONDS = Number(process.argv[2]) || 90;
const POLL_MS = 2000;

function findExe() {
  if (!fs.existsSync(DIST_DIR)) return null;
  const dir = fs.readdirSync(DIST_DIR).find((d) => d.startsWith("ccdj-desktop-"));
  if (!dir) return null;
  return path.join(DIST_DIR, dir, "ccdj-desktop.exe");
}

function getConnectionsForPid(pid) {
  try {
    const raw = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -OwningProcess ${pid} -ErrorAction SilentlyContinue | Select-Object RemoteAddress,RemotePort,State | ConvertTo-Json -Compress"`,
      { encoding: "utf8" }
    ).trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

// Electron spawns helper/renderer processes under the same parent - grab
// every pid in the process tree, not just the one `spawn` hands back,
// or a connection made by a renderer/GPU process would be invisible.
function getProcessTreePids(rootPid) {
  try {
    const raw = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress"`,
      { encoding: "utf8" }
    ).trim();
    const all = JSON.parse(raw);
    const byParent = {};
    for (const p of all) {
      byParent[p.ParentProcessId] = byParent[p.ParentProcessId] || [];
      byParent[p.ParentProcessId].push(p.ProcessId);
    }
    const result = new Set([rootPid]);
    const queue = [rootPid];
    while (queue.length) {
      const cur = queue.pop();
      for (const child of byParent[cur] || []) {
        if (!result.has(child)) {
          result.add(child);
          queue.push(child);
        }
      }
    }
    return [...result];
  } catch {
    return [rootPid];
  }
}

function isLoopback(addr) {
  return addr === "127.0.0.1" || addr === "::1" || addr === "localhost";
}

// "::" and "0.0.0.0" with RemotePort 0 are how Get-NetTCPConnection
// represents a LISTENING socket bound to "any address" - not a real
// remote connection, and not something this check cares about. Without
// this filter, the app's own listening sockets show up looking exactly
// like an outbound connection to nowhere.
function isListeningPlaceholder(addr, port) {
  return (addr === "::" || addr === "0.0.0.0") && port === 0;
}

async function main() {
  const exePath = findExe();
  if (!exePath || !fs.existsSync(exePath)) {
    console.error("No packaged app found. Run: node scripts/buildDevPackage.js first.");
    process.exit(1);
  }

  console.log(`Launching: ${exePath}`);
  console.log(`Watching for ${WATCH_SECONDS}s. Make sure the real backend is running (apps/server, npm run dev).`);
  console.log("DURING THIS WINDOW: load the library if needed, and run a real Track Cheat fetch or Crate Cheat build.\n");

  const child = spawn(exePath, [], { detached: true, stdio: "ignore" });
  const rootPid = child.pid;

  // Keyed by address+port but storing the ADDRESS SEPARATELY too - an
  // IPv6 address like "::1" contains colons itself, so re-splitting a
  // concatenated "addr:port" string on ":" is lossy and was WRONG here
  // before (found by actually running this, not assumed): it classified
  // ::1 (real IPv6 loopback) as "non-loopback" because split(":")[0]
  // on "::1:8080" returns "", not "::1".
  const seen = new Map(); // "addr|port" -> { address, port, state }
  const start = Date.now();
  while (Date.now() - start < WATCH_SECONDS * 1000) {
    const pids = getProcessTreePids(rootPid);
    for (const pid of pids) {
      for (const conn of getConnectionsForPid(pid)) {
        if (!conn || !conn.RemoteAddress) continue;
        if (isListeningPlaceholder(conn.RemoteAddress, conn.RemotePort)) continue;
        const key = `${conn.RemoteAddress}|${conn.RemotePort}`;
        seen.set(key, { address: conn.RemoteAddress, port: conn.RemotePort, state: conn.State });
      }
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  console.log("\nWatch window closed. Attempting to close the app...");
  try {
    execSync(`taskkill /PID ${rootPid} /T /F`, { stdio: "ignore" });
  } catch {
    // already closed, or close enough
  }

  console.log("\n" + "=".repeat(72));
  console.log("Every distinct remote endpoint seen during the watch window:");
  console.log("=".repeat(72));
  if (seen.size === 0) {
    console.log("(none - either nothing was interacted with during the window, or the app made no outbound connections)");
  }
  const loopback = [];
  const nonLoopback = [];
  for (const { address, port, state } of seen.values()) {
    const label = `${address}:${port} (${state})`;
    (isLoopback(address) ? loopback : nonLoopback).push(label);
  }
  console.log("\nLoopback (expected - our own backend on this machine):");
  loopback.forEach((l) => console.log("  " + l));
  if (!loopback.length) console.log("  (none)");

  console.log("\nNON-LOOPBACK (anything here needs an explanation):");
  nonLoopback.forEach((l) => console.log("  " + l));
  if (!nonLoopback.length) console.log("  (none)");

  console.log("\n" + "=".repeat(72));
  if (nonLoopback.length) {
    console.log(`RESULT: ${nonLoopback.length} non-loopback endpoint(s) seen - review each one above. This does NOT pass.`);
    process.exitCode = 1;
  } else {
    console.log("RESULT: no non-loopback connections seen during the watch window.");
    console.log("This is only as good as what you actually did during the window - if you didn't trigger a real");
    console.log("AI call, this hasn't proven anything about what happens when one fires. Re-run and confirm you");
    console.log("exercised Track Cheat/Crate Cheat for real before trusting a clean result.");
  }
}

main();
