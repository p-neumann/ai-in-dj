// REAL Anthropic provider. Costs money and requires a real API key.
// Never used unless a caller explicitly asks for it (see app.js's provider
// selection) - the default everywhere in this codebase is the mock
// provider (mockProvider.js). CLAUDE.md: never require a real key for
// tests that don't need one; ask before running paid tests.
//
// VERIFY BEFORE RELYING ON THIS LONG-TERM: endpoint path and
// `anthropic-version` header against Anthropic's current official API docs
// (CLAUDE.md Top Rule 9).

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01"; // verify against current docs

export function createAnthropicProvider(apiKey) {
  if (!apiKey) {
    throw new Error("createAnthropicProvider requires a real ANTHROPIC_API_KEY");
  }
  return {
    kind: "anthropic",
    async call(requestBody) {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION
        },
        body: JSON.stringify(requestBody)
      });
      const data = await res.json();
      if (!data.content || !Array.isArray(data.content)) {
        throw new Error((data.error && data.error.message) || "Anthropic API error");
      }
      return data;
    }
  };
}
