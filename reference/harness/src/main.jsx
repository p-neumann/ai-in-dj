import React from "react";
import { createRoot } from "react-dom/client";
import { installStorageShim } from "./shims/storage.js";
import { installRecordingFetch, seedRandom } from "./recorder.js";
import { installMockProvider } from "./mockProvider.js";

// Order matters:
// 1. Storage shim first - the prototype's effects read it on first render.
// 2. Recording fetch second - wraps the REAL fetch, redirecting only
//    api.anthropic.com calls to the local dev proxy and logging them.
// 3. Mock provider last - wraps whatever fetch #2 produced, so when mock
//    mode is on (the default) it answers AI calls itself, offline, and
//    never reaches step 2's redirect/proxy at all. When mock mode is
//    turned off it falls through to #2's real (proxied) call.
installStorageShim();
installRecordingFetch();
installMockProvider();
seedRandom(42); // fixed default seed; call window.__ccdjSeedRandom(n) from
                // devtools before a scenario to use a different one

window.__ccdjSeedRandom = seedRandom;

// Safety default: the prototype's own Artist Era Resolver toggle defaults to
// ON in its React state (useState(true), source line ~1266) regardless of
// what window.storage returns for a missing key. Left alone, importing a
// library in this harness could start firing background AI calls
// immediately. Until explicitly authorized, seed the same preference key
// the prototype itself writes (ARTIST_ERA_RESOLVER_ENABLED_KEY =
// "cheatcode_resolver_enabled") to "false" on first run only - if the app
// (or a person using the UI toggle) has already written a real preference,
// that choice is left alone rather than overwritten on every reload.
if (window.localStorage.getItem("cheatcode_resolver_enabled") === null) {
  window.localStorage.setItem("cheatcode_resolver_enabled", JSON.stringify(false));
}

async function mount() {
  const { default: App } = await import("../../CheatCodeDJ_v_1_0_22016.sanitized.jsx");
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

mount();
