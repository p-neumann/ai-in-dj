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

interface Window {
  ccdj: {
    library: {
      importFromFile: () => Promise<CcdjLibraryImportResult>;
      getStatus: () => Promise<CcdjLibraryStatus>;
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
  };
}
