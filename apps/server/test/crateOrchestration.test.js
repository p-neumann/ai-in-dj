// Phase 4 Crate Cheat orchestration tests (buildCrate/runBuildCrateBody,
// source lines 3757-4488). No network, no API key - every provider here is
// a deterministic, hand-written stand-in, and every test seeds Math.random
// (see helpers.js) so context-merge shuffles are reproducible.
//
// Scope note (honest, not a shortcut): this exercises the gating logic,
// the era pre-filter/final-guard, the strict artist lock merge+hard filter,
// Do Not Play/Do Play wiring, deep-mode familiarity filtering, dedup, and
// R4's requested/returned/candidatePoolSize/shortfallReason contract. It
// does NOT independently verify every nuance of the old-school/genre
// explicit-implicit interleave algorithms or the tag-vs-artist-era
// correction's override counting - those are ported faithfully (see
// engine/crateOrchestration.js) but only indirectly covered here.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { buildCrate, runBuildCrateBody as runBuildCrateBodyDirect, ValidationError, RequestTooLargeError, MAX_CRATE_SIZE } from "../src/engine/crateOrchestration.js";
import { _resetAllSessionsForTests } from "../src/session/sessionStore.js";
import { createSession, recommend, seedRandom, DEV_TOKEN } from "./helpers.js";

beforeEach(() => {
  _resetAllSessionsForTests();
});

// Parses the candidate pool out of whatever request the engine actually
// built, so test providers never need to know the pool's contents ahead of
// time - same principle as src/providers/mockProvider.js.
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

// Generic test provider: answers crate-build calls by echoing candidates
// from its own pool (optionally filtered/reordered by `pick`), and answers
// the three knowledge-resolver call shapes with caller-supplied canned
// JSON so gating tests can assert exactly which resolver fired.
function makeCrateProvider({ pick, curatedTracksResponse, eraResponse, onCall } = {}) {
  return {
    kind: "mock",
    async call(requestBody) {
      if (onCall) onCall(requestBody);
      const system = requestBody.system || "";
      if (system.indexOf("A DJ typed a request into a track-recommendation tool") !== -1) {
        return { content: [{ text: JSON.stringify(curatedTracksResponse || { recognized: false, tracks: [], bpmMin: null, bpmMax: null, eraStart: null, eraEnd: null }) }] };
      }
      if (system.indexOf("A DJ's playlist request may reference a specific era") !== -1) {
        return { content: [{ text: JSON.stringify(eraResponse || { eraDetected: false, yearMin: null, yearMax: null }) }] };
      }
      const candidates = parseCandidates(requestBody.messages[0].content);
      const requestCount = requestCountFromSystem(system) || candidates.length;
      const pool = pick ? pick(candidates) : candidates;
      const chosen = pool.slice(0, requestCount).map((c) => ({ id: c.id, name: c.name, bpm: c.bpm, key: c.key }));
      return { content: [{ text: JSON.stringify(chosen) }] };
    }
  };
}

function track(id, artist, title, { bpm = "120", key = "8A", year = "2015", genre = "pop", playcount = "1" } = {}) {
  return { id, artist, title, bpm, key, year, genre, playcount };
}

function genericLibrary() {
  const lib = [];
  const genres = ["pop", "hip hop", "rock", "funk", "house"];
  for (let i = 0; i < 40; i++) {
    lib.push(track("t" + i, "Artist" + i, "Song" + i, { genre: genres[i % genres.length], bpm: String(100 + i), year: String(2000 + (i % 20)) }));
  }
  return lib;
}

test("plain genre prompt: no knowledge resolver call, results come back within the requested size", async () => {
  const restore = seedRandom(1);
  try {
    const library = genericLibrary();
    const provider = makeCrateProvider();
    const data = await buildCrate({ library, prompt: "some house music for the floor", playlistSize: 10 }, provider);
    assert.equal(data.knowledgeCallMade, null);
    assert.equal(data.requested, 10);
    assert.ok(data.returned <= 10);
    assert.ok(data.returned > 0, "expected at least some results for a generic genre prompt");
    data.results.forEach((r) => assert.ok(r.trackId, "every result must map to a real library trackId"));
  } finally { restore(); }
});

