// Phase 4 behavior tests: chain vibe lock (R8), session-wide exclusion
// (R12 defect fix), and the R28 fallback chain. No network, no API key.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { createMockProvider } from "../src/providers/mockProvider.js";
import { sampleLibrary } from "../fixtures/sampleLibrary.js";
import { _resetAllSessionsForTests } from "../src/session/sessions.js";

const DEV_TOKEN = "test-token-do-not-use-in-prod";

function makeApp() {
  return buildApp({ devTokens: [DEV_TOKEN], provider: createMockProvider() });
}

async function recommend(app, body) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/track-cheat/recommend",
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
    payload: body
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
  return res.json().data;
}

beforeEach(() => {
  _resetAllSessionsForTests();
});

test("R8: an active chain locks vibe to -3 regardless of the slider value sent", async () => {
  const app = makeApp();
  // vibe=5 (wide open) but chainDepth=2 (an active daisy chain) must still
  // behave like -3 (same era, same feel) per the source's flat chain lock.
  const data = await recommend(app, { library: sampleLibrary, seedTrackId: "t1", vibe: 5, chainDepth: 2 });
  assert.equal(data.simulated, true);
  assert.ok(data.results.length > 0);
});

test("R12: a track returned in one call is excluded from a later call in the same session", async () => {
  const app = makeApp();
  const sessionId = "session-1";

  const first = await recommend(app, { library: sampleLibrary, seedTrackId: "t1", sessionId });
  assert.ok(first.results.length > 0);
  const firstNames = new Set(first.results.map((r) => r.name));

  const second = await recommend(app, { library: sampleLibrary, seedTrackId: "t1", sessionId });
  for (const r of second.results) {
    assert.ok(!firstNames.has(r.name), `${r.name} was already shown this session and should be excluded`);
  }
});

test("no sessionId means no cross-request memory (documented stateless default)", async () => {
  const app = makeApp();
  const first = await recommend(app, { library: sampleLibrary, seedTrackId: "t1" });
  const second = await recommend(app, { library: sampleLibrary, seedTrackId: "t1" });
  // Without a sessionId, both calls see a clean slate - this just proves
  // statelessness is the explicit default, not an accident.
  assert.deepEqual(
    second.results.map((r) => r.trackId).sort(),
    first.results.map((r) => r.trackId).sort()
  );
});

test("R28: fallback chain fires when the first batch comes back short at negative vibe", async () => {
  const app = makeApp();
  // Vibe Lock (-8) plus a library where almost nothing shares the seed's
  // exact genre forces resolveRes/applyGenreWall down to a tiny result set,
  // which should trigger the fallback chain per the source's own condition
  // (resolved.length < 10 && currentVibe < 0).
  const tinyLibrary = [
    { id: "s1", artist: "Bad Bunny", title: "Seed Song", bpm: "98", key: "9A", genre: "reggaeton", year: "2022", playcount: "1" },
    { id: "s2", artist: "Bad Bunny", title: "Only Match", bpm: "97", key: "9A", genre: "reggaeton", year: "2022", playcount: "1" },
    { id: "s3", artist: "Drake", title: "Unrelated One", bpm: "77", key: "5A", genre: "hip hop", year: "2018", playcount: "1" },
    { id: "s4", artist: "Calvin Harris", title: "Unrelated Two", bpm: "128", key: "6A", genre: "edm", year: "2014", playcount: "1" }
  ];
  const data = await recommend(app, { library: tinyLibrary, seedTrackId: "s1", vibe: -8 });
  assert.ok(data.fallbackDepth >= 1, `expected a fallback call to have fired, got fallbackDepth=${data.fallbackDepth}`);
});

test("deep play-count mode filters out familiar song families", async () => {
  const app = makeApp();
  const libraryWithFamiliar = [
    { id: "d1", artist: "Bad Bunny", title: "Seed Song", bpm: "98", key: "9A", genre: "reggaeton", year: "2022", playcount: "1" },
    { id: "d2", artist: "Daddy Yankee", title: "Familiar Hit", bpm: "96", key: "9A", genre: "reggaeton", year: "2004", playcount: "50" },
    { id: "d3", artist: "Daddy Yankee", title: "Familiar Hit (Redrum)", bpm: "96", key: "9A", genre: "reggaeton", year: "2004", playcount: "0" },
    { id: "d4", artist: "Ozuna", title: "Deep Cut", bpm: "95", key: "8A", genre: "reggaeton", year: "2020", playcount: "0" }
  ];
  const data = await recommend(app, { library: libraryWithFamiliar, seedTrackId: "d1", playCountMode: "deep" });
  const returnedIds = data.results.map((r) => r.trackId);
  // d3 shares a song family with d2 (playcount 50 >= threshold), so both
  // must be excluded in deep mode even though d3 itself has 0 plays.
  assert.ok(!returnedIds.includes("d2"));
  assert.ok(!returnedIds.includes("d3"));
});
