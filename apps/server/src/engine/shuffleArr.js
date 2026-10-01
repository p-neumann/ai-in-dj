// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source line 1929). Shared by typeLock.js and crateMatching.js - both
// use the exact same shuffle in the source.
export function shuffleArr(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}
