---
name: WorkItemsPage Budget Lines Column & Filter Spec (Issue #1036)
description: Visual spec decisions for budget line count column and unbudgeted filter toggle on WorkItemsPage
type: project
---

## Key Spec Decisions

- Budget Lines column: 7th column (before Actions), 80px wide, center-aligned, non-sortable
- Zero state: neutral gray pill (`--color-role-member-bg` / `--color-text-muted`) — NOT em-dash; zero is actionable info
- Positive count: blue-tinted pill (`--color-primary-bg` / `--color-primary-badge-text`) — signals "has data"
- Pill padding: `var(--spacing-0-5) var(--spacing-2)`, `var(--radius-full)`, `var(--font-size-xs)`
- noBudget filter: replace checkbox with `<button aria-pressed>` toggle button (NOT `<input type="checkbox">`)
- Toggle off: `--color-bg-primary` bg, `--color-border-strong` border, `--color-text-secondary` text
- Toggle on: `--color-primary-bg` bg, `--color-primary` border, `--color-primary-badge-text` text
- Toggle checkmark: CSS `::before { content: "✓ "; }` on `[aria-pressed="true"]` (decorative, no aria impact)
- Filter bar position: between Tag filter and Sort By filter
- `.noBudgetFilter` wrapper needs `align-self: flex-end; min-width: unset` to align with selects that have labels above
- Mobile: toggle button full-width (`width: 100%`), min-height 44px
- `aria-pressed` NOT `aria-checked` — toggle button semantics, not checkbox semantics
- `srAnnouncement` live region announces filter activation/deactivation state

## Why Not Badge Component

Badge is parameterized by a variant map of string values. Numeric count with zero/positive states does not fit the pattern cleanly. Inline `<span>` with local CSS classes is the right approach. Extract to `CountBadge` shared component only if the pattern is needed in 3+ places.

## WorkItemsPage.module.css Token Issues (pre-existing, for review reference)

The existing CSS module has many hardcoded values (2rem padding, 1.5rem margins, 0.875rem font sizes, 0.2s transitions, 0.5rem border-radius). These are pre-existing tech debt — do NOT copy them in new CSS. Use tokens in any new rules added to the file.

**Why:** `--color-border` incorrectly used as hover background in `.secondaryButton:hover` (should be `--color-bg-hover`). This is a known bug in the existing file.
