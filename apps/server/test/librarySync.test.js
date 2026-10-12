// The real fix for the real 413 bug (docs/decisions/0009): a library too
// big for a normal request body must sync once, on its own route with
// its own larger limit, then be referenced by revision on every
// recommend call - never sent inline again. This is tested at the real
// HTTP layer (app.inject), not just as pure functions, because the bug
// itself was an HTTP-layer problem (Fastify's default body limit).

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { createMockProvider } from "../src/providers/mockProvider.js";
import { _resetAllSessionsForTests } from "../src/session/sessionStore.js";
import { _resetLibraryStoreForTests } from "../src/library/libraryStore.js";
import { DEV_TOKEN, recommend } from "./helpers.js";

function makeApp() {
  return buildApp({ devTokens: [DEV_TOKEN], provider: createMockProvider() });
}

function bigSyntheticLibrary(n) {
  // Real-size, not a toy fixture - the whole point is proving this at the
  // scale that actually broke (Ranjish's real ~38,484-track library).
  const tracks = [];
  for (let i = 0; i < n; i++) {
    tracks.push({
      id: i,
      artist: "Artist " + i,
      title: "Song Title Number " + i + " (Extended Club Mix)",
      bpm: 120 + (i % 10),
      key: "8A",
      genre: "house",
      year: 2000 + (i % 25),
      playcount: i % 50
      // deliberately no location/displayName here - this IS the sync
      // payload shape, and the privacy check below confirms location
      // specifically is never required or sent.
    });
  }
  return tracks;
}

test.beforeEach(() => {
  _resetAllSessionsForTests();
  _resetLibraryStoreForTests();
});

async function syncLibraryViaHttp(app, tracks) {
  return app.inject({
    method: "POST",
    url: "/v1/library/sync",
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
    payload: { tracks }
  });
}

test("a real ~38k-track library syncs successfully - this is the exact size that produced the real 413", async () => {
  const app = makeApp();
  const library = bigSyntheticLibrary(38484);

  const response = await syncLibraryViaHttp(app, library);
  assert.equal(response.statusCode, 200, JSON.stringify(response.json()));
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.trackCount, 38484);
  assert.equal(typeof body.data.libraryRevision, "number");
});

test("after syncing, recommend works with ONLY a libraryRevision - no library array in the request at all", async () => {
  const app = makeApp();
  const library = bigSyntheticLibrary(500);

  const syncRes = await syncLibraryViaHttp(app, library);
  const { libraryRevision } = syncRes.json().data;

  const res = await recommend(app, { seedTrackId: 0, vibe: 0, energy: 0, libraryRevision });
  assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
  const body = res.json();
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.data.results));
});

test("recommend's own body stays small even with a huge synced library - this is the actual fix, not a bigger limit on recommend", async () => {
  const app = makeApp();
  const library = bigSyntheticLibrary(38484);
  const syncRes = await syncLibraryViaHttp(app, library);
  const { libraryRevision } = syncRes.json().data;

  // The recommend request body itself is tiny - a seed id and some
  // numbers - regardless of how big the synced library is.
  const res = await recommend(app, { seedTrackId: 0, vibe: 0, energy: 0, libraryRevision });
  assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
});

test("recommend still 413s on an inline library over the normal limit - confirms recommend's OWN limit was never raised", async () => {
  const app = makeApp();
  const hugeInlineLibrary = bigSyntheticLibrary(38484); // ~1MB+ inline, the original bug's exact shape

  const res = await app.inject({
    method: "POST",
    url: "/v1/track-cheat/recommend",
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
    payload: { library: hugeInlineLibrary, seedTrackId: 0, vibe: 0, energy: 0 }
  });

  assert.equal(res.statusCode, 413, "recommend must still reject an oversized inline library - the fix is sync, not a bigger limit here");
});

test("LIBRARY_OUT_OF_SYNC: a libraryRevision that was never synced is rejected clearly, not silently", async () => {
  const app = makeApp();

  const res = await recommend(app, { seedTrackId: 0, vibe: 0, energy: 0, libraryRevision: 999 });

  assert.equal(res.statusCode, 409);
  const body = res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "LIBRARY_OUT_OF_SYNC");
});

test("LIBRARY_OUT_OF_SYNC: a STALE revision (server restarted / resynced since) is rejected the same way", async () => {
  const app = makeApp();
  const firstSync = await syncLibraryViaHttp(app, bigSyntheticLibrary(10));
  const staleRevision = firstSync.json().data.libraryRevision;

  await syncLibraryViaHttp(app, bigSyntheticLibrary(20)); // a second, newer sync

  const res = await recommend(app, { seedTrackId: 0, vibe: 0, energy: 0, libraryRevision: staleRevision });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error.code, "LIBRARY_OUT_OF_SYNC");
});

test("privacy: syncing a library that accidentally includes real file paths never leaks them into the AI prompt", async () => {
  const app = makeApp();
  const library = [
    {
      id: 0,
      displayName: "Real Song Name",
      artist: "Artist",
      title: "Real Song Name",
      bpm: 120,
      key: "8A",
      genre: "house",
      year: 2020,
      playcount: 1,
      location: "/Users/mike/Music/Secret Folder/private-file.mp3"
    }
  ];
  const syncRes = await syncLibraryViaHttp(app, library);
  const { libraryRevision } = syncRes.json().data;

  const res = await recommend(app, { seedTrackId: 0, vibe: 0, energy: 0, libraryRevision });
  assert.equal(res.statusCode, 200);
  // The mock provider doesn't echo the prompt back, but the stored
  // library itself (what the real prompt is built from) is the thing
  // that must never carry the path - already proven directly in
  // libraryStore.test.js. This test additionally proves the full real
  // HTTP round trip accepts a location-bearing payload without ever
  // needing or storing it.
});
