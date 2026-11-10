// Phase 5, step 5 piece 6 - Playlist Cheat core (plain-text only).
//
// CLAUDE.md Section 5.4 explicitly lists "Playlist Cheat local matcher"
// under client-side, unprotected logic - unlike Track Cheat and Crate
// Cheat, this screen makes NO call to apps/server at all. It fetches the
// already-imported library once (the same window.ccdj.library.getAllTracks
// the Library screen already uses) and does all matching locally in this
// process.
//
// Deliberately out of scope for this piece (CLAUDE.md's own Phase 6,
// "Spotify via backend" - needs D2, secret rotation, and a proxy audit,
// none of which have happened): Spotify URL import. Only the plain-text/
// .txt path is built here. Also deferred, same as Track Cheat's own
// piece-3/piece-4 split: the Vibe Prompt type-lock and the cross-build
// "don't repeat this session" variety tracking (both real source
// behavior - see buildCandidatePools.ts's header comment).

import { useEffect, useState } from "react";
import { matchPlaylistFromPlainText } from "./matchPlaylist.ts";
import type { MatchedResult } from "./matchPlaylist.ts";
import type { CrateTrack } from "../App";

const RESULT_COUNTS = [1, 3, 5] as const;

type ResultState =
  | { status: "idle" }
  | { status: "loadingLibrary" }
  | { status: "ready"; library: CcdjLibraryRow[] }
  | { status: "matched"; library: CcdjLibraryRow[]; results: MatchedResult[] };

interface PlaylistCheatScreenProps {
  // docs/decisions/0019: source's "Add To Crate ->" (spotifyToPlaylist) -
  // adds whichever matches are currently selected into Crate Cheat's
  // own list, without erasing what's already there. CLAUDE.md never
  // documented this feature; confirmed directly against the reference
  // source instead (docs/QUESTIONS.md).
  onAddToCrate: (tracks: CrateTrack[]) => void;
}

export default function PlaylistCheatScreen({ onAddToCrate }: PlaylistCheatScreenProps): React.JSX.Element {
  const [plainText, setPlainText] = useState("");
  const [resultCount, setResultCount] = useState<number>(3);
  const [state, setState] = useState<ResultState>({ status: "loadingLibrary" });
  // Keyed by song index -> the index within that song's matches the DJ
  // has selected. Selecting a different match for the same song
  // overwrites this entry rather than adding to it - that IS "one version
  // per song" (CLAUDE.md 3.2): the data shape makes a second selection
  // for the same song impossible, not just visually discouraged.
  const [selected, setSelected] = useState<Record<number, number>>({});

  useEffect(() => {
    window.ccdj.library.getAllTracks().then((library) => setState({ status: "ready", library }));
  }, []);

  const library = state.status === "ready" || state.status === "matched" ? state.library : [];
  const results = state.status === "matched" ? state.results : [];
  const isBusy = state.status === "loadingLibrary";

  function handleMatch(): void {
    if (!plainText.trim() || state.status === "loadingLibrary") return;
    const matched = matchPlaylistFromPlainText(plainText, library, resultCount);
    setState({ status: "matched", library, results: matched });
    const defaults: Record<number, number> = {};
    matched.forEach((r, i) => {
      if (r.matches.length) defaults[i] = 0;
    });
    setSelected(defaults);
  }

  function selectedCount(): number {
    return Object.keys(selected).length;
  }

  // Source: spotifyToPlaylist - collects the currently-selected match
  // per song and hands them to Crate Cheat's list. No dedup here either
  // (matching the source exactly) - adding the same track twice, on
  // purpose or by accident, is allowed, same as his app.
  function handleAddToCrate(): void {
    const tracks: CrateTrack[] = [];
    results.forEach((r, ri) => {
      const mi = selected[ri];
      if (mi === undefined) return;
      const m = r.matches[mi];
      if (!m) return;
      tracks.push({ trackId: m.id, name: m.displayName, bpm: m.bpm, key: m.key });
    });
    if (tracks.length) onAddToCrate(tracks);
  }

  return (
    <section style={{ border: "2px solid #888", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Step 5, piece 6: Playlist Cheat (plain text)</h2>
      <p style={{ fontSize: 13, color: "#666" }}>
        Paste or type a playlist, one song per line ("Artist - Title", or just a title). Matched entirely against
        your own library - no AI, no network call. Spotify URL import is separate work (Phase 6 - needs Spotify's
        secret rotated and a decision on accounts first).
      </p>

      {state.status === "loadingLibrary" && <p style={{ color: "#666" }}>Loading your library...</p>}
      {(state.status === "ready" || state.status === "matched") && library.length === 0 && (
        <p style={{ color: "#c62828" }}>No library imported yet - import one on the Library screen first.</p>
      )}

      <div>
        <label>
          Playlist:
          <br />
          <textarea
            value={plainText}
            onChange={(e) => setPlainText(e.target.value)}
            placeholder={"Daft Punk - One More Time\nBlackstreet - No Diggity"}
            style={{ width: "100%", height: 100, marginTop: "0.3rem" }}
          />
        </label>
      </div>

      <div style={{ marginTop: "0.5rem" }}>
        <label>
          Versions per song:{" "}
          <select value={resultCount} onChange={(e) => setResultCount(Number(e.target.value))}>
            {RESULT_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button onClick={handleMatch} disabled={!plainText.trim() || isBusy} style={{ marginTop: "0.75rem" }}>
        Match against my library
      </button>

      {state.status === "matched" && (
        <div style={{ marginTop: "0.75rem" }}>
          <p style={{ fontSize: 13, color: "#666" }}>
            {results.filter((r) => r.matches.length > 0).length} of {results.length} matched &middot;{" "}
            {selectedCount()} selected
          </p>
          <button onClick={handleAddToCrate} disabled={selectedCount() === 0}>
            Add To Crate →
          </button>
          <ol style={{ paddingLeft: "1.2rem" }}>
            {results.map((r, ri) => (
              <li key={ri} style={{ marginBottom: "0.5rem" }}>
                {r.sourceArtist ? `${r.sourceArtist} - ${r.sourceName}` : r.sourceName}
                {r.matches.length === 0 ? (
                  // docs/decisions/0014: these are two different situations
                  // and the wording must not conflate them. No " - " in the
                  // pasted line means the parser could not identify a
                  // separate artist/title (sourceArtist is blank) - honest
                  // phrasing says so instead of claiming the DJ doesn't own
                  // the song, which assumes a title was correctly found.
                  // Only when sourceArtist is non-blank do we actually know
                  // what title was searched for, so only then is "no match
                  // in your library" a claim this screen can stand behind.
                  <span style={{ color: "#c62828" }}>
                    {" - "}
                    {r.sourceArtist === ""
                      ? "no title found in this line - try \"Artist - Title\" or just the title"
                      : "no match in your library"}
                  </span>
                ) : (
                  <ul style={{ paddingLeft: "1.2rem" }}>
                    {r.matches.map((m, mi) => (
                      <li key={m.id}>
                        <label>
                          <input
                            type="radio"
                            name={`song-${ri}`}
                            checked={selected[ri] === mi}
                            onChange={() => setSelected((prev) => ({ ...prev, [ri]: mi }))}
                          />{" "}
                          {m.displayName} - {m.bpm} bpm / {m.key}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
