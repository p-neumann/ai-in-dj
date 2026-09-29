import React from "react";
import { createRoot } from "react-dom/client";
import { installStorageShim } from "./shims/storage.js";
import { installRecordingFetch, seedRandom } from "./recorder.js";

// Order matters: both shims must be in place before the prototype's App
// component mounts and runs its effects (several fire on first render).
installStorageShim();
installRecordingFetch();
seedRandom(42); // fixed default seed; call window.__ccdjSeedRandom(n) from
                // devtools before a scenario to use a different one

window.__ccdjSeedRandom = seedRandom;

const { default: App } = await import("../../CheatCodeDJ_v_1_0_22016.sanitized.jsx");

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
