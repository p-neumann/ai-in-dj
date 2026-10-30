// Declares the shape of window.ccdj for the renderer. Kept as its own
// small file, independent of the preload project's tsconfig, so the
// renderer doesn't need a cross-project type import to know this shape.

interface CcdjSampleTrack {
  id: number;
  displayName: string;
}

interface CcdjLibraryImportResult {
  cancelled: boolean;
  imported?: number;
  blankLinesSkipped?: number;
  rowsNeedingAttention?: number;
  totalRows?: number;
  sampleTracks?: CcdjSampleTrack[];
}

interface CcdjLibraryStatus {
  count: number;
  sampleTracks: CcdjSampleTrack[];
}

interface CcdjHistoryRow {
  id: number;
  timestamp: number;
  entry: unknown;
}

interface CcdjShowInFinderResult {
  ok: boolean;
  reason?: string;
}

interface CcdjBackendHealthResult {
  reachable: boolean;
  error?: string;
}

interface CcdjBackendSessionResult {
  ok: boolean;
  sessionId?: string;
  chainId?: string;
  stateVersion?: number;
  error?: string;
}

interface CcdjLibraryRow {
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

interface CcdjTrackCheatResult {
  ok: boolean;
  results?: Array<{ trackId: number; name: string; bpm: number; key: string; camp: string | null; lane: string | null }>;
  candidatePoolSize?: number;
  requested?: number;
  returned?: number;
  fallbackDepth?: number;
  simulated?: boolean;
  error?: string;
  chain?: { chainId: string; depth: number } | null;
  trigger?: string | null;
  mode?: string;
  stateVersion?: number | null;
  superseded?: boolean;
}

interface CcdjSessionEventResult {
  ok: boolean;
  accepted?: boolean;
  stateVersion?: number;
  duplicate?: boolean;
  error?: string;
}

interface CcdjCrateResult {
  ok: boolean;
  results?: Array<{ trackId: number; name: string; bpm: number; key: string }>;
  requested?: number;
  returned?: number;
  candidatePoolSize?: number;
  shortfallReason?: string | null;
  knowledgeCallMade?: string | null;
  simulated?: boolean;
  error?: string;
}

interface Window {
  ccdj: {
    library: {
      importFromFile: () => Promise<CcdjLibraryImportResult>;
      getStatus: () => Promise<CcdjLibraryStatus>;
      getAllTracks: () => Promise<CcdjLibraryRow[]>;
    };
    prefs: {
      get: (key: string) => Promise<string | null>;
      set: (key: string, value: string) => Promise<boolean>;
    };
    history: {
      append: (entry: unknown) => Promise<boolean>;
      list: (limit: number) => Promise<CcdjHistoryRow[]>;
    };
    showInFinder: (trackId: number) => Promise<CcdjShowInFinderResult>;
    setAlwaysOnTop: (flag: boolean) => Promise<boolean>;
    backend: {
      checkHealth: () => Promise<CcdjBackendHealthResult>;
      createSession: () => Promise<CcdjBackendSessionResult>;
      sendSessionEvent: (sessionId: string, event: Record<string, unknown>) => Promise<CcdjSessionEventResult>;
      recommendTrackCheat: (params: {
        seedTrackId: number;
        vibe: number;
        energy: number;
        playCountMode: string;
        sessionId?: string;
        clientSeq?: number;
        expectedStateVersion?: number;
      }) => Promise<CcdjTrackCheatResult>;
      buildCrate: (params: {
        prompt: string;
        size: number;
        crateVibePrompt?: string;
        playCountMode: string;
      }) => Promise<CcdjCrateResult>;
    };
  };
}
