// Phase 5, step 3 - library import. Real edge cases a naive split(",")
// parser would get wrong, and the normalization rules from CLAUDE.md
// Section 6.1, each tested directly against real input.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { parseCsv, parseCsvWithHeaders } = require("../src/main/library/parseCsv.ts");
const { normalizeTrack, normalizeKey, getDisplayName } = require("../src/main/library/normalizeTrack.ts");
const { importLibraryFromCsvText } = require("../src/main/library/importLibrary.ts");

test("parseCsv: a comma inside quotes is not treated as a column separator", () => {
  const rows = parseCsv('a,"b, still b",c\n');
  assert.deepEqual(rows, [["a", "b, still b", "c"]]);
});

test("parseCsv: a doubled quote inside a quoted field is one literal quote", () => {
  const rows = parseCsv('"She said ""hi""",ok\n');
  assert.deepEqual(rows, [['She said "hi"', "ok"]]);
});

test("parseCsv: a newline inside a quoted field stays inside that one field", () => {
  const rows = parseCsv('"line one\nline two",ok\n');
  assert.deepEqual(rows, [["line one\nline two", "ok"]]);
});

test("parseCsv: CRLF line endings are treated the same as plain newlines", () => {
  const rows = parseCsv("a,b\r\nc,d\r\n");
  assert.deepEqual(rows, [["a", "b"], ["c", "d"]]);
});

test("parseCsv: a doubled CR before LF (real export quirk found in Crates.csv) is ONE line ending, not two", () => {
  // Real bug, found on the real ~38k-track library: every row in that
  // file ends in "\r\r\n", not plain "\r\n". Treating each \r/\n as its
  // own boundary turned every real row into one real row PLUS one
  // spurious empty row right after it - doubling the row count and
  // reporting half the file as "rejected." This is the regression test
  // for the fix.
  const rows = parseCsv("a,b\r\r\nc,d\r\r\n");
  assert.deepEqual(rows, [["a", "b"], ["c", "d"]], "no spurious empty row between or after the real rows");
});

test("parseCsv: any run of mixed consecutive line breaks collapses to one boundary", () => {
  const rows = parseCsv("a,b\n\n\nc,d\n");
  assert.deepEqual(rows, [["a", "b"], ["c", "d"]]);
});

test("parseCsv: a leading UTF-8 BOM is stripped, not treated as part of the first field", () => {
  const rows = parseCsv("\uFEFFtitle,artist\nSong,Artist\n");
  assert.deepEqual(rows, [["title", "artist"], ["Song", "Artist"]]);
});

test("parseCsvWithHeaders: headers are lowercased (CLAUDE.md 6.1: playCount -> playcount)", () => {
  const { headers, rows } = parseCsvWithHeaders('title,artist,playCount\nSong,Artist,5\n');
  assert.deepEqual(headers, ["title", "artist", "playcount"]);
  assert.equal(rows[0].playcount, "5");
});

test("normalizeKey: DJ-software notation variants are cleaned up, not reinterpreted musically", () => {
  assert.equal(normalizeKey("8M"), "8A");
  assert.equal(normalizeKey("2D"), "2B");
  assert.equal(normalizeKey("8A"), "8A", "already-correct values pass through unchanged");
  assert.equal(normalizeKey(" 8a "), "8A", "whitespace/case are normalized");
  assert.equal(normalizeKey(""), "");
  assert.equal(normalizeKey("garbage"), "GARBAGE", "an unrecognizable key is uppercased, not invented");
});

test("getDisplayName: prefers the real filename from location, matching the project's own rule", () => {
  assert.equal(getDisplayName({ location: "/Volumes/Drive/DJ Shadow - Organ Donor.mp4" }), "DJ Shadow - Organ Donor");
  assert.equal(getDisplayName({ location: "C:\\Music\\Song.mp3" }), "Song");
  assert.equal(getDisplayName({ artist: "Artist", title: "Title" }), "Artist - Title");
  assert.equal(getDisplayName({ title: "Title" }), "Title");
  assert.equal(getDisplayName({}), "Unknown");
});

test("normalizeTrack: a row with only a location (no title) is still kept", () => {
  const { track, rejectedReason } = normalizeTrack({ location: "/Music/song.mp3" });
  assert.equal(rejectedReason, null);
  assert.ok(track);
  assert.equal(track.displayName, "song");
});

test("normalizeTrack: a row with none of title/location/filename is rejected with a reason", () => {
  const { track, rejectedReason, isBlankLine } = normalizeTrack({ artist: "Someone", bpm: "120" });
  assert.equal(track, null);
  assert.equal(rejectedReason, "no title, location, or filename");
  assert.equal(isBlankLine, false, "this row has real data, it should NOT be reported as just a blank line");
});

test("normalizeTrack: a genuinely blank row (every field empty) is distinguished from a real problem row", () => {
  const { track, rejectedReason, isBlankLine } = normalizeTrack({ title: "", artist: "", location: "" });
  assert.equal(track, null);
  assert.equal(rejectedReason, "blank line");
  assert.equal(isBlankLine, true);
});

test("normalizeTrack: a real 0 play count is kept as 0, not treated as unknown", () => {
  const { track } = normalizeTrack({ title: "Song", playcount: "0" });
  assert.equal(track.playcount, 0);
});

test("normalizeTrack: an empty/absent play count is null (genuinely unknown), not 0", () => {
  const { track: t1 } = normalizeTrack({ title: "Song", playcount: "" });
  assert.equal(t1.playcount, null);
  const { track: t2 } = normalizeTrack({ title: "Song" });
  assert.equal(t2.playcount, null);
});

test("normalizeTrack: an unparseable bpm becomes 0, not NaN", () => {
  const { track } = normalizeTrack({ title: "Song", bpm: "not-a-number" });
  assert.equal(track.bpm, 0);
});

test("normalizeTrack: unknown columns are preserved in extra, not dropped", () => {
  const { track } = normalizeTrack({ title: "Song", mood: "chill", rating: "5" });
  assert.deepEqual(track.extra, { mood: "chill", rating: "5" });
});

test("importLibraryFromCsvText: rejected rows report the correct 1-based line number, including the header", () => {
  const csv = "title,artist\nGood Song,Someone\n,NoTitleOrLocation\nAnother Good One,Someone\n";
  const result = importLibraryFromCsvText(csv);
  assert.equal(result.tracks.length, 2);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].line, 3, "row 2 of data is line 3 counting the header as line 1");
});

test("benchmark: importing 75,000 synthetic rows completes and is actually timed, not assumed", () => {
  const lines = ["title,artist,bpm,key,genre,playcount,year,location"];
  for (let i = 0; i < 75000; i++) {
    lines.push(`Song ${i},Artist ${i},128,8A,house,${i % 50},2020,/Music/Song ${i}.mp3`);
  }
  const csv = lines.join("\n");

  const start = Date.now();
  const result = importLibraryFromCsvText(csv);
  const elapsedMs = Date.now() - start;

  assert.equal(result.tracks.length, 75000);
  assert.equal(result.rejected.length, 0);
  console.log(`[benchmark] 75,000-row import took ${elapsedMs}ms (measured, not assumed)`);
});
