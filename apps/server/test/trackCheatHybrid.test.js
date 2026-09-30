// Type lock and hybrid-mode (Bridge / Style Drift / Vibe Slider Drift)
// tests. No network, no API key - the mock provider tags camp/lane fields
// itself when the prompt asks for them (providers/mockProvider.js).

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { createMockProvider } from "../src/providers/mockProvider.js";
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

const typeLockLibrary = [
  { id: "seed", artist: "Artist", title: "Seed Song", bpm: "100", key: "8A", genre: "hip hop", year: "2020", playcount: "5" },
  { id: "f1", artist: "Artist", title: "Other One (Funk Edit)", bpm: "101", key: "8A", genre: "funk", year: "2019", playcount: "2" },
  { id: "f2", artist: "Artist", title: "Other Two (Funk Redrum)", bpm: "99", key: "8A", genre: "funk", year: "2018", playcount: "1" },
  { id: "m1", artist: "Artist", title: "Other Three (Moombahton Edit)", bpm: "102", key: "9A", genre: "latin", year: "2021", playcount: "3" },
  { id: "p1", artist: "Artist", title: "Plain Track No Edit", bpm: "100", key: "8A", genre: "hip hop", year: "2020", playcount: "4" },
  { id: "p2", artist: "Artist", title: "Another Plain Track", bpm: "103", key: "8A", genre: "hip hop", year: "2020", playcount: "4" }
];

test("type lock: 'only funk and moombahton remixes' hard-filters to matching edit descriptors", async () => {
  const app = makeApp();
  const data = await recommend(app, {
    library: typeLockLibrary,
    seedTrackId: "seed",
    vibePromptText: "only show funk and moombahton remixes"
  });
  assert.ok(data.results.length > 0, "expected at least one type-locked result");
  for (const r of data.results) {
    assert.ok(/funk|moombahton/i.test(r.name), `${r.name} does not indicate a funk or moombahton edit`);
  }
  // plain, untyped tracks must never pass a hard type lock
  const names = data.results.map((r) => r.name);
  assert.ok(!names.some((n) => n.includes("Plain Track")));
});

test("no type lock when the vibe prompt doesn't ask for one", async () => {
  const app = makeApp();
  const data = await recommend(app, { library: typeLockLibrary, seedTrackId: "seed", vibePromptText: "give me something fun" });
  // Without a lock, plain tracks are eligible again.
  assert.ok(data.results.length > 0);
});

const chainLibrary = [
  { id: "old", artist: "Old", title: "Old Seed", bpm: "90", key: "8A", genre: "hip hop", year: "2015", playcount: "5" },
  { id: "new", artist: "New", title: "New Seed", bpm: "128", key: "6A", genre: "edm", year: "2020", playcount: "5" },
  { id: "a", artist: "A", title: "Track A", bpm: "126", key: "6A", genre: "edm", year: "2021", playcount: "1" },
  { id: "b", artist: "B", title: "Track B", bpm: "92", key: "8A", genre: "hip hop", year: "2016", playcount: "1" },
  { id: "c", artist: "C", title: "Track C", bpm: "130", key: "7A", genre: "edm", year: "2022", playcount: "1" }
];

test("Bridge Mode: an external swerve mid-chain tags results new/bridge and reports mode:bridge", async () => {
  const app = makeApp();
  const data = await recommend(app, {
    library: chainLibrary,
    seedTrackId: "new",
    chainDepth: 2,
    bridgeContext: { oldSeedName: "Old - Old Seed" }
  });
  assert.equal(data.mode, "bridge");
  assert.ok(data.results.length > 0);
  for (const r of data.results) {
    assert.ok(["new", "bridge"].includes(r.camp), `expected camp new/bridge, got ${r.camp}`);
  }
});

test("Style Drift: an active drift signal reports mode:styleDrift and tags lanes", async () => {
  const app = makeApp();
  const data = await recommend(app, {
    library: chainLibrary,
    seedTrackId: "new",
    chainDepth: 1,
    driftContext: { active: true, detectedLane: "crossover", crossoverGenre: "hip hop" }
  });
  assert.equal(data.mode, "styleDrift");
  assert.ok(data.results.length > 0);
  for (const r of data.results) {
    assert.ok(["pure", "crossover", "native"].includes(r.lane), `expected a lane tag, got ${r.lane}`);
  }
});

test("Vibe Slider Drift: overrides the chain lock and reports mode:vibeDrift", async () => {
  const app = makeApp();
  const data = await recommend(app, {
    library: chainLibrary,
    seedTrackId: "new",
    vibe: 4,
    chainDepth: 3,
    vibeDriftContext: { newVibeOffset: 4 }
  });
  assert.equal(data.mode, "vibeDrift");
  assert.ok(data.results.length > 0);
  for (const r of data.results) {
    assert.ok(["chain", "vibe"].includes(r.camp), `expected camp chain/vibe, got ${r.camp}`);
  }
});

test("Bridge takes priority over drift/vibe-drift when more than one signal is present", async () => {
  const app = makeApp();
  const data = await recommend(app, {
    library: chainLibrary,
    seedTrackId: "new",
    chainDepth: 2,
    bridgeContext: { oldSeedName: "Old - Old Seed" },
    driftContext: { active: true, detectedLane: "crossover", crossoverGenre: "hip hop" },
    vibeDriftContext: { newVibeOffset: 5 }
  });
  assert.equal(data.mode, "bridge");
});
