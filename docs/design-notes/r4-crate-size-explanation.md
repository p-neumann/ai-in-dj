# For Mike: why big Crate Cheat requests (100–200 songs) come up short

**Date:** 2026-10-03
**Status:** Awaiting Mike's decision (CLAUDE.md R4 / `docs/QUESTIONS.md` "Crate sizes 100-200: batching, bigger pool, or cap?"). Nothing below has been implemented - this is the write-up for that decision, not a proposal in motion.

**The problem, in one line:** when you ask Crate Cheat for 150 or 200 songs, it can't actually deliver that many in one go — it quietly falls short today, and we've now made it say so honestly instead of pretending.

## What happens right now (verified from the code)

- Every Crate Cheat build only ever shows the AI a pool of about **100 candidate songs** from your library, no matter how big the library is or how big a crate you asked for. That's a hard cap in the code (`apps/server/src/engine/candidateSelection.js`).
- When you ask for 200 songs, the app asks the AI for ~205 (a small buffer for duplicates). But the AI is only working from that ~100-song pool — it mathematically cannot hand back 205 *different, real* songs from a pool of 100.
- There's also a second limit: the AI's answer has to fit in a fixed amount of output space (capped at 8,000 tokens). At 200 songs, that's roughly 35-40 tokens per song to include a name, BPM, and key — tight, and it can get cut off mid-answer.
- **What we just fixed (this is done, not proposed):** instead of silently returning fewer songs than you asked for with no explanation, the app now reports *exactly* how many it found, how many it's returning, and why it came up short. No behavior changed for which songs get picked — this is just honesty about the count.

## The three ways to actually fix the shortfall

**Option 1 — Real batching.** Split a big request into several smaller AI calls (e.g., four calls of ~50), and combine the results.
- *Pro:* The only option that can genuinely deliver the full 150–200 you ask for.
- *Con:* Multiple AI calls per build means it costs more and takes longer per build — *how much more is an estimate, not measured yet* (ballpark: cost and wait time roughly scale with the number of batches). Also needs care so the batches don't pick a lot of overlapping/duplicate songs.

**Option 2 — Give the AI a bigger pool to pick from (raise the 100 cap for big requests).**
- *Pro:* Simpler than batching — one call, just a longer song list in the prompt.
- *Con:* Doesn't fully solve it — the 8,000-token output limit is still there, so even seeing more songs, the AI may still run out of room writing out 200 of them in one answer. It also costs more per call (bigger prompt), and — *this part is a judgment call, not measured* — asking the AI to pick well from a much longer list in one shot may make its picks a little less sharp.

**Option 3 — Stop offering sizes the current setup can't really deliver.** Cap the crate-size options to something like 50 or 100 instead of advertising up to 200.
- *Pro:* Cheapest, safest, zero new engineering risk.
- *Con:* Takes away something the app currently advertises — a DJ who wants a 150-200 track pre-built set for a long night would need to run two separate builds instead of one.

## Recommendation: **Option 1 (real batching)**

Reasoning: the app's own menu already offers up to 200 as a choice, which tells me that's a real use case you wanted, not an oversight. Option 3 just removes a feature you built on purpose. Option 2 is a half-measure — it doesn't clear the output-size ceiling, so it wouldn't reliably fix the 150-200 cases anyway. Option 1 is more work, but it's the only one that actually delivers what the size menu promises.

That said, this is genuinely your call to make, not mine — it trades off engineering time against how often you'd actually build 150-200 track crates in practice, and only you know how often that comes up at a real gig.
