# UX Designer Memory

> This file is loaded into the ux-designer agent's system prompt. Keep it under 200 lines.

## Design System

- Token source: `client/src/styles/tokens.css` (3-layer: palette -> semantic -> dark mode)
- Shared classes: `client/src/styles/shared.module.css` (buttons, etc.)
- Style Guide wiki: `wiki/Style-Guide.md`
- Always reference Layer 2 semantic tokens (e.g. `var(--color-bg-primary)`) in CSS Modules
- Never use hardcoded hex values or Layer 1 palette tokens in `.module.css` files

## PhotoAnnotator Patterns (client/src/components/photos/PhotoAnnotator/)

- Tool palette: `role="toolbar"` wrapper; each button `.toolButton` / `.toolButtonActive`; `min-width/height: 44px`; `aria-pressed`; inline SVG icons (24×24, `stroke="currentColor"`); HighlightIcon uses `fill="currentColor"` (established precedent)
- Annotator dark-surface rgba values: `rgba(0,0,0,0.6)`, `rgba(255,255,255,0.4)` etc. in PhotoAnnotator.module.css are intentional photo-overlay hardcodes (pre-existing pattern); do NOT flag as token violations
- Font-size radiogroup: `role="radiogroup"` + `role="radio"` + `aria-checked`; buttons use `.fontSizeButton`/`.fontSizeButtonActive`; hover inside `prefers-reduced-motion` block (consistent with toolButton + strokeButton pattern)
- Inline text input (Story #1476): `.inlineTextInput` positioned absolute over canvas; focus managed via `requestAnimationFrame`; `aria-label` via `t('editText'|'editCallout')`; `z-index: 1000` is pre-existing (should be `var(--z-modal)`, refinement item); inline style should NOT duplicate CSS module's `min-width`/`z-index`
- TextIcon uses SVG `<text>` element (not stroked path) — inconsistent with stroke icon family; flag for polish pass
- Annotation colors in `ANNOTATION_COLORS` are intentionally hardcoded hex (not tokens) — marks must be theme-invariant; document this in any spec touching that file
- Draft shape visual: `stroke-dasharray: 6 4`, `opacity: 0.8`, `pointer-events: none` — use for ALL new shape types
- Arrow committed: `<line>` + `<marker>` with `fill="context-stroke"` so one defs entry covers all colors; arrowhead on commit only (not during draft)
- Ellipse selection handles: 4 cardinal points (N/S/E/W) not 8; Arrow/Line: 2 endpoint handles
- `context-stroke` SVG2 fill on marker = no dark mode override needed for arrowhead
- Mobile: `.toolGroup` gets `width:100%` + bottom border at `<640px` via existing media query — no new CSS needed for new buttons
- Fit-to-container scaling (fix #1705): `fitScale = min(containerW/intrinsicW, containerH/intrinsicH, 1.0)`; Stage gets `width={intrinsicW*fitScale}` `height={intrinsicH*fitScale}` `scaleX/Y={fitScale}`; KonvaImage keeps `width={intrinsicW}` `height={intrinsicH}`; cap at 1.0 prevents upscaling small photos
- `touch-action: none` on `.canvasArea` and `.svgOverlay` only — correctly scoped to canvas area; does NOT affect scroll outside the annotator
- `sizeDropdownSelect:focus-visible` uses `outline: 2px solid var(--color-focus-ring)` (inconsistent with `box-shadow: var(--shadow-focus)` convention) — pre-existing refinement item

## Story #1478 — Photo Annotator A11y Audit

See `annotator-a11y-audit.md` for full findings. Key items:

- Active button border must use `var(--color-primary-active)` + `border-width: 2px` (contrast 6.67:1 vs 2.25:1 with `--color-primary`)
- ToolPalette must use `min-height: 56px` not `height: 56px` (prevents font-size group from clipping)
- Color swatches need `padding: 10px; box-sizing: content-box` for 44px touch target
- 7 of 9 shape types missing live-region announcements — see i18n keys `shapeAddedRectangle` etc.
- Remove Escape handler from PhotoAnnotator; PhotoViewer owns annotator lifecycle
- `.inlineTextInput color: white` → `color: var(--color-text-inverse)`

## PR #792 Review Findings — Budget Sources Bar Chart

- `color-mix()` in inline `style` prop bypasses token system — allocate a named token instead
- Legend dot `8px` = `var(--spacing-2)` — always swap raw px dot sizes to nearest spacing token
- `role="status"` already implies `aria-live="polite"` — do not add both; use `role="status" aria-atomic="true"`
- `--color-border-strong` as text `color` for separator — use `--color-text-muted` instead

## WorkItemDetailPage Patterns

- Section card: `background: var(--color-bg-primary); border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 1.5rem`
- Currency: `new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })` — German locale

## Shell Quoting — gh CLI

- When posting long GitHub comments with special chars (backticks, CSS var() calls), write to `/tmp/spec.md` and use `--body-file /tmp/spec.md`

## Token Verification

- `--color-success-text-on-light` dark mode = `#6ee7b7` (emerald-300) — contrast ~5.2:1 on dark success bg — passes WCAG AA
- Budget bar, Gantt, and milestone tokens in tokens.css — check before specifying new domain-specific colors

## GanttTooltip Patterns

- Inverse surface: `--color-bg-inverse` / `--color-text-inverse`; needs component-level dark override because inverse surface itself flips
- `var(--color-blue-200)` on dark inverse surface is justified (no semantic "link on dark inverse" alias)

## GH PR Review Note

- Cannot `--request-changes` on own PRs — use `--comment` instead; note in review body

## Document Browser / Linking Patterns (Stories 8.3–8.7)

- Grid: 3-col desktop / 2-col tablet / 1-col mobile; 2-col in modal embed
- Tag chips: `role="group"` + `role="checkbox"` + `aria-checked`; `--color-primary-bg` active state
- Card border: 1px NOT 2px; `aria-pressed` for toggle, `aria-expanded` for disclosure
- Picker modal: `min(860px, calc(100vw - 2rem))` max-width override on `.modalContent`
- `0.625rem` (10px) has no font-size token — nearest `var(--font-size-xs)` = 12px

## Token Scale Gaps (spec writing)

- `0.625rem` (10px) — no font-size token; nearest `var(--font-size-xs)` = 12px
- `2.5rem` (40px) — no font-size token; nearest `var(--font-size-4xl)` = 32px
- `1.75rem` (28px) — no token; between `--font-size-2xl` (24px) and `--font-size-3xl` (30px)

## Common Token Mistakes (recurring across PRs)

- `0.875rem` → `var(--font-size-sm)`; `0.75rem` → `var(--font-size-xs)`; `0.375rem` → `var(--radius-md)`
- Layer 1 palette token in dark mode override → use semantic `var(--color-primary)` instead
- `transition: opacity 0.15s ease` → `var(--transition-normal)`
- `--color-bg-tertiary` where spec calls `--color-bg-secondary` (tertiary = code blocks/inset)
- `var(--color-text-secondary)` where spec calls `--color-text-muted` (secondary is darker)
- `outline: 2px solid var(--color-primary)` on focus-visible → ALWAYS use `box-shadow: var(--shadow-focus)`
- `secondaryButton:hover` with `var(--color-border)` background → should be `var(--color-bg-hover)`
- `z-index: 1000` → `var(--z-modal)`; `z-index: 10` → `var(--z-dropdown)`
- Tablet breakpoint upper bound: `1023px` not `1024px` to avoid overlap with desktop
- Action menu `aria-label="Actions menu"` too generic — must include item name
- Sortable `<th>` needs keyboard support + `aria-sort` attribute on active column
- All buttons duplicated from shared.module.css → use `composes:` instead

## HI / Invoice Patterns (Stories 4.3–4.10)

- `--spacing-xs` / `--spacing-sm` are NOT valid tokens — use `--spacing-1` through `--spacing-16`
- `--color-warning-bg` EXISTS in tokens.css (`#fff7ed`, dark: `rgba(251,146,60,0.1)`) — use it for warning banners
- HI Detail: section cards use `border: 1px solid var(--color-border)` NOT `box-shadow: var(--shadow-sm)`
- RECURRING BUG: `outline: 2px solid var(--color-primary)` on focus-visible — flagged PRs #402, #414

## PR #1490 — Measurement & Freehand Tools (APPROVED/comment)

See `pr-1490-measurement-freehand.md`. Medium: `labelAttrs { display:'none' }` dead code in render.ts — refinement item.

## Story 4.9 — Invoice Linking for HI Budget Lines (Issue #413)

See `story-4-9-invoice-linking-hi.md`. Entity type toggle (`role="group"` + `role="radio"`), "Linked To" column hidden at tablet.

## Story #1553 — Full Edit for Budget Lines (PR #1554 reviewed)

- `BudgetLineForm` parent-picker extends to edit path (not just unassigned): show collapsed "Linked item" row with "Change" button when `currentParentId` is set
- Entity type pill: WI = `--color-status-in-progress-*`; HI = `--color-hi-status-scheduled-*`; `--radius-full`
- Cross-table move hint: `role="status" aria-atomic="true"` (do NOT add `aria-live` separately)
- `--color-warning-bg` / `--color-warning` / `--color-warning-text-on-light` — all exist and have dark mode overrides
- Modal width: `min(540px, calc(100vw - 2rem))` for full-edit modal
- RECURRING A11Y BUG: `aria-controls` with conditional rendering — if the button and its target are in mutually exclusive branches, `aria-controls` referent never exists in DOM simultaneously. Fix: keep both in DOM, toggle with `hidden` prop, update `aria-expanded` dynamically.
- `parentPickerTab` and `modeBtn` in BudgetLineForm.module.css missing `:focus-visible` (pre-existing gap, WCAG 2.4.7 Medium)
- New i18n keys (namespace `budget`): `linkedItemLegend`, `changeParentButton`, `cancelChangeParentButton`, `moveButton`, `movingButton`, `moveCrossTableHint`, `moveCrossTableHintReverse`

## Story #1551 — Discretionary Funding + Auto-origin badge

- AutoItemizePage already has a per-line "Funding Source" `<select>` that pre-fills to discretionary — recommended informational note above `.lineList`, not a column
- Note style: `--color-primary-bg` bg, `--color-border` border, `3px solid --color-primary` left border, `--radius-md`, `--spacing-3 --spacing-4` padding — purely semantic tokens, dark mode handled automatically
- New `.autoOrigin` Badge variant: `--color-primary-bg` bg, `--color-primary-badge-text` text, `1px solid --color-primary` border — blue-tinted, distinct from `.info` (gray)
- `.info` badge already used for "Auto-created" assignment badge in AutoItemizePage; `.autoOrigin` is a separate semantic (data origin vs. assignment label)
- `BreakdownBudgetLine` shared type must expose `origin: 'manual' | 'auto'` — backend/shared coordination required
- `getSourceBadgeStyleKey(null)` returns `'sourceUnassigned'` (italic gray), `getSourceColorIndex(null)` returns `0`

## DiaryEntryForm Patterns (Story #1672)

- `daily_log` metadata section: `.metadataSection` with `background: var(--color-bg-secondary)`, `border: 1px solid var(--color-border)`, `border-radius: var(--radius-md)`, `padding: var(--spacing-4)`
- `.formRow` uses `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))` — do NOT use this for time pickers; use explicit `.formRowTwoCol` (`1fr 1fr`) so columns never wrap on tablet
- Vendor selector: use `SearchPicker` with `showItemsOnFocus`; `fetchVendors({ q: query, pageSize: 20 })` as `searchFn`; `id` prop flows to inner `<input>` for label association
- Time inputs: native `<input type="time" step="60">` reusing `.input` class; cross-field validation error goes BELOW the `.formRowTwoCol`, not inside either column; single `validationErrors.dailyLogWorkTime` key for both inputs
- Duration display: `role="status" aria-atomic="true"` (do NOT add redundant `aria-live`); conditionally rendered in DOM (not hidden); `font-weight: var(--font-weight-semibold)` on value
- `DiaryMetadataSummary` daily_log branch: vendor, start, end, duration all render as plain `.item` spans; no new CSS; duration computed client-side (not stored in metadata)
- `DailyLogMetadata` type needs: `vendorId?: string | null`, `vendorName?: string | null` (server-side denormalized), `workStart?: string | null`, `workEnd?: string | null`
- Check for i18n key collision: `form.vendor` already exists for delivery entry type — use `form.dailyLogVendor` if label differs

## Story #1679 — Paperless-first Invoice Creation (spec posted)

- Picker modal: `max-width: min(900px, calc(100vw - 2rem))`, `height: min(700px, calc(100vh - 4rem))`, flex column; mobile: full-screen with `border-radius: 0`
- Correspondent filter: `SearchPicker` with `showItemsOnFocus`, `max-width: 220px` at desktop, full-width at mobile — lives in wrapper component, NOT inside `DocumentBrowser`
- `DocumentBrowser` new props: `defaultHideLinked?: boolean`, `onOpenInPaperless?: fn`, `paperlessUrl?: string | null`
- Hide-linked toggle: change from `{linkedDocumentIds.length > 0 && ...}` to `{linkedDocumentIds !== undefined && ...}` for always-visible when prop provided
- "Open in Paperless" per-card: `<a>` anchor, `target="_blank" rel="noopener noreferrer"`; `opacity: 0` on card, `opacity: 1` on `.card:hover`/`:focus-within`; always opaque on mobile; wrapped in `@media (prefers-reduced-motion: no-preference)` for transition
- LLM vendor suggestion: reuse existing `SuggestionBadge` (NOT a new Badge variant) — same pattern as invoiceNumber/date/notes suggestions in AutoItemizePage
- Vendor field required error: `SearchPicker` + `aria-invalid="true"` + `FormError variant="field"` below picker
- New wrapper component: `InvoicePaperlessPickerModal` at `client/src/components/invoices/` (justified — invoice-creation-specific chrome + reusable)
- "Open in Paperless" URL pattern: `{paperlessUrl}/documents/{document.id}/details` (matches DocumentDetailPanel existing pattern)

## PR #1681 — Paperless Invoice Picker (CHANGES_REQUIRED)

- `--color-danger-text` = white (text ON danger bg) — NEVER use as border or text on `--color-danger-bg`; use `--color-danger-border` for border and `--color-danger-text-on-light` for red text on light bg
- RECURRING BUG: when a page is refactored from a source page, CSS class migration is often incomplete — always grep all `styles.*` references in TSX against defined classes in the module to catch missing definitions
- Inline `style={{ backgroundColor: 'var(--token)' }}` bypasses stylelint; use `data-level` attribute + CSS attribute selectors instead
- GH PR review `--comment` via `--body-file` still fails silently; use `gh api repos/.../issues/{N}/comments` instead (issues API works for PR comments)
- z-index: `z-index: 1` on absolute overlays inside card should be `var(--z-dropdown)` — prevents stacking collision with other card overlays (e.g. unlink button from #1680)

## Story #1545 — Unassigned IBL + One-Shot Parent Assignment (PR #1548)

- `iblUnassigned` Badge class: `--color-status-not-started-bg` + `--color-text-muted` + `font-style:italic` — distinguishes from work-item "not_started" badge
- IBL table `tdLinkedItem` cell: `display:flex; align-items:center; gap:var(--spacing-2)` wrapper (`unassignedCell`) holding badge + inline "Assign…" ghost button
- Parent picker section in BudgetLineForm: inset panel with `--color-bg-tertiary` bg + `--color-border` border + `--radius-md`
- Modal width for edit with picker visible: `min(640px, calc(100vw - 2rem))`
- Focus auto-advance: use `requestAnimationFrame` (not `setTimeout`) for React 19 concurrent rendering
- RECURRING BUG pattern: `BadgeVariantMap` entries must include BOTH `label` (translated) AND `className` (CSS module class) — missing className means the CSS variant rule has no effect; missing i18n means hardcoded English text visible to users. PR #1548 shipped `UNASSIGNED_BADGE_VARIANTS` without `className: badgeStyles.iblUnassigned` — the `.iblUnassigned` style rule was dead on arrival.
