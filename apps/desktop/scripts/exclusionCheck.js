// CLAUDE.md 11.3's packaged-app exclusion check - piece 15, 2026-11-21.
// Run against the real output of scripts/buildDevPackage.js. Confirms,
// with real printed evidence, not a pass/fail summary:
//
//   1. a full file inventory of what actually ships
//   2. no devDependencies shipped (packager's own `prune` claim, verified)
//   3. no .env files
//   4. no source maps (the classic way a clean-looking bundle still leaks -
//      the minified file is clean while a .map beside it has everything)
//   5. no trace of reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx - Mike's
//      entire prototype, full prompt library included, lives in this repo
//   6. no Anthropic key pattern, PEM private key header, or the
//      SPOTIFY_CLIENT_SECRET NAME (never its value - see the note in that
//      section; CLAUDE.md forbids ever printing/copying the real value,
//      so this deliberately never reads or searches for it)
//   7. no api.anthropic.com, no window.storage
//   8. none of a handful of REAL, distinctive phrases pulled directly
//      from apps/server's own prompt builders (not invented - see
//      PROMPT_SENTINELS below and where each one actually came from)
//   9. no file paths or path references to apps/server
//  10. a manual-review list of high-entropy strings (a heuristic, not a
//      pass/fail gate - minified bundles are full of base64 image data
//      and hashes that score "high entropy" with nothing wrong with them;
//      this surfaces candidates for a human to look at, it does not and
//      cannot replace that look)
//
// NOT checked here, on purpose: network behavior (whether the running
// app only ever talks to our backend). That needs the app actually
// running - see scripts/watchPackagedNetwork.js, run separately.
//
// NOT checked here, on purpose: code signing, notarization, certificates.
// That's Phase 10 - needs an Apple Developer account this project
// doesn't have, and is explicitly out of scope for this check.
//
// Meant to be run again and again (after History Piece B, before any
// beta, and anytime the packaging setup changes) - not a one-off. Exit
// code is 1 if anything was found, 0 if nothing was, so it can be
// wired into CI later without anyone needing to read the output by eye.
//
// Usage (from apps/desktop):
//   node scripts/buildDevPackage.js   (first, if dist-unsigned/ is stale or missing)
//   node scripts/exclusionCheck.js

const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");

const ROOT = path.resolve(__dirname, "..");
const APP_NAME = "ccdj-desktop";
const ARCH_DIR_PREFIX = `${APP_NAME}-`;
const DIST_DIR = path.join(ROOT, "dist-unsigned");
const EXTRACT_DIR = path.join(ROOT, ".exclusion-check-extracted");

// Real, distinctive text pulled directly from apps/server/src/engine/
// promptBuilder.js's buildSys() (lines ~61-93) - NOT invented. If any of
// these turn up client-side, a real system-prompt fragment leaked.
const PROMPT_SENTINELS = [
  "DAISY CHAIN BRIDGE MODE",
  "STYLE DRIFT MODE",
  "VIBE SLIDER DRIFT",
  "STANDING STYLE PREFERENCE (always applies",
  "EXCLUDE ENTIRELY, do not include even one",
  "SECONDARY, LOW-PRIORITY SIGNAL",
  "You are a DJ assistant. Return ONLY a valid JSON array"
];

// Package NAMES from apps/desktop/package.json's own devDependencies -
// read directly from that file below, not hand-copied, so this can't
// silently drift from the real list.
const PKG_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const DEV_DEP_NAMES = Object.keys(PKG_JSON.devDependencies || {});

function findPackageDir() {
  if (!fs.existsSync(DIST_DIR)) return null;
  const candidates = fs.readdirSync(DIST_DIR).filter((d) => d.startsWith(ARCH_DIR_PREFIX));
  return candidates.length ? path.join(DIST_DIR, candidates[0]) : null;
}

function listAllFiles(dir) {
  const out = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  }
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

