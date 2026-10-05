// Unit tests for the Artist Era Resolver's pure batch helpers
// (resolveArtistEraBatch/resolveTitleEraBatch) - the Phase 4 scope only
// (engine/eraResolverBatch.js header explains the Phase 4/Phase 7 split).
// No network, no API key, no retry loop - these are single-call,
// scripted-response tests, same pattern as knowledgeCalls.test.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveArtistEraBatch, resolveTitleEraBatch } from "../src/engine/eraResolverBatch.js";

function scripted(text) {
  return { kind: "mock", async call() { return { content: [{ text }] }; } };
}
function scriptedThrows(err) {
  return { kind: "mock", async call() { throw err; } };
}

test("resolveArtistEraBatch: returns confident, input-matching entries", async () => {
  const provider = scripted(JSON.stringify({ artists: [{ name: "Daddy Yankee", year: 2004, aliases: ["DY"] }] }));
  const result = await resolveArtistEraBatch(["Daddy Yankee", "Unrelated Artist"], provider);
  assert.deepEqual(result, [{ name: "Daddy Yankee", year: 2004, aliases: ["DY"] }]);
});

test("resolveArtistEraBatch: discards an entry that doesn't match any name actually sent this batch (source v1.0.13272 bug)", async () => {
  // The model returning MORE artists than it was asked about is exactly
  // the confirmed real bug this filter exists to catch.
  const provider = scripted(JSON.stringify({
    artists: [
      { name: "Daddy Yankee", year: 2004, aliases: [] },
      { name: "An Artist Never Sent In This Batch", year: 1999, aliases: [] }
    ]
  }));
  const result = await resolveArtistEraBatch(["Daddy Yankee"], provider);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Daddy Yankee");
});

test("resolveArtistEraBatch: an entry with no year is dropped, not defaulted", async () => {
  const provider = scripted(JSON.stringify({ artists: [{ name: "Daddy Yankee", aliases: [] }] }));
  const result = await resolveArtistEraBatch(["Daddy Yankee"], provider);
  assert.equal(result.length, 0);
});

test("resolveArtistEraBatch: malformed JSON resolves to an empty array, never throws", async () => {
  const provider = scripted("not json at all");
  const result = await resolveArtistEraBatch(["Daddy Yankee"], provider);
  assert.deepEqual(result, []);
});

test("resolveArtistEraBatch: a provider error resolves to an empty array, never throws (no retry loop at this layer - Phase 7's job)", async () => {
  const provider = scriptedThrows(new Error("rate limited"));
  const result = await resolveArtistEraBatch(["Daddy Yankee"], provider);
  assert.deepEqual(result, []);
});

test("resolveArtistEraBatch: matching is case/whitespace-insensitive against the input list", async () => {
  const provider = scripted(JSON.stringify({ artists: [{ name: "  DADDY YANKEE  ", year: 2004, aliases: [] }] }));
  const result = await resolveArtistEraBatch(["daddy yankee"], provider);
  assert.equal(result.length, 1);
});

test("resolveTitleEraBatch: finds the real artist hidden in a title credited to an edit producer (the DJ PS1/SERAFIN case)", async () => {
  const provider = scripted(JSON.stringify({ titles: [{ title: "Beyonce - Crazy In Love (SERAFIN Remix)", realArtist: "Beyonce", year: 2003 }] }));
  const result = await resolveTitleEraBatch(["Beyonce - Crazy In Love (SERAFIN Remix)"], provider);
  assert.deepEqual(result, [{ title: "Beyonce - Crazy In Love (SERAFIN Remix)", realArtist: "Beyonce", year: 2003 }]);
});

test("resolveTitleEraBatch: discards an entry for a title not actually in this batch", async () => {
  const provider = scripted(JSON.stringify({
    titles: [{ title: "A Title Never Sent", realArtist: "Someone", year: 2000 }]
  }));
  const result = await resolveTitleEraBatch(["A Different Title"], provider);
  assert.equal(result.length, 0);
});

test("resolveTitleEraBatch: malformed JSON resolves to an empty array, never throws", async () => {
  const provider = scripted("{not valid json");
  const result = await resolveTitleEraBatch(["Some Title"], provider);
  assert.deepEqual(result, []);
});
