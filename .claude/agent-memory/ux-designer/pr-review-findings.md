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

## PR #1834 — Backup Scheduler Status (APPROVED)

Reviewed against the issue #1804 spec (see [feature-spec-history.md](feature-spec-history.md)). Near-perfect spec conformance: all tokens verified present in tokens.css, dark mode routes through existing semantic tokens, mobile override matches spec verbatim, Badge/Skeleton/bannerError reused correctly, i18n keys present in both locales.

- Only finding: informational nit on `<p>` hint as a direct child of `<dl>` (HTML content-model violation) — traced back to my own spec's JSX, not an implementation deviation; non-blocking.

## Process notes

- Cannot `--request-changes` on your own PRs — use `--comment` instead, and note this in the review body
- `gh pr review --comment` via `--body-file` can fail silently — use `gh api repos/.../issues/{N}/comments` instead (the issues API works for PR comments too)
- When posting long GitHub comments with special chars (backticks, CSS `var()` calls), write to `/tmp/spec.md` (or similar) and use `--body-file`
