// POST /v1/crates/build (CLAUDE.md Section 6.4). Thin HTTP wrapper around
// engine/crateOrchestration.js's buildCrate - the route's own job is just
// request shape, session-scoped per-prompt staleness (source:
// crateShownTracks/resetIfOverCap, CRATE_STALE_CAP=100), and mapping
// engine errors to the documented error codes (Section 6.3).
//
// `size` is the wire name for what the engine calls `playlistSize`
// (matches CLAUDE.md's own POST /v1/crates/build example body). doPlayList/
// doNotPlayList/styleProfile/styleProfileEnrichment are accepted directly
// on the request for now (no account/preferences store exists yet - PUT
// /v1/preferences is not built in this phase); when a sessionId is given
// and the request omits doPlayList/doNotPlayList, the session's own
// sessionPrefs (set via the event API) are used instead.

import { buildCrate, ValidationError, RequestTooLargeError } from "../engine/crateOrchestration.js";
import { getSession } from "../session/sessionStore.js";

const CRATE_STALE_CAP = 100;

function promptKeyFor(prompt) {
  return "v1:" + String(prompt || "").slice(0, 100);
}

export function registerCrateRoutes(app, provider) {
  app.post("/v1/crates/build", async (request, reply) => {
    const body = request.body || {};
    let session = null;
    if (body.sessionId) {
      session = getSession(body.sessionId);
      if (!session) {
        reply.code(400);
        return { ok: false, error: { code: "VALIDATION", message: "Unknown sessionId" } };
      }
    }

    const promptKey = promptKeyFor(body.prompt);
    const shownSet = session ? (session.crateShownTracks[promptKey] || null) : null;

    const input = {
      library: body.library,
      prompt: body.prompt,
      playlistSize: body.size,
      crateVibePrompt: body.crateVibePrompt || "",
      styleProfile: body.styleProfile || "",
      styleProfileEnrichment: body.styleProfileEnrichment || null,
      playCountMode: body.playCountMode || "mix",
      doPlayList: body.doPlayList || (session ? session.doPlay : []) || [],
      doNotPlayList: body.doNotPlayList || (session ? session.doNotPlay : []) || [],
      vibeOffset: body.vibeOffset || 0,
      shownSet
    };

    try {
      const data = await buildCrate(input, provider);
      if (session && data.resultDisplayNames.length) {
        const existing = session.crateShownTracks[promptKey] || {};
        const base = Object.keys(existing).length >= CRATE_STALE_CAP ? {} : existing;
        const next = { ...base };
        data.resultDisplayNames.forEach((name) => { next[name] = true; });
        session.crateShownTracks[promptKey] = next;
      }
      const { resultDisplayNames, ...responseData } = data;
      return { ok: true, data: responseData };
    } catch (err) {
      if (err instanceof ValidationError) {
        reply.code(400);
        return { ok: false, error: { code: "VALIDATION", message: err.message } };
      }
      if (err instanceof RequestTooLargeError) {
        reply.code(413);
        return { ok: false, error: { code: "REQUEST_TOO_LARGE", message: err.message } };
      }
      request.log?.error?.(err);
      reply.code(502);
      return { ok: false, error: { code: "PROVIDER_ERROR", message: String(err.message || err) } };
    }
  });
}
