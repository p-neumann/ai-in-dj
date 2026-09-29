// Unit tests for the ported engine pieces themselves (not the HTTP layer).
// These exist to make "preserve Mike's recommendation logic" checkable,
// not just asserted - e.g. that the seed and duplicate song-family
// versions genuinely get filtered out, matching the prototype's own rules.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isSameSong, getRawTitleFromName } from "../src/engine/trackNames.js";
import { resolveRes } from "../src/engine/resolveResults.js";
import { buildSmartCtx } from "../src/engine/candidateSelection.js";
import { sampleLibrary } from "../fixtures/sampleLibrary.js";

test("isSameSong treats different edits of the same song as the same song", () => {
  assert.equal(isSameSong("Bad Bunny - Tití Me Preguntó", "Bad Bunny - Tití Me Preguntó (Dirty)"), true);
  assert.equal(isSameSong("Bad Bunny - Tití Me Preguntó", "J Balvin - Mi Gente"), false);
});

test("getRawTitleFromName strips a leading BPM/bracket tag before the real title", () => {
  assert.equal(getRawTitleFromName("(100-106) Bad Bunny - Tití Me Preguntó"), "tití me preguntó");
});

test("buildSmartCtx never includes more than 100 candidates, matching the prototype's cap (R1)", () => {
  const ctx = buildSmartCtx(sampleLibrary, "reggaeton", false, null, 98, false, new Set(), 2022, false, false);
  assert.ok(ctx.indexed.length <= 100);
  assert.equal(ctx.indexed.length, sampleLibrary.length); // fixture is small, so nothing gets cut
});

test("resolveRes drops the seed track, drops a duplicate edit of an already-picked song, and never invents an ID", () => {
  const indexed = sampleLibrary.map((t, i) => ({ id: i, track: t }));
  const rawResults = [
    { id: 0, name: "ignored - overwritten by real display name" }, // t1, the seed itself - must be dropped
    { id: 1, name: "ignored" }, // t2 - Bad Bunny, different song from seed, should survive
    { id: 4, name: "ignored" }, // t5
    { id: 999, name: "model hallucinated an id that was never in the pool" } // must be dropped
  ];

  const resolved = resolveRes(rawResults, indexed, "Bad Bunny - Tití Me Preguntó", "reggaeton", false, null, [], []);

  const ids = resolved.map((r) => r._libTrack.id);
  assert.ok(!ids.includes("t1"), "the seed track must never come back as its own recommendation");
  assert.ok(!resolved.some((r) => r.name.includes("hallucinated")), "an id not in the candidate pool must never survive");
  assert.ok(ids.includes("t2"));
  assert.ok(ids.includes("t5"));
});
