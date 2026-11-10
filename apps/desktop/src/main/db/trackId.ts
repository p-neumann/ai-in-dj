// Stable track IDs (CLAUDE.md 5.5; docs/decisions/0008-stable-track-id.md).
// The same file always gets the same ID, so history, votes and Do Not Play
// keep pointing at the right track across re-imports.
//
// The location is normalized first so spelling differences of one path give
// one ID: separators (\ vs /), Unicode form (macOS may store "é" decomposed),
// and letter case (macOS and Windows file systems ignore it by default).
//
// Known limit: an external drive mounted under another name gives other
// paths, so other IDs. CLAUDE.md wants a volume identifier for that, which a
// CSV does not carry; it belongs with the Serato import (Phase 8b).

import { createHash } from "node:crypto";

export function normalizeLocation(location: string): string {
  return location.trim().replace(/\\/g, "/").normalize("NFC").toLowerCase();
}

// "t_" + the first 16 hex characters (64 bits) of SHA-256: text, not a number,
// because JavaScript cannot hold a 64-bit integer exactly.
export function trackId(location: string): string {
  return "t_" + createHash("sha256").update(normalizeLocation(location)).digest("hex").slice(0, 16);
}