test("R4: playlistSize above the maximum is rejected before any provider call", async () => {
  const library = genericLibrary();
  let called = false;
  const provider = makeCrateProvider({ onCall: () => { called = true; } });
  await assert.rejects(
    () => buildCrate({ library, prompt: "anything", playlistSize: MAX_CRATE_SIZE + 1 }, provider),
    RequestTooLargeError
  );
  assert.equal(called, false, "must not spend a provider call on an oversized request");
});

test("validation: empty prompt and empty library are rejected", async () => {
  const provider = makeCrateProvider();
  await assert.rejects(() => buildCrate({ library: genericLibrary(), prompt: "   ", playlistSize: 10 }, provider), ValidationError);
  await assert.rejects(() => buildCrate({ library: [], prompt: "house music", playlistSize: 10 }, provider), ValidationError);
});

test("quickNoMatch gating: an unrecognized vibe/occasion prompt calls the curated-tracks resolver before the real build", async () => {
  const restore = seedRandom(2);
  try {
    const library = genericLibrary();
    const systemsSeen = [];
    const provider = makeCrateProvider({
      onCall: (body) => systemsSeen.push(body.system),
      curatedTracksResponse: { recognized: true, tracks: [{ artist: "Artist3", track: "Song3" }], bpmMin: null, bpmMax: null, eraStart: null, eraEnd: null }
    });
    const data = await buildCrate({ library, prompt: "something for a laid back Sunday brunch", playlistSize: 8 }, provider);
    assert.equal(data.knowledgeCallMade, "curatedTracks");
    assert.equal(systemsSeen.length, 2, "expected exactly one resolver call followed by exactly one build call");
    assert.ok(systemsSeen[0].indexOf("A DJ typed a request into a track-recommendation tool") !== -1);
    assert.ok(systemsSeen[1].indexOf("CURATED TRACK RESOLUTION") !== -1, "the build prompt must mention the curated-track resolution once anchors were found");
  } finally { restore(); }
});

test("era gating: a genre prompt with a bare unrecognized year calls the era-knowledge resolver, not the curated-tracks one", async () => {
  const restore = seedRandom(3);
  try {
    // Library includes a couple of real 1998/1999-tagged tracks. Without
    // them, the resolver's reported range would overlap nothing in the
    // library at all - which exercises a different, already-understood
    // edge case (see "era final guard" test below), not the gating order
    // this test exists to check.
    const library = [
      track("e1", "Nineties Act", "Keyword Song", { year: "1998", genre: "hip hop" }),
      track("e2", "Nineties Act", "Another Song", { year: "1999", genre: "hip hop" }),
      ...genericLibrary()
    ];
    const systemsSeen = [];
    const provider = makeCrateProvider({
      onCall: (body) => systemsSeen.push(body.system),
      eraResponse: { eraDetected: true, yearMin: 1998, yearMax: 1999 }
    });
    const data = await buildCrate({ library, prompt: "hip hop 1998 vibes", playlistSize: 8 }, provider);
    assert.equal(data.knowledgeCallMade, "era");
    assert.equal(systemsSeen.length, 2, "expected exactly one resolver call followed by exactly one build call");
    assert.ok(systemsSeen[0].indexOf("A DJ's playlist request may reference a specific era") !== -1);
  } finally { restore(); }
});

// source v1.0.14007 (pre-filter "safety valve") vs v1.0.14010 (final guard,
// no safety valve of its own): the final guard runs unconditionally
// whenever an era range is in play, even when the pre-filter declined to
// apply because fewer than 10 full-library tracks matched. If the full
// library genuinely has ZERO tracks in that range, the final guard removes
// every real-year track anyway, leaving an empty context - the safety
// valve's leniency doesn't carry through to the final guard. This is the
// source's own asymmetry (CLAUDE.md Top Rule 5 - preserved, not "fixed"
// here); flagged for Mike in docs/QUESTIONS.md as worth knowing about.
test("era final guard has no safety valve of its own: an era range matching nothing in the full library still empties the context", async () => {
  const restore = seedRandom(12);
  try {
    const library = genericLibrary(); // years 2000-2019, nothing in 1998-1999
    const provider = makeCrateProvider();
    const data = await runBuildCrateBodyDirect({ library, prompt: "hip hop 1998 vibes", playlistSize: 8, resolvedEraRange: [1998, 1999] }, provider);
    assert.equal(data.candidatePoolSize, 0);
    assert.equal(data.shortfallReason, "POOL_TOO_SMALL");
  } finally { restore(); }
});

