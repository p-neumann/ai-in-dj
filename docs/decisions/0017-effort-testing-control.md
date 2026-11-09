0017 — A real effort switch, for testing only

Status: Done, pending Ranjish's real-window check. The shipped default has not changed. The decision about whether to ever change it still belongs to Mike.
Date: 2026-11-07

What this is

A dropdown on both the Track Cheat screen and the Crate Cheat screen that lets Ranjish pick "high" or "low" for how hard the AI model thinks before answering. High is the default and matches exactly what has always shipped. Low is new. It's clearly marked on screen as a testing control, not a real setting - it's there so Ranjish can compare the two himself, switching back and forth on the same prompt, over the next few days, before bringing a real recommendation to Mike.

Why now

The token-ceiling problem has now failed for real four times. Each time, the fix was to give the model more room. That stopped being a real fix a while ago: across every real call measured, the actual answer stays a small, steady size, but the thinking next to it has swung all the way from nothing up to over fourteen thousand tokens on similar-looking requests. Giving it more room raises the ceiling for the answer and the thinking together, so a bigger ceiling just means the thinking can swing even higher before something breaks again - it doesn't stop the swinging. Lowering effort is the one thing that actually changes how much the model thinks, instead of just how much room it's given. Whether that's the right trade for Mike's product is his call, not ours - this piece only makes it possible to test, safely, without touching anything about what gets recommended.

What else this includes

Two smaller things came along with the dropdown, because they're needed to make testing real:

First, the screen now shows which effort level was actually used, right next to the existing numbers, and the server's own log line says the same thing - so a run can be told apart from another one afterward without guessing.

Second, a real safety net: if a call comes back cut off, or if 45 seconds pass with nothing back at all, the app now cancels that attempt and tries exactly once more at low effort, and says so plainly on screen. This is error recovery, not a product decision, so it didn't need to wait for Mike - a DJ mid-gig should get a slower-but-complete answer, not a hard failure, when something stalls. If the retry also fails, it fails for real; there's no infinite loop, and normal successful calls behave exactly as they always have.

What did not change

The token ceiling is untouched. Nothing about candidate selection, prompts, pool size, or ranking changed anywhere. An untouched dropdown sends exactly what always shipped. The only thing a retry changes is the effort level on one repeated call - never the ceiling, never anything else.

How this was checked

137 server tests pass (7 new, covering the retry logic itself with fake providers - a cut-off response, a stall, a normal success, and a real failure that correctly does NOT get retried - no real AI spend). 135 desktop tests pass. Both type checks pass, and a real build succeeds. The real proof - that flipping the dropdown actually changes what effort gets used, that a slow or cut-off call really does recover automatically, and that the default still behaves exactly as before - is a manual check in the running app, described separately for Ranjish to run before this is committed.
