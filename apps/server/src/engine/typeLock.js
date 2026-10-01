// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 739-744, 1929, 2163-2167, 2184-2287, 2672-2709). Mike's
// dated comments preserved unchanged - this is the "only funk and
// moombahton remixes" hard type-lock feature (CLAUDE.md R3, Appendix B).

import { getDisplayName, isSameSong } from "./trackNames.js";
import { getAdjacentGenresAtTier } from "./genre.js";
import { getGenreTier } from "./vibe.js";
import { shuffleArr } from "./shuffleArr.js";

const CONTENT_KEYWORD_STOPWORDS = ["the","and","for","with","some","need","needs","tracks","track","remix","remixes","only","give","gimme","any","want","wanna","like","please","help","build","playlist","songs","song","music","vibe","vibes","turn","dj","set","party","bangers","banger","hits","hit","ideas","idea","good","great","best","more","less","new","old","have","has","get","got","really","just","kind","kinda","that","this","those","these","from","about","into","out","not","but","are","was","were","would","could","should","can","will","play","playing","let","lets"];

export function getEditDescriptor(name) {
  var s = (name || "").replace(/\s*-\s*(dirty|clean|explicit|radio|instrumental)\s*$/i, "").trim();
  s = s.replace(/^[\(\[][^\)\]]*[\)\]]\s*/, "").trim();
  var parts = s.match(/[\(\[]([^\)\]]*)[\)\]]/g);
  return parts ? parts.join(" ").toLowerCase() : "";
}

export function typeTokenMatches(editDescriptor, k) {
  if (editDescriptor.indexOf(k) !== -1) return true;
  var alt = k.endsWith("s") ? k.slice(0, -1) : k + "s";
  return editDescriptor.indexOf(alt) !== -1;
}

export function detectStyleTypeLock(styleText) {
  var p = (styleText || "").toLowerCase();
  var stopSet = {}; CONTENT_KEYWORD_STOPWORDS.forEach(function (w) { stopSet[w] = true; });
  var genericTypeWords = { "version": 1, "versions": 1, "remix": 1, "remixes": 1, "edit": 1, "edits": 1 };
  var tokenize = function (rawTokens) {
    var tokens = [];
    rawTokens.forEach(function (t) {
      t = t.trim();
      if (!t || genericTypeWords[t]) return;
      t = t.replace(/\s+(versions?|remixes?|edits?)$/, "").trim();
      if (!t || genericTypeWords[t]) return;
      if (t.indexOf(" ") === -1) { if (t.length >= 2 && t.length < 25) tokens.push(t); return; }
      t.split(/\s+/).forEach(function (w) { if (w.length >= 2 && w.length < 25 && !stopSet[w]) tokens.push(w); });
    });
    return tokens;
  };
  var m = p.match(/\bonly\s+(?:show|play|use|include|want|display|give me|need|prefer|keep|pick)\s+(.+?)(?:\s+versions?\b|\s+of\s+tracks?\b|\s+of\s+songs?\b|[.!]|$)/i);
  if (m) {
    var rawTokens = m[1].split(/\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+/i).map(function (t) { return t.trim(); }).filter(Boolean);
    var tokens = tokenize(rawTokens);
    if (tokens.length) return tokens;
  }
  var m2 = p.match(/^(.+?)\s+only\b/i);
  if (m2 && m2[1].split(/\s+/).length <= 6) {
    var rawTokens2 = m2[1].split(/\s*\/\s*|\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+/i).map(function (t) { return t.trim(); }).filter(Boolean);
    var tokens2 = tokenize(rawTokens2);
    if (tokens2.length) return tokens2;
  }
  return null;
}

export function detectGenreIslandLock(typeLock, seedGenreArg, vibe) {
  if (!typeLock || !typeLock.length) return false;
  var tier = getGenreTier(vibe);
  var adjacent = getAdjacentGenresAtTier(seedGenreArg, tier).map(function (g) { return g.toLowerCase(); });
  return typeLock.some(function (k) { return adjacent.indexOf(k) === -1; });
}

