// Ported from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx (source
// lines 3033-3155, resolveArtistEraBatch and resolveTitleEraBatch).
//
// SCOPE (per explicit instruction): this is ONLY the pure, single-call
// prompt-builder + response-parser pieces the Artist Era Resolver needs -
// the part Phase 4's dependency order calls "pure helpers". The source's
// surrounding orchestration (runTitleFallbackPhase, saveEraCacheWithRetry,
// the 40-name batch splitting, the 1500ms inter-batch pacing, 429/529
// retry-with-backoff across a whole library scan, and persisting the
// result as a resumable cache) is a real background JOB, not a helper -
// that is explicitly Phase 7 (CLAUDE.md Section 6.6, "Resolver as a real
// job") and is NOT built here. These two functions make exactly one
// provider call each and return a filtered, validated result (or an
// empty array on any failure) - no retry loop, no scheduling, no cache.
// The Artist Era Resolver stays OFF by default (nothing in this codebase
// calls these functions automatically); Phase 7 is what wires them into
// an actual resumable job and decides the on/off default for that job.
//
// Uses the same `provider.call(requestBody)` abstraction as
// engine/knowledgeCalls.js, not raw fetch - testable with the mock
// provider, no network, no key, consistent with every other AI call site
// in this codebase.

function stripCodeFence(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}

// artistNames: string[] - distinct artist names pulled from the library.
// Returns: [{name, year, aliases}] - only entries the model was confident
// about AND that actually match one of the input names (source v1.0.13272:
// "discards anything that doesn't match an actual input name for this
// specific batch" - a confirmed real bug in the original resolver).
export async function resolveArtistEraBatch(artistNames, provider) {
  const validNames = {};
  artistNames.forEach((n) => { validNames[n.toLowerCase().trim()] = true; });
  const requestBody = {
    model: "claude-sonnet-5",
    max_tokens: 4000,
    system: "You'll receive a JSON array of artist names extracted from a DJ's music library. For each name that is a REAL, RECOGNIZABLE music artist, return their representative era/year (roughly when they were most active or had their defining hits — a single 4-digit year is fine) AND a list of their well-known alternate names/aliases/stage-name variations (e.g. Diddy has been credited as Puff Daddy, P. Diddy, Puffy, Sean Combs — a DJ's library might tag any of these). Skip names that aren't real recognizable artists (generic pack names, compilation titles, obvious mistagging) — don't guess or force an entry for those. Return ONLY valid JSON, no markdown, no extra text, in this exact shape: {\"artists\":[{\"name\":\"...\",\"year\":number,\"aliases\":[\"...\"]}]}. Only include entries for names you're genuinely confident about. Only return entries for names that were actually in the input list — do not add extra artists you happen to think of.",
    messages: [{ role: "user", content: JSON.stringify(artistNames) }]
  };
  try {
    const data = await provider.call(requestBody);
    if (!data) return [];
    const text = data.content && data.content[0] && data.content[0].text ? data.content[0].text.trim() : "";
    const cleaned = stripCodeFence(text);
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch { return []; }
    if (!parsed || !Array.isArray(parsed.artists)) return [];
    return parsed.artists.filter((a) => a && typeof a.name === "string" && a.year && validNames[a.name.toLowerCase().trim()]);
  } catch {
    return [];
  }
}

// titleTexts: string[] - raw track titles whose ARTIST field was NOT a
// real recording artist (an edit/remix producer tag) - looks for a real
// artist's name embedded in the title text itself (source v1.0.13273:
// the "DJ PS1 / SERAFIN" case - the title is "Beyoncé - Crazy In Love
// (SERAFIN Remix)" but the library's artist field just says "SERAFIN").
// Returns: [{title, realArtist, year}], same input-match validation.
export async function resolveTitleEraBatch(titleTexts, provider) {
  const validTitles = {};
  titleTexts.forEach((t) => { validTitles[t.toLowerCase().trim()] = true; });
  const requestBody = {
    model: "claude-sonnet-5",
    max_tokens: 4000,
    system: "You'll receive a JSON array of DJ track titles. Each one's ARTIST field in the library was NOT a real recording artist — it was likely an edit/remix producer's tag (e.g. 'DJ PS1', 'SERAFIN'), a compilation label, or similar. Look at the TITLE TEXT itself: does it contain a real, recognizable original artist's name (the actual performer of the song, not the edit producer)? If so, return that real artist's representative era/year. Only answer when you're genuinely confident about both the real artist's identity AND their era — skip anything ambiguous, generic, or where no real artist name is actually present in the text. Return ONLY valid JSON, no markdown, no extra text, in this exact shape: {\"titles\":[{\"title\":\"...\",\"realArtist\":\"...\",\"year\":number}]}. Only return entries for titles that were actually in the input list.",
    messages: [{ role: "user", content: JSON.stringify(titleTexts) }]
  };
  try {
    const data = await provider.call(requestBody);
    if (!data) return [];
    const text = data.content && data.content[0] && data.content[0].text ? data.content[0].text.trim() : "";
    const cleaned = stripCodeFence(text);
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch { return []; }
    if (!parsed || !Array.isArray(parsed.titles)) return [];
    return parsed.titles.filter((t) => t && typeof t.title === "string" && t.year && validTitles[t.title.toLowerCase().trim()]);
  } catch {
    return [];
  }
}
