// Phase 5, step 5 piece 2 - the real Library screen.
//
// Architecture decided from real measurements (see db/tracks.ts's
// getAllTracksForLibrary): fetching the whole library (~38k real tracks)
// takes ~60ms total, done ONCE here; searching then happens instantly in
// this component's own memory (filterTracks.ts), never round-tripping to
// the database per keystroke.
//
// Virtualization (CLAUDE.md R25: "Library list | W (only 500 rows)" -
// the prototype's own limitation this screen removes): only the rows
// actually visible in the scroll viewport are ever real DOM elements,
// regardless of whether there are 10 tracks or 38,484 - that's what lets
// the full library scroll smoothly instead of freezing the window.

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { filterTracks } from "./filterTracks";

const ROW_HEIGHT = 32;

export default function LibraryScreen({ refreshSignal }: { refreshSignal: number }): React.JSX.Element {
  const [allTracks, setAllTracks] = useState<CcdjLibraryRow[] | null>(null);
  const [search, setSearch] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAllTracks(null);
    window.ccdj.library.getAllTracks().then(setAllTracks);
  }, [refreshSignal]);

  const filtered = useMemo(() => (allTracks ? filterTracks(allTracks, search) : []), [allTracks, search]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  });

  return (
    <section style={{ border: "2px solid #888", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Step 5, piece 2: Library</h2>

      {allTracks === null ? (
        <p style={{ color: "#666" }}>Loading library...</p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: "#666" }}>
            Showing <b>{filtered.length.toLocaleString()}</b> of {allTracks.length.toLocaleString()} tracks.
          </p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or artist..."
            style={{ width: "100%", boxSizing: "border-box", padding: "0.4rem" }}
          />

          <div
            ref={parentRef}
            style={{ height: 320, overflow: "auto", border: "1px solid #ccc", marginTop: "0.5rem" }}
          >
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const track = filtered[virtualRow.index];
                return (
                  <div
                    key={track.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: ROW_HEIGHT,
                      transform: `translateY(${virtualRow.start}px)`,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      fontSize: 13,
                      borderBottom: "1px solid #eee",
                      padding: "0 0.3rem",
                      boxSizing: "border-box"
                    }}
                  >
                    <span style={{ flex: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {track.displayName}
                    </span>
                    <span style={{ flex: "0 0 48px", color: "#666" }}>{track.bpm || "-"}</span>
                    <span style={{ flex: "0 0 36px", color: "#666" }}>{track.key || "-"}</span>
                    <span style={{ flex: 1, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {track.genre || "-"}
                    </span>
                    <span style={{ flex: "0 0 48px", color: "#666" }}>{track.year || "-"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