test("era hard filter: an explicit decade keyword excludes tracks outside that decade even though the model could see them", async () => {
  const restore = seedRandom(4);
  try {
    const library = [
      track("n1", "Nineties Act", "Song One", { year: "1994", genre: "hip hop" }),
      track("n2", "Nineties Act", "Song Two", { year: "1996", genre: "hip hop" }),
      track("n3", "Nineties Act", "Song Three", { year: "1998", genre: "hip hop" }),
      track("n4", "Nineties Act", "Song Four", { year: "1993", genre: "hip hop" }),
      track("n5", "Nineties Act", "Song Five", { year: "1999", genre: "hip hop" }),
      track("n6", "Nineties Act", "Song Six", { year: "1995", genre: "hip hop" }),
      track("n7", "Nineties Act", "Song Seven", { year: "1992", genre: "hip hop" }),
      track("n8", "Nineties Act", "Song Eight", { year: "1997", genre: "hip hop" }),
      track("n9", "Nineties Act", "Song Nine", { year: "1991", genre: "hip hop" }),
      track("n10", "Nineties Act", "Song Ten", { year: "1990", genre: "hip hop" }),
      track("o1", "TwentyTens Act", "Other One", { year: "2015", genre: "hip hop" }),
      track("o2", "TwentyTens Act", "Other Two", { year: "2018", genre: "hip hop" })
    ];
    // every candidate echoed - the era filter must do the real work, not the mock
    const provider = makeCrateProvider();
    const data = await buildCrate({ library, prompt: "90s hip hop only", playlistSize: 10 }, provider);
    const years = data.results.map((r) => library.find((t) => t.id === r.trackId).year);
    years.forEach((y) => assert.ok(y >= "1990" && y <= "1999", `expected only 90s tracks, got year ${y}`));
  } finally { restore(); }
});

test("strict artist lock: naming a real library artist with no broadening language hard-filters every result to that artist", async () => {
  const restore = seedRandom(5);
  try {
    const library = [
      track("a1", "Locked Artist", "Alpha", { genre: "pop" }),
      track("a2", "Locked Artist", "Beta", { genre: "pop" }),
      track("a3", "Locked Artist", "Gamma", { genre: "pop" }),
      track("a4", "Locked Artist", "Delta", { genre: "pop" }),
      ...genericLibrary()
    ];
    const provider = makeCrateProvider();
    const data = await buildCrate({ library, prompt: "Locked Artist", playlistSize: 10 }, provider);
    assert.ok(data.results.length > 0, "expected the locked artist's own tracks to come back");
    data.results.forEach((r) => {
      const t = library.find((lt) => lt.id === r.trackId);
      assert.equal(t.artist, "Locked Artist", `expected every result credited to Locked Artist, got ${t.artist}`);
    });
  } finally { restore(); }
});

// Do Not Play runs on the model's raw {id,name,bpm,key} shape, before IDs
// are resolved back to real library objects (source order, preserved here
// - see crateLists.js header) - so an "artist"/"track" entry (matched by
// substring against the display name) works reliably, but a "genre"/"era"/
// "content" entry can only fall back to a substring guess against the name
// text when no _libTrack is attached, which it usually isn't at this point
// in the pipeline. That's the source's own degraded behavior, not
// something this port is authorized to improve by attaching real track
// data earlier (CLAUDE.md Top Rule 5) - flagged for Mike in
// docs/QUESTIONS.md. This test exercises the path that actually works.
test("Do Not Play is a real hard filter on crate results (R27 scope: Crate Cheat only)", async () => {
  const restore = seedRandom(6);
  try {
    const library = genericLibrary();
    const provider = makeCrateProvider();
    const data = await buildCrate({
      library, prompt: "a broad mix for the night", playlistSize: 15,
      doNotPlayList: [{ type: "artist", value: "Artist3", persistent: true }]
    }, provider);
    data.results.forEach((r) => {
      const t = library.find((lt) => lt.id === r.trackId);
      assert.notEqual(t.artist, "Artist3", "a Do Not Play artist must never appear in results");
    });
  } finally { restore(); }
});

