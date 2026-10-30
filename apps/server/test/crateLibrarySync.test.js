// docs/decisions/0011: extends the real 413 fix (docs/decisions/0009,
// proven in librarySync.test.js for track-cheat) to /v1/crates/build -
// without this, Crate Cheat would hit the exact same real HTTP 413 Track
// Cheat hit against Ranjish's real ~38,484-track library sent inline.
// Tested at the real HTTP layer (app.inject), same reason as
// librarySync.test.js: the original bug was an HTTP-layer problem
// (Fastify's default body limit), not a pure-function one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { createMockProvider } from "../src/providers/mockProvider.js";
import { _resetAllSessionsForTests } from "../src/session/sessionStore.js";
import { _resetLibraryStoreForTests } from "../src/library/libraryStore.js";
import { DEV_TOKEN } from "./helpers.js";

function makeApp() {
  return buildApp({ devTokens: [DEV_TOKEN], provider: createMockProvider() });
}

function bigSyntheticLibrary(n) {
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

async function buildCrateViaHttp(app, body) {
  return app.inject({
    method: "POST",
    url: "/v1/crates/build",
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
    payload: body
  });
}

test("crate build works with ONLY a libraryRevision - no library array in the request at all", async () => {
  const app = makeApp();
  const library = bigSyntheticLibrary(500);
  const syncRes = await syncLibraryViaHttp(app, library);
  const { libraryRevision } = syncRes.json().data;

  const res = await buildCrateViaHttp(app, { prompt: "house music for the dance floor", size: 10, libraryRevision });
  assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
  const body = res.json();
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.data.results));
});

test("crate build's own request body stays small even with a huge synced library", async () => {
  const app = makeApp();
  const library = bigSyntheticLibrary(38484);
  const syncRes = await syncLibraryViaHttp(app, library);
  const { libraryRevision } = syncRes.json().data;

  const res = await buildCrateViaHttp(app, { prompt: "house music for the dance floor", size: 25, libraryRevision });
  assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
});

test("crate build still 413s on an inline library over the normal limit - the fix is sync, not a bigger limit here", async () => {
  const app = makeApp();
  const hugeInlineLibrary = bigSyntheticLibrary(38484); // same real size that produced the original 413

  const res = await buildCrateViaHttp(app, { library: hugeInlineLibrary, prompt: "house music", size: 10 });
  assert.equal(res.statusCode, 413, "crate build must still reject an oversized inline library");
});

test("LIBRARY_OUT_OF_SYNC: a crate build with a libraryRevision that was never synced is rejected clearly, not silently", async () => {
  const app = makeApp();

  const res = await buildCrateViaHttp(app, { prompt: "house music", size: 10, libraryRevision: 999 });

  assert.equal(res.statusCode, 409);
  const body = res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "LIBRARY_OUT_OF_SYNC");
});

test("LIBRARY_OUT_OF_SYNC: a STALE revision (server restarted / resynced since) is rejected the same way for crate build", async () => {
  const app = makeApp();
  const firstSync = await syncLibraryViaHttp(app, bigSyntheticLibrary(10));
  const staleRevision = firstSync.json().data.libraryRevision;

  await syncLibraryViaHttp(app, bigSyntheticLibrary(20)); // a second, newer sync

  const res = await buildCrateViaHttp(app, { prompt: "house music", size: 5, libraryRevision: staleRevision });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error.code, "LIBRARY_OUT_OF_SYNC");
});

test("an inline library still works unchanged - existing small-fixture tests keep working exactly as before", async () => {
  const app = makeApp();
  const library = bigSyntheticLibrary(30);

  const res = await buildCrateViaHttp(app, { library, prompt: "house music", size: 10 });
  assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
  assert.equal(res.json().ok, true);
});
