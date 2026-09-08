---
name: singular-plural-announcement-split-2060
description: German declension pattern for splitting a single {{count}}-interpolated string into i18next _one/_other pairs (diary infiniteScroll, Issue #2060)
metadata:
  type: project
---

**Update (same day, PR #2063 review round 2)**: frontend-developer renamed the English keys again,
from `*Singular`/`*Plural` to i18next's native `_one`/`_other` plural suffix convention (the
"final" naming — matches how i18next's default pluralization resolves German, which also just
uses `_one`/`_other`, same two-category split as English). German text content unchanged, key
names only: `initialLoadAnnouncement_one`/`_other`, `batchAppendedAnnouncement_one`/`_other`,
`batchAppendedAndEndAnnouncement_one`/`_other`. If asked to add further pluralized diary/infinite-
scroll keys, use `_one`/`_other` directly, not `*Singular`/`*Plural` — the latter was an interim
naming that got superseded. Note: this repo's other pluralization keys (`page.entryCountSingular`/
`entryCountPlural`) still use the older explicit-suffix style — `_one`/`_other` is new to this
codebase as of #2060, introduced specifically because i18next requires it for its `count`-driven
automatic plural resolution (`t('key', { count })`) to work, whereas `entryCountSingular`/`Plural`
are picked manually in code, not through i18next's plural engine.

**Concurrent-worktree gotcha**: mid-verification, `en/diary.json`'s key names changed under me
between an Edit call and the following diff-script call (frontend-developer's rename landed in the
same shared worktree in that window) — the flattened parity diff briefly showed 6 "missing in de" /
6 "missing in en" that were pure timing noise, not a real gap. Re-running the same diff script
immediately after confirmed 334/334 with zero mismatches. Same lesson as the `closingLabel`
incident in MEMORY.md: always re-check immediately before finalizing rather than trusting one read,
in a shared worktree.

---

Issue #2060 (diary infinite scroll) PR review caught an English grammar bug ("1 entries loaded")
in three `{{count}}`-interpolated `infiniteScroll` announcement keys and split each into
`*Singular`/`*Plural` pairs (superseded by `_one`/`_other`, see update above). The pre-existing German translations had the same latent bug (always
used the plural noun "Einträge" even for count=1) but it was masked because German doesn't
mark this in the same visible way English does — still wrong once split explicitly.

**Pattern applied** (`client/src/i18n/de/diary.json` `infiniteScroll.*`):

- Base noun switches "Eintrag" (singular) / "Einträge" (plural) — matches sibling
  `page.entryCountSingular`/`entryCountPlural`.
- Where English prepends "more" (`batchAppended*`), the German adjective "weiter-" takes **strong
  declension** since no article precedes it and count is a bare numeral: singular is
  `"{{count}} weiterer Eintrag geladen"` (masculine nominative singular, `-er` ending), plural is
  `"{{count}} weitere Einträge geladen"` (`-e` ending). Do not use "weitere Eintrag" (wrong,
  mismatched adjective/noun number) or "weiterer Einträge" (wrong, mismatched the other way) —
  this is the easy mistake when splitting a English count/plural pair mechanically without
  checking German adjective agreement.

General rule for future singular/plural key splits: when English source has an adjective before
the noun (more, another, additional, etc.), check German strong/weak declension for that adjective
against the noun's number and case, don't just toggle the noun.

Verification method used (Jest unrunnable in this worktree — known `ts-node` gap, see
[[audit-pitfalls]]): a throwaway Node script flattening both `en/diary.json` and `de/diary.json`
to dotted-path key sets and diffing both directions — confirmed 334/334 parity, 0 missing either
way. Preferred over trusting Edit tool success alone — see MEMORY.md's "Always verify persistence"
rule, re-confirmed here via `git diff --stat` showing the expected 6-line insert / 3-line delete.
