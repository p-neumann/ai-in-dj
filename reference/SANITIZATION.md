# Sanitization Record

This file records what was removed from each sanitized reference copy in `reference/`, and why.
No secret value is ever written here — only which identifier was changed and the hash of the original file.

---

## CheatCodeDJ_v_1_0_22016.sanitized.jsx

- **Source file:** `CheatCodeDJ_v_1_0_22016.jsx` (repo root)
- **Source `APP_VERSION`:** `v1.0.22016`
- **SHA-256 of the original, unmodified source file:** `3a300f428d849cb2f9c6bfe9e1d631daf601a9040c04d7af334b324205e74796`
- **Identifier changed:** the value assigned to `SPOTIFY_CLIENT_SECRET` (line 35 of the source file) was replaced with an empty string.
- **Reason:** the source file hardcodes a live Spotify client secret in a public repository (see CLAUDE.md Section 2, row R17, and Section 7.1). This reference copy must not carry that value forward into any new commit.
- **Verification performed:** the sanitized copy was diffed against the original using a method that reports only differing line numbers, never content. Exactly one line differs: line 35, the `SPOTIFY_CLIENT_SECRET` assignment. No other line changed.
- **Musical logic:** unchanged. No prompts, weights, thresholds, pool sizes, or other recommendation behavior were touched.
- **What still needs to happen:** rotating the real secret in the Spotify Developer Dashboard is Mike's action, tracked in `docs/QUESTIONS.md`. Removing the original value from git history is a separate decision for Paul (repo owner) and has not been done here.
