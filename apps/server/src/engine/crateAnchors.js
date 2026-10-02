// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 311, 333-383, 400-407, 405, 468). Mike's "secret sauce"
// heater/old-school/tropical anchor data, built live with him correcting
// guesses - CLAUDE.md Top Rule 5 treats this as musical behavior, not
// something to re-derive or "clean up" while porting.

import { getArtistTitle } from "./trackNames.js";

export const HIGH_ENERGY_WORDS = ["energy", "hype", "peak", "intense", "banger", "bangers", "hard", "slam", "party", "pump", "lit", "heater", "heaters", "floor filler", "floor fillers", "fire", "smash", "slapper", "slappers", "turnt", "turn up", "crowd pleaser", "floor mover", "body mover", "rager", "anthem", "wrecker", "popper", "go off", "goes off", "hit", "hits", "mover", "movers", "shaker", "shakers"];

export function isHighEnergyPrompt(p) {
  return HIGH_ENERGY_WORDS.some(function (k) { return p.toLowerCase().indexOf(k) !== -1; });
}

export const ARTIST_HEATER_TIER = {
  "pitbull": "guaranteed", "t-pain": "guaranteed", "50 cent": "guaranteed", "jay-z": "guaranteed",
  "ludacris": "guaranteed", "flo rida": "guaranteed", "lil jon": "guaranteed", "sean paul": "guaranteed",
  "nelly": "guaranteed", "ying yang twins": "guaranteed", "three 6 mafia": "guaranteed", "3 6 mafia": "guaranteed",
  "ciara": "guaranteed", "missy elliott": "guaranteed", "dmx": "guaranteed", "akon": "guaranteed",
  "cardi b": "guaranteed", "megan thee stallion": "guaranteed", "travis scott": "guaranteed", "dababy": "guaranteed",
  "migos": "guaranteed", "dj khaled": "guaranteed", "lizzo": "guaranteed", "doja cat": "guaranteed",
  "beyonce": "guaranteed", "juvenile": "guaranteed", "pop smoke": "guaranteed",
  "lil jon and the ying yang twins": "guaranteed",
  "drake": "situational", "kendrick lamar": "situational", "usher": "situational", "chris brown": "situational",
  "rihanna": "situational", "bruno mars": "situational", "outkast": "situational", "busta rhymes": "situational",
  "john mayer": "mellow", "bon iver": "mellow", "james blake": "mellow", "jack johnson": "mellow",
  "norah jones": "mellow", "kevin gates": "mellow"
};

export const HEATER_TRACK_OVERRIDES = [
  { test: ["marvin's room", "marvins room"], tier: "mellow" },
  { test: ["take care"], tier: "situational" },
  { test: ["jungle"], tier: "mellow" },
  { test: ["hotline bling"], tier: "situational" },
  { test: ["hyfr", "hell ya fucking right"], tier: "guaranteed" },
  { test: ["know yourself"], tier: "guaranteed" },
  { test: ["toosie slide"], tier: "guaranteed" },
  { test: ["it takes two"], tier: "guaranteed" },
  { test: ["push it"], tier: "guaranteed" },
  { test: ["doowutchyalike", "do what you like"], tier: "mellow" },
  { test: ["peter piper"], tier: "situational" },
  { test: ["jam on it"], tier: "situational" },
  { test: ["atomic dog"], tier: "situational" },
  { test: ["my prerogative"], tier: "situational" }
];

export function getHeaterTier(trackName) {
  var lower = (trackName || "").toLowerCase();
  for (var i = 0; i < HEATER_TRACK_OVERRIDES.length; i++) {
    var ov = HEATER_TRACK_OVERRIDES[i];
    if (ov.test.some(function (t) { return lower.indexOf(t) !== -1; })) return ov.tier;
  }
  var at = getArtistTitle(trackName);
  var artist = (at.artist || "").toLowerCase().trim();
  if (!artist) return "";
  if (ARTIST_HEATER_TIER[artist]) return ARTIST_HEATER_TIER[artist];
  for (var key in ARTIST_HEATER_TIER) {
    if (artist.indexOf(key) !== -1 || key.indexOf(artist) !== -1) return ARTIST_HEATER_TIER[key];
  }
  return "";
}

export const OLD_SCHOOL_TRUE = ["grandmaster flash", "sugarhill gang", "kurtis blow", "afrika bambaataa", "run-dmc", "run dmc", "whodini", "fat boys", "newcleus", "doug e. fresh", "doug e fresh", "utfo", "melle mel", "treacherous three", "spoonie gee", "kool moe dee", "warp 9", "man parrish", "the sequence", "cold crush brothers", "jimmy spicer", "trouble funk", "salt-n-pepa", "salt n pepa", "beastie boys", "public enemy"];
export const OLD_SCHOOL_NEWER = ["notorious b.i.g.", "notorious big", "biggie", "tupac", "2pac", "jay-z", "jay z", "nas", "snoop dogg", "dr. dre", "dr dre", "wu-tang clan", "wu tang clan", "a tribe called quest", "tribe called quest", "outkast", "ice cube", "n.w.a", "nwa", "bone thugs-n-harmony", "bone thugs n harmony", "method man"];
export const TROPICAL_ANCHOR_ARTISTS = ["omi", "major lazer", "dj snake", "magic!", "pitbull", "j balvin", "camila cabello", "bob marley", "shakira", "ub40", "don omar", "lucenzo", "vance joy"];

export function isOldSchoolPrompt(p) {
  return /\bold\s*-?\s*school\b|\bold\s*-?\s*skool\b/i.test(p || "");
}

export function getOldSchoolTier(trackName) {
  var at = getArtistTitle(trackName);
  var artist = (at.artist || "").toLowerCase().trim();
  if (!artist) return "";
  if (OLD_SCHOOL_TRUE.some(function (a) { return artist.indexOf(a) !== -1; })) return "true";
  if (OLD_SCHOOL_NEWER.some(function (a) { return artist.indexOf(a) !== -1; })) return "newer";
  return "";
}
