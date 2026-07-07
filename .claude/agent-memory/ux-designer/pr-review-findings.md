---
name: pr-review-findings
description: Past PR design-review findings, verdicts, and recurring bug patterns worth checking on future reviews
metadata:
  type: project
---

## PR #792 — Budget Sources Bar Chart

- `color-mix()` in inline `style` prop bypasses the token system — allocate a named token instead
- Legend dot `8px` = `var(--spacing-2)` — always swap raw px dot sizes to nearest spacing token
- `--color-border-strong` as text `color` for a separator — use `--color-text-muted` instead

## PR #1490 — Measurement & Freehand Tools (APPROVED/comment)

See `pr-1490-measurement-freehand.md`. Medium: `labelAttrs { display:'none' }` dead code in render.ts — refinement item.

## PR #1681 — Paperless Invoice Picker (CHANGES_REQUIRED)

- `--color-danger-text` misuse — see [token-reference.md](token-reference.md)
- RECURRING BUG: when a page is refactored from a source page, CSS class migration is often incomplete — always grep all `styles.*` references in TSX against defined classes in the module to catch missing definitions
- z-index stacking collision with sibling overlay (e.g. unlink button from #1680) — see [token-reference.md](token-reference.md)

## PR #1844 — i18n/a11y sweep, 69 hardcoded strings → t() (CHANGES_REQUESTED/comment)

Large i18n sweep converting hardcoded aria-label/placeholder/title strings to `t()` across ~27 components. Found 4 genuinely broken translation keys that render as literal key strings in the UI (i18next default: no `parseMissingKeyHandler`/`returnNull` in `client/src/i18n/index.ts`, so missing key → key path shown verbatim to users):

- `TimelinePage.tsx` called `t('toolbar.zoomOut')`/`t('toolbar.zoomIn')` but the JSON key actually added was `timeline.toolbar.zoomOutTitle`/`zoomInTitle` (namespace `schedule`) — wrong path AND wrong leaf name.
- `BudgetSourcesPage.tsx` called `t('budgetSources.termsPlaceholder')` etc. — `budgetSources` was never added as a top-level key anywhere in `budget.json` (should've been under existing `sources` key).
- `VendorDetailPage.tsx` called `t('vendorDetail.invoicesAriaLabel')` — only `vendorDetail.invoices` (plain label, no aria variant) exists.

**Recurring check to always run on i18n-conversion PRs**: for every changed `.tsx` file, resolve its `useTranslation(ns)` namespace(s), then script-verify every `t('key.path')` call resolves in `en/{ns}.json` (accounting for i18next `_one`/`_other` plural suffixes as false positives). A key that doesn't resolve renders as the literal key string — this is a functional/visual regression, not just a translation nit, and is easy to miss by eyeballing diffs alone since the diff itself looks plausible (translated title/placeholder swapped 1:1). None of these were caught by tests — no test asserted the actual rendered string.

Also found (non-blocking): `SubsidyProgramsPage.tsx` delete-confirm modal collapsed `<strong>{name}</strong>` embedded in JSX into a flat `t(key, {name})` interpolation — loses bold emphasis around the interpolated value. Recurring pattern to watch for: JSX with embedded `<strong>`/`<em>` around an interpolated variable can't be flattened into a plain `t()` call without losing that formatting — needs `<Trans>` or the JSX split preserved.

Process note: `--request-changes` blocked (own PR) as usual — posted `--comment` with clear "CHANGES_REQUESTED" verdict text in the body instead; that succeeded fine via `gh pr review --comment --body-file`.

## PR #1834 — Backup Scheduler Status (APPROVED)

Reviewed against the issue #1804 spec (see [feature-spec-history.md](feature-spec-history.md)). Near-perfect spec conformance: all tokens verified present in tokens.css, dark mode routes through existing semantic tokens, mobile override matches spec verbatim, Badge/Skeleton/bannerError reused correctly, i18n keys present in both locales.

- Only finding: informational nit on `<p>` hint as a direct child of `<dl>` (HTML content-model violation) — traced back to my own spec's JSX, not an implementation deviation; non-blocking.

## Process notes

- Cannot `--request-changes` on your own PRs — use `--comment` instead, and note this in the review body
- `gh pr review --comment` via `--body-file` can fail silently — use `gh api repos/.../issues/{N}/comments` instead (the issues API works for PR comments too)
- When posting long GitHub comments with special chars (backticks, CSS `var()` calls), write to `/tmp/spec.md` (or similar) and use `--body-file`
