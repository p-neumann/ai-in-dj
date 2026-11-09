// Phase 5, step 5 piece 7 (Settings).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { DEFAULT_THEME, parseThemePrefs, serializeThemePrefs, SWATCHES_ACCENT, SWATCHES_BG } = require("../src/renderer/src/settings/theme.ts");

test("theme: the swatch lists match the reference source exactly", () => {
  assert.deepEqual(SWATCHES_ACCENT, ["#71e401", "#a78bfa", "#f472b6", "#e03c3c", "#38bdf8", "#f5a623", "#facc15", "#ffffff"]);
  assert.deepEqual(SWATCHES_BG, ["#0a0a0a", "#000814", "#0a1a0a", "#1a0a00", "#1a0020", "#1a0000", "#1a1a1a", "#2a2010"]);
});

test("parseThemePrefs: null (nothing saved yet) returns the default theme", () => {
  assert.deepEqual(parseThemePrefs(null), DEFAULT_THEME);
});

test("parseThemePrefs: round-trips through serializeThemePrefs", () => {
  const theme = { accentColor: "#f472b6", bgColor: "#1a0020", lightMode: true };
  assert.deepEqual(parseThemePrefs(serializeThemePrefs(theme)), theme);
});

test("parseThemePrefs: malformed JSON falls back to the default rather than throwing", () => {
  assert.deepEqual(parseThemePrefs("not json"), DEFAULT_THEME);
});

test("parseThemePrefs: a partial object fills in defaults for missing fields", () => {
  assert.deepEqual(parseThemePrefs(JSON.stringify({ accentColor: "#f472b6" })), {
    accentColor: "#f472b6",
    bgColor: DEFAULT_THEME.bgColor,
    lightMode: DEFAULT_THEME.lightMode
  });
});
