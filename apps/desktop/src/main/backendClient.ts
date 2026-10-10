// The real HTTP connection to the backend server. Lives in the main
// process on purpose (CLAUDE.md Section 5.6's own diagram shows the
// "HTTPS + bearer token" line coming out of main, not the renderer) - the
// renderer never makes a network call itself and never sees this token,
// even though it's just a local dev-only value today (CLAUDE.md Section
// 6.3: real accounts are Phase 6, not built here).
//
// Piece 1 of step 5: only enough to prove the pipe works. No AI call
// lives here yet - that's later pieces, and even then this file never
// decides whether a call is real or simulated (apps/server's own
// LIVE_AI_CALLS controls that, same as it already does for the manual
// test harness).

// Read lazily, at call time, not at module-load time - main/index.ts
// loads the .env file before any of these functions are actually called,
// but ESM import ordering means a module-level read here could run
// before that load happens.
function backendUrl(): string {
  return process.env.BACKEND_URL || "http://localhost:8080";
}

function authHeaders(): Record<string, string> {
  const token = process.env.BACKEND_DEV_TOKEN || "";
  return token ? { authorization: `Bearer ${token}` } : {};
}

export interface HealthResult {
  reachable: boolean;
  error?: string;
}

export async function checkBackendHealth(): Promise<HealthResult> {
  try {
    const res = await fetch(`${backendUrl()}/healthz`);
    return { reachable: res.ok };
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface CreateSessionResult {
  ok: boolean;
  sessionId?: string;
  chainId?: string;
  stateVersion?: number;
  error?: string;
}

export async function createBackendSession(): Promise<CreateSessionResult> {
  try {
    const res = await fetch(`${backendUrl()}/v1/sessions`, {
      method: "POST",
      headers: authHeaders()
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as { ok: boolean; data: { sessionId: string; chainId: string; stateVersion: number } };
    return { ok: true, ...body.data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
