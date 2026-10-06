# 0006 - Raise Track Cheat's response size limit from 2000 to 6000

**Date:** 2026-10-06
**Owner/source:** Ranjish, this session - approved after a real (billed) API call reproduced the bug twice in a row.
**Status:** Accepted

## Decision
Bug found: sometimes the AI ran out of room to answer, because it was "thinking" before responding, which is normal, but the app's allowed response size was set years ago and never updated.

Fix: increased the allowed response size (`max_tokens`) for Track Cheat from 2000 to 6000, in `apps/server/src/routes/trackCheat.js`.

This does not change what songs get picked, only fixes a technical limit that was occasionally cutting answers short.

## Why 6000, specifically
Two real test calls (same request, back to back) each showed the AI using 1999 of its 2000-token allowance just "thinking" before writing anything - leaving zero room left for the actual list of songs, so the answer came back empty both times. 6000 gives about 4000 tokens of extra room beyond that worst case we actually measured - more than enough, since the real answer (a list of 20 songs) only ever needs around 400-500 tokens to write out. This isn't the same number Crate Cheat uses (which scales up to a higher 8000 ceiling for its own, much bigger requests) - 6000 is sized to Track Cheat's own, smaller job specifically, with healthy headroom rather than just matching Crate Cheat's number for its own sake.

## Why this is safe
- **Only one thing changed:** the number passed as `max_tokens`. Nothing about the prompt text, the list of candidate songs, how they get filtered, or how they get ranked was touched.
- Confirmed by re-running the full automated test suite (36 tests covering Track Cheat specifically) after the change - all still pass, with no test needing any update. That's expected: those tests use a simulated stand-in for the AI that doesn't "think" at all, so they were never sensitive to this limit in the first place - which is also *why* this bug could exist for a while without any test catching it.

## Consequences
- A Track Cheat call that happens to think for a very long time could theoretically still run out of room, since 6000 is generous but not unlimited. If that's ever observed on a real call, it should be logged the same way this one was, not silently patched again.
- Slightly higher token ceiling means a slightly higher *possible* cost per call if the model ever actually uses the full 6000 tokens - in practice this only happens when the model would have failed outright before, so it's not a new cost for anything that previously worked.
