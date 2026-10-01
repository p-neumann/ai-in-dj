// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 2347-2361, computeDragLean). CLAUDE.md R6/Section 4.4.
//
// The source reads two refs directly (dragLeanRef.current, the raw
// {genre,atFetch} entries, and trackCheatFetchCountRef.current, the
// current fetch number) via closure. Here both are explicit parameters -
// session/sessionStore.js holds the raw {trackId,atFetch} entries (it has
// no library access to resolve genre at drag-event time - see
// sessionEvents.js), and routes/trackCheat.js resolves trackId -> genre
// against the request's own library right before calling this, filtering
// out anything with no genre tag, exactly like the source's own
// `if(!entry.genre)return;` / `if(dragGenre)` guards.

export function computeDragLean(entries, fetchNum) {
  var weights = {};
  entries.forEach(function (entry) {
    if (!entry.genre) return;
    var age = fetchNum - entry.atFetch;
    var w = Math.pow(0.75, age);
    weights[entry.genre] = (weights[entry.genre] || 0) + w;
  });
  var ranked = Object.keys(weights).map(function (g) { return { genre: g, weight: weights[g] }; }).filter(function (x) { return x.weight >= 0.2; }).sort(function (a, b) { return b.weight - a.weight; });
  var top = ranked.slice(0, 2);
  var hint = top.length ? top.map(function (x) { return x.genre; }).join(", ") : "";
  var debug = ranked.length ? ("dragLean (fetch #" + fetchNum + "): " + ranked.map(function (x) { return x.genre + "=" + x.weight.toFixed(2); }).join(", ")) : ("dragLean (fetch #" + fetchNum + "): none yet");
  return { hint: hint, debug: debug, ranked: ranked, fetchNum: fetchNum };
}
