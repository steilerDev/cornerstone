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

- HI Gantt visual: amber circle marker (r=7px), NOT a bar or diamond — zero-duration node
- 5 new Gantt tokens: `--color-gantt-hi-fill`, `--color-gantt-hi-stroke`, `--color-gantt-hi-delivered-fill`, `--color-gantt-hi-delivered-stroke`, `--color-gantt-hi-hover-glow` (both layers in tokens.css)
- Amber fills reference existing palette: `var(--color-amber-100)` / `var(--color-amber-800)` / `var(--color-amber-300)` (already in Layer 1)
- Calendar HI badge: pill shape, reuses `--color-hi-status-in-transit-*` and `--color-hi-status-delivered-*` (NO new calendar tokens)
- Dependency row: reuses `budgetLineItem` / `subsidyItem` pattern from HouseholdItemDetailPage.module.css
- "Floored to today" late indicator: `--color-hi-status-in-transit-bg` / `--color-hi-status-in-transit-text` (amber)
- Add Dependency modal: 36rem max-width (wider than standard 28rem), entity type toggle = `role="radiogroup"`
- HI tooltip kind: `kind: 'household-item'` extending GanttTooltipData discriminated union
- GanttSidebar UnifiedRow gains `kind: 'householdItem'` variant
- HI rows appear AFTER work items, sorted by earliestDeliveryDate (same principle as milestones by targetDate)
- `srAnnouncement` live region: "Dependency added: [name]" / "Dependency removed: [name]"
- `HouseholdItemDetailPage.module.css` `prefers-reduced-motion` block must be extended to cover new dep section elements

## PR #416 Review Findings — HI Timeline Dependencies (Story 4.10)

Key misses to watch for in Gantt/detail-page dependency PRs:

- `--color-primary-text` (white in light mode) used on `--color-primary-bg` (light blue) chip — contrast failure; always use `var(--color-primary)` for text on `--color-primary-bg` tinted chips
- `depSearchOptionSelected` same mistake — selected state bg is `--color-primary-bg`, text must be `var(--color-primary)` not `--color-primary-text`
- `role="dialog"` modal with no focus trap and no initial focus — `autoFocus` on first input is the minimum acceptable fix
- `role="listbox"` + `role="option"` requires arrow-key keyboard navigation; without it use `role="list"` + `role="button"` items instead
- Tooltip HI status badge hardcoded amber color regardless of delivered state — status-conditional token selection required
- "Floored to today" heuristic: spec uses `isLate` flag from scheduling engine; date-string equality to today is a fragile approximation (PR #457 correctly switched to `isLate`)
- `showToast()` alone is insufficient for spec-required `aria-live="polite"` srAnnouncement — toast is visual, not reliable for screen-reader-only users

## HI Status Token Naming — CRITICAL CORRECTION

MEMORY.md previously referenced `--color-hi-status-in-transit-*` tokens. These DO NOT EXIST in tokens.css.
Correct amber tokens for "in transit / late / floored" states:

- `--color-hi-status-scheduled-bg` (light: `--color-amber-100`, dark: `rgba(245,158,11,0.2)`)
- `--color-hi-status-scheduled-text` (light: `--color-amber-800`, dark: `--color-amber-300`)

Broken usages as of PR #457 (pre-existing, need cleanup):

- `HouseholdItemDetailPage.module.css` `.lateChip` lines 1228–1229: uses `in-transit` tokens
- `GanttTooltip.module.css` `.detailValueFloored` line 320: uses `in-transit` token

## PR #457 Review Findings — HI Delivery Date Redesign

- `--color-hi-status-in-transit-*` used in lateChip — non-existent tokens (HIGH)
- modalOverlay uses `rgba(0,0,0,0.5)` and `z-index:1000` instead of `var(--color-overlay)` and `var(--z-modal)` (MEDIUM, pre-existing)
- `--color-danger-active` used for errorBanner text instead of `--color-danger-text-on-light` (LOW, pre-existing inconsistency)
- "Target Delivery (computed)" — parenthetical "(computed)" is dev-oriented language in a user-facing label (LOW)
