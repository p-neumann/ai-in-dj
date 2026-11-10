// Phase 5, step 5 piece 8 - Export. Pure string builders only; the save
// dialog and file write live in ipc.ts and aren't exercised here.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { buildCsv, buildM3u, buildTxt, buildJson } = require("../src/main/export/buildExportContent.ts");

const TRACKS = [
  { name: "Rihanna - So Hard (Clean)", artist: "Rihanna", bpm: 88, key: "8A", location: "/Music/song1.mp3" },
  { name: 'DJ "Flash" - Go', artist: 'DJ "Flash"', bpm: 128, key: "9A", location: "/Music/song2.mp3" }
];

test("buildCsv: header row, then one quoted row per track with internal quotes doubled", () => {
  const csv = buildCsv(TRACKS);
  const lines = csv.split("\n");
  assert.equal(lines[0], "Location,Artist,Title,BPM,Key");
  assert.equal(lines.length, 3);
  assert.equal(lines[1], '"/Music/song1.mp3","Rihanna","Rihanna - So Hard (Clean)","88","8A"');
  assert.ok(lines[2].includes('""Flash""'), "an embedded double-quote must be escaped as two quotes, not break the row");
});

test("buildCsv: a track with no location leaves the Location column blank, not the name", () => {
  const csv = buildCsv([{ name: "No Location Track", artist: "Someone", bpm: 120, key: "5A" }]);
  assert.ok(csv.includes('""'), "missing location is an empty field, never a fallback to the name");
});

test("buildM3u: #EXTM3U header, then one EXTINF + path pair per track", () => {
  const m3u = buildM3u(TRACKS);
  const lines = m3u.split("\n");
  assert.equal(lines[0], "#EXTM3U");
  assert.equal(lines[1], "#EXTINF:-1,Rihanna - So Hard (Clean)");
  assert.equal(lines[2], "/Music/song1.mp3");
});

test("buildM3u: falls back to the track name when there's no location", () => {
  const m3u = buildM3u([{ name: "No Location Track", artist: "Someone", bpm: 120, key: "5A" }]);
  assert.ok(m3u.includes("\nNo Location Track"), "the path line must fall back to the name, same as the source");
});

test("buildTxt: just the names, one per line, no header", () => {
  assert.equal(buildTxt(TRACKS), 'Rihanna - So Hard (Clean)\nDJ "Flash" - Go');
});

test("buildJson: matchCount, exportDate, tracks, versionExported, plus whatever extraJson adds", () => {
  const json = buildJson(TRACKS, { prompt: "2000s heaters" }, "1.2.3", "2026-11-09T00:00:00.000Z");
  const parsed = JSON.parse(json);
  assert.equal(parsed.matchCount, 2);
  assert.equal(parsed.exportDate, "2026-11-09T00:00:00.000Z");
  assert.equal(parsed.versionExported, "1.2.3");
  assert.equal(parsed.prompt, "2000s heaters");
  assert.deepEqual(parsed.tracks, TRACKS);
});
