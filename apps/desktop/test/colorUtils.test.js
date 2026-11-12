// Phase 5, step 5 piece 11 (shared header/visual port).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { hex2rgb, darkenHex, makeAlpha } = require("../src/renderer/src/theme/colorUtils.ts");

test("hex2rgb: splits a hex color into its three channels", () => {
  assert.deepEqual(hex2rgb("#71e401"), [113, 228, 1]);
});

test("darkenHex: scales each channel down by the given fraction", () => {
  // floor(113*0.65)=73(0x49), floor(228*0.65)=148(0x94), floor(1*0.65)=0(0x00)
  assert.equal(darkenHex("#71e401", 0.35), "#499400");
});

test("makeAlpha: returns an rgba() string generator for the given hex", () => {
  const accentAlpha = makeAlpha("#71e401");
  assert.equal(accentAlpha(0.5), "rgba(113,228,1,0.5)");
});
