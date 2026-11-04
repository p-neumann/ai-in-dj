0015 — One shared session for the whole app

Status: Done. This is plumbing only. No change to how songs get picked, ranked, or filtered.
Date: 2026-11-04

What happened

While planning the Settings screen, Ranjish asked a question that turned up a real bug: could a thumbs-down in Track Cheat ever reach Crate Cheat? The answer was no. Each screen that talked to the server was quietly creating its own separate memory of the night. Track Cheat made one for itself. Crate Cheat never made one at all — it never told the server who was asking. The main app window made a third one, just for a demo screen, that nothing else used.

Why it happened

This was never a decision anyone made on purpose. It happened because each screen got built on its own, in its own piece, and each one solved "I need a session" by just making one. Mike's actual design assumes one continuous memory for the whole night — thumbs-down lasting until you quit, how deep a chain of songs goes, what the DJ has been dragging out. Three separate memories quietly breaks that, in a way nobody would notice just by using one screen at a time.

The fix

Now there is exactly one session, created once, when the app opens. The main app screen creates it and hands it to Track Cheat and Crate Cheat. Neither of them makes its own anymore. If a screen tries to do something before that one session is ready, it now says so and asks you to try again in a moment, instead of quietly making a second one behind your back — which is exactly the bug this fixes, so the fix can't quietly bring it back.

What it still can't do

This only connects Track Cheat and Crate Cheat. Playlist Cheat doesn't talk to the server at all, so it isn't part of this. The Settings screen (next piece) will use this same shared session once it's built. This also doesn't change anything about what happens inside a session — if there was ever a question about how long a thumbs-down should last, or how chain depth should behave, none of that was touched. This only makes sure every screen is pointed at the same memory instead of three different ones.

How this was checked

All 119 existing tests still pass. Both type checks pass. A real build succeeds. The real proof is a manual check in the running app: thumbs-down a song in Track Cheat, then build a crate with Crate Cheat, and confirm that song does not show up in the crate. That check is described separately for Ranjish to run himself before this gets committed.
