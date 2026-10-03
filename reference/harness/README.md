# CCDJ Characterization Harness (Phase 2) — dev proxy removed

**What this was:** a throwaway Vite + React app that ran the sanitized
prototype (`reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx`) in a normal
browser, so its behavior could be recorded as fixtures before anything was
ported. It was never the real desktop app.

**Status (Phase 4 complete):** per `CLAUDE.md`'s own Phase 4 gate ("delete the
Phase 2 dev proxy"), `dev-proxy/` — the local, temporary proxy that held a
personal Anthropic dev key and forwarded the prototype's unmodified
`fetch("https://api.anthropic.com/...")` calls so they could run outside
Claude.ai — has been deleted (2026-10-02). It was never deployed and held no
secrets of its own (the key lived only in a gitignored, never-committed
`dev-proxy/.env`). Real AI calls now go through the actual backend
(`apps/server`) via a provider abstraction (`apps/server/src/providers/`),
not a throwaway proxy.

The rest of this harness (`src/`, `reference/fixtures/`) remains as a
historical record of Phase 2's characterization work; `src/recorder.js`'s
host-rewrite comment referencing `dev-proxy/server.js` is now stale and
describes removed scaffolding, not current behavior.

The Spotify proxy path was left disabled in this harness (the third-party
proxy at `project-hnecq.vercel.app` is a separate, still-unaudited
dependency — see `docs/QUESTIONS.md`; unrelated to the dev proxy removed
here).
