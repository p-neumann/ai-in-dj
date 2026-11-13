// Phase 5, step 5 piece 17 (👍 thumbs-up reseed / handleLikeAsSeed).
// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 711-717), duplicated from the already-tested server
// copy (apps/server/src/engine/vibe.js) - this screen's thumbs-up
// reseed is a direct client-side library search per his own comment
// (source line 2486: "a direct client-side library search, not a
// model call"), so it needs its own BPM-window math client-side too,
// same cross-boundary judgment call as every other local-matching
// feature in this port (Playlist Cheat's typeLock.ts, etc.).

export function getBpmRange(seedBpm: number, vibeOff: number, energyOff: number): [number, number] | null {
  if (!seedBpm) return null;
  const bpm = seedBpm;
  if (!bpm) return null;
  if (energyOff !== 0) {
    const center = bpm + energyOff;
    return [center - 5, center + 5];
  }
  const half = vibeOff >= 5 ? 16 + (vibeOff - 5) * 4 : 8;
  return [bpm - half, bpm + half];
}
