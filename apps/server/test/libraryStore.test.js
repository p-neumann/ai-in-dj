// The server's own synced-library store (CLAUDE.md Phase 5 "sync
// client"; docs/decisions/0009). In-memory, full-replace each sync -
// deliberately not true incremental upsert/delete diffing, see the
// decision record for why.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  syncLibrary,
  getLibraryForRevision,
  getCurrentRevision,
  _resetLibraryStoreForTests
} from "../src/library/libraryStore.js";

test.beforeEach(() => {
  _resetLibraryStoreForTests();
});

test("before any sync, revision 0 and every lookup returns null (never synced)", () => {
  assert.equal(getCurrentRevision(), 0);
  assert.equal(getLibraryForRevision(0), null);
  assert.equal(getLibraryForRevision(1), null);
});

test("syncLibrary stores the tracks and returns an incrementing revision + count", () => {
  const first = syncLibrary([{ id: 1, title: "A" }, { id: 2, title: "B" }]);
  assert.equal(first.libraryRevision, 1);
  assert.equal(first.trackCount, 2);

  const second = syncLibrary([{ id: 1, title: "A" }]);
  assert.equal(second.libraryRevision, 2, "each sync bumps the revision, even a smaller one");
  assert.equal(second.trackCount, 1);
});

test("getLibraryForRevision returns the exact tracks for the CURRENT revision only", () => {
  const { libraryRevision } = syncLibrary([{ id: 1, title: "A" }, { id: 2, title: "B" }]);
  const library = getLibraryForRevision(libraryRevision);
  assert.equal(library.length, 2);
  assert.deepEqual(library.map((t) => t.id).sort(), [1, 2]);
});

test("an OLDER revision becomes invalid the moment a newer sync happens (simulates a stale client)", () => {
  const { libraryRevision: oldRevision } = syncLibrary([{ id: 1, title: "A" }]);
  syncLibrary([{ id: 2, title: "B" }]); // a second sync - old revision is no longer current
  assert.equal(getLibraryForRevision(oldRevision), null);
});

test("privacy: a location field is stripped before storage, even if the caller sends one (defense in depth)", () => {
  const { libraryRevision } = syncLibrary([{ id: 1, title: "A", location: "/Users/mike/Music/secret-path.mp3" }]);
  const [track] = getLibraryForRevision(libraryRevision);
  assert.equal(track.location, undefined, "location must never be stored, even if sent");
  assert.equal(track.id, 1);
  assert.equal(track.title, "A");
});
