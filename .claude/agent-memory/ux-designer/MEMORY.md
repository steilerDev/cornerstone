# UX Designer Memory

> This file is loaded into the ux-designer agent's system prompt. Keep it under 140 lines — one line per entry, detail lives in topic files.

## Topic files

- [token-reference.md](token-reference.md) — design token layers, verified token values, recurring token-substitution mistakes (hardcoded values that should be `var(--...)`)
- [component-patterns.md](component-patterns.md) — section-card/page patterns, Badge conventions, SearchPicker/AreaPicker patterns, pre-existing a11y gaps not to block on
- [photo-annotator-patterns.md](photo-annotator-patterns.md) — PhotoAnnotator toolbar/shape/dark-surface conventions + Story #1478 a11y audit
- [cost-breakdown-patterns.md](cost-breakdown-patterns.md) — CostBreakdownTable toolbar/filter patterns (Issue #1786)
- [feature-spec-history.md](feature-spec-history.md) — detailed notes from past visual specs posted to GitHub issues, by story number
- [pr-review-findings.md](pr-review-findings.md) — past PR design-review findings, verdicts, and recurring bugs; process notes for posting GitHub reviews/comments
- `story-4-9-invoice-linking-hi.md`, `pr-1490-measurement-freehand.md`, `annotator-a11y-audit.md` — standalone detailed reports referenced from the files above

## Quick-reference rules (apply on every spec/review)

- Every visual value must be `var(--token-name)` from `tokens.css` — no hardcoded hex/px/z-index. See [token-reference.md](token-reference.md) for the recurring-mistake list before flagging or writing CSS.
- Dark mode: colors must route through semantic (Layer 2) tokens that already flip under `[data-theme="dark"]`; never reference Layer 1 palette tokens directly in a dark-mode override.
- Focus rings: always `box-shadow: var(--shadow-focus)`, never `outline: 2px solid var(--color-primary)` (recurring bug across many PRs).
- `role="status"` already implies `aria-live="polite"` — never add both attributes.
- `BadgeVariantMap` entries need both `label` and `className` — a missing `className` makes the variant's style dead on arrival.
- New component reuse audit: check `Badge`, `SearchPicker`, `Modal`, `Skeleton`, `EmptyState`, `FormError` before proposing anything new; see [component-patterns.md](component-patterns.md) for established section-card/badge/picker conventions.
- Cannot `gh pr review --request-changes` **or** `--approve` on your own PRs (GraphQL rejects both, not just request-changes) — post via `gh api repos/.../issues/{N}/comments` with an explicit "Verdict: APPROVED/CHANGES_REQUIRED" line in the body instead.
- `Intl.NumberFormat` enables thousands-grouping by default; `toFixed()`/manual string-building never did. When a PR swaps a `toFixed()` call for a locale formatter, script-verify the _old vs new_ output isn't just per-locale-correct but also identical for large values (≥1000) — grouping separators are an easy-to-miss 3rd English-output regression beyond whatever the PR explicitly discloses. See PR #1845 in [pr-review-findings.md](pr-review-findings.md).
- `formatDateForAria`-style aria-labels that interpolate localized weekday/month into a hardcoded English sentence order (`"{weekday}, {month} {day}, {year}"`) render grammatically odd in German (`"Dienstag, Februar 24, 2026"` vs correct `"Dienstag, 24. Februar 2026"`) — this is an accepted, deferred, non-blocking gap across the app, not a new bug to flag each time.
- When a PR claims a Badge/shared-component consolidation is "zero visual delta," build a before/after table (padding/font-size/weight) per migrated component — the shared base class is usually extracted from only a subset of sources, so other migrated components can silently inherit a different size than they had. See PR #1848 in [pr-review-findings.md](pr-review-findings.md).
