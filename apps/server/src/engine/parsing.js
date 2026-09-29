// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 496-497). Logic unchanged.
//
// NOTE: parseCSV here is the prototype's OWN simple parser, not the
// RFC-4180-compliant replacement CLAUDE.md calls for (R24, a "defect
// against a stated requirement"). Reusing it as-is for this vertical slice
// keeps behavior identical to the prototype for now; the real parser
// replacement is separate, tracked work (Section 6.1), not done here.

export function parseJSON(text) {
  var c = text.split("```json").join("").split("```").join("").trim();
  var s = c.indexOf("["), e = c.lastIndexOf("]");
  if (s === -1 || e === -1) throw new Error("No JSON");
  return JSON.parse(c.slice(s, e + 1));
}

export function parseCSV(text) {
  var lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  var headers = lines[0].split(",").map(function (h) { return h.trim().replace(/^"|"$/g, "").toLowerCase(); });
  var tracks = [];
  for (var i = 1; i < lines.length; i++) {
    var vals = [], cur = "", inQ = false;
    for (var j = 0; j < lines[i].length; j++) {
      var ch = lines[i][j];
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    vals.push(cur.trim());
    var obj = {};
    headers.forEach(function (h, idx) { obj[h] = (vals[idx] || "").replace(/^"|"$/g, ""); });
    if (obj.title || obj.location || obj.filename) tracks.push(obj);
  }
  return tracks;
}
