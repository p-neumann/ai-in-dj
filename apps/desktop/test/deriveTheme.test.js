// Phase 5, step 5 piece 11 (shared header/visual port).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { deriveTheme } = require("../src/renderer/src/theme/deriveTheme.ts");

test("deriveTheme: dark mode uses the saved bgColor and the accent as-is for ruleColor", () => {
  const d = deriveTheme({ accentColor: "#71e401", bgColor: "#0a0a0a", lightMode: false });
  assert.equal(d.accent, "#71e401");
  assert.equal(d.bg, "#0a0a0a");
  assert.equal(d.ruleColor, "#71e401");
  assert.equal(d.rowOdd, "rgba(113,228,1,0.04)");
  assert.equal(d.textGray, "#bbb");
});

test("deriveTheme: light mode forces bg to #f0f0f0 and darkens the accent for ruleColor, ignoring the saved bgColor", () => {
  const d = deriveTheme({ accentColor: "#71e401", bgColor: "#1a0000", lightMode: true });
  assert.equal(d.bg, "#f0f0f0", "light mode's background is a fixed value, not the saved dark-mode bgColor");
  assert.equal(d.ruleColor, "#499400", "light mode darkens the accent by 0.35, same as the source");
  assert.equal(d.rowEven, "#2a2a2a");
  assert.equal(d.textGray, "#555");
});

test("deriveTheme: accentAlpha and ia are independent alpha generators (accent vs. ruleColor)", () => {
  const dark = deriveTheme({ accentColor: "#71e401", bgColor: "#0a0a0a", lightMode: false });
  assert.equal(dark.accentAlpha(0.3), dark.ia(0.3), "in dark mode ruleColor equals accent, so both generators agree");

  const light = deriveTheme({ accentColor: "#71e401", bgColor: "#0a0a0a", lightMode: true });
  assert.notEqual(light.accentAlpha(0.3), light.ia(0.3), "in light mode ruleColor is a darkened accent, so they diverge");
});
