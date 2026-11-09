// Phase 5 SQLite milestone: CSV library import into the tracks table.
// Parser and normalization tests adopted from Ranjish Kumar's
// ranjish/ccdj-desktop branch (test/library.test.js), with the unknown
// bpm/year cases changed to null. The Crates.csv test runs the real library
// through this database; it only reads that file and writes to a temporary
// folder.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, parseCsvWithHeaders } from "../src/main/library/parseCsv.ts";
import { getDisplayName, normalizeKey, normalizeTrack } from "../src/main/library/normalizeTrack.ts";
import { importLibraryFromCsvText } from "../src/main/library/importLibrary.ts";
import { migrate } from "../src/main/db/migrate.ts";
import { openDatabase } from "../src/main/db/connection.ts";
import { countTracks, getAllTracksForLibrary, replaceAllTracks } from "../src/main/db/tracks.ts";

const CRATES_CSV = fileURLToPath(new URL("../../../Crates.csv", import.meta.url));

// --- parseCsv --------------------------------------------------------------

test("parseCsv: a comma inside quotes is not treated as a column separator", () => {
  assert.deepEqual(parseCsv('a,"b, still b",c\n'), [["a", "b, still b", "c"]]);
});

test("parseCsv: a doubled quote inside a quoted field is one literal quote", () => {
  assert.deepEqual(parseCsv('"She said ""hi""",ok\n'), [['She said "hi"', "ok"]]);
});

test("parseCsv: a newline inside a quoted field stays inside that one field", () => {
  assert.deepEqual(parseCsv('"line one\nline two",ok\n'), [["line one\nline two", "ok"]]);
});

test("parseCsv: CRLF line endings are treated the same as plain newlines", () => {
  assert.deepEqual(parseCsv("a,b\r\nc,d\r\n"), [["a", "b"], ["c", "d"]]);
});

test("parseCsv: a doubled CR before LF (the Crates.csv export quirk) is one line ending", () => {
  assert.deepEqual(parseCsv("a,b\r\r\nc,d\r\r\n"), [["a", "b"], ["c", "d"]]);
});

test("parseCsv: any run of consecutive line breaks collapses to one boundary", () => {
  assert.deepEqual(parseCsv("a,b\n\n\nc,d\n"), [["a", "b"], ["c", "d"]]);
});

test("parseCsv: a leading UTF-8 BOM is stripped", () => {
  assert.deepEqual(parseCsv("\uFEFFtitle,artist\nSong,Artist\n"), [["title", "artist"], ["Song", "Artist"]]);
});

test("parseCsvWithHeaders: headers are lowercased (CLAUDE.md 6.1: playCount -> playcount)", () => {
  const { headers, rows } = parseCsvWithHeaders("title,artist,playCount\nSong,Artist,5\n");
  assert.deepEqual(headers, ["title", "artist", "playcount"]);
  assert.equal(rows[0].playcount, "5");
});

// --- normalizeTrack --------------------------------------------------------

test("normalizeKey: DJ-software notation variants are cleaned up, not reinterpreted", () => {
  assert.equal(normalizeKey("8M"), "8A");
  assert.equal(normalizeKey("2D"), "2B");
  assert.equal(normalizeKey("8A"), "8A");
  assert.equal(normalizeKey(" 8a "), "8A");
  assert.equal(normalizeKey(""), "");
  assert.equal(normalizeKey("garbage"), "GARBAGE");
});

test("getDisplayName: prefers the filename from location, then artist - title, then title", () => {
  assert.equal(getDisplayName({ location: "/Volumes/Drive/DJ Shadow - Organ Donor.mp4" }), "DJ Shadow - Organ Donor");
  assert.equal(getDisplayName({ location: "C:\\Music\\Song.mp3" }), "Song");
  assert.equal(getDisplayName({ artist: "Artist", title: "Title" }), "Artist - Title");
  assert.equal(getDisplayName({ title: "Title" }), "Title");
  assert.equal(getDisplayName({}), "Unknown");
});

test("normalizeTrack: a row with only a location is kept", () => {
  const { track, rejectedReason } = normalizeTrack({ location: "/Music/song.mp3" });
  assert.equal(rejectedReason, null);
  assert.equal(track.displayName, "song");
});

test("normalizeTrack: a row with none of title/location/filename is rejected with a reason", () => {
  const { track, rejectedReason, isBlankLine } = normalizeTrack({ artist: "Someone", bpm: "120" });
  assert.equal(track, null);
  assert.equal(rejectedReason, "no title, location, or filename");
  assert.equal(isBlankLine, false);
});

