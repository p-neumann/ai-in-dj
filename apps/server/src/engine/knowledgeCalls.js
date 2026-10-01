// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 2859-2981, 2988-3003). Four small, self-contained
// "ask the model a knowledge question" calls - NOT the Crate Cheat
// orchestration (buildCrate/runBuildCrateBody) that consumes
// resolveCuratedTracks/resolveEraFromKnowledge; that remains unported
// (see crateMatching.js/crateLists.js headers). Each function here takes
// an explicit `provider` ({call(requestBody)}) instead of calling fetch
// directly, matching routes/trackCheat.js's pattern - testable with the
// mock provider, no network, no key.
//
// Mike's dated comments (the max_tokens scaling fix, the error/truncation
// detection, the JSON-repair fallbacks) are preserved unchanged - these
// are real, gig-tested robustness fixes, not incidental code.

function stripCodeFence(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}

export async function resolveStyleProfileEnrichment(styleText, provider) {
  if (!styleText || !styleText.trim()) return null;
  const requestBody = {
    model: "claude-sonnet-5",
    max_tokens: 1600,
    system: "A DJ wrote a free-text description of their style/preferences for a track-recommendation tool. Analyze it for TWO separate, independent things — either, both, or neither may apply: (1) FORMAT/TAG preferences — does it name specific version/edit TYPES they favor (e.g. \"extended versions\", \"intros\", \"remixes\")? If so, expand each into a real, broader set of words a knowledgeable DJ would recognize as meaning the same or a closely related thing in how tracks actually get labeled/tagged in a library — for \"extended\", that might include Xtendz, Xtenda, Long Version, Club Mix, Album Version; use real DJ/producer naming conventions, not guesses. (2) GENRE/OCCASION preferences — does it describe a musical style, era, or a DJ context/crowd/occasion specific enough that a knowledgeable DJ would have real specific songs in mind (e.g. \"I'm a wedding DJ who plays open format party vibes\" or \"I love deep Quiet Storm cuts\")? If so, curate 15-25 REAL specific songs (artist and title) that fit. Return ONLY valid JSON, no markdown, no extra text, in this exact shape: {\"formatTokens\":[\"...\"],\"curatedTracks\":[{\"artist\":\"...\",\"track\":\"...\"}]}. Leave either array empty ([]) if that category genuinely doesn't apply — don't force content into a category that doesn't fit. If NEITHER applies (the text is too vague, e.g. just \"I like good music\"), return {\"formatTokens\":[],\"curatedTracks\":[]}.",
    messages: [{ role: "user", content: styleText }]
  };
  try {
    const data = await provider.call(requestBody);
    const text = data && data.content && data.content[0] && data.content[0].text ? data.content[0].text : "";
    const cleaned = stripCodeFence(text);
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch (e) { return null; }
    if (!parsed) return null;
    parsed.formatTokens = (Array.isArray(parsed.formatTokens) ? parsed.formatTokens : []).filter((t) => typeof t === "string" && t.trim()).map((t) => t.toLowerCase().trim());
    parsed.curatedTracks = (Array.isArray(parsed.curatedTracks) ? parsed.curatedTracks : []).filter((t) => t && typeof t.artist === "string" && typeof t.track === "string" && t.artist.trim() && t.track.trim());
    if (!parsed.formatTokens.length && !parsed.curatedTracks.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function resolveSeedYearFromKnowledge(seedName, provider) {
  const requestBody = {
    model: "claude-sonnet-5",
    max_tokens: 50,
    system: "A DJ app needs the original release year of a specific song to enforce era-matching for a seed track, and no year data exists anywhere in the DJ's library for this artist. Return ONLY the 4-digit year the song was originally released, nothing else — no markdown, no explanation, just the number by itself. If you genuinely don't know this specific song with real confidence, return exactly the word: unknown",
    messages: [{ role: "user", content: seedName }]
  };
  try {
    const data = await provider.call(requestBody);
    const text = data && data.content && data.content[0] && data.content[0].text ? data.content[0].text.trim() : "";
    const match = text.match(/\b(19|20)\d{2}\b/);
    return match ? parseInt(match[0]) : 0;
  } catch {
    return 0;
  }
}

export async function resolveEraFromKnowledge(promptText, provider) {
  const requestBody = {
    model: "claude-sonnet-5",
    max_tokens: 60,
    system: "A DJ's playlist request may reference a specific era or time period using phrasing that doesn't match a fixed keyword list (that list already covers 60s/70s/80s/90s/2000s/2010s in all their common spoken and written forms). Determine if THIS SPECIFIC request references a time period at all, beyond what a generic decade keyword would catch. Return ONLY valid JSON, no markdown, no extra text: {\"eraDetected\":true|false,\"yearMin\":number|null,\"yearMax\":number|null}. If eraDetected is true, yearMin/yearMax should be a reasonable year range for whatever specific period was referenced (e.g. \"y2k\" -> 1999-2001, \"millennium hits\" -> 1999-2001, \"turn of the century\" -> 1998-2002). If no specific time period is referenced, or it's too vague to give a real range (e.g. just \"classic\" or \"throwback\" alone with nothing else), return {\"eraDetected\":false,\"yearMin\":null,\"yearMax\":null}.",
    messages: [{ role: "user", content: promptText }]
  };
  try {
    const data = await provider.call(requestBody);
    const text = data && data.content && data.content[0] && data.content[0].text ? data.content[0].text.trim() : "";
    const cleaned = stripCodeFence(text);
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch (e) { return null; }
    if (!parsed || !parsed.eraDetected || !parsed.yearMin || !parsed.yearMax) return null;
    return [parsed.yearMin, parsed.yearMax];
  } catch {
    return null;
  }
}

export async function resolveCuratedTracks(promptText, curationCount, provider) {
  const dynamicMaxTokens = Math.min(6000, 800 + curationCount * 60);
  const requestBody = {
    model: "claude-sonnet-5",
    max_tokens: dynamicMaxTokens,
    system: "A DJ typed a request into a track-recommendation tool and nothing in the app's built-in genre/artist detection matched it. Determine whether a knowledgeable, culturally-fluent DJ would have specific real songs in mind for this exact request. This includes named genres/styles/subgenres/eras (New Jack Swing, Go-Go, Quiet Storm, Baltimore Club) AND occasion/context/crowd-based requests where real music knowledge produces a specific answer even though no genre is named at all (example: \"grown and sexy playlist for an all-Black wedding reception, ages 30-60\" has a real, knowable answer — Frankie Beverly and Maze, Guy, R. Kelly, Motown — despite naming no genre). Do NOT recognize vague requests with no real specific answer (e.g. \"high energy\" or \"something fun\", which have no knowable specific song list). Return ONLY valid JSON, no markdown, no extra text, in this exact shape: {\"recognized\":true|false,\"tracks\":[{\"artist\":\"...\",\"track\":\"...\"}],\"bpmMin\":number|null,\"bpmMax\":number|null,\"eraStart\":number|null,\"eraEnd\":number|null}. If recognized is true: \"tracks\" must be a curated list of " + curationCount + " REAL, SPECIFIC songs (both artist and title) that a knowledgeable DJ would actually pick for this exact request — the same quality of answer an expert gives when asked directly, not a generic genre-name list. Prioritize genuine variety across different artists — don't over-concentrate on just 2-3 names even if they're the most famous. bpmMin/bpmMax and eraStart/eraEnd (as 4-digit years) are optional best-effort context, null if not confidently known. If recognized is false, return {\"recognized\":false,\"tracks\":[],\"bpmMin\":null,\"bpmMax\":null,\"eraStart\":null,\"eraEnd\":null} and nothing else.",
    messages: [{ role: "user", content: promptText }]
  };
  try {
    const data = await provider.call(requestBody);
    if (data && (data.error || data.type === "error")) {
      const errMsg = (data.error && (data.error.message || data.error.type)) || "Unknown API error";
      return { recognized: false, tracks: [], _apiError: true, _rawText: String(errMsg).slice(0, 400) };
    }
    if (data && data.stop_reason === "max_tokens") return { recognized: false, tracks: [], _truncated: true, _rawText: "" };
    let text = data && data.content && data.content[0] && data.content[0].text ? data.content[0].text : "";
    text = stripCodeFence(text);
    const tryParse = (t) => { try { return JSON.parse(t); } catch (e) { return undefined; } };
    let parsed = tryParse(text);
    if (parsed === undefined) {
      const braceMatch = text.match(/\{[\s\S]*\}/);
      if (braceMatch) parsed = tryParse(braceMatch[0]);
    }
    if (parsed === undefined) {
      const deTrailed = text.replace(/,(\s*[\]}])/g, "$1");
      parsed = tryParse(deTrailed);
      if (parsed === undefined) {
        const braceMatch2 = deTrailed.match(/\{[\s\S]*\}/);
        if (braceMatch2) parsed = tryParse(braceMatch2[0]);
      }
    }
    if (parsed === undefined) return { recognized: false, tracks: [], _parseError: true, _rawText: text.slice(0, 400) };
    if (!parsed || !parsed.recognized || !Array.isArray(parsed.tracks) || !parsed.tracks.length) return null;
    parsed.tracks = parsed.tracks.filter((t) => t && typeof t.artist === "string" && typeof t.track === "string" && t.artist.trim() && t.track.trim());
    if (!parsed.tracks.length) return null;
    return parsed;
  } catch (err) {
    return { recognized: false, tracks: [], _apiError: true, _rawText: "Network/fetch error: " + (err && err.message ? err.message : String(err)) };
  }
}
