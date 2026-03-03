# Story 4.9 — Invoice Linking for HI Budget Lines Spec (Issue #413)

## Key Spec Decisions

- HI Detail page: new "Budget" card BELOW Linked Work Items card, ABOVE Metadata card
- Card uses `.card` from HouseholdItemDetailPage.module.css (box-shadow: var(--shadow-sm), padding: var(--spacing-6))
- cardTitle: `var(--font-size-xl)` (20px) — matches other HI Detail page card titles
- Budget lines list + summary: reuse `.budgetLinesList`, `.budgetLineItem`, `.budgetSummary` already defined in HouseholdItemDetailPage.module.css
- Invoice popover on budget line chip: reuse WorkItemDetailPage.module.css `.invoicePopover` pattern exactly
- Delete confirmation: shared.module.css `.modal + .btnSecondary + .btnConfirmDelete` (NOT `.btnDanger` — deletion of a budget line is irreversible)

## Invoice Form Toggle

- Entity type toggle: `role="group"` + two `role="radio"` buttons with `aria-checked`
- Left button: `border-radius: var(--radius-md) 0 0 var(--radius-md)` — Right: `border-radius: 0 var(--radius-md) var(--radius-md) 0`
- Between buttons: `margin-left: -1px` to collapse shared border
- Selected state: `--color-primary-bg` bg + `--color-primary-badge-text` text + `border-color: var(--color-primary)`
- Default selection: "Work Item" (no regression)
- Switching clears entity search + budget line fields
- At < 640px: buttons stack full-width, both use `var(--radius-md)` on all corners

## Invoice List Table

- New "Linked To" column between Vendor and Amount
- Cell text only (no link) for scannability: "Work Item: Title" or "Household Item: Name"
- Hide column at 768–1023px (tablet): `display: none` on th + td
- Mobile card: add optional `font-size: var(--font-size-xs); color: var(--color-text-muted)` line

## Budget Overview Page

- No new UI components needed — existing KPI tiles consume API data automatically
- If HI costs shown separately: use existing CategoryBudgetSummary row pattern

## No New Tokens

No new design tokens required for this story.

## Accessibility Notes

- Section `aria-labelledby` on card h2
- Budget lines list: `role="list"` + `role="listitem"`
- Row buttons: descriptive aria-labels with amount
- Invoice chip button: `aria-label="View N invoice(s) for this budget line"` + `aria-expanded` + `aria-controls`
- Invoice popover: `role="dialog"` with focus trap + Escape closes
- Screen reader live region: "Budget line added." / "Budget line deleted." via existing srAnnouncement visually-hidden div
