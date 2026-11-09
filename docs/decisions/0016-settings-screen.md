0016 — Settings screen (step 5, piece 7)

Status: Done, pending Ranjish's real-window check. No change to how songs get picked, ranked, or filtered.
Date: 2026-11-04

What this is

A new Settings screen with everything Mike's real app has in this area, except the parts that depend on accounts, billing, or things we don't have yet. It covers: theme colors and light/dark mode, the Always On Top pin, Style Profile, Do Play and Do Not Play lists, a History panel with export, and Report a Problem.

Why it looks different from Mike's app

Mike's real app spreads these across four small popups, each opened by clicking an icon in a bar that sits at the top of every screen. That bar doesn't exist in this app yet - nothing built so far has one. Building it is its own piece of real work, planned for later (piece 8), not something to squeeze into this one. So for now, everything lives in one screen, in the same list of screens as Track Cheat, Crate Cheat, and Playlist Cheat. It does the same things Mike's popups do. It just isn't arranged the same way yet, and piece 8 may rearrange it later.

Two real gaps found while building this, and what we did about them

First: Mike's actual app never saves the theme anywhere. Pick a color, close the app, reopen it - back to default, every time. But the project's own plan for this phase already says theme should be remembered after a restart, the same way your library and your history already are. So we're not changing Mike's design here - we're finishing something the plan already called for and his code never got to. The color is now saved on this computer and loaded back when you reopen the app.

Second: nothing in Track Cheat or Crate Cheat was writing anything real to history. The save-and-view functions existed from an earlier piece, but only a leftover test button had ever used them - a History panel today would have had nothing real to show. Ranjish asked for real logging to start now rather than wait. So Track Cheat now logs one simple line every time you get recommendations: what song you started from, what caused the fetch, how many results came back, and when. This is a first step, not the whole thing. Mike's real design also tracks what happened to each individual result - was it dragged out, thumbs-upped, thumbs-downed - plus chain and bridge and drift detail, plus notes you add afterward. None of that is recorded yet. The screen says so directly, in red text, right above the history list, so nobody mistakes this for finished.

What needs a real network call

Saving your Style Profile, and applying your Do Play / Do Not Play lists to tonight's session, both go through the real backend - and that backend already makes one real AI call to understand your Style Profile text (this was built and tested in an earlier phase; nothing new was added to make that happen). Everything else on this screen - theme, the pin, History, Report a Problem - is entirely local, no network, no AI.

One thing worth knowing: that AI call runs only when you click "Apply to this session," not every time you type a letter or add a list entry. The server would actually re-run it every single time Style Profile is saved, even if only your Do Not Play list changed - so clicking Apply only when you mean it avoids paying for and waiting on that call by accident.

What's left out, and why

Login, pricing, "Manage Subscription," and the referral code all depend on real accounts, which aren't built yet and need a decision from Mike and Paul first. The themed logo needs image files from Mike we don't have. The star-rating popup is tied to how Track Cheat is used during a session, not really a setting, and its wording depends on a still-open decision about how the app gets distributed. The "diagnostics" toggle mentioned in the plan turned out not to be a real button anywhere in Mike's actual code - just a fixed value in the source that isn't wired to a switch - so there was nothing real to port. Gig Mode lives inside Track Cheat's own screen, not here.

Kept exactly as Mike wrote it: the warning text on the Dirty/Clean filter, which says plainly that it only checks whether the words "dirty" or "explicit" appear in a track's filename - it doesn't listen to the audio, and its accuracy depends entirely on how you've named your files.

How this was checked

135/135 tests pass, including new ones for the color list, the list-entry logic, and the history export format. Both type checks pass. A real build succeeds, and the compiled app still contains no trace of the AI provider's web address or the artifact-only storage API it used to depend on. The real proof - that saved preferences actually survive a restart, and that Apply to this session actually reaches Crate Cheat - is a manual check in the running app, described separately for Ranjish to run before this is committed.
