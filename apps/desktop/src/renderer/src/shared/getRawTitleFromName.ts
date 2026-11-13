// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 718-729). Extracts just the title portion out of a
// library track's displayName, with artist and any version/BPM-range
// tag stripped off. Operates on displayName (filename-derived for
// Serato-style libraries), not the separate `.title` metadata field,
// matching the source exactly - CSV `.title` can be blank while the
// filename carries the real info.
//
// Promoted to shared/ (piece 17, 2026-11-13) - originally lived in
// playlistCheat/ (its first real use, matching a playlist's title text
// against the library), now also used by trackCheat/likeAsSeed.ts
// (matching a thumbs-upped result against every other version of the
// same song) - genuinely shared logic, not two coincidentally-similar
// copies, so it moved rather than being re-duplicated a third time.

export function getRawTitleFromName(name: string): string {
  let s = name.replace(/\s*-\s*(dirty|clean|explicit|radio|instrumental)\s*$/i, "").trim();
  // Strip a leading bracketed prefix first (e.g. a "(100-106)" BPM-range
  // tag) - without this, a name starting with "(" splits to an empty
  // string before ever reaching the real title (Mike's dated comment,
  // v1.0.13221 - this is exactly how a real duplicate slipped past dedup).
  s = s.replace(/^[([][^)\]]*[)\]]\s*/, "").trim();
  const beforeBracket = s.split(/[([]/)[0].trim();
  const parts = beforeBracket.split(" - ");
  return parts[parts.length - 1].trim().toLowerCase();
}