export function applyTypeLock(resolved, typeLock) {
  if (!typeLock || !typeLock.length) return resolved;
  return resolved.filter(function (t) {
    var ed = getEditDescriptor(t.name || "");
    if (!ed) return false;
    return typeLock.some(function (k) { return typeTokenMatches(ed, k); });
  });
}

export function mergeTypeLockIntoCtx(ctxIn, typeLock, lib) {
  if (!typeLock || !typeLock.length) return ctxIn;
  var already = {};
  ctxIn.indexed.forEach(function (e) { already[getDisplayName(e.track)] = true; });
  var missing = lib.filter(function (t) {
    var dn = getDisplayName(t);
    if (already[dn]) return false;
    var ed = getEditDescriptor(dn);
    if (!ed) return false;
    return typeLock.some(function (k) { return typeTokenMatches(ed, k); });
  });
  if (!missing.length) return ctxIn;
  var merged = shuffleArr(missing).concat(ctxIn.indexed.map(function (e) { return e.track; }));
  return {
    indexed: merged.map(function (t, i) { return { id: i, track: t }; }),
    context: merged.map(function (t, i) { return [i, getDisplayName(t), t.bpm || "", t.key || "", t["play count"] || t.playcount || "0", t.year || "", t.genre || ""].join("|"); }).join("\n")
  };
}

export function injectTypeLockBalance(resolved, typeLock, lib, allEx, fname, cap) {
  if (!typeLock || typeLock.length < 2) return resolved;
  var CAP = cap || 10;
  var getTypesFor = function (t) {
    var ed = getEditDescriptor(t.name || "");
    if (!ed) return [];
    return typeLock.filter(function (k) { return typeTokenMatches(ed, k); });
  };
  var counts = {}; typeLock.forEach(function (k) { counts[k] = 0; });
  resolved.forEach(function (t) { getTypesFor(t).forEach(function (k) { counts[k]++; }); });
  var usedNames = {}; resolved.forEach(function (t) { usedNames[t.name] = true; });
  var targetPerType = Math.max(2, Math.floor(CAP / typeLock.length));
  var additions = [];
  typeLock.forEach(function (k) {
    var have = counts[k];
    if (have >= targetPerType) return;
    var needed = targetPerType - have;
    var candidates = lib.filter(function (t) {
      var dn = getDisplayName(t);
      if (usedNames[dn]) return false;
      if (allEx.indexOf(dn) !== -1) return false;
      if (isSameSong(fname, dn)) return false;
      var ed = getEditDescriptor(dn);
      return ed && typeTokenMatches(ed, k);
    });
    var picked = shuffleArr(candidates).slice(0, needed);
    picked.forEach(function (t) {
      var dn = getDisplayName(t);
      usedNames[dn] = true;
      additions.push({ id: -1, name: dn, bpm: t.bpm || "", key: t.key || "", _libTrack: t, _injected: true });
    });
  });
  if (!additions.length) return resolved.length > CAP ? resolved.slice(0, CAP) : resolved;
  var kept = resolved.slice();
  var roomNeeded = Math.max(0, (kept.length + additions.length) - CAP);
  for (var i = 0; i < roomNeeded; i++) {
    var bestType = null, bestCount = -1;
    typeLock.forEach(function (k) {
      var c = kept.filter(function (t) { return getTypesFor(t).indexOf(k) !== -1; }).length;
      if (c > bestCount) { bestCount = c; bestType = k; }
    });
    var idx = -1;
    for (var j = kept.length - 1; j >= 0; j--) {
      if (getTypesFor(kept[j]).indexOf(bestType) !== -1) { idx = j; break; }
    }
    if (idx !== -1) kept.splice(idx, 1); else kept.pop();
  }
  return kept.concat(additions).slice(0, CAP);
}
