// Simulated Anthropic responses for Phase 2/3 testing (CLAUDE.md: "Test the
// harness and backend with clearly labeled simulated AI responses", "Do not
// require a real API key for tests that can run without one").
//
// This module never makes a network call. It reads the REAL request body the
// prototype built (unmodified prompts/logic), pulls real candidate track IDs
// out of the candidate pool the prototype already embedded in the prompt,
// and fabricates a response in the exact shape buildSys asks for
// (`[{id,name,bpm,key}]`, confirmed at source line ~2421, optionally with a
// `camp`/`lane` field for hybrid modes). This lets the rest of the pipeline
// (resolveRes, filters, rendering) be exercised for real, with only the
// model call itself faked.

function extractCandidateLines(userContent) {
  // Prototype's own format (buildSmartCtx, source line ~832):
  // "Library:\n<id>|<name>|<bpm>|<key>|<playcount>|<year>|<genre>\n..."
  const lines = userContent.split("\n");
  const candidates = [];
  for (const line of lines) {
    const m = line.match(/^(\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|/);
    if (m) {
      candidates.push({ id: Number(m[1]), name: m[2], bpm: m[3], key: m[4] });
    }
  }
  return candidates;
}

function detectExtraField(systemText) {
  // jsonShape variants observed in buildSys (source lines 2421-2450):
  //   "[{id,name,bpm,key}]"
  //   "[{id,name,bpm,key,camp}] where camp is either \"new\" or \"bridge\""
  //   "[{id,name,bpm,key,lane}] where lane is \"pure\" ... \"crossover\" ..."
  //   "[{id,name,bpm,key,camp}] where camp is either \"chain\" or \"vibe\""
  if (/lane}\]/.test(systemText)) {
    return { field: "lane", values: ["pure", "crossover", "native"] };
  }
  const campMatch = systemText.match(/camp}\] where camp is either "(\w+)" or "(\w+)"/);
  if (campMatch) {
    return { field: "camp", values: [campMatch[1], campMatch[2]] };
  }
  return null;
}

function buildSimulatedResponse(requestBodyText) {
  const body = JSON.parse(requestBodyText);
  const userMessage = (body.messages && body.messages[0] && body.messages[0].content) || "";
  const candidates = extractCandidateLines(userMessage);
  const extra = detectExtraField(body.system || "");

  // Mirrors the prototype's own "up to 20 requested, system caps at 12" split
  // (CLAUDE.md R5) - not resolving that conflict here, just picking a
  // reasonable count that lets resolveRes's own 10-item cap do its job.
  const count = Math.min(12, candidates.length);
  const chosen = candidates.slice(0, count).map((c, i) => {
    const item = { id: c.id, name: c.name, bpm: c.bpm, key: c.key };
    if (extra) item[extra.field] = extra.values[i % extra.values.length];
    return item;
  });

  return {
    id: "msg_simulated_" + Date.now(),
    type: "message",
    role: "assistant",
    model: body.model || "claude-sonnet-5",
    content: [{ type: "text", text: JSON.stringify(chosen) }],
    stop_reason: "end_turn",
    usage: { input_tokens: 0, output_tokens: 0 }
  };
}

function installMockProvider() {
  if (typeof window === "undefined") return;

  // SAFE DEFAULT: simulated responses only. Flipping this to false is a
  // manual, explicit action taken from the browser console - never done by
  // this code - and only makes sense once the dev proxy is running with a
  // real key AND the user has said to go ahead with live calls.
  window.__ccdjMockMode = true;

  const realFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input.url;

    if (!url || !url.startsWith("https://api.anthropic.com") || !window.__ccdjMockMode) {
      return realFetch(input, init);
    }

    const requestBodyText = (init && init.body) || "{}";
    const simulated = buildSimulatedResponse(requestBodyText);

    console.warn(
      "%c SIMULATED AI RESPONSE (mock mode) - no network call made, no API key used ",
      "background:#a855f7;color:#fff;font-weight:bold;padding:2px 6px;border-radius:3px",
      { requestUrl: url, simulatedResponse: simulated }
    );

    window.__ccdjRecordings = window.__ccdjRecordings || [];
    window.__ccdjRecordings.push({
      simulated: true,
      timestamp: Date.now(),
      requestUrl: url,
      requestBody: JSON.parse(requestBodyText),
      rawResponse: simulated
    });

    return new Response(JSON.stringify(simulated), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
}

export { installMockProvider };
