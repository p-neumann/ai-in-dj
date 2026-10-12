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

// Library sync (docs/decisions/0009): fixes the real 413 a full library
// caused on every recommend call. Sent on its own route with its own
// larger body limit (apps/server/src/routes/library.js) - recommend's
// own limit was never raised. CLAUDE.md 5.4 privacy rule: these fields
// only - no location, no path, ever.
export interface SyncLibraryTrack {
  id: number;
  displayName: string;
  artist: string;
  title: string;
  bpm: number;
  key: string;
  genre: string;
  year: number;
  playcount: number | null;
}

export interface SyncLibraryResult {
  ok: boolean;
  libraryRevision?: number;
  trackCount?: number;
  error?: string;
}

export async function syncLibraryToBackend(tracks: SyncLibraryTrack[]): Promise<SyncLibraryResult> {
  try {
    const res = await fetch(`${backendUrl()}/v1/library/sync`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ tracks })
    });
    const body = (await res.json()) as { ok: boolean; data?: { libraryRevision: number; trackCount: number }; error?: { message?: string } };
    if (!res.ok || !body.ok) {
      return { ok: false, error: body.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true, ...body.data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Piece 3 of step 5: Track Cheat. Sends only a libraryRevision now, never
// the library itself (that's the fix for the real 413 - see
// docs/decisions/0009). No sessionId yet on purpose: the real route
// treats that as optional and runs fully stateless without one (its own
// documented behavior) - chain/bridge/drift/exclusion memory is piece 4,
// not this one. Whether the call is real or simulated is decided
// entirely by apps/server's own LIVE_AI_CALLS - nothing here controls it.
export interface BackendTrackCheatRequest {
  libraryRevision: number;
  seedTrackId: number;
  vibe: number;
  energy: number;
  playCountMode: string;
}

export interface BackendTrackCheatResult {
  ok: boolean;
  errorCode?: string;
  results?: Array<{ trackId: number; name: string; bpm: number; key: string; camp: string | null; lane: string | null }>;
  candidatePoolSize?: number;
  requested?: number;
  returned?: number;
  fallbackDepth?: number;
  simulated?: boolean;
  error?: string;
}

export async function recommendTrackCheat(request: BackendTrackCheatRequest): Promise<BackendTrackCheatResult> {
  try {
    const res = await fetch(`${backendUrl()}/v1/track-cheat/recommend`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(request)
    });
    const body = (await res.json()) as {
      ok: boolean;
      data?: BackendTrackCheatResult;
      error?: { code?: string; message?: string };
    };
    if (!res.ok || !body.ok) {
      return { ok: false, errorCode: body.error?.code, error: body.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true, ...body.data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Step 5, piece 3, revised per Ranjish's real-library test (docs/decisions/0009):
// the orchestration for "sync if we don't have a revision yet, then
// recommend, and if the server forgot the library (LIBRARY_OUT_OF_SYNC -
// CLAUDE.md's own documented code for exactly this), resync once and
// retry" - as one plain, testable function. ipc.ts only owns WHERE the
// cached revision lives (module state tied to the app's lifetime); this
// owns HOW the sync-and-retry actually happens, so it can be tested the
// same way as every other function here (stub fetch, assert the call
// sequence) without needing a real Electron/IPC environment.
export async function recommendTrackCheatWithAutoSync(
  getTracks: () => SyncLibraryTrack[],
  cachedRevision: number | null,
  params: { seedTrackId: number; vibe: number; energy: number; playCountMode: string }
): Promise<{ result: BackendTrackCheatResult; revision: number | null }> {
  let revision = cachedRevision;

  if (revision === null) {
    const synced = await syncLibraryToBackend(getTracks());
    if (!synced.ok || synced.libraryRevision === undefined) {
      return { result: { ok: false, error: synced.error || "sync failed" }, revision: null };
    }
    revision = synced.libraryRevision;
  }

  let result = await recommendTrackCheat({ libraryRevision: revision, ...params });

  if (!result.ok && result.errorCode === "LIBRARY_OUT_OF_SYNC") {
    const resynced = await syncLibraryToBackend(getTracks());
    if (!resynced.ok || resynced.libraryRevision === undefined) {
      return { result: { ok: false, error: resynced.error || "resync failed" }, revision };
    }
    revision = resynced.libraryRevision;
    result = await recommendTrackCheat({ libraryRevision: revision, ...params });
  }

  return { result, revision };
}
