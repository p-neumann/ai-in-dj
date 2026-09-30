// Fastify app (Phase 3 slice, now running the Phase 4 recommend pipeline
// plus the Section 6.4 session-event system). Stack per CLAUDE.md Section
// 5.2's decision, docs/decisions/0001-stack.md. Cross-platform Node/Fastify
// code - nothing here is macOS- or Windows-specific, so this runs
// identically on both.

import Fastify from "fastify";
import { checkDevToken } from "./auth/devToken.js";
import { recommendTrackCheat, ValidationError } from "./routes/trackCheat.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { createMockProvider } from "./providers/mockProvider.js";

// config: { devTokens: string[], provider: {call} }
// Defaults to the mock provider - callers must explicitly pass a real
// provider (created only when a real key exists AND live calls were
// authorized) to ever make a paid API call.
export function buildApp(config = {}) {
  const devTokens = config.devTokens || [];
  const provider = config.provider || createMockProvider();

  const app = Fastify({ logger: false });

  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/healthz") return;
    const auth = checkDevToken(request.headers["authorization"], devTokens);
    if (!auth.ok) {
      reply.code(401).send({ ok: false, error: { code: "UNAUTHENTICATED" } });
    }
  });

  registerSessionRoutes(app);

  app.post("/v1/track-cheat/recommend", async (request, reply) => {
    try {
      const data = await recommendTrackCheat(request.body || {}, provider);
      return { ok: true, data };
    } catch (err) {
      if (err instanceof ValidationError) {
        reply.code(400);
        return { ok: false, error: { code: "VALIDATION", message: err.message } };
      }
      request.log?.error?.(err);
      reply.code(502);
      return { ok: false, error: { code: "PROVIDER_ERROR", message: String(err.message || err) } };
    }
  });

  app.get("/healthz", async () => ({ ok: true }));

  return app;
}
