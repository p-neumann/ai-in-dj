// PUT /v1/preferences (CLAUDE.md Section 6.4). Permanent preferences only
// (doPlay/doNotPlay session-only entries go through the `sessionPrefs`
// session event instead, per Section 6.4's own comment on that event).
//
// No per-user account/DB store exists yet (Phase 6) - preferences live on
// the session for now (sessionStore.js's own header on these fields
// explains the simplification). Style Profile enrichment is a real
// Anthropic call (engine/knowledgeCalls.js's resolveStyleProfileEnrichment,
// already ported and tested in Phase 4a) - per the documented contract
// this returns `{enrichmentStatus:"pending"}` immediately and the
// enrichment result lands on the session asynchronously; there is no
// polling endpoint for this in the current contract (unlike the resolver
// jobs API), so a caller only sees the effect on its NEXT recommend/build
// call once enrichment has actually finished.

import { getSession } from "../session/sessionStore.js";
import { resolveStyleProfileEnrichment } from "../engine/knowledgeCalls.js";

export function registerPreferencesRoutes(app, provider) {
  app.put("/v1/preferences", async (request, reply) => {
    const body = request.body || {};
    if (!body.sessionId) {
      reply.code(400);
      return { ok: false, error: { code: "VALIDATION", message: "sessionId is required (no account store exists yet)" } };
    }
    const session = getSession(body.sessionId);
    if (!session) {
      reply.code(400);
      return { ok: false, error: { code: "VALIDATION", message: "Unknown sessionId" } };
    }

    session.styleProfile = typeof body.styleProfile === "string" ? body.styleProfile : session.styleProfile;
    if (Array.isArray(body.doPlay)) session.doPlay = body.doPlay;
    if (Array.isArray(body.doNotPlay)) session.doNotPlay = body.doNotPlay;

    if (session.styleProfile && session.styleProfile.trim()) {
      // Fire-and-forget (source: the prototype's own save-triggers-one-
      // enrichment-call behavior, CLAUDE.md 3.5). Errors are swallowed by
      // resolveStyleProfileEnrichment itself (resolves to null on any
      // failure) - a failed enrichment just means no enrichment this time,
      // never a thrown/unhandled rejection.
      resolveStyleProfileEnrichment(session.styleProfile, provider).then((enrichment) => {
        session.styleProfileEnrichment = enrichment;
      });
    } else {
      session.styleProfileEnrichment = null;
    }

    return { ok: true, data: { enrichmentStatus: session.styleProfile && session.styleProfile.trim() ? "pending" : "none" } };
  });
}
