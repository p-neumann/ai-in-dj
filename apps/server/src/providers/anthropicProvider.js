// REAL Anthropic provider. Costs money and requires a real API key.
// Never used unless a caller explicitly asks for it (see app.js's provider
// selection) - the default everywhere in this codebase is the mock
// provider (mockProvider.js). CLAUDE.md: never require a real key for
// tests that don't need one; ask before running paid tests.
//
// VERIFY BEFORE RELYING ON THIS LONG-TERM: endpoint path and
// `anthropic-version` header against Anthropic's current official API docs
// (CLAUDE.md Top Rule 9).

import { ProviderError } from "./providerErrors.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01"; // verify against current docs

export function createAnthropicProvider(apiKey) {
  if (!apiKey) {
    throw new Error("createAnthropicProvider requires a real ANTHROPIC_API_KEY");
  }
  return {
    kind: "anthropic",
    async call(requestBody) {
      let res;
      try {
        res = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION
          },
          body: JSON.stringify(requestBody)
        });
      } catch (networkErr) {
        throw new ProviderError("Network error calling Anthropic: " + networkErr.message, "PROVIDER_ERROR");
      }
      // CLAUDE.md Section 6.3's error codes distinguish RATE_LIMITED (429)
      // and PROVIDER_OVERLOADED (529, Anthropic's own overload status)
      // from a generic PROVIDER_ERROR - a client needs to know "wait and
      // retry" from "something else broke". retry-after, when Anthropic
      // sends it, is passed through so a caller can honor it.
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        throw new ProviderError("Rate limited by Anthropic", "RATE_LIMITED", {
          status: 429, retryAfterMs: retryAfter ? Number(retryAfter) * 1000 : null
        });
      }
      if (res.status === 529) {
        throw new ProviderError("Anthropic is overloaded", "PROVIDER_OVERLOADED", { status: 529 });
      }
      if (!res.ok) {
        throw new ProviderError("Anthropic API error (HTTP " + res.status + ")", "PROVIDER_ERROR", { status: res.status });
      }
      const data = await res.json();
      if (!data.content || !Array.isArray(data.content)) {
        throw new ProviderError((data.error && data.error.message) || "Anthropic API error", "PROVIDER_ERROR");
      }
      return data;
    }
  };
}
