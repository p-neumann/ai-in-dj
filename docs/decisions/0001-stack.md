# 0001 - Development stack

**Date:** 2026-09-28
**Owner/source:** CLAUDE.md Section 5.2 (proposed engineering recommendation); adopted for active work absent any objection from Ranjish. Still open to change - D3 in the decisions register stays "Proposed" until Ranjish/team formally confirms.
**Status:** Proposed (in active use as the working default)

## Decision
Build the real app on: Electron + React (renderer) for the desktop shell, `better-sqlite3` for local persistence, a Node.js + TypeScript HTTP backend (Fastify), and Postgres for the remote store. Anthropic and Spotify calls happen only on the backend.

## Why
The prototype is already React, so the renderer can reuse its logic with minimal translation. Mike's own code comments already assume an Electron-shaped API (`window.electronAPI`, `minWidth/minHeight`). Node/TypeScript on the backend keeps one language across the whole port.

## Consequences
- Phase 3-5 scaffolding (server, desktop shell) proceeds using this stack.
- If Ranjish or the team wants a different stack, say so before much Phase 3/5 code is written - changing later means redoing scaffolding, not just this record.
