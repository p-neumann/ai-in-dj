// Phase 5, step 5 piece 11 (shared header/visual port). Ported verbatim
// from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx (source lines
// 439-441) - his exact color math, not a reimplementation.

export function hex2rgb(h: string): [number, number, number] {
  const c = h.replace("#", "");
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

export function darkenHex(hex: string, amount: number): string {
  const c = hex2rgb(hex);
  return (
    "#" +
    c
      .map((v) => Math.max(0, Math.floor(v * (1 - amount))).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function makeAlpha(accent: string): (a: number) => string {
  const rgb = hex2rgb(accent);
  return (a: number) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}
