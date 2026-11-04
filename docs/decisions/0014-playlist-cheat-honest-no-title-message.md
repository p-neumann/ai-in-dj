0014 — Playlist Cheat: telling "no title" apart from "no match"

Status: Done. This only changes wording on screen. Nothing about how songs get matched changed.
Date: 2026-11-04

What happened

Ranjish copied a line straight from his own library and pasted it into Playlist Cheat: "Trey Songz vs 2 Chainz". The real song is there — he owns several versions of it. But the app told him "no match in your library," which sounds like "you don't own this." That's wrong, and it's misleading.

Why it happened

He copied only the artist's name, not the song title. The line he pasted has no dash in it, so the app has no way to tell artist from title — it just assumes the whole line is the title. Then it goes looking for a song titled "Trey Songz vs 2 Chainz," which doesn't exist. The real title is "2 Reasons." The app did exactly what it was built to do — it just had no way to know an artist name was being pasted with no title at all.

We checked this isn't something we broke while building it: we pulled Mike's own original code and ran it by hand against the exact same input. It does the exact same thing. This has always worked this way — pasting just an artist name, with no title, was never supported. The app just never told anyone that.

The fix

The screen already explains two ways to type a song: "Artist - Title," or just the title by itself. It decides which message to show by checking one simple thing: did that line have a dash in it, splitting it into an artist part and a title part? If not, the app now says so plainly: "no title found in this line — try 'Artist - Title' or just the title." If the line clearly did have a title and the app still found nothing, it keeps saying "no match in your library," because that's a different, more confident statement, and now it's only made when it's actually true.

What it still can't do

The app can't always tell the difference between "someone pasted just an artist name" and "someone pasted just a title that happens to not be in the library." If a DJ types a real, valid title-only line — for a song they genuinely don't have — the app will now say "no title found," even though it did find a title, just not a match for it. We chose this on purpose: the old message was confidently wrong in a way that could make someone think they don't own music they actually do. The new message is a little less specific, but it's never wrong.

How this was checked

All 119 existing tests still pass. No new tests were written for this specific change, because the on-screen wording itself gets checked by hand in the real app, the same way every other screen in this phase has been — not by an automated test.
