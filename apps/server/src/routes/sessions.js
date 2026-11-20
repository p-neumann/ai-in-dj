// HTTP routes for session creation and session events (CLAUDE.md 6.4).

import { createSession, getSession } from "../session/sessionStore.js";
import { applyEvent, StaleEventError } from "../session/sessionEvents.js";

export function registerSessionRoutes(app) {
  app.post("/v1/sessions", async () => {
    const session = createSession();
    return { ok: true, data: { sessionId: session.sessionId, chainId: session.chainId, stateVersion: session.stateVersion } };
  });

  app.post("/v1/sessions/:id/events", async (request, reply) => {
    const session = getSession(request.params.id);
    if (!session) {
      reply.code(404);
      return { ok: false, error: { code: "VALIDATION", message: "Unknown sessionId" } };
    }

    const body = request.body || {};
    const idempotencyKey = request.headers["idempotency-key"] || null;

    if (typeof body.clientSeq !== "number") {
      reply.code(400);
      return { ok: false, error: { code: "VALIDATION", message: "clientSeq is required" } };
    }

    try {
      const result = applyEvent(session, { ...body, idempotencyKey });
      return { ok: true, data: result };
    } catch (err) {
      if (err instanceof StaleEventError) {
        reply.code(409);
        // docs/decisions/0020: the client's own position at rejection
        // time is already in the request body it just sent (clientSeq)
        // - echoing the SERVER's position too is what actually lets a
        // client (or a human reading a network tab) tell what's out of
        // sync, instead of just a bare code.
        return {
          ok: false,
          error: { code: "STALE_EVENT", serverLastClientSeq: err.serverLastClientSeq, serverStateVersion: err.serverStateVersion }
        };
      }
      reply.code(400);
      return { ok: false, error: { code: "VALIDATION", message: String(err.message || err) } };
    }
  });
}
