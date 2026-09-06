---
name: DataTable Core Spec (Issue #1099)
description: Visual spec decisions for the shared DataTable component and all sub-components
type: project
---

# DataTable Core — Visual Spec Summary

Spec posted at: https://github.com/steilerDev/cornerstone/issues/1099#issuecomment-4101514019

## Key Design Decisions

### Table Container

- `background: var(--color-bg-primary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); overflow-x: auto`
- `overflow-x: auto` (not hidden) — wide tables scroll, not clip

### Table Header (thead)

- `background-color: var(--color-bg-secondary); border-bottom: 1px solid var(--color-border)`
- `th`: `padding: var(--spacing-3) var(--spacing-4)`, `font-size: var(--font-size-xs)`, `font-weight: var(--font-weight-semibold)`, `color: var(--color-text-muted)`, uppercase, `letter-spacing: 0.05em`
- Sortable headers: `<button>` inside `<th>`, flex row (label + icon), hover = `var(--color-primary-hover)`, active (sorted) = `var(--color-text-primary)`
- Sort icons: 16px SVG, none=`var(--color-text-placeholder)`, asc/desc=`var(--color-primary)`, `aria-hidden="true"`, `aria-sort` on `<th>`
- Filter icon button: 20×20px, `color: var(--color-text-placeholder)` default, active filter = `color: var(--color-primary)` + `background: var(--color-primary-bg)`

### Table Rows

- `td`: `padding: var(--spacing-4)`, `font-size: var(--font-size-sm)`, `color: var(--color-text-secondary)`
- Title cell: `font-weight: var(--font-weight-medium)`, `color: var(--color-text-primary)`
- Hover: `background-color: var(--color-bg-secondary)`; selected: `var(--color-primary-bg)`
- Focus-visible: `inset box-shadow: 0 0 0 2px var(--color-primary)` (inset avoids layout shift)

### Popovers (ColumnSettings + FilterPopover)

- `background: var(--color-bg-primary); border: 1px solid var(--color-border-strong); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); z-index: var(--z-dropdown)`
- ColumnSettings: `position: absolute; right: 0; min-width: 200px`
- FilterPopover: `position: fixed` (with JS-computed coords from `getBoundingClientRect()`) to avoid `overflow-x: auto` clipping
- Entrance animation: `popoverEnter` (opacity 0→1, translateY -4px→0, `var(--transition-normal)`), disabled under `prefers-reduced-motion`

### Pagination

- Pattern matches HouseholdItemsPage exactly: `border-top: 1px solid var(--color-border); padding-top: var(--spacing-4); margin-top: var(--spacing-6)`
- Button: `min-width: 44px; min-height: 44px` (WCAG 2.5.5 touch target)
- Active page: `background: var(--color-primary-hover); color: var(--color-primary-text)`
- Mobile (< 768px): Previous/Next only + "Page N of M" text; page numbers hidden

### Mobile Cards (< 768px)

- `tableContainer` hidden, `.cardsContainer` shown
- Card: `border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--spacing-4); box-shadow: var(--shadow-md)`, hover = `var(--shadow-lg)`
- Card header: `border-bottom: 1px solid var(--color-border); margin-bottom: var(--spacing-3)`
- Card title: `font-size: var(--font-size-base); font-weight: var(--font-weight-semibold)`
- Card rows: label `var(--color-text-muted); min-width: 80px`, value `var(--color-text-secondary)`

### Filter Components

- All inputs compose from `shared.module.css` `.input`
- BooleanFilter: segmented control (flex row, shared outer border, dividers), `role="group"`, active = `var(--color-primary-bg)` + `var(--color-primary)`
- EnumFilter: checkbox list, `accent-color: var(--color-primary)`, max-height 200px scrollable
- EntityFilter: thin wrapper around existing `SearchPicker` — no custom CSS needed

### Dark Mode

- All tokens flip automatically — no component-level `[data-theme="dark"]` blocks needed
- Date inputs: `color-scheme: light dark` needed globally for `[data-theme="dark"] input[type="date"]`

### No New Tokens Required

All visual properties map to existing Layer 2 semantic tokens.

## Component Reuse

- `Skeleton`: wrap `pageSize` rows inside `tableContainer`
- `EmptyState`: for "no data" state; separate custom `.filteredEmptyState` for "no results" state
- `SearchPicker`: used inside `EntityFilter` unchanged

## i18n Namespace

All strings under `common:dataTable.*` namespace. See full key map in spec comment.

## Expandable parent/child rows extension (Issue #2046)

Spec posted at: https://github.com/steilerDev/cornerstone/issues/2046#issuecomment-5559158229

- Must be opt-in/additive only — every existing `DataTable` consumer renders unchanged when the new prop isn't passed (no leading expand column, no extra markup at all, not just empty).
- Leading pseudo-column, fixed `44px`, NOT one of the page's `ColumnDef`s (exempt from `DataTableColumnSettings`). Rows with no children still reserve the same 44px cell (empty) so column alignment never jumps within one table.
- Reuse `InvoiceGroup.tsx`'s exact chevron recipe: `▼` text glyph (no icon asset), `.expandIconOpen { transform: rotate(-180deg) }`, `transition: transform var(--transition-normal)`.
- Toggle button is a real `<button>` (not a hand-rolled `onKeyDown` div like `InvoiceGroup`) — gets Enter/Space + focus-visible for free. `aria-expanded` + `aria-controls` pointing at the `id` of a `<tbody>` wrapping that parent + its children (multiple `<tbody>` per `<table>` is valid HTML). Click must `stopPropagation()` (same requirement as `renderActions` cells).
- Child `<tr>`s stay in the DOM always, toggled via the `hidden` attribute — never conditionally unmounted (keeps the `aria-controls` target always resolvable; matches the codebase's established "keep both in DOM, toggle with hidden" a11y pattern).
- Child row visual recipe: `background: var(--color-bg-secondary)` tint (not `--color-primary-bg`, that's reserved for selected-row), first/label cell `padding-left: var(--spacing-8)` (double base), amount cells drop to `color: var(--color-text-secondary); font-weight: var(--font-weight-normal)` (parent stays `--color-text-primary` + medium) — this weight/color drop plus indentation is the anti-double-counting signal for "this is a subset, not an addition."
- Mobile: same 44×44px expand button in `.cardHeader`; children nest *inside* the same card (not as separate top-level cards) via a `.childCardList` with `border-left: 2px solid var(--color-border-strong); padding-left: var(--spacing-3)` — kept modest at 320px specifically to avoid horizontal overflow.
- Disabling a single column's filter control (needed when a page-level toggle makes that filter contradictory) needs a new opt-in `disabledFilterKeys`-shaped prop on `DataTableHeader`/`ColumnDef` — doesn't exist yet as of #2046.
