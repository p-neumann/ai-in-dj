// POST /v1/crates/build (CLAUDE.md Section 6.4). Thin HTTP wrapper around
// engine/crateOrchestration.js's buildCrate - the route's own job is just
// request shape, session-scoped per-prompt staleness (source:
// crateShownTracks/resetIfOverCap, CRATE_STALE_CAP=100), and mapping
// engine errors to the documented error codes (Section 6.3).
//
// `size` is the wire name for what the engine calls `playlistSize`
// (matches CLAUDE.md's own POST /v1/crates/build example body).
// doPlayList/doNotPlayList/styleProfile/styleProfileEnrichment may be
// supplied directly on the request as a one-off override; when omitted
// (not merely falsy - an explicit empty string/array still wins) and a
// sessionId is given, the session's own stored preferences are used
// instead (doPlay/doNotPlay via the `sessionPrefs` event, styleProfile/
// styleProfileEnrichment via PUT /v1/preferences - routes/preferences.js).
//
// docs/decisions/0011: accepts a libraryRevision the same way
// track-cheat/recommend does (docs/decisions/0009), instead of only the
// inline `library` this route originally took. Without this, Crate Cheat
// would hit the exact same real HTTP 413 Track Cheat hit against a real
// ~38k-track library sent inline on every call - same fix, same
// reasoning, extended to a second route rather than re-discovering it.

import { buildCrate, ValidationError, RequestTooLargeError } from "../engine/crateOrchestration.js";
import { getSession } from "../session/sessionStore.js";
import { getLibraryForRevision, LibraryOutOfSyncError } from "../library/libraryStore.js";
import { mapProviderError } from "../providers/providerErrors.js";

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

    try {
      // Two ways a caller can supply the library: inline (small test
      // fixtures, every existing test, unchanged) or by libraryRevision
      // (the real desktop app, after a one-time sync - same pattern as
      // track-cheat/recommend, docs/decisions/0009 and 0011).
      let library = body.library;
      if (!Array.isArray(library) || library.length === 0) {
        if (body.libraryRevision !== null && body.libraryRevision !== undefined) {
          const synced = getLibraryForRevision(body.libraryRevision);
          if (!synced) {
            throw new LibraryOutOfSyncError(
              "libraryRevision " + body.libraryRevision + " is stale or was never synced - resync via POST /v1/library/sync and retry"
            );
          }
          library = synced;
        }
      }

      const input = {
        library,
        prompt: body.prompt,
        playlistSize: body.size,
        crateVibePrompt: body.crateVibePrompt || "",
        styleProfile: body.styleProfile !== undefined ? body.styleProfile : ((session ? session.styleProfile : "") || ""),
        styleProfileEnrichment: body.styleProfileEnrichment !== undefined ? body.styleProfileEnrichment : ((session ? session.styleProfileEnrichment : null) || null),
        playCountMode: body.playCountMode || "mix",
        doPlayList: body.doPlayList !== undefined ? body.doPlayList : ((session ? session.doPlay : []) || []),
        doNotPlayList: body.doNotPlayList !== undefined ? body.doNotPlayList : ((session ? session.doNotPlay : []) || []),
        vibeOffset: body.vibeOffset || 0,
        shownSet
      };

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
      if (err instanceof LibraryOutOfSyncError) {
        reply.code(409);
        return { ok: false, error: { code: "LIBRARY_OUT_OF_SYNC", message: err.message } };
      }
      request.log?.error?.(err);
      const mapped = mapProviderError(err);
      reply.code(mapped.httpStatus);
      return { ok: false, error: { code: mapped.code, message: String(err.message || err), retryAfterMs: mapped.retryAfterMs } };
    }
  });
}
