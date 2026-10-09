// Declares the shape of window.ccdj for the renderer. Kept as its own
// small file, independent of the preload project's tsconfig, so the
// renderer doesn't need a cross-project type import to know this shape.

interface CcdjLibraryImportResult {
  cancelled: boolean;
  imported?: number;
  blankLinesSkipped?: number;
  rowsNeedingAttention?: number;
  totalRows?: number;
  sampleNames?: string[];
}

interface CcdjLibraryStatus {
  count: number;
  sampleNames: string[];
}

interface Window {
  ccdj: {
    library: {
      importFromFile: () => Promise<CcdjLibraryImportResult>;
      getStatus: () => Promise<CcdjLibraryStatus>;
    };
  };
}
