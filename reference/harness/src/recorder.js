// Phase 2 characterization recorder (CLAUDE.md Section "Phase 2").
//
// Two jobs, both required to run the sanitized prototype's AI calls outside
// Claude.ai without touching any of its prompt/selection logic:
//
// 1. Redirect: the prototype's 9 `fetch("https://api.anthropic.com/...")`
//    call sites are untouched source code. This wrapper rewrites only the
//    destination host to the local dev-proxy (see dev-proxy/server.js),
//    which is the thing that actually holds a real API key. Method,
//    headers, and body reach the proxy byte-for-byte.
// 2. Record: every such call's request body and raw response text are
//    captured into memory so a fixture can be saved with
//    `window.__ccdjDownloadRecordings()`.
//
// Also seeds Math.random so a recording session is reproducible (the
// prototype uses Math.random for shuffling/tie-breaking in a few places -
// without a fixed seed, two runs of the same scenario can't be diffed).

const DEV_PROXY_BASE = "http://localhost:8787";
const ANTHROPIC_HOST = "https://api.anthropic.com";

const recordings = [];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedRandom(seed) {
  Math.random = mulberry32(seed);
  window.__ccdjRandomSeed = seed;
}

function installRecordingFetch() {
  if (typeof window === "undefined") return;
  const realFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input.url;

    if (!url || !url.startsWith(ANTHROPIC_HOST)) {
      return realFetch(input, init);
    }

    const rewrittenUrl = DEV_PROXY_BASE + url.slice(ANTHROPIC_HOST.length);
    const startedAt = Date.now();
    const response = await realFetch(rewrittenUrl, init);
    const clone = response.clone();

    clone
      .text()
      .then((rawResponseText) => {
        recordings.push({
          seed: window.__ccdjRandomSeed ?? null,
          timestamp: startedAt,
          requestUrl: url,
          requestBody: init && init.body ? safeParse(init.body) : null,
          status: response.status,
          rawResponse: safeParse(rawResponseText)
        });
      })
      .catch(() => {
        /* recording is best-effort; never break the app over it */
      });

    return response;
  };

  window.__ccdjDownloadRecordings = function (filename) {
    const blob = new Blob([JSON.stringify(recordings, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `ccdj-recording-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  window.__ccdjRecordings = recordings;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export { installRecordingFetch, seedRandom };
