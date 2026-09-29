// Phase 3 vertical slice: Track Cheat recommend pipeline.
//
// SCOPE (see candidateSelection.js and resolveResults.js headers for detail):
// covers the plain, non-hybrid, non-type-locked path only. Fallback calls
// (R28), hybrid modes (bridge/drift/vibe-drift), Do Not Play (R27), and full
// buildSys prompt text are Phase 4 work, not this slice.
//
// This module never decides which provider to use - it's handed one
// (mock or real Anthropic) by the caller (app.js), so it can be tested with
// zero network calls and zero API key.

import { buildSmartCtx } from "../engine/candidateSelection.js";
import { resolveRes } from "../engine/resolveResults.js";
import { getDisplayName } from "../engine/trackNames.js";
import { parseJSON } from "../engine/parsing.js";

// Faithful to doFetch's own request body (source line 2566) for the
// non-hybrid default case: model, max_tokens, and the user-message wording
// (hard rules, "Return JSON array of 20 tracks") are copied as-is. The
// SYSTEM prompt below is a deliberately partial stand-in for the real
// buildSys (source ~L2360-2457): it keeps the exact jsonShape contract
// buildSys uses for the default case ("[{id,name,bpm,key}]", array of 12)
// so resolveRes's expectations are met, but omits buildSys's many
// instruction lines (vibe/genre/retry/discovery/style/type-lock/drag-lean
// text). Porting those faithfully is Phase 4 work (see file headers above).
function buildRequestBody(seedName, ctx) {
  const system =
    "You are a DJ assistant. Return ONLY a valid JSON array of 12 objects: " +
    "[{id,name,bpm,key}]. No markdown, no explanation, no extra text — ONLY the JSON array. " +
    "Library: ID|DisplayName|BPM|Key|PlayCount|Year|Genre.";
  const seedTitleWords = seedName.toLowerCase().replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "")
    .trim().split(" ").filter((w) => w.length > 2).slice(0, 3);
  const seedExcludeNote = seedTitleWords.length
    ? "\nNEVER return any track whose title contains: " + seedTitleWords.join(", ") + ". This includes all remixes, edits, intros, or versions of the seed song."
    : "";
  return {
    model: "claude-sonnet-5",
    max_tokens: 2000,
    system,
    messages: [{
      role: "user",
      content: "Seed: " + seedName + "\nLibrary:\n" + ctx.context +
        "\nReturn JSON array of 20 tracks." + seedExcludeNote +
        "\nHARD RULES:\n1. Every result must be a DIFFERENT song title — never return two versions or remixes of the same song.\n2. Never return any version of the seed track.\n3. Return exactly 20 different song titles."
    }]
  };
}

export class ValidationError extends Error {}

// library: Track[], each with a caller-assigned string `id` (real stable
// trackId hashing is Phase 5 work - CLAUDE.md Section 5.5 - not built yet).
export async function recommendTrackCheat({ library, seedTrackId, vibe = -3, energy = 0 }, provider) {
  if (!Array.isArray(library) || library.length === 0) {
    throw new ValidationError("library must be a non-empty array");
  }
  const seedTrack = library.find((t) => t.id === seedTrackId);
  if (!seedTrack) {
    throw new ValidationError("seedTrackId not found in library");
  }

  const seedName = getDisplayName(seedTrack);
  const seedGenre = seedTrack.genre || "";
  const seedBpm = parseFloat(seedTrack.bpm || "0") || null;
  const seedYear = parseInt(seedTrack.year || "0", 10) || null;

  const ctx = buildSmartCtx(library, seedGenre, false, null, seedBpm, false, new Set(), seedYear, false, false);

  const requestBody = buildRequestBody(seedName, ctx);
  const response = await provider.call(requestBody);

  if (!response.content || !Array.isArray(response.content)) {
    throw new Error((response.error && response.error.message) || "Provider returned no content");
  }
  const rawResults = parseJSON(response.content.map((b) => b.text || "").join(""));

  // resolveRes is the safety boundary: it only keeps items whose `id` is
  // found in `ctx.indexed` (the exact candidate pool this request sent), so
  // no model-invented ID can ever reach the response (CLAUDE.md 6.3:
  // "Never trust model output").
  const resolved = resolveRes(rawResults, ctx.indexed, seedName, seedGenre, false, null, [], []);

  return {
    results: resolved.map((r) => ({ trackId: r._libTrack.id, name: r.name, bpm: r.bpm, key: r.key })),
    candidatePoolSize: ctx.indexed.length,
    requested: 20,
    returned: resolved.length,
    simulated: provider.kind !== "anthropic"
  };
}
