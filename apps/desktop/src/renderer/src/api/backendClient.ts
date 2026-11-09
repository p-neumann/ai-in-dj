// The renderer's typed view of the backend connection (CLAUDE.md's own
// proposed layout: "src/renderer/api/ - typed backend client"). The real
// network call lives in the main process (src/main/backendClient.ts) -
// this file never touches the network itself; it's just a clean, typed
// surface for screens to call, growing as more backend endpoints get
// wired through step 5's later pieces.

export function checkBackendHealth(): Promise<CcdjBackendHealthResult> {
  return window.ccdj.backend.checkHealth();
}

export function createBackendSession(): Promise<CcdjBackendSessionResult> {
  return window.ccdj.backend.createSession();
}

export function recommendTrackCheat(params: {
  seedTrackId: number;
  vibe: number;
  energy: number;
  playCountMode: string;
  sessionId?: string;
  clientSeq?: number;
  expectedStateVersion?: number;
  debugOverride?: { effort?: string };
}): Promise<CcdjTrackCheatResult> {
  return window.ccdj.backend.recommendTrackCheat(params);
}

// Step 5, piece 4 (daisy-chain/votes): one session event per DJ action.
export function sendSessionEvent(
  sessionId: string,
  event: Record<string, unknown>
): Promise<CcdjSessionEventResult> {
  return window.ccdj.backend.sendSessionEvent(sessionId, event);
}

// Step 5, piece 5 (Crate Cheat). sessionId added in docs/decisions/0015
// so Crate Cheat shares the app's one session instead of sending none.
export function buildCrate(params: {
  prompt: string;
  size: number;
  crateVibePrompt?: string;
  playCountMode: string;
  sessionId?: string;
  debugOverride?: { effort?: string };
}): Promise<CcdjCrateResult> {
  return window.ccdj.backend.buildCrate(params);
}
