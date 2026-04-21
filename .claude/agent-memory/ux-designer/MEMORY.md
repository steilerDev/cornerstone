# UX Designer Memory

> This file is loaded into the ux-designer agent's system prompt. Keep it under 200 lines.

## Design System

- Token source: `client/src/styles/tokens.css` (3-layer: palette -> semantic -> dark mode)
- Shared classes: `client/src/styles/shared.module.css` (buttons, etc.)
- Style Guide wiki: `wiki/Style-Guide.md`
- Always reference Layer 2 semantic tokens (e.g. `var(--color-bg-primary)`) in CSS Modules
- Never use hardcoded hex values or Layer 1 palette tokens in `.module.css` files

## PR #792 Review Findings — Budget Sources Bar Chart

- `color-mix()` in inline `style` prop bypasses token system — dark mode override in `[data-theme="dark"]` cannot reach it; allocate a named token instead
- Legend dot `8px` = `var(--spacing-2)` — always swap raw px dot sizes to the nearest spacing token
- `role="status"` already implies `aria-live="polite"` — do not add both; use `role="status" aria-atomic="true"`
- Inverse-surface tooltip (`--color-bg-inverse` / `--color-text-inverse`) works automatically via semantic token flipping — no `[data-theme="dark"]` block needed (unlike GanttTooltip which has local subdued-color properties)
- `--color-border-strong` as text `color` for a pipe character is a semantic mismatch; `--color-text-muted` is more appropriate for separator text

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

## PR #380 Review Findings — Responsive & Accessibility Polish (Story 8.7)

Key observations for future a11y polishing PRs:

- `0.625rem` tag font (10px) has no token — `var(--font-size-xs)` (12px) is nearest; deviation accepted
- `transition: all` on buttons — flag informational; prefer explicit properties list
- Skeleton items inside `role="list"` should have `role="listitem"` even if `aria-hidden="true"` (not a blocker)
- ARIA focus trap: `useEffect` + `setTimeout(0)` + keydown Tab/Shift+Tab intercept = correct pattern
- Reduced-motion guards: audit ALL selectors with `transition` in the file, not just newly-added ones

## Token Scale Gaps (document for spec writing)

- `0.625rem` (10px) — no font-size token; nearest is `var(--font-size-xs)` = 12px
- `2.5rem` (40px) — no font-size token; nearest is `var(--font-size-4xl)` = 32px (or keep literal)
- `1.75rem` (28px) — no token; falls between `--font-size-2xl` (24px) and `--font-size-3xl` (30px)

## Story 4.3 — Household Items List Page (Issue #389)

- New amber badge tokens required: `--color-status-in-transit-bg` + `--color-status-in-transit-text` (Layer 2 + Layer 3 in tokens.css)
- Status badge token mapping: Not Ordered→not-started, Ordered→in-progress, In Transit→in-transit (new), Delivered→completed
- Category badge: use `--color-role-member-bg` / `--color-role-member-text` (neutral gray pill)
- Table vs card breakpoint: `< 768px` shows cards, `>= 768px` shows table (matches WorkItemsPage)
- Tablet (768–1024px): hide "Expected Delivery" and "Room" columns
- Cost formatting: German locale (`de-DE`, EUR) — consistent with WorkItemDetailPage
- Sidebar already has "Household Items" nav link — no sidebar changes needed
- WorkItemsPage.module.css has many hardcoded values — do NOT copy them; spec must use tokens
- Empty state split: "no items exist" (icon + CTA) vs "filtered empty" (text + clear filters link, no icon)
- `prefers-reduced-motion`: wrap all transitions in a media query guard in the CSS module

## PR #398 Review Findings — Household Items List Page

Key misses to watch for in list-page PRs:

- Entire CSS module used hardcoded literals for spacing/font/radius/transition — every value must use tokens
- New token family amber in-transit: Layer 2 `:root` used `#fef3c7` and `#92400e` directly — must be Layer 1 palette refs; need `--color-amber-100`, `--color-amber-800`, `--color-amber-300` added to Layer 1
- Layer 3 dark mode in-transit text `#fcd34d` also hardcoded — use `var(--color-amber-300)`
- Buttons (primaryButton, secondaryButton, cancelButton, confirmDeleteButton) fully duplicated from shared.module.css — use `composes:` instead
- modal/modalBackdrop/modalContent/modalActions/loading/emptyState also duplicated from shared.module.css
- `secondaryButton:hover` used `var(--color-border)` as background (border token, not bg token) — should be `var(--color-bg-hover)`; same bug exists in WorkItemsPage
- Sortable `<th>` elements need keyboard support + `aria-sort` attribute on active column
- Action menu button `aria-label="Actions menu"` too generic — must include item name
- `z-index: 1000` → `var(--z-modal)`; `z-index: 10` → `var(--z-dropdown)`
- Tablet breakpoint upper bound should be `1023px` not `1024px` to avoid overlap with desktop

