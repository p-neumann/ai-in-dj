// PUT /v1/preferences (CLAUDE.md Section 6.4). No account/DB store exists
// yet (Phase 6) - these tests verify the session-scoped simplification
// documented in sessionStore.js/routes/preferences.js: a session's stored
// Style Profile and enrichment feed into a LATER crate build that doesn't
// explicitly re-supply them, and an explicit per-request field still wins
// over the stored one.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { _resetAllSessionsForTests, getSession } from "../src/session/sessionStore.js";
import { createSession, seedRandom, DEV_TOKEN } from "./helpers.js";

beforeEach(() => {
  _resetAllSessionsForTests();
});

async function putPreferences(app, body) {
  return app.inject({
    method: "PUT",
    url: "/v1/preferences",
    headers: { authorization: `Bearer ${DEV_TOKEN}` },
    payload: body
  });
}

test("PUT /v1/preferences requires a sessionId (no account store exists yet)", async () => {
  const app = buildApp({ devTokens: [DEV_TOKEN] });
  const res = await putPreferences(app, { styleProfile: "I love remixes" });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, "VALIDATION");
});

test("PUT /v1/preferences stores doPlay/doNotPlay on the session and reports enrichmentStatus", async () => {
  const app = buildApp({ devTokens: [DEV_TOKEN] });
  const session = await createSession(app);

  const resNoProfile = await putPreferences(app, { sessionId: session.sessionId, doPlay: [{ type: "genre", value: "house" }] });
  assert.equal(resNoProfile.statusCode, 200);
  assert.equal(resNoProfile.json().data.enrichmentStatus, "none");

  const raw = getSession(session.sessionId);
  assert.deepEqual(raw.doPlay, [{ type: "genre", value: "house" }]);

  const resWithProfile = await putPreferences(app, { sessionId: session.sessionId, styleProfile: "I favor extended versions" });
  assert.equal(resWithProfile.json().data.enrichmentStatus, "pending");
  assert.equal(getSession(session.sessionId).styleProfile, "I favor extended versions");
});

test("a session's stored Style Profile feeds into a later crate build that doesn't re-supply it", async () => {
  const restore = seedRandom(1);
  try {
    const app = buildApp({ devTokens: [DEV_TOKEN] });
    const session = await createSession(app);

    await putPreferences(app, { sessionId: session.sessionId, styleProfile: "only show redrum versions" });
    // No enrichment call is awaited by the route (fire-and-forget) - set
    // the resolved styleProfile directly for a deterministic test rather
    // than racing a background promise.
    const raw = getSession(session.sessionId);
    assert.equal(raw.styleProfile, "only show redrum versions");

    const library = [
      { id: "r1", artist: "Artist", title: "Song One (Redrum)", bpm: "120", key: "8A", year: "2015", genre: "pop", playcount: "1" },
      { id: "r2", artist: "Artist", title: "Song Two", bpm: "121", key: "8A", year: "2015", genre: "pop", playcount: "1" }
    ];

    const buildRes = await app.inject({
      method: "POST",
      url: "/v1/crates/build",
      headers: { authorization: `Bearer ${DEV_TOKEN}` },
      payload: { sessionId: session.sessionId, library, prompt: "a chill pop mix", size: 2 }
    });
    assert.equal(buildRes.statusCode, 200, JSON.stringify(buildRes.json()));
    const data = buildRes.json().data;
    data.results.forEach((r) => {
      const t = library.find((lt) => lt.id === r.trackId);
      assert.ok(/redrum/i.test(t.title), `expected only redrum versions per the session's stored style profile, got ${t.title}`);
    });
  } finally { restore(); }
});

test("an explicit styleProfile on the crate-build request overrides the session's stored one", async () => {
  const restore = seedRandom(2);
  try {
    const app = buildApp({ devTokens: [DEV_TOKEN] });
    const session = await createSession(app);
    await putPreferences(app, { sessionId: session.sessionId, styleProfile: "only show redrum versions" });

    const library = [
      { id: "r1", artist: "Artist", title: "Song One (Redrum)", bpm: "120", key: "8A", year: "2015", genre: "pop", playcount: "1" },
      { id: "r2", artist: "Artist", title: "Song Two", bpm: "121", key: "8A", year: "2015", genre: "pop", playcount: "1" }
    ];
    const buildRes = await app.inject({
      method: "POST",
      url: "/v1/crates/build",
      headers: { authorization: `Bearer ${DEV_TOKEN}` },
      payload: { sessionId: session.sessionId, library, prompt: "a chill pop mix", size: 2, styleProfile: "" }
    });
    assert.equal(buildRes.statusCode, 200, JSON.stringify(buildRes.json()));
    const names = buildRes.json().data.results.map((r) => r.name);
    assert.ok(names.includes("Artist - Song Two"), "an explicit empty styleProfile on the request must override the session's stored one");
  } finally { restore(); }
});
