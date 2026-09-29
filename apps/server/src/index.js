// Entry point for running the server for real (not for tests - tests use
// app.js's buildApp() directly via Fastify's .inject(), no port needed).
//
// Provider selection is deliberately conservative: the mock provider is
// used unless BOTH ANTHROPIC_API_KEY is set AND LIVE_AI_CALLS=true is set.
// Setting LIVE_AI_CALLS=true is a manual, explicit action - never done by
// any code in this repo - and should only happen after you've decided to
// authorize a real (paid) API call.

import { buildApp } from "./app.js";
import { createMockProvider } from "./providers/mockProvider.js";
import { createAnthropicProvider } from "./providers/anthropicProvider.js";

const PORT = Number(process.env.PORT || 8080);
const devTokens = (process.env.DEV_TOKENS || "").split(",").map((t) => t.trim()).filter(Boolean);

if (devTokens.length === 0) {
  console.error(
    "DEV_TOKENS is not set. Copy .env.example to .env and set at least one " +
      "development token (any random string you choose) before starting the server."
  );
  process.exit(1);
}

let provider;
if (process.env.LIVE_AI_CALLS === "true" && process.env.ANTHROPIC_API_KEY) {
  console.warn("LIVE_AI_CALLS=true - this server will make REAL, PAID Anthropic API calls.");
  provider = createAnthropicProvider(process.env.ANTHROPIC_API_KEY);
} else {
  console.log("Using the SIMULATED provider - no network calls, no API key needed.");
  provider = createMockProvider();
}

const app = buildApp({ devTokens, provider });

app.listen({ port: PORT, host: "localhost" }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`CCDJ server listening on ${address} (provider: ${provider.kind})`);
});
