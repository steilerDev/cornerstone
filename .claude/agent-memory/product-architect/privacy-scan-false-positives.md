---
name: privacy-scan-false-positives
description: scan-privacy.mjs flags wiki/diff text that is not real data — an ISO date at the start of a diff line (phone) and a 5-digit number before a word (postcode-city)
metadata:
  type: feedback
---

`node plan/restructure/scripts/scan-privacy.mjs --stdin < diff` reports false positives on ordinary
wiki prose (seen on #2229):

- `+2026-10-20). …` — a wrapped line that starts with a date reads as a phone number (`+` diff prefix
  plus digits). Reflow so the date is mid-line.
- `16384 UTF-16` — a 5-digit number followed by a word reads as postcode + city. Write `16 × 1024`.

**Why:** the scan must be clean before an EPIC-21 wiki push; rewording is cheaper than arguing it.
**How to apply:** scan the `git diff` of every wiki/plan change (write the diff to a /tmp file first;
the worktree guard refuses `git -C … | …` pipes), and reword these patterns rather than ignore them.
