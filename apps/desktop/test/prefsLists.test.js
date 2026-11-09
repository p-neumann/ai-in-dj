// Phase 5, step 5 piece 7 (Settings).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { addListEntry, removeListEntry, permanentOnly, buildStoredPrefsPayload } = require("../src/renderer/src/settings/prefsLists.ts");

test("addListEntry: adds a trimmed entry with the given persistence", () => {
  const result = addListEntry([], "artist", "  Drake  ", true);
  assert.deepEqual(result, [{ type: "artist", value: "Drake", persistent: true }]);
});

test("addListEntry: a blank value is ignored, the list is unchanged", () => {
  const list = [{ type: "artist", value: "Drake", persistent: true }];
  assert.deepEqual(addListEntry(list, "artist", "   ", false), list);
});

test("addListEntry: does not mutate the original list", () => {
  const list = [];
  addListEntry(list, "genre", "disco", true);
  assert.deepEqual(list, []);
});

test("removeListEntry: removes exactly the entry at that index", () => {
  const list = [
    { type: "artist", value: "A", persistent: true },
    { type: "artist", value: "B", persistent: true },
    { type: "artist", value: "C", persistent: true }
  ];
  assert.deepEqual(removeListEntry(list, 1).map((e) => e.value), ["A", "C"]);
});

test("permanentOnly: keeps only persistent entries - this is what gets saved locally", () => {
  const list = [
    { type: "artist", value: "A", persistent: true },
    { type: "artist", value: "B", persistent: false },
    { type: "artist", value: "C", persistent: true }
  ];
  assert.deepEqual(permanentOnly(list).map((e) => e.value), ["A", "C"]);
});

test("permanentOnly: an all-session list returns empty - nothing to save on restart", () => {
  const list = [{ type: "artist", value: "A", persistent: false }];
  assert.deepEqual(permanentOnly(list), []);
});

// docs/decisions/0018: the exact real bug - a session entry sitting
// alongside a permanent one in the SAME list must not survive a save
// triggered by that permanent entry (or by anything else touching the
// same list).
test("buildStoredPrefsPayload: a session entry mixed in with a permanent one in the same list is dropped, not saved", () => {
  const doNotPlayList = [
    { type: "artist", value: "Drake", persistent: false },
    { type: "artist", value: "Drake", persistent: true }
  ];
  const payload = buildStoredPrefsPayload("", [], doNotPlayList);
  assert.deepEqual(payload.doNotPlayList, [{ type: "artist", value: "Drake", persistent: true }]);
});

test("buildStoredPrefsPayload: filters Do Play the same way as Do Not Play", () => {
  const doPlayList = [
    { type: "genre", value: "disco", persistent: false },
    { type: "genre", value: "funk", persistent: true }
  ];
  const payload = buildStoredPrefsPayload("", doPlayList, []);
  assert.deepEqual(payload.doPlayList, [{ type: "genre", value: "funk", persistent: true }]);
});

test("buildStoredPrefsPayload: an all-session list on both sides saves as empty, not the session entries", () => {
  const sessionOnly = [{ type: "artist", value: "A", persistent: false }];
  const payload = buildStoredPrefsPayload("my style", sessionOnly, sessionOnly);
  assert.deepEqual(payload, { styleProfile: "my style", doPlayList: [], doNotPlayList: [] });
});

test("buildStoredPrefsPayload: style profile passes through untouched - it has no session/permanent split", () => {
  const payload = buildStoredPrefsPayload("I favor remixes", [], []);
  assert.equal(payload.styleProfile, "I favor remixes");
});
