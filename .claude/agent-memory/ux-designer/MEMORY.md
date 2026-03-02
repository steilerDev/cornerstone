# UX Designer Memory

> This file is loaded into the ux-designer agent's system prompt. Keep it under 200 lines.

## Design System

- Token source: `client/src/styles/tokens.css` (3-layer: palette -> semantic -> dark mode)
- Shared classes: `client/src/styles/shared.module.css` (buttons, etc.)
- Style Guide wiki: `wiki/Style-Guide.md`
- Always reference Layer 2 semantic tokens (e.g. `var(--color-bg-primary)`) in CSS Modules
- Never use hardcoded hex values or Layer 1 palette tokens in `.module.css` files

## WorkItemDetailPage Patterns (client/src/pages/WorkItemDetailPage/)

- Two-column grid at desktop (>= 1024px), single column below
- Section card: `background: var(--color-bg-primary); border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 1.5rem`
- Budget section is in the LEFT column; Notes/Subtasks/Constraints in the RIGHT column
- `netCostRow` pattern (lines 936–958): flex row, `--color-bg-secondary` bg, summary financial values — label left, value right-aligned
- `budgetSubsection` pattern: `border-top: 1px solid var(--color-border); padding-top: 1.25rem` for sub-sections within Budget
- `budgetValueHighlighted`: green (`--color-success-text-on-light`), font-weight 700, 18px — used for positive financial highlights
- `confidenceBadge` + `.confidenceHigh`: pill shape chips, `--color-success-badge-bg`/`--color-success-badge-text`
- Currency formatting: `new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })` — German locale (period thousands, comma decimal, € prefix)

## Subsidy Payback Spec (Issue #343)

- Payback row placed BETWEEN budget totals summary and budget lines list
- Use success-family tokens (--color-success-bg, --color-success-border, --color-success-text-on-light) for green positive-money framing
- Per-subsidy chips: pill shape, `--color-success-badge-bg`, `--color-success-badge-text`, `--radius-full`
- When payback = 0: use muted netCostRow style with helper text, background = `--color-bg-secondary` (NOT tertiary)
- When no non-rejected subsidies: do not render the row at all
- Dynamic updates (aria-live="polite" aria-atomic="true") needed on the amount span
- Label: `var(--color-text-muted)` + `var(--font-size-sm)` + `var(--font-weight-medium)`
- Amount: `var(--font-size-base)` (16px, NOT 14px) for visual hierarchy above label

## PR #344 Review Findings (for impl reference)

Common token mistakes in this PR to watch for in future reviews:

- Hardcoded `0.875rem` instead of `var(--font-size-sm)` — very common
- Hardcoded `0.75rem` instead of `var(--font-size-xs)`
- Hardcoded `0.375rem` instead of `var(--radius-md)`
- `0.25rem` used for `--spacing-1`, `0.375rem` for `--spacing-1-5`, `0.5rem` for `--spacing-2`
- Layer 1 palette token `var(--color-blue-600)` used in dark mode component override instead of semantic `var(--color-primary)`
- Hardcoded `transition: opacity 0.15s ease` instead of `var(--transition-normal)`
- Chips shown only when `> 1` instead of `> 0` (hiding single-item breakdowns)
- `--color-bg-tertiary` used where spec calls for `--color-bg-secondary` (tertiary is for code blocks/inset)
- `var(--color-text-secondary)` used where spec calls for `--color-text-muted` (secondary is darker/more prominent)

## Shell Quoting — gh CLI

- When posting long GitHub comments with special chars (backticks, CSS var() calls, box-drawing chars, angle brackets), write the body to `/tmp/spec.md` and use `--body-file /tmp/spec.md` instead of inline `--body "..."`
- Inline `--body` breaks on CSS `var(--token)` syntax and Unicode box-drawing characters

## Token Verification

- `--color-success-text-on-light` dark mode = `#6ee7b7` (emerald-300) — contrast ~5.2:1 on dark success bg — passes WCAG AA
- Budget bar tokens live in tokens.css Layer 2 (e.g. `--color-budget-claimed`, `--color-budget-paid`)
- Gantt and milestone tokens also in tokens.css — check before specifying new domain-specific colors

## GanttTooltip Patterns

