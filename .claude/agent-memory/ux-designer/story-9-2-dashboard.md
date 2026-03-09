# Story 9.2 — Dashboard Layout & Data Shell (Issue #471)

## File Structure

```
client/src/pages/DashboardPage/
  DashboardPage.tsx              (replace placeholder)
  DashboardPage.module.css       (replace placeholder)
  DashboardCard.tsx              (new — local sub-component, NOT in components/)
  DashboardCard.module.css       (new)
  useDashboardData.ts            (new — parallel fetch hook)
  useDashboardPreferences.ts     (new — hidden cards persistence hook)
```

DashboardCard is local to DashboardPage — never extract to shared `components/`.

## Grid Layout

- Desktop ≥1024px: 3-col, gap `--spacing-6`, padding `--spacing-8`
- Tablet 768–1023px: 2-col, gap `--spacing-5`, padding `--spacing-6`
- Mobile <768px: 1-col, gap `--spacing-4`, padding `--spacing-4`
- max-width: 1200px, margin: 0 auto

## Card Anatomy

- Card element: `<article aria-labelledby="card-{id}-title">`
- Card title: `<h2>` (NOT h3 — primary page sections)
- Card shape: `background: var(--color-bg-primary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm)`
- Header: `padding: var(--spacing-4) var(--spacing-5); border-bottom: 1px solid var(--color-border)`
- Body: `padding: var(--spacing-5)`
- Footer: `padding: var(--spacing-3) var(--spacing-5); border-top: 1px solid var(--color-border); background: var(--color-bg-secondary)`
- Card title font: `var(--font-size-sm)` + `var(--font-weight-semibold)` + uppercase + `--color-text-secondary`
- Footer link font: `var(--font-size-xs)` + `--color-primary`

## Dismiss Button

- 28px × 28px visual; min 44×44px touch target at ≤1023px
- `aria-label="Hide [Card Name] card"`
- Colors: muted by default, text-secondary on hover, bg-hover background

## Skeleton Pattern

- shimmer uses `--color-bg-tertiary` base + `--color-bg-hover` highlight band
- Under `prefers-reduced-motion`: static `--color-bg-tertiary`, animation: none
- Wrapper: `role="status" aria-label="Loading [Card Name] data"`
- Header and footer remain visible during skeleton — skeleton replaces body only

## Error State

- Body replaced: warning icon (`--color-danger`) + message (`--color-text-muted`) + Retry button
- Retry: use `composes: btnSecondaryCompact` from shared.module.css
- `aria-label="Retry loading [Card Name] data"`
- Mobile: min-height 44px on Retry button

## Empty State

- Body replaced: label (`--color-text-muted`, `--font-size-sm`) + contextual CTA link (`--color-primary`, `--font-size-xs`)
- No icon in empty state (minimalist)

## Customize Control

- Show "Customize" button only when ≥1 card is hidden (hide button entirely otherwise)
- Popover anchors bottom-right of button, `z-index: var(--z-dropdown)`
- Popover: `role="dialog" aria-label="Customize dashboard cards"`, each show button: `aria-label="Show [Name] card"`
- Focus management: open → focus first Show button; Escape → return focus to Customize button
- Popover close: Escape key or outside click

## Preference Key

`dashboard.hiddenCards` (array of card ID strings) via preferences API.

## Card Entrance Animation

- `cardFadeIn`: translateY(8px) → 0, opacity 0 → 1, `--transition-slow`
- Staggered nth-child delays: 0/100/200/300/400ms
- Under `prefers-reduced-motion`: animation: none

## Live Region

`aria-live="polite" aria-atomic="true"` announces "Budget card hidden" / "Budget card shown".

## No New Tokens

All values covered by existing Layer 2 semantic tokens.

## Card Footer Link Targets

| Card ID          | href                       |
|------------------|----------------------------|
| `budget`         | `/project/overview`        |
| `timeline`       | `/project/milestones`      |
| `budget-sources` | `/budget/sources`          |
| `subsidies`      | `/budget/subsidies`        |
| `invoices`       | `/budget/invoices`         |

## PR #709 Review Findings (for impl correction reference)

- `<div>` + `<h3>` used instead of required `<article aria-labelledby>` + `<h2>`
- Skeleton `aria-label="Loading"` must include card name: `aria-label={\`Loading ${title} data\`}`
- Dismiss button reduced to 40×40px on tablet/mobile — must stay 44px at all sizes ≤1023px
- Grid gaps off by one step: desktop needs `--spacing-6`, tablet `--spacing-5`, mobile `--spacing-4`
- max-width is 1400px — spec says 1200px
- Tablet breakpoint uses `max-width: 1024px` — must be `1023px` (recurring pattern)
- Skeleton gradient: `--color-bg-secondary` base used instead of `--color-bg-tertiary`
- Missing `prefers-reduced-motion` guard on shimmer `@keyframes`
- `retryButton` duplicates `btnPrimary`; spec says compose `btnSecondaryCompact`
- `customizeButton` uses `--color-bg-tertiary` (code block token); use `--color-bg-secondary` or compose `btnSecondary`
- `reEnableButton:focus-visible` uses non-standard inset shadow; must use `var(--shadow-focus)` (outset)
