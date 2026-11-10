// Phase 5, step 5 piece 8 - Export, Playlist Cheat side.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { buildPlaylistExportData } = require("../src/renderer/src/playlistCheat/buildPlaylistExportData.ts");

function match(id, displayName, artist, bpm, key) {
  return { id, displayName, artist, title: displayName, bpm, key, genre: "house", year: 2020, playcount: 1 };
}

test("a selected match appears in tracks with no location; an unselected one does not", () => {
  const results = [
    { sourceArtist: "Daft Punk", sourceName: "One More Time", matches: [match(1, "Daft Punk - One More Time", "Daft Punk", 123, "8A")] }
  ];
  const data = buildPlaylistExportData(results, { 0: 0 });
  assert.deepEqual(data.tracks, [{ name: "Daft Punk - One More Time", artist: "Daft Punk", bpm: 123, key: "8A" }]);
  assert.equal(data.tracks[0].location, undefined, "the source never includes a location for this screen's export");
});

test("no selection for a song means it contributes nothing to tracks", () => {
  const results = [{ sourceArtist: "A", sourceName: "B", matches: [match(1, "A - B", "A", 120, "5A")] }];
  const data = buildPlaylistExportData(results, {});
  assert.deepEqual(data.tracks, []);
});

test("allTracksForJson includes the source line plus every candidate, selected or not, flagged", () => {
  const results = [
    {
      sourceArtist: "Daft Punk",
      sourceName: "One More Time",
      matches: [match(1, "Daft Punk - One More Time (Radio)", "Daft Punk", 123, "8A"), match(2, "Daft Punk - One More Time (Extended)", "Daft Punk", 123, "8A")]
    }
  ];
  const data = buildPlaylistExportData(results, { 0: 0 });
  assert.equal(data.allTracksForJson.length, 3, "one source line + two candidates, even though only one is selected");
  assert.equal(data.allTracksForJson[0].isSource, true);
  assert.equal(data.allTracksForJson[1].isMatch, true);
  assert.equal(data.allTracksForJson[2].isMatch, true);
});

test("a song with no matches at all gets a noMatch placeholder line, worded per whether a title was even found", () => {
  const results = [
    { sourceArtist: "", sourceName: "not a real line", matches: [] },
    { sourceArtist: "Real Artist", sourceName: "Real Title", matches: [] }
  ];
  const data = buildPlaylistExportData(results, {});
  assert.equal(data.allTracksForJson[1].noMatch, true);
  assert.ok(data.allTracksForJson[1].name.includes("Title Found"), "blank sourceArtist means no title was identified at all");
  assert.ok(data.allTracksForJson[3].name.includes("Match In Your Library"), "a real title that matched nothing is a different message");
});

test("extraJson identifies the source screen, matching the source's own shape", () => {
  const data = buildPlaylistExportData([{ sourceArtist: "A", sourceName: "B", matches: [] }], {});
  assert.deepEqual(data.extraJson, { source: "Playlist Cheat", tracksIncludeSourceAndAllCandidates: true });
});
