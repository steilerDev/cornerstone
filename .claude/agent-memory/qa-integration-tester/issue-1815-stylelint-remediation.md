---
name: issue-1815-stylelint-remediation
description: QA verification of large-scale stylelint remediation (370 violations) and CI gate wiring
metadata:
  type: project
---

Issue #1815 (2026-07-07): stylelint remediation across ~35 CSS/module files + `.stylelintrc.json` config
fix + `npm run stylelint` wired into root `lint`/`lint:fix` + CI `static-analysis` job. Verified clean —
no bugs found, no test assertion updates needed.

**Verification approach that worked well for a CSS-only PR with no new test files:**
- Ran the 5 touched-component test dirs batched in one `jest` invocation (29 suites / 1365 tests / 6 todo,
  all green) rather than one invocation per directory — faster and the spec explicitly listed them as a
  batch.
- For "keep-list" verification (duplicate-selector deletions), `grep -n "^\.selectorName"` across the
  whole file is enough to prove a selector now appears exactly once (dedup confirmed) or that a specific
  class survived untouched — no need to read the whole 1600-line CSS file.
- For the `@extend` bug fix (SCSS syntax silently ignored by plain CSS Modules — real latent bug, not just
  a lint nit), confirmed via `git diff main -- <file>` rather than grep, since one of the six `.td*`
  classes (`.tdLinkedItem`) already had its own explicit `padding: var(--spacing-2) var(--spacing-3)`
  override sitting alongside the dead `@extend .td;` — the implementer correctly just deleted the `@extend`
  line there instead of literally inserting `padding: var(--spacing-3)` (which would have been wrong,
  overriding the more specific existing value). Worth checking the diff, not just grepping for the expected
  literal string, when a spec's "apply this pattern to N instances" has an exception baked into one instance.
- `--color-warning-bg` token reuse for `InvoicePipelineCard.itemOverdue` is a deliberate normalization
  (solid `#fff7ed` light / translucent `rgba(...,0.1)` dark) replacing a flat rgba that had **no** dark-mode
  awareness before — this is a documented latent-dark-mode-gap fix, not a regression. Don't flag it as a
  bug if you see it again in a snapshot/visual diff.
- eslint baseline check (`npx eslint .` → 8 errors, 50 warnings) is a good confirmatory sanity check even
  though this PR deliberately does NOT gate CI on eslint (only stylelint) — confirms the PR didn't
  introduce new eslint issues while doing 35-file CSS surgery.

No memory-worthy bugs found in this story — pure clean verification pass.
