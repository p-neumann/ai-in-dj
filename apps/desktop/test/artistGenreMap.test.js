// Phase 5, step 5 piece 17 (👍 thumbs-up reseed). ARTIST_GENRE_MAP is
// duplicated client-side from the already-tested server copy
// (apps/server/src/engine/artistLookup.js), same convention as every
// other cross-boundary duplicate in this port (typeLock.ts,
// getRawTitleFromName.ts) - kept in sync by hand, not by a live
// cross-package require (apps/server is "type":"module", apps/desktop
// is not, and this project doesn't lean on cross-require(esm) for its
// duplicated files elsewhere either). Verified here by spot-checking
// one representative artist per genre bucket plus the one real
// duplicate-key case, rather than trusting a by-eye transcription of
// a ~100-entry table.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { ARTIST_GENRE_MAP, inferGenreLocal } = require("../src/renderer/src/trackCheat/artistGenreMap.ts");

test("ARTIST_GENRE_MAP: one representative artist per genre bucket resolves correctly", () => {
  assert.equal(ARTIST_GENRE_MAP["luke bryan"], "country");
  assert.equal(ARTIST_GENRE_MAP["kanye west"], "hip hop");
  assert.equal(ARTIST_GENRE_MAP.rihanna, "r&b");
  assert.equal(ARTIST_GENRE_MAP["bad bunny"], "reggaeton");
  assert.equal(ARTIST_GENRE_MAP.shakira, "latin");
  assert.equal(ARTIST_GENRE_MAP["sean paul"], "dancehall");
  assert.equal(ARTIST_GENRE_MAP["bob marley"], "reggae");
  assert.equal(ARTIST_GENRE_MAP["taylor swift"], "pop");
  assert.equal(ARTIST_GENRE_MAP["daft punk"], "house");
  assert.equal(ARTIST_GENRE_MAP["calvin harris"], "edm");
  assert.equal(ARTIST_GENRE_MAP.nirvana, "rock");
  assert.equal(ARTIST_GENRE_MAP["james brown"], "funk");
  assert.equal(ARTIST_GENRE_MAP["donna summer"], "disco");
  assert.equal(ARTIST_GENRE_MAP.twista, "hip hop");
});

test("inferGenreLocal: a real duplicate-key case resolves to the LAST value in the source literal (enrique iglesias: latin then pop in source order - pop wins)", () => {
  assert.equal(inferGenreLocal("Enrique Iglesias - Bailamos"), "pop");
});

test("inferGenreLocal: unknown artist returns empty string, not a crash", () => {
  // "Totally Unknown Artist" is NOT a safe negative case here - his own
  // substring-match loop matches it against the real key "total"
  // ("totally".indexOf("total")===0), the same class of false-positive
  // substring match already flagged elsewhere in this project
  // (docs/QUESTIONS.md's hip/hop case) - a real property of his
  // algorithm, not a bug in this port. Picked a name with no
  // accidental substring collision against any real key instead.
  assert.equal(inferGenreLocal("Zzyzx Qwerp - Some Song"), "");
});

test("inferGenreLocal: partial/substring match still resolves (artist credit varies by edit)", () => {
  assert.equal(inferGenreLocal("Jay-Z ft. Someone - Song"), "hip hop");
});
