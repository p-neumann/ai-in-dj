// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 471-498). Logic unchanged. See genre.js header for the
// preserve-behavior rationale.

export function getDisplayName(t) {
  if (t.location) {
    var p = t.location.replace(/\\/g, "/").split("/");
    return p[p.length - 1].replace(/\.[^.]+$/, "");
  }
  return t.artist ? t.artist + " - " + t.title : t.title || "Unknown";
}

export function getArtistTitle(name) {
  var idx = name.indexOf(" - ");
  if (idx !== -1) return { artist: name.slice(0, idx).trim(), title: name.slice(idx + 3).trim() };
  return { artist: "", title: name };
}

export function extractCore(name) {
  var at = getArtistTitle(name);
  var artist = at.artist.toLowerCase().trim();
  var title = at.title || name;
  var t = title.toLowerCase().replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "");
  ["remix","version","bootleg","intro","outro","dirty","clean","edit","club","extended",
   "radio","slam","hype","vip","acapella","instrumental","redrum","mashup","blend",
   "rework","flip","funk","official","unofficial","moombahton","xtenda","redrums",
   "lounge","deville","kees","sjansen","crooklyn","taito","wooderson","frey","ligotti",
   "moji","muzik","junkies","holla","tik","tok","dance","break","big","room","deep",
   "house","beat","breaker","supreme","soundsystem","cmp","twerk","five","scratch",
   "stutter","chop","riddim","magenta","jack","millz","arman","aveiru","mayhem",
   "genzo","supreme","ultimate"].forEach(function (k) { t = t.split(k).join(" "); });
  var titleWords = t.replace(/-/g, " ").replace(/\s+/g, " ").trim()
    .split(" ").filter(function (w) { return w.length > 1 && !/^\d+$/.test(w); }).slice(0, 4);
  var artistWords = artist.replace(/ vs\.? .*/, "").split(" ")
    .filter(function (w) { return w.length > 1; }).slice(0, 1);
  return artistWords.concat(titleWords).join(" ");
}

export function getRawTitleFromName(name) {
  var s = name.replace(/\s*-\s*(dirty|clean|explicit|radio|instrumental)\s*$/i, "").trim();
  s = s.replace(/^[\(\[][^\)\]]*[\)\]]\s*/, "").trim();
  var beforeBracket = s.split(/[\(\[]/)[0].trim();
  var parts = beforeBracket.split(" - ");
  return parts[parts.length - 1].trim().toLowerCase();
}

export function isSameSong(seed, track) {
  var sc = extractCore(seed), tc = extractCore(track);
  if (!sc || !tc) return false;
  var sw = sc.split(" ").filter(function (w) { return w.length > 2; });
  return sw.filter(function (w) { return tc.indexOf(w) !== -1; }).length >= Math.max(1, Math.min(2, sw.length));
}
