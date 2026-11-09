0018 — A session-only Do Not Play entry was surviving a restart

Status: Done, pending Ranjish's real-window check. Fixes a real bug. Not a design change, and not something Mike's own code does - the real code does this correctly already.
Date: 2026-11-08

What happened

Ranjish added a "Drake" entry to Do Not Play as session-only, then added a second "Drake" entry as permanent. He closed the app completely and reopened it. Both entries were still there - including the one marked "(session)," which should have disappeared the moment the app closed.

Why it happened

This was a mistake in this port, not something copied from Mike's own app, and not something his version also has.

The screen's own save function wrote whatever list it was given straight to disk, with no filtering. Adding the session entry didn't save anything by itself - that part was fine. But adding the PERMANENT entry right after it did save - and at that moment, the list it saved from still had the session entry sitting in it, so both went to disk together. The permanent entry didn't cause the bug on its own; it was just the next thing that triggered a save, and the save itself didn't know to leave the session entry out. The same thing would have happened if Ranjish had just clicked out of the Style Profile box instead - that also triggers a save of the current lists, unfiltered.

We checked Mike's own code before touching anything, and he already does this correctly. His save function is literally built to throw away anything not marked permanent before it writes:

    var permDoPlay = nextDoPlay.filter(function(e){ return e.persistent; });
    var permDoNotPlay = nextDoNotPlay.filter(function(e){ return e.persistent; });
    window.storage.set(PREFS_KEY, JSON.stringify({ doPlayList: permDoPlay, doNotPlayList: permDoNotPlay, ... }))

This port left that filter out. That's the whole bug.

We also checked whether the same mistake was hiding anywhere else. Do Play has the exact same problem, because it's saved by the same function the same way. Style Profile, the theme, History, and Always On Top don't have a session-vs-permanent idea at all, so there was nothing for this particular bug to affect there.

The fix

The save function now throws away anything not marked permanent before it writes, the same way Mike's always has. This is in one place now, not copied into every button that can trigger a save, so nobody has to remember to filter by hand next time something new gets added to this screen.

What did not change

Nothing about what a session entry does while the app is open changed - it still shows up, still works, still gets sent along if you click "Apply to this session." The only thing that changed is what gets written to disk when something gets saved.

How this was checked

139 tests pass, including four new ones that build the exact situation Ranjish ran into by hand - a session entry and a permanent entry in the same list - and check that only the permanent one comes out the other side. Both type checks pass, and a real build succeeds. The real proof - that a session entry is actually gone after a real restart - is a manual check in the running app, described separately for Ranjish to run before this is committed.