test("normalizeTrack: a blank row is told apart from a problem row", () => {
  const { track, rejectedReason, isBlankLine } = normalizeTrack({ title: "", artist: "", location: "" });
  assert.equal(track, null);
  assert.equal(rejectedReason, "blank line");
  assert.equal(isBlankLine, true);
});

test("normalizeTrack: a real 0 play count stays 0; empty or absent is null", () => {
  assert.equal(normalizeTrack({ title: "Song", playcount: "0" }).track.playcount, 0);
  assert.equal(normalizeTrack({ title: "Song", playcount: "" }).track.playcount, null);
  assert.equal(normalizeTrack({ title: "Song" }).track.playcount, null);
});

test("normalizeTrack: an empty or unparseable bpm is null, not 0 or NaN", () => {
  assert.equal(normalizeTrack({ title: "Song", bpm: "not-a-number" }).track.bpm, null);
  assert.equal(normalizeTrack({ title: "Song", bpm: "" }).track.bpm, null);
  assert.equal(normalizeTrack({ title: "Song", bpm: "128.5" }).track.bpm, 128.5);
});

test("normalizeTrack: a year of 0, empty or unparseable is null (CLAUDE.md 6.1)", () => {
  assert.equal(normalizeTrack({ title: "Song", year: "0" }).track.year, null);
  assert.equal(normalizeTrack({ title: "Song", year: "" }).track.year, null);
  assert.equal(normalizeTrack({ title: "Song", year: "n/a" }).track.year, null);
  assert.equal(normalizeTrack({ title: "Song", year: "2007" }).track.year, 2007);
});

test("normalizeTrack: unknown columns are preserved in extra", () => {
  const { track } = normalizeTrack({ title: "Song", mood: "chill", rating: "5" });
  assert.deepEqual(track.extra, { mood: "chill", rating: "5" });
});

// --- importLibraryFromCsvText ----------------------------------------------

test("importLibraryFromCsvText: rejected rows report the 1-based line number, header included", () => {
  const csv = "title,artist\nGood Song,Someone\n,NoTitleOrLocation\nAnother Good One,Someone\n";
  const result = importLibraryFromCsvText(csv);
  assert.equal(result.tracks.length, 2);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].line, 3);
});

test("benchmark: 75,000 synthetic rows parse and store, timed", async (t) => {
  const lines = ["title,artist,bpm,key,genre,playcount,year,location"];
  for (let i = 0; i < 75000; i++) {
    lines.push(`Song ${i},Artist ${i},128,8A,house,${i % 50},2020,/Music/Song ${i}.mp3`);
  }
  const db = await tempDatabase(t);

  const start = Date.now();
  const { tracks, rejected } = importLibraryFromCsvText(lines.join("\n"));
  const parsedAt = Date.now();
  const result = replaceAllTracks(db, tracks);
  const storedAt = Date.now();

  assert.equal(rejected.length, 0);
  assert.deepEqual(result, { inserted: 75000, duplicateLocations: [] });
  t.diagnostic(`75,000 rows: parse ${parsedAt - start} ms, store ${storedAt - parsedAt} ms`);
});

// --- the real library ------------------------------------------------------

test("Crates.csv: every track imports, and a re-import keeps every ID", { skip: !existsSync(CRATES_CSV) && "Crates.csv not present" }, async (t) => {
  const db = await tempDatabase(t);
  const text = readFileSync(CRATES_CSV, "utf8");

  const start = Date.now();
  const { tracks, rejected, totalRows } = importLibraryFromCsvText(text);
  const first = replaceAllTracks(db, tracks);
  t.diagnostic(`import: ${totalRows} rows, ${Date.now() - start} ms`);
  const idsBefore = getAllTracksForLibrary(db).map((r) => r.id).sort();

  replaceAllTracks(db, importLibraryFromCsvText(text).tracks);
  const idsAfter = getAllTracksForLibrary(db).map((r) => r.id).sort();

  // 38,484 matches Ranjish's count for this file (his phase-5 report explains
  // the prototype's 38,486: two rows it mis-parses).
  assert.equal(totalRows, 38484);
  assert.equal(rejected.length, 0);
  assert.deepEqual(first, { inserted: 38484, duplicateLocations: [] });
  assert.equal(countTracks(db), 38484);
  assert.deepEqual(idsAfter, idsBefore);
});

// --- helpers ---------------------------------------------------------------

// A database at the latest version in its own temporary folder. One cleanup
// hook closes the connection before deleting the folder (Windows EBUSY).
async function tempDatabase(t) {
  const dir = mkdtempSync(join(tmpdir(), "ccdj-library-test-"));
  let db;
  t.after(() => {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const dbPath = join(dir, "ccdj-db.sqlite");
  assert.equal((await migrate(dbPath)).status, "migrated");
  db = openDatabase(dbPath);
  return db;
}
