---
name: cost-breakdown-patterns
description: CostBreakdownTable layout, control bar pattern, and inline filter select spec for Issue #1786
metadata:
  type: project
---

## CostBreakdownTable (client/src/components/CostBreakdownTable/)

### Layout: `breakdownCard` is a flex column

- `display: flex; flex-direction: column; gap: var(--spacing-4)`
- Children: `.breakdownTitle` → controls → `.tableWrapper`
- `PerspectiveToggle` is a direct flex-column child (inline-flex, `align-self: flex-start`)

### PerspectiveToggle (Min/Avg/Max segmented control)

- `role="radiogroup"`, each button `role="radio"` + `aria-checked`
- Wrapper: `display: inline-flex; border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); overflow: hidden`
- Segments: `min-width: 52px; min-height: 44px; padding: var(--spacing-1-5) var(--spacing-3)`
- Active: `background: var(--color-primary); color: var(--color-primary-text)`
- Focus: `box-shadow: var(--shadow-focus)` (stronger ring than inputs)
- prefers-reduced-motion: `transition: none` applied

### Issue #1786 — "Cost Basis" filter control bar (spec posted)

When adding a second control alongside `PerspectiveToggle`, wrap both in a `.controlBar` flex row:

- `display: flex; align-items: center; gap: var(--spacing-6); flex-wrap: wrap`
- No `role` attribute needed (independent controls, not a toolbar)

**Cost Basis select:**

- `<label htmlFor="cost-basis-select">` + `<select id="cost-basis-select">`
- `.costBasisField`: `display: flex; align-items: center; gap: var(--spacing-2)`
- `.costBasisSelect`: `composes: select from shared.module.css`; override `width: auto; min-height: 44px`
- Active filter state (value !== "all"): `.costBasisSelectActive` → `border-color: var(--color-primary)`
- Do NOT change label color for active state — reserve label color changes for validation errors
- Mobile (<640px): `.costBasisField` and `.costBasisSelect` get `width: 100%`
- Print: add `.controlBar` to the `@media print { display: none !important }` block alongside `.perspectiveToggle`
- prefers-reduced-motion: add `.costBasisSelect` to the no-transition rule

**Native `<select>` a11y:** Screen readers announce option changes natively — no live region needed for the select itself. However, if the table re-renders on change, expand the existing `role="status"` message to cover cost basis state too.

**i18n namespace:** `budget`

- `overview.costBreakdown.costBasis.label` → "Cost Basis"
- `overview.costBreakdown.costBasis.all` → "All"
- `overview.costBreakdown.costBasis.paid` → "Paid"
- `overview.costBreakdown.costBasis.outstanding` → "Outstanding"
- Translator note: "Outstanding" = accounting term for pending/unpaid; use "Ausstehend" in German

**Why:** Inline toolbar controls must use `width: auto` (not `width: 100%` from shared.select). The `shared.select` default `padding: spacing-2 spacing-3` gives ~36px height — always add `min-height: 44px` for touch compliance.