## Stories 4.7–4.9 Key Patterns (see story-4-9-invoice-linking-hi.md for full spec)

- HI Detail: section cards use `border: 1px solid var(--color-border)` NOT `box-shadow: var(--shadow-sm)` for `.section`
- HI page card titles: `--font-size-xl` (20px); WI page section titles: `--font-size-lg` (18px)
- WorkItemPicker reused for searchable add; `<HouseholdItemStatusBadge>` reused for HI status
- srOnly live region announces link/unlink actions
- `--spacing-xs` / `--spacing-sm` are NOT valid tokens — use `--spacing-1` through `--spacing-16`
- `--color-warning-bg` does NOT exist; for warning bg use `--color-hi-status-in-transit-bg`
- RECURRING BUG: `outline: 2px solid var(--color-primary)` on focus-visible — always use `box-shadow: var(--shadow-focus)` (flagged PRs #402, #414)

## PR #399 Review Findings — HI Create & Edit Forms (APPROVED)

Model implementation — tokens used comprehensively. See `story-4-9-invoice-linking-hi.md` for HI domain patterns.

## Story 4.9 — Invoice Linking for HI Budget Lines (Issue #413)

See `story-4-9-invoice-linking-hi.md`. Spec: entity type toggle (`role="group"` + `role="radio"`), "Linked To" column in invoice list table (hidden at tablet). No new tokens needed.

## PR #414 Review Findings — Invoice Linking for HI (COMMENT)

- `outline: 2px solid var(--color-primary)` on `invoiceLink:focus-visible` — recurring mistake; always use `box-shadow: var(--shadow-focus)`
- Inline `Intl.NumberFormat('en-US', { currency: 'USD' })` in budget line dropdown — always use `formatCurrency()` from formatters.ts (EUR, not USD)
- Badge `padding: 2px 6px` hardcoded — use `var(--spacing-0-5) var(--spacing-1-5)`
- Spec entity type toggle not implemented (used plain separator div instead) — flag as spec deviation
- "Linked To" table column omitted from invoice list page — functional omission

## Story 4.10 — HI Timeline Dependencies (Issue #415)

See memory for key patterns. Amber tokens: `--color-hi-status-scheduled-bg/text` (NOT `in-transit`).
HI Gantt: amber circle marker (r=7px). Add Dep modal: 36rem wide.
`role="listbox"` requires arrow-key nav — use `role="list"` + `role="button"` items instead.
`--color-primary-text` on `--color-primary-bg` chip = contrast failure; use `var(--color-primary)` for text.

## DataTable Core (Issue #1099)

See `datatable-spec.md` for full token map. Key decisions:

- FilterPopover uses `position: fixed` + `getBoundingClientRect()` — avoids `overflow-x: auto` clipping
- Sort indicator: none=`var(--color-text-placeholder)`, active=`var(--color-primary)`; `aria-sort` on `<th>`
- Active filter icon: `color: var(--color-primary)` + `background: var(--color-primary-bg)` (no new tokens)
- Pagination min touch target: `min-width: 44px; min-height: 44px`
- Mobile (< 768px): cards layout, no column visibility toggle, simplified pagination (Prev/Next only)
- All strings under `common:dataTable.*` namespace
- No new design tokens needed

## DataTable Bug Fix Specs (#1135–#1140)

- Date range (#1135): `.filterDateInputConfirmed` = `border: var(--color-primary); bg: var(--color-primary-bg)`; range bridge pill uses `--color-primary-bg` + `--color-primary-badge-text`; auto-focus advance to "to" input
- Toolbar height (#1136): three controls (search, reset, col-settings) all set to `height: 36px; box-sizing: border-box`; column icon = 3-bar vertical SVG (16×16), NOT gear emoji; `min-height: 44px` only on mobile
- Number filter (#1139): existing `NumberFilter.tsx` visual is correct; fix is behavioral (`numberMin/Max/Step` props); compare mode uses existing `.filterSegmentedControl` classes
- Drag indicator (#1140): replace full-row `--color-primary` bg with `::before` pseudo-element insertion line (2px, `--color-primary`, `--radius-full`); add `e.dataTransfer.effectAllowed = 'move'` on dragstart; drag handle needs `tabIndex={0}` + arrow-key keyboard reorder for a11y

## Story 4.11 — HI Detail Inline Edit (Issue #467)

See `story-4-11-hi-detail-inline-edit.md` for full spec.

- 3 sections: Details → Dates & Delivery → Dependencies (all `.section` border-variant)
- Strikethrough target date: `.scheduleTargetStrikethrough` + `aria-label="Target date: [date]"` (screen readers don't read text-decoration)
- AutosaveIndicator CSS must be LOCAL COPY in HouseholdItemDetailPage.module.css
- Re-fetch required after saving `actualDeliveryDate` and `earliestDeliveryDate`
- Edit page scope: remove orderDate/earliestDeliveryDate/latestDeliveryDate/actualDeliveryDate/status

## PR #516 Review Findings — Unified Manage Page (Tags + Categories)

- WAI-ARIA tablist: arrow-key nav (ArrowLeft/Right/Home/End) + roving tabindex required
- `transition: all` on tabs: always explicit property list + prefers-reduced-motion guard
- Tablet breakpoint recurring: `max-width: 1024px` must be `1023px`

## Story 15.4 — Invoice Budget Lines Section (Issue #606)

Spec posted at https://github.com/steilerDev/cornerstone/issues/606#issuecomment-4020101918

Key decisions:

- Section placement: between Invoice Details card and LinkedDocumentsSection, full-width `.card`
- Edit modal: old WI/HI pickers removed entirely; modal may shrink from `modalContentWide` (48rem) back to default 28rem
- Remaining row: `var(--color-bg-secondary)` bg, `border-top: 2px solid var(--color-border-strong)` (double weight), italic label
- Remaining color: `var(--color-text-primary)` (>0), `var(--color-success-text-on-light)` (=0), `var(--color-danger-text-on-light)` (<0)
- HI vs WI entity type pill: use `var(--color-role-member-bg)` / `var(--color-role-member-text)` for "HI" discriminator chip
- Picker modal: `min(640px, calc(100vw - 2rem))` — between default and wide
- InvoiceDetailPage.module.css uses `box-shadow: var(--shadow-sm)` for cards (NOT `border: 1px solid`) — diverges from WorkItemDetailPage pattern

## Story 9.2 — Dashboard Layout & Data Shell (Issue #471)

See `story-9-2-dashboard.md`. Key: 3/2/1 col grid, card = `<article>`, skeleton replaces body only (header+footer always visible), Customize button only when ≥1 hidden card, no new tokens needed.

## AreaBreadcrumb + SearchPicker renderSecondary (Issue #1237)

- Breadcrumb tokens: `--font-size-xs`, `--color-text-muted` (no new tokens)
- Compact truncation: CSS `direction: rtl` + `unicode-bidi: plaintext` + `text-overflow: ellipsis` (no JS needed)
- Tooltip on compact: wrap in existing `Tooltip` component; add `tabIndex={0}` for touch/tap
- Null area: same muted style, NOT italic; plain `<span>` (no nav/ol)
- ARIA: `<nav aria-label="Area path"><ol>` with separator `<li aria-hidden="true">` for populated; plain `<span>` for null
- `color` field on AreaAncestor: ignore in breadcrumb (used by Badge elsewhere)
- SearchPicker `.resultSecondary`: `--font-size-xs`, `--color-text-muted`, `margin-top: --spacing-0-5`; omit from selectedDisplay
- Tooltip component already handles `onFocus`/`onBlur` — no new Tooltip behavior needed

## Issue #933 — DAV Access Card + Vendor Contacts

See `story-933-dav-vendor-contacts.md`. Token-once reveal panel: `role="status" aria-atomic="true"`. ContactCard is a new shared component. VendorContacts section placed between Vendor Info card and Invoices card.

## i18n Infrastructure (Story 17.1, Issue #916)

Zero new tokens, zero new CSS, zero new components. Text replacement only. Key review checks:

- `<html lang>` updated via `document.documentElement.setAttribute('lang', locale)` in LocaleContext (WCAG 3.1.1)
- German sidebar label "Haushaltsartikel" — verify no visual overflow at 240px sidebar width
- German currency trailing `€` with space may widen budget table cells — acceptable, no layout fix needed
- SearchPicker default prop strings (`placeholder`, `emptyHint`, etc.) replaced with `t()` — no CSS change
- Language selector UI is Story #917 (ProfilePage) — not this story
