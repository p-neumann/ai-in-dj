// Unsigned development packaging - piece 15 (CLAUDE.md 11.3's packaged-
// app exclusion check). Produces a real, runnable, asar-packed app we
// can unpack and inspect. Nothing like this existed before this piece -
// there was no packaging tool in this repo at all.
//
// TOOL CHOICE: @electron/packager, not electron-builder or Forge.
// Packager's only job is "copy this app into a runnable, asar-packed
// folder" - it has no installer/signing pipeline sitting next to that
// one job waiting to be reached for. electron-builder/Forge can also
// produce an unsigned dir build, but their whole config surface is built
// around eventually producing SIGNED installers (dmg/nsis/etc) - every
// config file for them has a natural "add the signing block here" spot.
// Packager's config has no such spot at all. That match to the hard
// scope limit on this piece (no signing, no notarization, no
// certificates - that's Phase 10, needs an Apple Developer account we
// don't have) is the actual reason, not just a preference.
//
// Always rebuilds `out/` first (electron-vite build), so the package
// reflects whatever the CURRENT source is - this script is meant to be
// run again after every real piece of work (explicitly: after History
// Piece B, and again before any beta), not once and forgotten.
//
// Usage (from apps/desktop):
//   node scripts/buildDevPackage.js
//
// Output: dist-unsigned/ccdj-desktop-<platform>-<arch>/ (gitignored -
// a build artifact, never committed). Platform/arch default to THIS
// machine's own (Windows, during development) - the exclusion check
// itself (what ships in the JS bundle, what the app talks to over the
// network) is platform-independent; only the native .exe/.app wrapper
// differs. The real macOS build, signed and notarized, is Phase 10
// work, on a real Mac - this is not that.

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { packager } = require("@electron/packager");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist-unsigned");

// Found by the exclusion check itself, 2026-11-21: our own dependencies
// (@tanstack/react-virtual, @tanstack/virtual-core) ship .map files as
// part of their normal published npm package - legitimate upstream
// files, pointing only at their own already-public source, nothing of
// ours or Mike's. Still real findings under the check as written (no
// carve-out for "but it's only third-party") - simplest, safest fix is
// to strip every .map file before packing, regardless of where it came
// from. Runs on the STAGED build directory, before asar packing, so
// nothing map-shaped ever reaches the archive at all.
function stripSourceMaps(buildPath) {
  let removed = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".map")) {
        fs.unlinkSync(full);
        removed++;
      }
    }
  }
  walk(buildPath);
  console.log(`  Stripped ${removed} .map file(s) from the staged build before packing.`);
}

async function main() {
  console.log("Rebuilding out/ from current source (npm run build)...\n");
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });

  console.log("\nPackaging (unsigned, development only - no signing config exists to reach for)...\n");
  const appPaths = await packager({
    dir: ROOT,
    out: OUT_DIR,
    overwrite: true,
    // Strips devDependencies from the packaged node_modules. Claimed by
    // the tool, not just trusted - the exclusion check verifies this
    // directly by looking for devDependency package names in the output.
    prune: true,
    // Native bindings (better-sqlite3's .node file) cannot be required
    // from inside an asar archive - this unpacks any of them found into
    // app.asar.unpacked instead, which is the standard, documented way
    // to handle this, not a workaround.
    asar: { unpack: "**/*.node" },
    ignore: [
      /^\/src(\/|$)/,
      /^\/test(\/|$)/,
      /^\/scripts(\/|$)/,
      /^\/dist-unsigned(\/|$)/,
      /^\/\.exclusion-check-extracted(\/|$)/,
      /^\/\.env$/,
      /^\/\.env\.example$/,
      /^\/tsconfig.*\.json$/,
      /^\/tsconfig.*\.tsbuildinfo$/,
      /^\/electron\.vite\.config\.ts$/,
      /^\/package-lock\.json$/,
      // Vite's own internal dev-server dependency cache (left on disk by
      // `npm run dev`, never cleaned up by `npm run build`) - not part of
      // the real app, ships its own .map files for third-party libraries
      // if not excluded. Found by the exclusion check itself, 2026-11-21 -
      // see docs/decisions for the write-up.
      /node_modules\/\.vite(\/|$)/
    ],
    afterCopy: [
      async (opts) => {
        stripSourceMaps(opts.buildPath);
      }
    ]
  });

  console.log("\nPackaged at:");
  appPaths.forEach((p) => console.log("  " + p));
  console.log("\nNext: node scripts/exclusionCheck.js");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
