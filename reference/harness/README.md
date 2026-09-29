# CCDJ Characterization Harness (Phase 2)

**What this is:** a throwaway Vite + React app that runs the sanitized prototype
(`reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx`) in a normal browser, so its
current behavior can be recorded as fixtures before anything is ported. It is
**not** the real desktop app and is not meant to be kept long-term (deleted by
end of Phase 4 per `CLAUDE.md`).

## Why a local proxy is needed

The sanitized file still contains the prototype's real `fetch("https://api.anthropic.com/...")`
calls (9 call sites) — that's the behavior being characterized, so it isn't
changed. Those calls have no API key and only work inside Claude.ai. This
harness adds a **local, temporary dev proxy** (`dev-proxy/`) that holds a
personal Anthropic dev key and forwards requests, so the same unmodified
prototype code can run in a real browser. `src/recorder.js` rewrites only the
destination host from `api.anthropic.com` to `localhost:8787` — nothing else
about the request changes.

The Spotify proxy path is left disabled in this harness (the third-party proxy
at `project-hnecq.vercel.app` is an unaudited dependency — see
`docs/QUESTIONS.md`). Plain-text playlist import in Playlist Cheat does not
need Spotify and works normally.

## Prerequisites

- Node.js (v24.11.0 confirmed working elsewhere in this project)
- Your own Anthropic API key, for development use only (never the production
  key, never committed)

## Setup and running

```powershell
# PowerShell, in reference/harness/dev-proxy
Copy-Item .env.example .env
notepad .env          # put your real key in ANTHROPIC_API_KEY
npm install
npm start              # starts the proxy on http://localhost:8787
```

```powershell
# separate terminal, PowerShell, in reference/harness
npm install
npm run dev             # prints a localhost URL, normally http://localhost:5183
```

Open the printed URL. The prototype should load exactly as it does inside
Claude.ai, except AI calls now go through your local proxy instead of Claude.ai's
built-in auto-authentication.

## Recording a fixture

From the browser devtools console on the running harness page:

```js
window.__ccdjSeedRandom(42);       // pick/confirm a seed before the scenario
// ... perform the scenario in the UI (e.g. drop a seed track, adjust vibe) ...
window.__ccdjDownloadRecordings(); // downloads a JSON file with every
                                    // Anthropic request/response since page load
```

Move the downloaded file into `reference/fixtures/` with a descriptive name
(e.g. `track-cheat-vibe--3-chain-depth-2.json`) and note in the filename or a
companion note what scenario it captures.

## Safety notes

- The dev proxy enforces a daily request cap (`MAX_DAILY_REQUESTS` in
  `dev-proxy/.env`, default 50) so a runaway loop can't spend unbounded money
  on a personal key.
- The proxy only listens on `localhost` and only accepts the one endpoint
  (`POST /v1/messages`) the prototype calls. It is never deployed.
- Never commit `dev-proxy/.env` (already covered by the repo's `.gitignore`).
