// POST /v1/library/sync (CLAUDE.md Phase 5 file list: "sync client";
// Section 6.3: "larger for sync chunks"). This is the one route allowed
// a bigger body - everything else (recommend, crate build) stays at
// Fastify's normal default specifically so a library can never
// accidentally end up inline there again.

import { syncLibrary } from "../library/libraryStore.js";

// 30MB: comfortably covers a real ~38k-track library sent as plain JSON
// (measured in apps/desktop at ~8MB for the lean per-track shape this
// route expects) with a wide margin, without being unbounded.
const SYNC_BODY_LIMIT = 30 * 1024 * 1024;

export function registerLibraryRoutes(app) {
  app.post("/v1/library/sync", { bodyLimit: SYNC_BODY_LIMIT }, async (request, reply) => {
    const { tracks } = request.body || {};
    if (!Array.isArray(tracks)) {
      reply.code(400);
      return { ok: false, error: { code: "VALIDATION", message: "tracks must be an array" } };
    }
    const result = syncLibrary(tracks);
    return { ok: true, data: result };
  });
}
