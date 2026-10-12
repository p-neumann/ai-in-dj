// getDisplayName (CLAUDE.md 5.4 library-sync privacy change): a provided
// displayName is now trusted first - added for synced (location-less)
// tracks. Every existing behavior (location-based, artist-title
// fallback) must stay exactly as it was.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getDisplayName } from "../src/engine/trackNames.js";

test("getDisplayName: a provided displayName is trusted directly, no recomputation", () => {
  assert.equal(getDisplayName({ displayName: "Real Name (Clean)", artist: "Wrong", title: "Wrong" }), "Real Name (Clean)");
});

test("getDisplayName: unchanged - derives the filename from location when no displayName is given", () => {
  assert.equal(getDisplayName({ location: "/Volumes/Drive/Artist - Song (Redrum).mp4" }), "Artist - Song (Redrum)");
});

test("getDisplayName: unchanged - falls back to 'artist - title' when neither displayName nor location is given", () => {
  assert.equal(getDisplayName({ artist: "Artist", title: "Title" }), "Artist - Title");
});

test("getDisplayName: unchanged - falls back to title alone, then 'Unknown'", () => {
  assert.equal(getDisplayName({ title: "Title" }), "Title");
  assert.equal(getDisplayName({}), "Unknown");
});
