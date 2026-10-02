// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 287-301, 309, 318-319, 556, 564, 569-589, 2631-2665,
// 3410-3429). Crate Cheat's free-text prompt parsing - genre/era/bpm/
// artist/remix-type/content-keyword detection used by buildCrate's gating
// logic and context-merge steps (engine/crateOrchestration.js). None of
// this is shared with Track Cheat's own prompt parsing (different source
// functions entirely), per CLAUDE.md Top Rule 5 - preserved as its own
// module rather than merged into typeLock.js/genre.js to keep that
// distinction visible.

export const GENRE_KEYWORDS_IN_PROMPT = {
  "hip hop": ["hip hop", "hiphop", "rap", "trap", "boom bap"],
  "r&b": ["r&b", "rnb", "rhythm and blues", "soul"],
  "house": ["house", "edm", "electronic", "dance floor", "dancefloor"],
  "eurodance": ["eurodance", "euro dance", "90s dance", "night at the roxbury", "roxbury", "hi-nrg", "hi nrg"],
  "dance": ["dance", "club", "floor filler"],
  "pop": ["pop", "top 40", "radio"],
  "country": ["country", "nashville", "western", "honky"],
  "latin": ["latin", "reggaeton", "salsa", "bachata", "cumbia", "spanish"],
  "reggae": ["reggae", "dancehall", "caribbean"],
  "rock": ["rock", "guitar", "alternative", "indie"],
  "funk": ["funk", "groove", "funky"],
  "disco": ["disco", "boogie", "70s dance"]
};

export const ERA_KEYWORDS = {
  "60s": ["60s", "60's", "1960s", "sixties"],
  "70s": ["70s", "70's", "1970s", "seventies"],
  "80s": ["80s", "80's", "1980s", "eighties"],
  "90s": ["90s", "90's", "1990s", "nineties"],
  "2000s": ["2000s", "2000's", "00s", "00's", "aughts", "early 2000s", "2k", "2k's", "2ks", "two thousands"],
  "2010s": ["2010s", "2010's", "tens", "2k10s", "2k10", "twenty tens"]
};

export const ERA_KEYWORD_YEAR_RANGE = { "60s": [1960, 1969], "70s": [1970, 1979], "80s": [1980, 1989], "90s": [1990, 1999], "2000s": [2000, 2009], "2010s": [2010, 2019] };

export const ARTIST_DETECTION_STOPLIST = ["old school", "new school", "old skool", "new skool", "classic", "classics", "throwback", "throwbacks", "deep cuts", "deep cut", "top 40", "underground", "mainstream", "radio", "club", "dance floor", "dancefloor"];

export function isArtistDetectionStopword(name) {
  return ARTIST_DETECTION_STOPLIST.indexOf((name || "").toLowerCase().trim()) !== -1;
}

export function extractGenreFromPrompt(p) {
  p = p.toLowerCase().replace(/-/g, " ");
  for (var g in GENRE_KEYWORDS_IN_PROMPT) {
    if (GENRE_KEYWORDS_IN_PROMPT[g].some(function (k) { return p.indexOf(k) !== -1; })) return g;
  }
  return "";
}

export function extractEraFromPrompt(p) {
  p = p.toLowerCase();
  for (var e in ERA_KEYWORDS) {
    if (ERA_KEYWORDS[e].some(function (k) { return p.indexOf(k) !== -1; })) return e;
  }
  return "";
}

export function mightReferenceUnrecognizedEra(p) {
  var s = (p || "").toLowerCase();
  if (/\b(19[5-9]\d|20[0-2]\d)\b/.test(s)) return true;
  var hints = ["retro", "throwback", "throwbacks", "vintage", "y2k", "nostalgic", "nostalgia", "new music", "current hits", "right now", "modern", "recent", "millennium", "turn of the century", "back in the day", "classic", "classics", "old school", "old skool"];
  return hints.some(function (w) { return s.indexOf(w) !== -1; });
}

export function extractBpmFromPrompt(p) {
  var explicit = p.match(/\b(\d{2,3})\s*bpm\b/i);
  if (explicit) return parseInt(explicit[1]);
  var bare = p.match(/\b(6[0-9]|7[0-9]|8[0-9]|9[0-9]|1[0-4][0-9]|150)\b/);
  if (bare) return parseInt(bare[0]);
  return 0;
}

// source: detectPromptArtist closes over libraryRef.current - explicit
// `library` parameter here, same convention as every other port. Requires
// 3+ distinct tracks credited to an artist before trusting a substring
// match enough to hard-lock the whole build onto them (source comment,
// v1.0.13241/v1.0.22016 area: "a single mistagged file can no longer wipe
// out a build").
export function detectPromptArtist(promptText, library) {
  var p = (promptText || "").toLowerCase();
  var found = null, foundLen = 0, seen = {}, counts = {};
  library.forEach(function (t) {
    var artist = (t.artist || "").trim();
    if (!artist || artist.length < 3) return;
    var al = artist.toLowerCase();
    counts[al] = (counts[al] || 0) + 1;
  });
  library.forEach(function (t) {
    var artist = (t.artist || "").trim();
    if (!artist || artist.length < 3) return;
    var al = artist.toLowerCase();
    if (seen[al]) return;
    seen[al] = true;
    if (isArtistDetectionStopword(al)) return;
    if (counts[al] < 3) return;
    var escaped = al.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp("\\b" + escaped + "\\b");
    if (re.test(p) && al.length > foundLen) { found = artist; foundLen = al.length; }
  });
  return found;
}

export function hasBroadeningLanguage(promptText) {
  return /similar artist|artists like|in the style of|vibe of|and friends|inspired by|and similar|like [a-z]/i.test(promptText || "");
}

export function detectRemixTypeLock(promptText) {
  var p = (promptText || "").toLowerCase();
  var m = p.match(/\bonly\s+([a-z0-9]+)\s+remix(?:es)?\b/) || p.match(/\b([a-z0-9]+)\s+remix(?:es)?\s+only\b/);
  return m ? m[1] : null;
}

const CONTENT_KEYWORD_STOPWORDS = ["the", "and", "for", "with", "some", "need", "needs", "tracks", "track", "remix", "remixes", "only", "give", "gimme", "any", "want", "wanna", "like", "please", "help", "build", "playlist", "songs", "song", "music", "vibe", "vibes", "turn", "dj", "set", "party", "bangers", "banger", "hits", "hit", "ideas", "idea", "good", "great", "best", "more", "less", "new", "old", "have", "has", "get", "got", "really", "just", "kind", "kinda", "that", "this", "those", "these", "from", "about", "into", "out", "not", "but", "are", "was", "were", "would", "could", "should", "can", "will", "play", "playing", "let", "lets"];

export function extractContentKeywords(promptText) {
  var words = (promptText || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  var stopSet = {}; CONTENT_KEYWORD_STOPWORDS.forEach(function (w) { stopSet[w] = true; });
  var seen = {}; var out = [];
  words.forEach(function (w) {
    if (w.length < 3 || stopSet[w] || seen[w]) return;
    seen[w] = true; out.push(w);
  });
  return out;
}
