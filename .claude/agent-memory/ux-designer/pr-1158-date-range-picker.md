---
name: PR #1158 — DateRangePicker design review findings
description: Key ARIA and token findings from DateRangePicker calendar component review
type: project
---

## PR #1158 Review Findings — DateRangePicker (DateFilter)

### High finding

- `role="application"` on outer picker wrapper is wrong. `role="grid"` on the inner grid container is the correct and sufficient composite widget landmark. `role="application"` strips virtual cursor navigation from all sibling elements (nav buttons, phase label) outside the grid.
- Fix: remove `role="application"` from outer div; optionally route `ariaLabel` prop to the grid's `aria-label` as `ariaLabel ?? t('...')`.

### Medium findings

- `32px` hardcoded → `var(--spacing-8)`, `28px` → `var(--spacing-7)`, `40px` → `var(--spacing-10)`. `36px` and `44px` have no spacing token — keep as literals.
- Mobile day button touch target at 40px; WCAG 2.5.5 recommends 44px. Constrained by 7-column grid in compact picker.

### Informational

- `aria-pressed` on buttons inside `role="gridcell"` is pragmatic but `aria-selected` on the gridcell is more semantically correct for grid selection.
- linear-gradient approach for range start/end half-cells (`transparent 50%, var(--color-primary-bg) 50%`) is correct and dark-mode-safe.
- Component is visually consistent with `MonthGrid.module.css` patterns.

**Why:** `role="application"` is a recurring ARIA misuse pattern — developers apply it to calendar widgets thinking it helps keyboard navigation, but it removes browse mode and harms non-keyboard screen reader users.

**How to apply:** Flag `role="application"` on any component that already has a `role="grid"`, `role="listbox"`, `role="menu"`, or other composite widget role inside it. The composite widget role is sufficient.
