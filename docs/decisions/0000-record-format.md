# 0000 - Decision Record Format

This folder holds one file per numbered decision, in the order the decision was made. Use this template.

## Format

```
# NNNN - Short title

**Date:** YYYY-MM-DD
**Owner/source:** who made or approved this decision (e.g. "Mike, verbal, gig on 2026-09-02" or "Ranjish + Paul, this session")
**Status:** Proposed | Accepted | Superseded by NNNN

## Decision
One or two sentences: what was decided.

## Why
The reasoning or constraint that drove it.

## Consequences
What this rules in or out for later work.
```

## Rules
- Never edit a merged decision record to change what it says; add a new one that supersedes it and update the old file's Status line.
- A decision record documents something that was actually decided by its stated owner — it is not a place to record an engineering guess. Engineering proposals belong in code comments, PR descriptions, or `docs/design-notes/`.
- File names: `NNNN-kebab-case-title.md`, numbered sequentially starting at `0001`.
