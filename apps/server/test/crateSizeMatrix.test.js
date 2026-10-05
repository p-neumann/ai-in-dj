// Explicit size-matrix tests for Crate Cheat (CLAUDE.md R4 / Section
// 6.4's documented sizes: 10, 25, 50, 100, 150, 200), plus the specific
// integrity cases requested alongside them: a real 200-vs-~100-pool
// shortfall with the actual counts shown, repeated tracks, unknown
// model-returned IDs, a malformed model response, exclusions, and the
// oversize-request rejection. No network, no API key - every provider
// here is a deterministic, hand-written stand-in (same pattern as
// test/crateOrchestration.test.js).
//
// docs/decisions/0005: keeping all six prototype-offered sizes and
// testing size 200 for real (against the engine's actual ~100-track
// pool cap) instead of leaving it unverified - this file is that test.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildCrate, MAX_CRATE_SIZE } from "../src/engine/crateOrchestration.js";
import { _resetAllSessionsForTests } from "../src/session/sessionStore.js";
import { seedRandom } from "./helpers.js";

beforeEach(() => {
  _resetAllSessionsForTests();
});

function parseCandidates(userMessage) {
  const candidates = [];
  for (const line of userMessage.split("\n")) {
    const m = line.match(/^(\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|/);
    if (m) candidates.push({ id: Number(m[1]), name: m[2], bpm: m[3], key: m[4] });
  }
  return candidates;
}
function requestCountFromSystem(system) {
  const m = system.match(/array of exactly (\d+) objects/);
  return m ? Number(m[1]) : null;
}

// Echoes real candidates straight from the pool the engine actually
// built, same integrity contract a real model is asked to honor
// (CLAUDE.md Section 6.3: "accept only integer candidate IDs present in
// the prompt's pool") - this provider never invents an id.
function echoProvider() {
  return {
    kind: "mock",
    async call(requestBody) {
      const candidates = parseCandidates(requestBody.messages[0].content);
      const requestCount = requestCountFromSystem(requestBody.system) || candidates.length;
      const chosen = candidates.slice(0, requestCount).map((c) => ({ id: c.id, name: c.name, bpm: c.bpm, key: c.key }));
      return { content: [{ text: JSON.stringify(chosen) }] };
    }
  };
}

function track(id, i) {
  const genres = ["pop", "hip hop", "rock", "funk", "house"];
  return {
    id, artist: "Artist " + i, title: "Track " + i,
    bpm: String(100 + (i % 40)), key: "8A",
    year: String(2000 + (i % 20)), genre: genres[i % genres.length],
    playcount: "1"
  };
}

// 150 unique tracks - big enough that buildSmartCtx's own ~100 cap is the
// thing being exercised at the larger sizes, not an artificially small
// fixture.
function library150() {
  return Array.from({ length: 150 }, (_, i) => track("t" + i, i));
}

for (const size of [10, 25, 50, 100]) {
  test(`crate size ${size}: fully satisfied from a 150-track library (pool is not the bottleneck at this size)`, async () => {
    const restore = seedRandom(size);
    try {
      const library = library150();
      const data = await buildCrate({ library, prompt: "a broad mix for the set", playlistSize: size }, echoProvider());
      assert.equal(data.requested, size);
      assert.equal(data.returned, size, `expected the full ${size} at a size well within the ~100-track pool`);
      assert.equal(data.shortfallReason, null);
      assert.equal(new Set(data.results.map((r) => r.trackId)).size, size, "no repeated track in the result");
    } finally { restore(); }
  });
}

for (const size of [150, 200]) {
  test(`crate size ${size}: honestly reports the real shortfall against the actual ~100-track pool cap`, async () => {
    const restore = seedRandom(size);
    try {
      const library = library150();
      const data = await buildCrate({ library, prompt: "a broad mix for the set", playlistSize: size }, echoProvider());
      // Real, observed output - not asserted blind. candidatePoolSize is
      // buildSmartCtx's own documented cap (engine/candidateSelection.js);
      // this test fails loudly if that ever silently changes.
      console.log(`[crate size ${size}] requested=${data.requested} returned=${data.returned} candidatePoolSize=${data.candidatePoolSize} shortfallReason=${data.shortfallReason}`);
      assert.equal(data.requested, size);
      assert.equal(data.candidatePoolSize, 100, "buildSmartCtx's own cap - must not have been changed by this work");
      assert.ok(data.returned <= 100, "can never return more than the real pool, no matter how much was requested");
      assert.equal(data.returned, 100, "the echo provider offers every real candidate, so the full 100-track pool comes back");
      assert.equal(data.shortfallReason, "POOL_TOO_SMALL");
      assert.equal(new Set(data.results.map((r) => r.trackId)).size, data.returned, "no repeated track even at a size the pool can't fully satisfy");
    } finally { restore(); }
  });
}

test("oversize request (above MAX_CRATE_SIZE): rejected before any provider call, not silently clamped", async () => {
  let called = false;
  const provider = { kind: "mock", async call() { called = true; return { content: [{ text: "[]" }] }; } };
  await assert.rejects(
    () => buildCrate({ library: library150(), prompt: "anything", playlistSize: MAX_CRATE_SIZE + 1 }, provider)
  );
  assert.equal(called, false);
});

test("unknown model-returned id: an id the real candidate pool never assigned is dropped, never trusted", async () => {
  const restore = seedRandom(1);
  try {
    const library = library150().slice(0, 20);
    const provider = {
      kind: "mock",
      async call(requestBody) {
        const real = parseCandidates(requestBody.messages[0].content).slice(0, 5);
        // id 9999 was never assigned to any real candidate in this pool.
        const withFakeId = [...real, { id: 9999, name: "Invented Track - Does Not Exist", bpm: "120", key: "8A" }];
        return { content: [{ text: JSON.stringify(withFakeId) }] };
      }
    };
    const data = await buildCrate({ library, prompt: "a broad mix for the set", playlistSize: 10 }, provider);
    assert.ok(!data.results.some((r) => r.name === "Invented Track - Does Not Exist"), "an id outside the real pool must never appear in results");
    assert.equal(data.returned, 5, "only the 5 real candidates survive; the invented id is dropped, not counted");
  } finally { restore(); }
});

test("repeated track: the same real id returned twice by the model collapses to one result (trackId-level dedup)", async () => {
  const restore = seedRandom(1);
  try {
    const library = library150().slice(0, 20);
    const provider = {
      kind: "mock",
      async call(requestBody) {
        const real = parseCandidates(requestBody.messages[0].content).slice(0, 5);
        // Same id (real[0].id) returned twice, with different name text
        // the second time - must not defeat the dedup.
        const dupe = { ...real[0], name: real[0].name + " (Alternate Mix)" };
        return { content: [{ text: JSON.stringify([real[0], dupe, ...real.slice(1)]) }] };
      }
    };
    const data = await buildCrate({ library, prompt: "a broad mix for the set", playlistSize: 10 }, provider);
    const ids = data.results.map((r) => r.trackId);
    assert.equal(new Set(ids).size, ids.length, "no trackId appears twice in the final results");
    assert.equal(data.returned, 5, "the duplicate collapses - 5 real candidates in, 5 distinct results out");
  } finally { restore(); }
});

test("malformed model response: unparseable JSON surfaces as an error, never a silently empty or padded crate", async () => {
  const provider = { kind: "mock", async call() { return { content: [{ text: "this is not json at all, not even close" }] }; } };
  await assert.rejects(
    () => buildCrate({ library: library150().slice(0, 20), prompt: "a broad mix for the set", playlistSize: 10 }, provider)
  );
});

test("exclusions: Do Not Play removes a matching real track rather than silently padding to the requested count", async () => {
  const restore = seedRandom(1);
  try {
    const library = library150().slice(0, 20);
    const data = await buildCrate({
      library, prompt: "a broad mix for the set", playlistSize: 10,
      doNotPlayList: [{ type: "artist", value: "Artist 0", persistent: true }]
    }, echoProvider());
    assert.ok(!data.results.some((r) => r.trackId === "t0"), "the excluded artist's track must never appear");
  } finally { restore(); }
});
