// LOCAL, TEMPORARY dev proxy for Phase 2 characterization (CLAUDE.md).
//
// Purpose: the sanitized prototype's fetch calls are redirected here (see
// harness/src/recorder.js) instead of to api.anthropic.com directly, so we
// can record real request/response fixtures using a personal dev API key
// that never touches the browser or git.
//
// This is NOT the production backend from Section 5-6 of CLAUDE.md. It has
// no real auth, no session state, no engine logic - it only adds a key and
// forwards. It must never be deployed anywhere public, and is deleted by
// the end of Phase 4 per the roadmap.
//
// VERIFY BEFORE RELYING ON THIS LONG-TERM: the `anthropic-version` header
// value and endpoint path below should be checked against Anthropic's
// current official API docs at implementation time (CLAUDE.md Top Rule 9).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COUNT_FILE = path.join(__dirname, "request-count.json");

const PORT = 8787;
const ALLOWED_ORIGIN = "http://localhost:5183";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01"; // verify against current docs
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MAX_DAILY_REQUESTS = Number(process.env.MAX_DAILY_REQUESTS || 50);

if (!API_KEY || API_KEY === "replace-me") {
  console.error(
    "ANTHROPIC_API_KEY is not set. Copy dev-proxy/.env.example to " +
      "dev-proxy/.env and put your own dev key in it (never commit .env)."
  );
  process.exit(1);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadCount() {
  try {
    const data = JSON.parse(fs.readFileSync(COUNT_FILE, "utf8"));
    if (data.date === todayKey()) return data.count;
    return 0;
  } catch {
    return 0;
  }
}

function saveCount(count) {
  fs.writeFileSync(COUNT_FILE, JSON.stringify({ date: todayKey(), count }));
}

function withCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, x-api-key, anthropic-version"
  );
}

const server = http.createServer(async (req, res) => {
  withCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/v1/messages") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: "NOT_FOUND" } }));
    return;
  }

  const count = loadCount();
  if (count >= MAX_DAILY_REQUESTS) {
    res.writeHead(429, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          code: "QUOTA_EXCEEDED",
          message: `Dev proxy daily cap of ${MAX_DAILY_REQUESTS} requests reached.`
        }
      })
    );
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body
    });

    saveCount(count + 1);

    const text = await upstream.text();
    res.writeHead(upstream.status, { "content-type": "application/json" });
    res.end(text);
  } catch (err) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: { code: "PROVIDER_ERROR", message: String(err) } })
    );
  }
});

server.listen(PORT, "localhost", () => {
  console.log(`CCDJ dev proxy listening on http://localhost:${PORT}`);
  console.log(`Daily request cap: ${MAX_DAILY_REQUESTS} (used today: ${loadCount()})`);
});
