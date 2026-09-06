---
name: component-patterns
description: Established page/component styling patterns (section cards, badges, pickers, a11y gaps) to reuse when writing new specs
metadata:
  type: project
---

## Section cards & page patterns

- Generic section card (WorkItemDetailPage, InvoiceDetailPage, BackupsPage scheduler status): `background: var(--color-bg-primary); border: 1px solid var(--color-border); border-radius: var(--radius-lg)` (0.5rem), padding `var(--spacing-4) var(--spacing-5)` or similar — no shared "Card" component exists; this is intentional page-local composition, not a candidate for a new shared component
- Currency formatting: `new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })` — German locale (or use `formatCurrency` from `useFormatters()` where available)
- GanttTooltip inverse surface: `--color-bg-inverse` / `--color-text-inverse`; needs component-level dark override because the inverse surface itself flips; `var(--color-blue-200)` on dark inverse surface is justified (no semantic "link on dark inverse" alias exists)
- Document Browser grid: 3-col desktop / 2-col tablet / 1-col mobile (2-col in modal embed); tag chips use `role="group"` + `role="checkbox"` + `aria-checked`, `--color-primary-bg` active state; card border 1px NOT 2px; picker modal `min(860px, calc(100vw - 2rem))` max-width
- HI Detail section cards use `border: 1px solid var(--color-border)` NOT `box-shadow: var(--shadow-sm)`

## Badge patterns

- `BadgeVariantMap` entries need BOTH `label` (translated) AND `className` (CSS module class) — RECURRING BUG: missing `className` means the style rule is dead on arrival (PR #1548)
- `.info` badge = neutral gray, reused for "disabled"/"auto-created" states; distinct semantic badges (`.success`, `.autoOrigin`, `iblUnassigned`, entity-type pills) should get their own variant only when the semantic meaning truly differs from `.info`/`.error`/`.warning`
- Entity type pills: WI = `--color-status-in-progress-*`; HI = `--color-hi-status-scheduled-*`; use `--radius-full`
- `iblUnassigned` Badge class: `--color-status-not-started-bg` + `--color-text-muted` + `font-style:italic`

## SearchPicker / AreaPicker

- `SearchPicker.selectedDisplay` min-height is `2.5rem` (40px) — 4px below the 44px touch target; flag as a cross-cutting refinement item, not blocking for any single story
- AreaPicker: ancestor-path secondary line (reusing `.resultSecondary` from `SearchPicker.module.css`) is the sole hierarchy signal — drop em-dash indentation once ancestor path is shown; `title={ancestorPath}` for truncation disclosure; selected/collapsed chip shows bare name only
- `PhotoMetadataSidepanel`-style raw `SearchPicker<T>` usages that need hierarchy should be switched to the dedicated `AreaPicker` wrapper for consistency

## Refund / negative-money pattern (InvoiceDepositsSection — the canonical recipe)

- `InvoiceDepositsSection.tsx`/`.module.css` already has the exact "this row is money owed back, not owed" treatment: `Badge` with a `refund` variant (`.refund { background: var(--color-status-blocked-bg); color: var(--color-status-blocked-text); }`) + a sibling `<span>` with `.amountNegative { color: var(--color-danger-text-on-light) }` + `formatCurrency(-amount)` (literal minus sign). Any new UI showing `InvoiceDeposit`-shaped data with `entryType: 'refund'` must reuse this exact recipe (same Badge variant, same i18n key `budget:invoiceDetail.deposits.entryTypeLabels.refund`) rather than re-deriving it — confirms the general rule already in this file's Quick-reference section (pair red text with a real Badge label + minus sign).

## Pre-existing a11y/styling gaps (do not request-changes on these — flag as pre-existing/refinement)

- `FormError variant="field"` renders a `<div>` with NO `role="alert"` (only `variant="banner"` gets it); `SearchPicker` has no `aria-invalid` prop. Consistent across `InvoiceLinkModal`, `PaperlessInvoiceReviewPage`, `InvoiceDetailPage` — established pattern, not a per-PR blocker
- `role="status"` already implies `aria-live="polite"` — never add both; use `role="status" aria-atomic="true"`
- `aria-controls` pointing at a conditionally-rendered target that's never in the DOM at the same time as the trigger — keep both in DOM, toggle with `hidden`, update `aria-expanded` dynamically (RECURRING A11Y BUG)
- A raw `<p>`/other non-dt/dd element as a direct child of `<dl>` violates the HTML `dl` content model (only `dt`/`dd` groups, optionally `div`-wrapped, plus script-supporting elements are allowed) — low-severity/informational; browsers and most AT tolerate it but flag as a refinement (seen in BackupsPage scheduler status, PR #1834 — traced back to my own issue #1804 spec)
- `InvoicesPage.tsx`'s `invoiceStatusVariants` sets `className: styles[status]!` where `styles` = `InvoicesPage.module.css` — but `.pending`/`.paid`/`.claimed`/`.quotation` are actually defined in `Badge.module.css`, not `InvoicesPage.module.css` (confirmed via grep — zero matches). So the invoice status badge on `/budget/invoices` renders with `className: undefined` today — bare `.badge`, no color at all — while the *same* statuses on `InvoiceDetailPage`/`InvoiceDepositsSection` correctly resolve local classes. Classic "missing className = dead on arrival" (PR #1548 pattern) that nobody caught because a colorless badge still renders *something*. Flagged in Issue #2046 spec as a recommended same-PR fix (not a hard blocker) since #2046 touches this exact render path and depends on the badge being legible.

## Related topic files

- [photo-annotator-patterns.md](photo-annotator-patterns.md) — PhotoAnnotator toolbar/shapes/dark-surface conventions + Story #1478 a11y audit
- [cost-breakdown-patterns.md](cost-breakdown-patterns.md) — CostBreakdownTable toolbar/filter patterns
