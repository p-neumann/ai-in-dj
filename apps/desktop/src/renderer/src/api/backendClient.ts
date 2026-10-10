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
