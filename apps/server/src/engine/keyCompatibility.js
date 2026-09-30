// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 66, 442-443, 454-466).

export const CAMELOT_COLORS = {"1A":"#e74c3c","1B":"#c0392b","2A":"#e67e22","2B":"#d35400","3A":"#f39c12","3B":"#e67e22","4A":"#f1c40f","4B":"#f39c12","5A":"#d4e157","5B":"#cddc39","6A":"#a3e635","6B":"#8bc34a","7A":"#2ecc71","7B":"#27ae60","8A":"#1abc9c","8B":"#16a085","9A":"#00bcd4","9B":"#0097a7","10A":"#3498db","10B":"#2980b9","11A":"#9b59b6","11B":"#8e44ad","12A":"#e91e8c","12B":"#c2185b"};

export const CAMELOT = {"1A":["1A","2A","12A","1B"],"2A":["2A","3A","1A","2B"],"3A":["3A","4A","2A","3B"],"4A":["4A","5A","3A","4B"],"5A":["5A","6A","4A","5B"],"6A":["6A","7A","5A","6B"],"7A":["7A","8A","6A","7B"],"8A":["8A","9A","7A","8B"],"9A":["9A","10A","8A","9B"],"10A":["10A","11A","9A","10B"],"11A":["11A","12A","10A","11B"],"12A":["12A","1A","11A","12B"],"1B":["1B","2B","12B","1A"],"2B":["2B","3B","1B","2A"],"3B":["3B","4B","2B","3A"],"4B":["4B","5B","3B","4A"],"5B":["5B","6B","4B","5A"],"6B":["6B","7B","5B","6A"],"7B":["7B","8B","6B","7A"],"8B":["8B","9B","7B","8A"],"9B":["9B","10B","8B","9A"],"10B":["10B","11B","9B","10A"],"11B":["11B","12B","10B","11A"],"12B":["12B","1B","11B","12A"]};

export function normalizeKey(key) {
  if (!key) return "";
  var k = key.toString().toUpperCase().trim().replace(/\s+/g, "");
  if (CAMELOT_COLORS[k]) return k;
  var noM = k.replace(/M$/, "A");
  if (CAMELOT_COLORS[noM]) return noM;
  var noD = k.replace(/D$/, "B");
  if (CAMELOT_COLORS[noD]) return noD;
  var stripped = k.replace(/[^0-9AB]/g, "");
  if (CAMELOT_COLORS[stripped]) return stripped;
  return k;
}

export function compatibleKeys(key) {
  return key ? (CAMELOT[normalizeKey(key)] || []) : [];
}

export function sortByKeyCompatibility(resolved, seedKeyRaw) {
  if (!seedKeyRaw || !resolved || !resolved.length) return resolved;
  var compat = compatibleKeys(seedKeyRaw);
  if (!compat.length) return resolved;
  var compatSet = {}; compat.forEach(function (k) { compatSet[k] = true; });
  var withKeyMatch = [], rest = [];
  resolved.forEach(function (t) {
    var tk = normalizeKey(t.key || (t._libTrack && t._libTrack.key) || "");
    if (tk && compatSet[tk]) withKeyMatch.push(t);
    else rest.push(t);
  });
  return withKeyMatch.concat(rest);
}
