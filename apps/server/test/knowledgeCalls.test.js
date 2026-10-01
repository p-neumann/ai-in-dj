// Unit tests for the small, self-contained "ask the model a knowledge
// question" functions (style enrichment, seed-year, era, curated tracks).
// No network, no API key - each test hands in a scripted provider that
// returns an exact, hand-written response, since these prompts ask
// knowledge questions rather than picking from a candidate pool (there is
// no "real candidate pool" for a scripted response to derive from here,
// unlike the Track Cheat mock).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveStyleProfileEnrichment, resolveSeedYearFromKnowledge,
  resolveEraFromKnowledge, resolveCuratedTracks
} from "../src/engine/knowledgeCalls.js";

function scripted(text, overrides) {
  return { kind: "mock", async call() { return { content: [{ text }], ...overrides }; } };
}
function scriptedThrows(err) {
  return { kind: "mock", async call() { throw err; } };
}

test("resolveStyleProfileEnrichment: empty input never calls the provider", async () => {
  let called = false;
  const provider = { kind: "mock", async call() { called = true; return {}; } };
  const result = await resolveStyleProfileEnrichment("   ", provider);
  assert.equal(result, null);
  assert.equal(called, false);
});

test("resolveStyleProfileEnrichment: parses format tokens and curated tracks, lowercasing tokens", async () => {
  const provider = scripted(JSON.stringify({ formatTokens: ["Xtendz", "Club Mix"], curatedTracks: [{ artist: "Guy", track: "Groove Me" }] }));
  const result = await resolveStyleProfileEnrichment("I only like extended versions", provider);
  assert.deepEqual(result.formatTokens, ["xtendz", "club mix"]);
  assert.deepEqual(result.curatedTracks, [{ artist: "Guy", track: "Groove Me" }]);
});

test("resolveStyleProfileEnrichment: both arrays empty resolves to null (neither category applied)", async () => {
  const provider = scripted(JSON.stringify({ formatTokens: [], curatedTracks: [] }));
  const result = await resolveStyleProfileEnrichment("I like good music", provider);
  assert.equal(result, null);
});

test("resolveStyleProfileEnrichment: malformed JSON resolves to null, never throws", async () => {
  const provider = scripted("not json at all");
  const result = await resolveStyleProfileEnrichment("something", provider);
  assert.equal(result, null);
});

test("resolveSeedYearFromKnowledge: extracts a 4-digit year from the response", async () => {
  const provider = scripted("1993");
  const year = await resolveSeedYearFromKnowledge("Snoop Dogg - Gin and Juice", provider);
  assert.equal(year, 1993);
});

test("resolveSeedYearFromKnowledge: 'unknown' response resolves to 0", async () => {
  const provider = scripted("unknown");
  const year = await resolveSeedYearFromKnowledge("Some Obscure Track", provider);
  assert.equal(year, 0);
});

test("resolveSeedYearFromKnowledge: a provider error resolves to 0, never throws", async () => {
  const provider = scriptedThrows(new Error("network down"));
  const year = await resolveSeedYearFromKnowledge("Any Track", provider);
  assert.equal(year, 0);
});

test("resolveEraFromKnowledge: a detected era returns [yearMin, yearMax]", async () => {
  const provider = scripted(JSON.stringify({ eraDetected: true, yearMin: 1999, yearMax: 2001 }));
  const range = await resolveEraFromKnowledge("y2k anthems", provider);
  assert.deepEqual(range, [1999, 2001]);
});

test("resolveEraFromKnowledge: no era detected resolves to null", async () => {
  const provider = scripted(JSON.stringify({ eraDetected: false, yearMin: null, yearMax: null }));
  const range = await resolveEraFromKnowledge("throwback", provider);
  assert.equal(range, null);
});

test("resolveCuratedTracks: a recognized request returns filtered, valid tracks", async () => {
  const provider = scripted(JSON.stringify({
    recognized: true,
    tracks: [{ artist: "Frankie Beverly", track: "Before I Let Go" }, { artist: "", track: "missing artist dropped" }],
    bpmMin: 90, bpmMax: 100, eraStart: 1980, eraEnd: 1990
  }));
  const result = await resolveCuratedTracks("grown and sexy wedding reception", 20, provider);
  assert.equal(result.recognized, true);
  assert.equal(result.tracks.length, 1, "an entry missing artist/track must be filtered out");
  assert.equal(result.tracks[0].artist, "Frankie Beverly");
});

test("resolveCuratedTracks: an unrecognized vague request resolves to null", async () => {
  const provider = scripted(JSON.stringify({ recognized: false, tracks: [], bpmMin: null, bpmMax: null, eraStart: null, eraEnd: null }));
  const result = await resolveCuratedTracks("something fun", 20, provider);
  assert.equal(result, null);
});

test("resolveCuratedTracks: repairs JSON wrapped in extra text and trailing commas", async () => {
  const wrapped = 'Here you go:\n{"recognized":true,"tracks":[{"artist":"A","track":"B"},],"bpmMin":null,"bpmMax":null,"eraStart":null,"eraEnd":null}\nHope that helps!';
  const provider = scripted(wrapped);
  const result = await resolveCuratedTracks("some request", 1, provider);
  assert.equal(result.recognized, true);
  assert.deepEqual(result.tracks, [{ artist: "A", track: "B" }]);
});

test("resolveCuratedTracks: distinguishes truncation from a genuine parse failure from an API error", async () => {
  const truncated = await resolveCuratedTracks("x", 80, scripted("", { stop_reason: "max_tokens" }));
  assert.equal(truncated._truncated, true);

  const apiError = await resolveCuratedTracks("x", 20, scripted("", { error: { message: "overloaded" } }));
  assert.equal(apiError._apiError, true);
  assert.equal(apiError._rawText, "overloaded");

  const parseError = await resolveCuratedTracks("x", 20, scripted("{not valid json"));
  assert.equal(parseError._parseError, true);
});

test("resolveCuratedTracks: max_tokens scales with curationCount but is capped at 6000", async () => {
  let capturedSmall, capturedLarge;
  const captureProvider = (capture) => ({ kind: "mock", async call(body) { capture.value = body.max_tokens; return { content: [{ text: '{"recognized":false,"tracks":[]}' }] }; } });
  const small = { value: null }; await resolveCuratedTracks("x", 10, captureProvider(small));
  const large = { value: null }; await resolveCuratedTracks("x", 500, captureProvider(large));
  assert.equal(small.value, 800 + 10 * 60);
  assert.equal(large.value, 6000, "must cap at 6000 even for a very large curationCount");
});

test("resolveSeedYear: local resolution succeeding never calls the provider", async () => {
  const { resolveSeedYear } = await import("../src/engine/seedYear.js");
  let called = false;
  const provider = { kind: "mock", async call() { called = true; return { content: [{ text: "1999" }] }; } };
  const year = await resolveSeedYear({ year: "2005" }, "Artist - Song", [], provider);
  assert.equal(year, 2005);
  assert.equal(called, false, "a tagged year must short-circuit before ever reaching the provider");
});

test("resolveSeedYear: falls back to the knowledge call only when local resolution finds nothing", async () => {
  const { resolveSeedYear } = await import("../src/engine/seedYear.js");
  const provider = scripted("1987");
  const year = await resolveSeedYear({ year: "0" }, "Totally Unknown Artist - Totally Unknown Song", [], provider);
  assert.equal(year, 1987);
});
