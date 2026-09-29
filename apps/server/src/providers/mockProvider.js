// Simulated Anthropic provider for deterministic tests and demos (CLAUDE.md
// Section 11.2: "Deterministic (synthetic fixtures, mocked provider): run in
// CI on every change" - never reported as a completed live/integration test).
// Makes no network call. Reads the real candidate pool out of the request
// this server itself built and returns real, resolvable IDs in the exact
// shape buildSys asks for by default: [{id,name,bpm,key}].

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
      const chosen = candidates.slice(0, count).map((c) => ({ id: c.id, name: c.name, bpm: c.bpm, key: c.key }));

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
