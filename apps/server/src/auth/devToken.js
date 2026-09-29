// Minimal development authentication (CLAUDE.md Section 6.3): per-developer
// static tokens from server config, constant-time compared, reject anything
// else with UNAUTHENTICATED. This is NOT real accounts (Phase 6) - it
// exists only so no endpoint that can spend paid AI credits is ever
// reachable with zero authentication, even in dev.

import { timingSafeEqual } from "node:crypto";

function safeEqual(a, b) {
  const bufA = Buffer.from(a || "", "utf8");
  const bufB = Buffer.from(b || "", "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// tokens: array of valid dev token strings (from server config/env, never committed)
export function checkDevToken(authorizationHeader, tokens) {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return { ok: false };
  }
  const presented = authorizationHeader.slice("Bearer ".length);
  const match = (tokens || []).some((t) => safeEqual(presented, t));
  return { ok: match };
}
