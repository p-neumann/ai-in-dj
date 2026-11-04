// Phase 5, step 5 piece 6.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { parsePlainText } = require("../src/renderer/src/playlistCheat/parsePlainText.ts");

test("parsePlainText: splits 'Artist - Title' per line", () => {
  const result = parsePlainText("Daft Punk - One More Time\nBlackstreet - No Diggity");
  assert.deepEqual(result, [
    { artist: "Daft Punk", name: "One More Time" },
    { artist: "Blackstreet", name: "No Diggity" }
  ]);
});

test("parsePlainText: a line with no ' - ' separator is title-only, artist blank", () => {
  assert.deepEqual(parsePlainText("Africa"), [{ artist: "", name: "Africa" }]);
});

test("parsePlainText: a title that itself contains ' - ' keeps the rest joined, not split again", () => {
  assert.deepEqual(parsePlainText("Pitbull - I Know You Want Me - Calle Ocho"), [
    { artist: "Pitbull", name: "I Know You Want Me - Calle Ocho" }
  ]);
});

test("parsePlainText: blank lines are skipped, not turned into empty entries", () => {
  assert.deepEqual(parsePlainText("Africa\n\n  \nBlackstreet - No Diggity"), [
    { artist: "", name: "Africa" },
    { artist: "Blackstreet", name: "No Diggity" }
  ]);
});

test("parsePlainText: empty input returns an empty list", () => {
  assert.deepEqual(parsePlainText(""), []);
});
