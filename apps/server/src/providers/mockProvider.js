// Simulated Anthropic provider for deterministic tests and demos (CLAUDE.md
// Section 11.2: "Deterministic (synthetic fixtures, mocked provider): run in
// CI on every change" - never reported as a completed live/integration test).
// Makes no network call. Reads the real candidate pool out of the request
// this server itself built and returns real, resolvable IDs in the exact
// shape buildSys asks for by default: [{id,name,bpm,key}].

// jsonShape variants from promptBuilder.js's buildSys (mirrors
// reference/harness/src/mockProvider.js's detectExtraField): detects
// whether the system prompt asked for a `camp` or `lane` tag on each
// result, so a simulated hybrid-mode batch actually carries tags to test
// against, instead of only ever answering the untagged default shape.
function detectExtraField(systemText) {
  if (/lane}\]/.test(systemText)) {
    return { field: "lane", values: ["pure", "crossover", "native"] };
  }
  const campMatch = systemText.match(/camp}\] where camp is either "(\w+)"[^"]*or "(\w+)"/);
  if (campMatch) {
    return { field: "camp", values: [campMatch[1], campMatch[2]] };
  }
  return null;
}

export function createMockProvider() {
  return {
    kind: "mock",
    async call(requestBody) {
      const userMessage = (requestBody.messages && requestBody.messages[0] && requestBody.messages[0].content) || "";
      const candidates = [];
      for (const line of userMessage.split("\n")) {
        const m = line.match(/^(\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|/);
        if (m) candidates.push({ id: Number(m[1]), name: m[2], bpm: m[3], key: m[4] });
      }
      const count = Math.min(12, candidates.length);
      const extra = detectExtraField(requestBody.system || "");
      const chosen = candidates.slice(0, count).map((c, i) => {
        const item = { id: c.id, name: c.name, bpm: c.bpm, key: c.key };
        if (extra) item[extra.field] = extra.values[i % extra.values.length];
        return item;
      });

      return {
        id: "msg_simulated_" + Date.now(),
        type: "message",
        role: "assistant",
        model: requestBody.model || "claude-sonnet-5",
        content: [{ type: "text", text: JSON.stringify(chosen) }],
        stop_reason: "end_turn",
        usage: { input_tokens: 0, output_tokens: 0 },
        simulated: true
      };
    }
  };
}
