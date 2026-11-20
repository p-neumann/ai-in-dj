// Phase 5, step 5 piece 7 (Settings).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { addListEntry, removeListEntry, permanentOnly, buildStoredPrefsPayload, parseStoredPrefs } = require("../src/renderer/src/settings/prefsLists.ts");

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
  const payload = buildStoredPrefsPayload("", [], doNotPlayList, false);
  assert.deepEqual(payload.doNotPlayList, [{ type: "artist", value: "Drake", persistent: true }]);
});

test("buildStoredPrefsPayload: filters Do Play the same way as Do Not Play", () => {
  const doPlayList = [
    { type: "genre", value: "disco", persistent: false },
    { type: "genre", value: "funk", persistent: true }
  ];
  const payload = buildStoredPrefsPayload("", doPlayList, [], false);
  assert.deepEqual(payload.doPlayList, [{ type: "genre", value: "funk", persistent: true }]);
});

test("buildStoredPrefsPayload: an all-session list on both sides saves as empty, not the session entries", () => {
  const sessionOnly = [{ type: "artist", value: "A", persistent: false }];
  const payload = buildStoredPrefsPayload("my style", sessionOnly, sessionOnly, true);
  assert.deepEqual(payload, { styleProfile: "my style", doPlayList: [], doNotPlayList: [], dontAskPrefsReminder: true });
});

// Piece 4 (startup preferences reminder): persistPrefs always writes
// all four fields together (source 1518-1526) - a caller that doesn't
// care about this flag still has to pass it through unchanged, or a
// Style Profile edit would silently reset "don't ask again" to false.
test("buildStoredPrefsPayload: dontAskPrefsReminder passes through untouched, both values", () => {
  assert.equal(buildStoredPrefsPayload("", [], [], false).dontAskPrefsReminder, false);
  assert.equal(buildStoredPrefsPayload("", [], [], true).dontAskPrefsReminder, true);
});

test("buildStoredPrefsPayload: style profile passes through untouched - it has no session/permanent split", () => {
  const payload = buildStoredPrefsPayload("I favor remixes", [], [], false);
  assert.equal(payload.styleProfile, "I favor remixes");
});

// parseStoredPrefs - moved into this shared module for piece 4 (startup
// preferences reminder), since App.tsx now needs to parse the exact
// same stored shape StyleProfilePopup does, for the gate check.
test("parseStoredPrefs: no stored value at all (fresh install) returns all defaults, dontAskPrefsReminder false", () => {
  assert.deepEqual(parseStoredPrefs(null), { styleProfile: "", doPlayList: [], doNotPlayList: [], dontAskPrefsReminder: false });
});

test("parseStoredPrefs: a real round-trip, every field intact", () => {
  const raw = JSON.stringify({
    styleProfile: "deep cuts only",
    doPlayList: [{ type: "artist", value: "A", persistent: true }],
    doNotPlayList: [{ type: "content", value: "Dirty", persistent: true }],
    dontAskPrefsReminder: true
  });
  assert.deepEqual(parseStoredPrefs(raw), {
    styleProfile: "deep cuts only",
    doPlayList: [{ type: "artist", value: "A", persistent: true }],
    doNotPlayList: [{ type: "content", value: "Dirty", persistent: true }],
    dontAskPrefsReminder: true
  });
});

test("parseStoredPrefs: malformed JSON never throws, returns defaults", () => {
  assert.deepEqual(parseStoredPrefs("{not json"), { styleProfile: "", doPlayList: [], doNotPlayList: [], dontAskPrefsReminder: false });
});

test("parseStoredPrefs: wrong types for each field fall back to that field's own default, not a crash", () => {
  const raw = JSON.stringify({ styleProfile: 5, doPlayList: "nope", doNotPlayList: null, dontAskPrefsReminder: "yes" });
  assert.deepEqual(parseStoredPrefs(raw), { styleProfile: "", doPlayList: [], doNotPlayList: [], dontAskPrefsReminder: false });
});