- Tooltip uses inverse surface (`--color-bg-inverse`): dark surface in light mode, light surface in dark mode
- On inverse surface, text uses `--color-text-inverse`
- Component-level `[data-theme='dark']` overrides are used here because the inverse surface itself flips
- "View item" touch affordance: `var(--color-blue-200)` on inverse dark surface is a justified palette token use (no semantic alias for "link on dark inverse surface"), but document the rationale

## GH PR Review Note

- Cannot `--request-changes` on own PRs — use `--comment` instead; note in review body that it would have been request-changes

## Story 8.3 — Document Browser Spec Decisions (Issue #356)

- Grid: 3-col desktop / 2-col tablet / 1-col mobile; 2-col in modal embed
- Detail view: Inline accordion expand (grid-column: 1 / -1), not sidebar/modal
- Loading: Skeleton shimmer cards (not spinner text); `--color-bg-tertiary` + `--color-bg-hover` gradient; static fallback under `prefers-reduced-motion`
- Mode prop: `mode="page" | "modal"` — modal constrains height, uses 2-col, adds `onSelect` callback + "Select" button in detail panel
- Tag filter chips: `role="group"` + `role="checkbox"` + `aria-checked`; active state uses `--color-primary-bg` / `--color-primary-badge-text`
- Not-configured state: informational (neutral tokens), not error (red tokens)
- File structure: `DocumentBrowser/` component + `DocumentCard/` + `DocumentDetailPanel/` + `DocumentSkeleton/`
- No new tokens needed for this component

## Reusable Browser-in-Modal Pattern

WorkItemPicker (`client/src/components/WorkItemPicker/`) is the existing reference for search-as-you-type inline pickers. DocumentBrowser is a richer version of that pattern — a full grid browser rather than a dropdown list.

## Story 8.4 — Document Linking Spec (Issue #357)

- Documents section: full-width panel BELOW the two-column contentGrid, ABOVE the footer
- Linked doc display: mini-card strip using CSS Grid `auto-fill minmax(180px, 1fr)` — NOT the full DocumentCard (different semantics)
- Card action tray: View / Open in Paperless / Unlink — tray uses `--color-bg-secondary` background with `border-top: 1px solid var(--color-border)`
- Unlink confirmation: uses `.btnDanger` (outline red, not `.btnConfirmDelete` solid red) — unlinking is reversible
- Picker modal: wide (860px max), not the default 28rem `.modalContent` size — `min(860px, calc(100vw - 2rem))`
- Single-click document selection in modal (no separate confirm step) — linking is reversible via Unlink
- Not-configured banner: neutral tokens (`--color-bg-secondary`, `--color-border`) NOT `--color-primary-bg` which is blue-tinted
- Count badge in heading uses `--color-bg-tertiary` + `--color-text-muted` (neutral pill, not status-colored)
- Skeleton: show 2 cards (not spinner text); uses same shimmer as DocumentSkeleton from 8.3
- `srAnnouncement` visually-hidden live region announces "Document linked: title" / "Document unlinked: title"
- Mobile modal: full-viewport sheet (width:100vw; height:100vh; border-radius:0) at < 768px

## PR #364 Review Findings — Document Browser (for future reference)

Common misses in this PR to watch for in card/grid components:

- Card border: 1px NOT 2px (2px over-weights unselected state)
- `aria-pressed` vs `aria-expanded`: pressed = toggle; expanded = discloses a region
- Selected state glow: `0 0 0 2px var(--color-primary-bg)` NOT `var(--shadow-focus)` (focus ring is for keyboard only)
- Breakpoint overlap: `max-width: 1024px` + `min-width: 1024px` — use 1023px upper for tablet
- Grid gap per breakpoint: desktop `--spacing-6`, tablet `--spacing-5`, mobile `--spacing-4`
- Tag/pill `border-radius`: always `var(--radius-full)` — never `0.25rem`
- Missing `prefers-reduced-motion` on any component with a looping CSS animation (shimmer, pulse)
- `aria-controls` + `id` pairing: search input → results container
- `aria-label` on tag chips must describe count meaningfully ("5 documents"), not raw number
- `:focus-visible` missing on secondary/utility buttons (closeButton, retryButton, pageButton)
