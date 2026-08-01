# Component Notes (shared components, one-off component learnings)

## Inline SVG Logo Component (Story 12.2)

- `client/src/components/Logo/Logo.tsx` — keystone/arch motif
- Uses `currentColor` for fills (NO hardcoded hex in SVG attributes)
- `role="img"` + `aria-label="Cornerstone"` for accessibility
- `fillRule="evenodd" clipRule="evenodd"` for compound paths with transparent cutouts
- Drive colour via CSS class: `.logo { color: var(--color-sidebar-focus-ring); }` → sets currentColor
- Standalone `client/public/favicon.svg` uses explicit hex (no CSS in browser tabs)

## NavLink Active State (CSS Modules)

Use function form of className — never rely on React Router adding literal `active` class:

```tsx
className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
```

## Sidebar Footer Pattern (UAT fix, fix/dark-mode-inputs)

Structure: logoArea → sidebarHeader (close, mobile-only) → nav (flex:1, overflow-y:auto) → sidebarFooter. Footer has ThemeToggle + logout + projectInfo (version `__APP_VERSION__` + GitHub link). GitHub link adds 1 extra role="link" — Sidebar.test.tsx expects 10 total links (not 9). Button DOM order: close (0), ThemeToggle (1), logout (2).

## WorkItemPicker — onSelectItem prop (PR #131)

Added optional `onSelectItem?: (item: { id: string; title: string }) => void` prop.
Fires alongside `onChange(id)` in `handleSelect`. Use when you need the title (e.g. for pending chips).

WorkItemPicker extra props (backward compatible, added PR #137): `specialOptions?: { id: string; label: string }[]` + `showItemsOnFocus?: boolean`. Special options appear with italic styling. When value matches special option ID, renders italic display (no StatusBadge).

## Segmented Toggle Pattern (PR #131)

For direction toggles (e.g. "depends on" / "blocks"):

```tsx
<div className={styles.directionToggle} role="group" aria-label="Dependency direction">
  <button
    type="button"
    aria-pressed={dir === 'a'}
    onClick={() => setDir('a')}
    className={`${styles.directionButton} ${dir === 'a' ? styles.directionButtonActive : ''}`}
  >
    Label A
  </button>
  ...
</div>
```

CSS: `.directionToggle { display: flex; border-radius: 0.375rem; overflow: hidden; border: 1px solid var(--color-border-strong); }`. Active uses `--color-primary` bg + `--color-primary-text`. Buttons have `border-right: 1px solid var(--color-border-strong)` between siblings.

## DependencySentenceBuilder Component (PR #137)

Components: `client/src/components/DependencySentenceBuilder/`

- `dependencyVerbs.ts` — `verbsToDependencyType()`, `dependencyTypeToVerbs()`, `THIS_ITEM_ID = '__THIS_ITEM__'`
- `DependencySentenceBuilder.tsx` — sentence UI; `thisItemId` prop (real ID on detail page, THIS_ITEM_ID sentinel on create)
- `DependencySentenceDisplay.tsx` — groups deps by type into sentence headers; `onDelete(type, workItemId, title)`
- `index.ts` — barrel exports

Test fix: When sentence builder adds duplicate text (title in h1 AND slot2), use `getByRole('heading', { name, level: 1 })`. Always run Prettier on test file edits — multi-line assertions often exceed 100 chars.

## Toast System (Story 6.6, PR #253)

- `client/src/components/Toast/ToastContext.tsx` — `ToastProvider` + `useToast()` hook. Provider wraps App.tsx root. `useToast` throws if called outside provider.
- `client/src/components/Toast/Toast.tsx` — `ToastList` portal component (`createPortal` to `document.body`). Bottom-right fixed, z-index modal.
- App.tsx provider order: `<BrowserRouter><ThemeProvider><ToastProvider><AuthProvider>...{/* <ToastList /> here */}...</AuthProvider></ToastProvider></ThemeProvider></BrowserRouter>`
- Test-mock requirement when a page gains `useToast()` → see `testing-mocks.md`

## Budget Bar Components (feat/budget-hero-bar)

- `--color-budget-{claimed|paid|pending|projected|track|overflow}` tokens added to tokens.css (light + dark)
- `BudgetBar`: `client/src/components/BudgetBar/` — segments prop, maxValue, overflow, height, callbacks
- `BudgetHealthIndicator`: `client/src/components/BudgetHealthIndicator/` — resolves on-budget/at-risk/over-budget
- `Tooltip`: `client/src/components/Tooltip/` — wrapper div approach (NOT cloneElement — React 19 ESLint rule `react-hooks/refs` flags cloneElement when a ref is in scope); `display: contents` inner span for aria-describedby
- `BudgetBarSegment` and `BudgetBar` are exported from BudgetBar.tsx (no barrel index.ts needed for single-component dirs)

## DashboardCard Component (Story #471)

- `client/src/components/DashboardCard/DashboardCard.tsx` — reusable card shell for dashboard
- Props: `title`, `onDismiss`, `isLoading?`, `error?`, `onRetry?`, `isEmpty?`, `emptyMessage?`, `emptyAction?`, `children`
- CSS: `.card` (bg-primary, border, shadow), `.cardHeader` (flex between title and dismiss), `.cardTitle` (uppercase muted)
- Dismiss button: `aria-label="Hide {title} card"` — min-height 44px for touch
- Loading: 3 shimmer lines with gradient animation, `aria-busy="true"`
- Error: centered message + "Retry" button (uses `--color-primary` via `retryButton` class)
- Empty: centered message + optional link action
- Responsive: Desktop (5px pad) → Tablet (4px) → Mobile (4px)
- DashboardPage: 8 cards (budget-summary, budget-alerts, source-utilization, timeline-status, mini-gantt, invoice-pipeline, subsidy-pipeline, quick-actions)
- Preferences: `dashboard.hiddenCards` = JSON array of card IDs; parse + store in `hiddenCardIds` Set
- Customize dropdown: only shows when cards are hidden; "Show X" buttons re-enable cards
- Parallel data fetch: `Promise.allSettled([budgetOverview, budgetSources, subsidyPrograms, timeline, invoices])`
- Per-card state: `dataStates` Record<DataSourceKey, DataSourceState> with isLoading/error/isEmpty
- Card mapping: budget-summary/alerts → budgetOverview; source-utilization → budgetSources; timeline-status/mini-gantt → timeline; invoice-pipeline → invoices; subsidy-pipeline → subsidyPrograms; quick-actions → no data (always shows)
- Grid: 3-column desktop, 2-column tablet, 1-column mobile (all via CSS Grid)

## Lost `patterns.md` (dangling reference removed 2026-08-01)

MEMORY.md previously pointed at a `patterns.md` file that no longer exists in this directory. It reportedly covered: keyboard shortcuts hook, color contrast calculation (WCAG), dropdown click-outside handler, modal overlay pattern, inline item editing, API client full API, auth form pattern, URL state management with useSearchParams, debounced search input, responsive table/card layout, pagination with smart page numbers, React.lazy / code splitting, complex detail page data loading. If any of those patterns are needed, rediscover them from the current code (they are all implemented somewhere in `client/src/`).