test("deep play-count mode filters out familiar song families from crate results", async () => {
  const restore = seedRandom(7);
  try {
    const library = [
      track("f1", "Familiar Act", "Common Hit", { genre: "pop", playcount: "50" }),
      track("f2", "Fresh Act", "Deep Cut", { genre: "pop", playcount: "0" }),
      ...genericLibrary()
    ];
    const provider = makeCrateProvider();
    const data = await buildCrate({ library, prompt: "pop music for the set", playlistSize: 20, playCountMode: "deep" }, provider);
    const names = data.results.map((r) => r.name);
    assert.ok(!names.includes("Familiar Act - Common Hit"), "a highly-played track must be excluded in deep mode");
  } finally { restore(); }
});

test("dedup: two model entries whose titles reduce to the same raw title collapse to one result", async () => {
  const restore = seedRandom(8);
  try {
    const library = genericLibrary();
    const provider = makeCrateProvider({
      pick: (candidates) => {
        const first = candidates[0];
        const dupe = { ...first, id: candidates[1].id, name: first.name + " (Redrum)" };
        return [first, dupe, ...candidates.slice(2)];
      }
    });
    const data = await buildCrate({ library, prompt: "a broad mix for the night", playlistSize: 10 }, provider);
    const seen = new Set();
    data.results.forEach((r) => {
      assert.ok(!seen.has(r.trackId), "a duplicated-title entry must not survive dedup as a second result");
      seen.add(r.trackId);
    });
  } finally { restore(); }
});

test("R4 shortfall reporting: a pool too small to satisfy the request reports POOL_TOO_SMALL honestly instead of padding", async () => {
  const restore = seedRandom(9);
  try {
    const library = [
      track("s1", "Locked Artist", "Only Song", { genre: "pop" })
    ];
    const provider = makeCrateProvider();
    const data = await buildCrate({ library, prompt: "Locked Artist", playlistSize: 10 }, provider);
    assert.ok(data.returned < data.requested);
    assert.equal(data.shortfallReason, "POOL_TOO_SMALL");
    assert.equal(data.candidatePoolSize, 1);
  } finally { restore(); }
});

test("old-school prompt pulls from both the true and newer old-school tiers, not just one", async () => {
  const restore = seedRandom(10);
  try {
    const library = [
      track("os1", "Run-DMC", "Classic One", { genre: "hip hop", year: "1985" }),
      track("os2", "Run-DMC", "Classic Two", { genre: "hip hop", year: "1986" }),
      track("os3", "Run-DMC", "Classic Three", { genre: "hip hop", year: "1986" }),
      track("os4", "Nas", "Newer One", { genre: "hip hop", year: "1994" }),
      track("os5", "Nas", "Newer Two", { genre: "hip hop", year: "1994" }),
      track("os6", "Nas", "Newer Three", { genre: "hip hop", year: "1996" }),
      ...genericLibrary()
    ];
    const provider = makeCrateProvider();
    const data = await buildCrate({ library, prompt: "old school hip hop party", playlistSize: 6 }, provider);
    const artists = data.results.map((r) => library.find((lt) => lt.id === r.trackId).artist);
    assert.ok(artists.includes("Run-DMC"), "expected at least one true-old-school pick");
    assert.ok(artists.includes("Nas"), "expected at least one newer-old-school pick");
  } finally { restore(); }
});

// --- Route-level: session-scoped per-prompt staleness (source: v1.0.14012/16002) ---

test("route: a repeated identical crate prompt in the same session excludes tracks already shown", async () => {
  const restore = seedRandom(11);
  try {
    const app = buildApp({ devTokens: [DEV_TOKEN] });
    const session = await createSession(app);
    const library = genericLibrary();

    const first = await recommendCrate(app, session.sessionId, { library, prompt: "a broad mix for the night", size: 10 });
    assert.ok(first.returned > 0);
    const firstIds = new Set(first.results.map((r) => r.trackId));

    const second = await recommendCrate(app, session.sessionId, { library, prompt: "a broad mix for the night", size: 10 });
    second.results.forEach((r) => assert.ok(!firstIds.has(r.trackId), `${r.trackId} was already shown for this exact prompt this session`));
  } finally { restore(); }
});

async function recommendCrate(app, sessionId, body) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/crates/build",
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
    payload: { ...body, sessionId }
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
  return res.json().data;
}
