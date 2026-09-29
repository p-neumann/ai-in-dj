// Shim for `window.storage`, a Claude.ai-only API the prototype depends on
// (CLAUDE.md Section 4 / 7.2). Backed by localStorage so the sanitized
// prototype can run in a normal browser for characterization purposes only.
// This is NOT the real desktop persistence layer (that's SQLite, Phase 5).
//
// Observed call shape in the prototype (grep for `window.storage.` in
// reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx):
//   window.storage.get(key, defaultValue) -> Promise<{ value }>
//   window.storage.set(key, value, scope)  -> Promise<void>
// Callers check `res && res.value`, so a missing key must resolve with the
// caller-supplied default rather than throwing or resolving to null.

function installStorageShim() {
  if (typeof window === "undefined") return;

  window.storage = {
    get(key, defaultValue) {
      return new Promise((resolve) => {
        try {
          const raw = window.localStorage.getItem(key);
          resolve({ value: raw !== null ? raw : defaultValue });
        } catch (err) {
          resolve({ value: defaultValue });
        }
      });
    },
    set(key, value /*, scope */) {
      return new Promise((resolve, reject) => {
        try {
          window.localStorage.setItem(key, value);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }
  };
}

export { installStorageShim };