function isProbablyText(filePath) {
  return /\.(js|cjs|mjs|jsx|ts|tsx|json|map|html|css|md|txt)$/i.test(filePath);
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function rel(p) {
  return path.relative(ROOT, p);
}

function section(title) {
  console.log("\n" + "=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

// Shannon entropy over the character distribution - a real, standard
// measure, not invented math. Higher = less repetitive/more random-
// looking. Used only to RANK candidates for a human to look at below,
// never to auto-pass or auto-fail anything.
function shannonEntropy(str) {
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  let entropy = 0;
  for (const ch in freq) {
    const p = freq[ch] / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function main() {
  const packageDir = findPackageDir();
  if (!packageDir) {
    console.error(`No packaged app found under ${rel(DIST_DIR)}. Run: node scripts/buildDevPackage.js first.`);
    process.exit(1);
  }
  const asarPath = path.join(packageDir, "resources", "app.asar");
  const unpackedDir = path.join(packageDir, "resources", "app.asar.unpacked");
  if (!fs.existsSync(asarPath)) {
    console.error(`${rel(asarPath)} not found - the packaged app doesn't have the shape this script expects.`);
    process.exit(1);
  }

  section("Packaged app under inspection");
  console.log(rel(packageDir));

  section("1. Extracting app.asar (a folder listing alone proves nothing - everything that matters is inside this archive)");
  if (fs.existsSync(EXTRACT_DIR)) fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
  asar.extractAll(asarPath, EXTRACT_DIR);
  console.log(`Extracted ${rel(asarPath)} -> ${rel(EXTRACT_DIR)}`);

  const asarFiles = listAllFiles(EXTRACT_DIR);
  const unpackedFiles = listAllFiles(unpackedDir);
  const allFiles = asarFiles.concat(unpackedFiles);
  const textFiles = allFiles.filter(isProbablyText);

  section(`2. Full file inventory (${allFiles.length} files: ${asarFiles.length} inside the asar, ${unpackedFiles.length} unpacked)`);
  allFiles.map(rel).sort().forEach((f) => console.log("  " + f));

  const findings = [];

  section("3. devDependencies - should NOT be shipped");
  const nodeModulesDir = path.join(EXTRACT_DIR, "node_modules");
  const shippedPackages = fs.existsSync(nodeModulesDir) ? fs.readdirSync(nodeModulesDir) : [];
  console.log("Packages present in the shipped node_modules: " + (shippedPackages.join(", ") || "(none)"));
  const leakedDevDeps = DEV_DEP_NAMES.filter((d) => shippedPackages.includes(d));
  if (leakedDevDeps.length) {
    findings.push("devDependencies shipped: " + leakedDevDeps.join(", "));
    console.log("FINDING: " + leakedDevDeps.join(", "));
  } else {
    console.log(`PASS - none of this project's ${DEV_DEP_NAMES.length} devDependencies (${DEV_DEP_NAMES.join(", ")}) appear.`);
  }

  section("4. .env files");
  const envFiles = allFiles.filter((f) => /(^|[\\/])\.env($|\.[^.]*$)/.test(f) && !f.endsWith(".env.example"));
  if (envFiles.length) {
    findings.push(".env file(s) shipped: " + envFiles.map(rel).join(", "));
    console.log("FINDING:\n  " + envFiles.map(rel).join("\n  "));
  } else {
    console.log("PASS - no .env file anywhere in the package.");
  }

  section("5. Source maps (.map) - these can leak original source even when the bundle beside them is clean");
  const mapFiles = allFiles.filter((f) => f.endsWith(".map"));
  if (mapFiles.length) {
    findings.push("Source map(s) shipped: " + mapFiles.map(rel).join(", "));
    console.log("FINDING:\n  " + mapFiles.map(rel).join("\n  "));
  } else {
    console.log("PASS - no .map files anywhere in the package.");
  }

  section("6. reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx - Mike's full prototype + prompt library");
  const refHits = [];
  for (const f of allFiles) {
    if (/CheatCodeDJ.*22016/i.test(path.basename(f))) refHits.push(rel(f) + " (filename match)");
  }
  for (const f of textFiles) {
    const text = readTextSafe(f);
    if (text && text.includes("v1.0.22016")) refHits.push(rel(f) + " (contains the literal string \"v1.0.22016\")");
  }
  if (refHits.length) {
    findings.push("reference prototype traces: " + refHits.join("; "));
    console.log("FINDING:\n  " + refHits.join("\n  "));
  } else {
    console.log("PASS - no file named after the reference prototype, and its version string appears nowhere.");
  }

  section("7. Secret patterns (checks for NAMES/PATTERNS, never for the real secret VALUE)");
  console.log("Note: this never reads or searches for the actual SPOTIFY_CLIENT_SECRET value - only its");
  console.log("variable NAME. CLAUDE.md explicitly forbids ever printing/copying that value, full stop.\n");
  const secretHits = [];
  const anthropicKeyRe = /sk-ant-[A-Za-z0-9_-]{10,}/;
  const privateKeyRe = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
  for (const f of textFiles) {
    const text = readTextSafe(f);
    if (!text) continue;
    if (anthropicKeyRe.test(text)) secretHits.push(rel(f) + " (Anthropic key pattern sk-ant-...)");
    if (privateKeyRe.test(text)) secretHits.push(rel(f) + " (PEM private key header)");
    if (text.includes("SPOTIFY_CLIENT_SECRET")) secretHits.push(rel(f) + " (the name SPOTIFY_CLIENT_SECRET)");
  }
  if (secretHits.length) {
    findings.push("Secret patterns: " + secretHits.join("; "));
    console.log("FINDING:\n  " + secretHits.join("\n  "));
  } else {
    console.log("PASS - no sk-ant- pattern, no PEM private key header, no SPOTIFY_CLIENT_SECRET name.");
  }

  section("8. Provider hostname / window.storage");
  const hostHits = [];
  for (const f of textFiles) {
    const text = readTextSafe(f);
    if (!text) continue;
    if (text.includes("api.anthropic.com")) hostHits.push(rel(f) + " (api.anthropic.com)");
    if (text.includes("window.storage")) hostHits.push(rel(f) + " (window.storage)");
  }
  if (hostHits.length) {
    findings.push("Forbidden strings: " + hostHits.join("; "));
    console.log("FINDING:\n  " + hostHits.join("\n  "));
  } else {
    console.log("PASS - no api.anthropic.com, no window.storage.");
  }

  section("9. Prompt sentinel phrases - real text copied from apps/server's own prompt builders");
  console.log("Source: apps/server/src/engine/promptBuilder.js, buildSys(). Checking for:");
  PROMPT_SENTINELS.forEach((p) => console.log(`  "${p}"`));
  console.log("");
  const promptHits = [];
  for (const f of textFiles) {
    const text = readTextSafe(f);
    if (!text) continue;
    for (const phrase of PROMPT_SENTINELS) {
      if (text.includes(phrase)) promptHits.push(rel(f) + ` -> "${phrase}"`);
    }
  }
  if (promptHits.length) {
    findings.push("Prompt sentinel phrase(s) found client-side: " + promptHits.join("; "));
    console.log("FINDING:\n  " + promptHits.join("\n  "));
  } else {
    console.log(`PASS - none of the ${PROMPT_SENTINELS.length} sentinel phrases appear anywhere in the client bundle.`);
  }

  section("10. apps/server reaching the desktop bundle");
  const serverPathHits = allFiles.filter((f) => /apps[\\/]server/i.test(f)).map(rel);
  const serverTextHits = [];
  for (const f of textFiles) {
    const text = readTextSafe(f);
    if (text && /apps[\\/]server/i.test(text)) serverTextHits.push(rel(f));
  }
  if (serverPathHits.length || serverTextHits.length) {
    findings.push("apps/server traces: " + serverPathHits.concat(serverTextHits).join("; "));
    console.log("FINDING:\n  " + serverPathHits.concat(serverTextHits).join("\n  "));
  } else {
    console.log("PASS - no file paths under apps/server, no path references to it in any file's content.");
  }

  section("11. High-entropy strings - MANUAL REVIEW LIST, not a pass/fail gate");
  console.log("Heuristic only. Minified JS and embedded images produce plenty of high-entropy-looking");
  console.log("strings with nothing wrong with them - this surfaces candidates for a human look, it");
  console.log("cannot replace one. Showing the top 15 by entropy, excluding obvious image/font data URIs.\n");
  const tokenRe = /[A-Za-z0-9+/_-]{40,}/g;
  const candidates = [];
  for (const f of textFiles) {
    const text = readTextSafe(f);
    if (!text) continue;
    let match;
    while ((match = tokenRe.exec(text))) {
      const token = match[0];
      const start = Math.max(0, match.index - 20);
      const context = text.slice(start, match.index);
      if (/data:(image|font)/.test(context)) continue; // embedded logo/font data - expected, not a secret
      candidates.push({ file: rel(f), token, entropy: shannonEntropy(token) });
    }
  }
  candidates.sort((a, b) => b.entropy - a.entropy);
  const top = candidates.slice(0, 15);
  if (top.length === 0) {
    console.log("No candidate tokens of 40+ characters found at all.");
  } else {
    top.forEach((c) => console.log(`  entropy ${c.entropy.toFixed(2)}  ${c.file}  ${c.token.slice(0, 60)}${c.token.length > 60 ? "..." : ""}`));
  }
  console.log(`\n(${candidates.length} total candidates found; showing the 15 highest-entropy for review.)`);

  section("RESULT");
  if (findings.length) {
    console.log(`${findings.length} FINDING(S) in checks 3-10 - see above. Do NOT treat this build as clean.`);
    process.exitCode = 1;
  } else {
    console.log(`No findings in checks 3-10, run against ${allFiles.length} real files (${textFiles.length} searched as text).`);
    console.log("Check 11's list above still needs a human look - it is not part of this pass/fail result.");
    console.log("\nNOT checked by this script: network behavior - run scripts/watchPackagedNetwork.js separately.");
    console.log("NOT checked by this script: code signing/notarization - that's Phase 10, out of scope here.");
  }
}

main();
