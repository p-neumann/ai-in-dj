// Client-side library search (CLAUDE.md Section 5.4: library search is
// acceptable, unprotected client-side logic). Pure on purpose - testable
// directly with node:test, no React/DOM needed.
//
// Same fields the measured SQL benchmark searched (displayName/artist/
// title) - the real database LIKE-search timing that justified this
// architecture stays directly comparable to what this function does.

export function filterTracks(tracks: CcdjLibraryRow[], term: string): CcdjLibraryRow[] {
  const q = term.trim().toLowerCase();
  if (!q) return tracks;
  return tracks.filter(
    (t) => t.displayName.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)
  );
}
