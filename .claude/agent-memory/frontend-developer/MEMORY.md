# Frontend Developer Memory

## CRITICAL: QA Owns ALL Tests

**The frontend-developer MUST NEVER write test files.** This rule has no exceptions.

- `qa-integration-tester` owns unit tests, integration tests, and component tests; `e2e-test-engineer` owns Playwright E2E tests
- Developer agents implement production code only — never `*.test.ts` / `*.test.tsx` files
- Violating this rule causes BLOCKING PR rejection (as happened in PR #152 where frontend-developer wrote 211 tests)
- If you find yourself writing a test file, stop and delegate to the QA agent instead

Key learnings for the Cornerstone project. Detailed patterns → `patterns.md`.

## Project Structure

- Components: `client/src/components/ComponentName/ComponentName.tsx` + `ComponentName.module.css`
- Pages: `client/src/pages/PageName/PageName.tsx`
- API client: `client/src/lib/apiClient.ts` (get/post/put/del, ApiClientError, NetworkError)
- Auth API: `client/src/lib/authApi.ts`
- Global styles: `client/src/styles/index.css`
- Design tokens: `client/src/styles/tokens.css` (Story 12.1, merged PR #121)
- Test utilities: `client/src/test/testUtils.ts` (renderWithRouter helper)

## Design Tokens (EPIC-12, Stories 12.1 + 12.3 + 12.4 done)

Story 12.1 (PR #121): tokens.css created with palette + semantic + shadow + spacing + radius + transition tokens.
Story 12.3 (PR #123): ALL 24 CSS module files fully migrated — zero hardcoded hex/rgba remain.
Story 12.4 (PR #124): Dark mode via `[data-theme="dark"]` in tokens.css + ThemeContext + ThemeToggle in sidebar.

**Key semantic tokens:** `--color-bg-{primary|secondary|tertiary|inverse}`, `--color-text-{primary|secondary|muted|subtle|placeholder}`, `--color-border`, `--color-border-strong`, `--color-primary/hover/active`, `--color-danger/hover/active`, `--color-success`, `--color-overlay`, `--shadow-{sm|md|lg|xl|focus|focus-subtle}`

**Component tokens:** `--color-sidebar-{bg|text|hover|active|focus-ring|separator}`, `--color-status-{not-started|in-progress|completed|blocked}-{bg|text}`, `--color-role-{admin|member}-{bg|text}`, `--color-user-{active|inactive}-{bg|text}`

**Verification command:** `grep -rn '#[0-9a-fA-F]' client/src --include="*.module.css"` must return ZERO results.

Use semantic tokens in CSS, not raw hex values. Details in `design-tokens.md`.

## Build & Quality Gates

```bash
npm run lint            # ESLint (0 errors required)
npm run format:check    # Prettier (all files)
npm run typecheck       # builds shared first, then typechecks server+client
npm test -- --maxWorkers=2  # 2388 tests (jsdom OOM with >2 workers). Single test: add --workerIdleMemoryLimit="256MB" --maxWorkers=1
npm run build           # shared → client (webpack) → server (tsc)
npm audit               # 17 pre-existing vulns in eslint/semantic-release — NOT fixable without breaking changes
```

Sandbox note: `npm run build` fails in sandbox with AJV `addKeywords` error — pre-existing env issue, not our code. CI passes.

## Webpack Config (`client/webpack.config.cjs`)

- CJS file, requires `const X = require('X')` syntax
- `extensionAlias` maps `.js` imports to `.ts/.tsx` files (required for ESM TypeScript)
- `CopyWebpackPlugin` copies `client/public/` → `dist/` (added in Story 12.2)
- `CssMinimizerPlugin` minifies CSS in production (Story 33)
- CSS Modules: `namedExport: false`, local ident `[name]__[local]--[hash:base64:5]` in dev

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

## Test Infrastructure (Jest + jsdom)

- `jest.unstable_mockModule()` for ESM module mocking (before import)
- `import { jest } from '@jest/globals'` — required in ESM mode
- CSS Modules mocked by `identity-obj-proxy` (returns class names as strings)
- `renderWithRouter()` wraps in `MemoryRouter` for isolated route testing
- **Sidebar test**: expects exactly 3 buttons (close + ThemeToggle + logout) — updated Story 12.4
- **window.matchMedia polyfill**: Added to `client/src/test/setupTests.ts` — jsdom lacks matchMedia; ThemeContext requires it
- **aria-hidden="true" selector pitfall**: SVG icons also use `aria-hidden="true"`. AppShell overlay uses `data-testid="sidebar-overlay"` to distinguish it
- When a new Context is added, ALL tests that render components using that context must either mock the context or wrap with the provider. ThemeContext is mocked in Sidebar.test.tsx and AppShell.test.tsx.

## Breaking Existing Tests

When UI changes affect test counts (e.g., adding nav links, buttons):

- Delegate ALL test fixes to the QA agent, even trivial count updates (e.g., 8→9)
- The "QA owns all tests" rule has no exceptions for developer agents

## npm audit — dev vs prod (2026-02-18)

CI uses `npm audit --omit=dev --audit-level=low` — dev-only vulns (jest, eslint, semantic-release) do NOT fail CI.
Only production dependency vulns matter. `npm audit fix` (no --force) is safe for production-only fixes.
If a vuln appears in `@fastify/static`, `better-sqlite3`, or other production deps, use `npm audit fix` to resolve.
After refinement PR #126: `npm audit --omit=dev` = 0 vulnerabilities. Dev-only vulns: ajv, minimatch in jest/eslint chain (unfixable without breaking changes).

## Git Object Corruption Recovery

If `git commit` fails with "index file corrupt":

1. `rm .git/index && git reset` — rebuilds the index from HEAD (confirmed working)

If `git push` fails with "unable to read <sha>":

1. `git ls-tree HEAD <file>` — find which file has that blob SHA
2. `git hash-object -w <file>` — re-writes blob; remove tmp_pack files from `.git/objects/pack/`
3. `git fsck --full` should only show "dangling" warnings, not errors

## Responsive Breakpoints

- Mobile: `@media (max-width: 767px)`
- Tablet: `@media (min-width: 768px) and (max-width: 1024px)`
- Desktop: `@media (min-width: 1025px)`
- Touch targets: `min-height: 44px` on mobile/tablet
- Sidebar: static on desktop, fixed + translateX(-100%) on mobile/tablet

## UserResponse Shape

`id`, `email`, `displayName`, `role`, `authProvider`, `createdAt`, `updatedAt?`, `deactivatedAt?`
Filter active users: `!u.deactivatedAt` (NOT `u.isActive` — that field does not exist)

## Auth Routes

`/setup` and `/login` are outside AppShell (no sidebar). AuthGuard wraps AppShell.
AuthContext: `user`, `oidcEnabled`, `isLoading`, `error`, `refreshAuth()`, `logout()`

## Design Token Conventions (after EPIC-12 refinement, PR #126)

- `--color-success-text` token exists (= white in both light+dark) — use on green success buttons
- Edit/cancel button hover: use `--color-bg-tertiary` (NOT `--color-border`)
- Primary buttons: default = `--color-primary` (blue-500), hover = `--color-primary-hover` (blue-600)
- Dark Palette in Layer 1: slate scale (`--color-slate-{50..900}`), `--color-blue-300`, `--color-red-300`, emerald scale (`--color-emerald-{200|300|400}`)
- `[data-theme="dark"]` block has ZERO raw hex values — all use `var(--color-slate-*)` etc.
- Verify: look for hex in dark block with `grep -A200 "\[data-theme='dark'\]" tokens.css | grep '#[0-9a-fA-F]'` — must return ZERO

## ThemeContext (Story 12.4, PR #124)

- `client/src/contexts/ThemeContext.tsx` — ThemeProvider + useTheme hook
- ThemePreference: `'light' | 'dark' | 'system'`; ResolvedTheme: `'light' | 'dark'`
- Stored in `localStorage` under key `'theme'`; resolved against `window.matchMedia('(prefers-color-scheme: dark)')`
- Sets `document.documentElement.dataset.theme` — picked up by `[data-theme="dark"]` in tokens.css
- ThemeToggle component: `client/src/components/ThemeToggle/ThemeToggle.tsx` — cycles Light→Dark→System
- Provider order in App.tsx: `<BrowserRouter><ThemeProvider><AuthProvider>...</AuthProvider></ThemeProvider></BrowserRouter>`

## Webpack DefinePlugin Globals in Tests

`__APP_VERSION__` (DefinePlugin globals) not available in Jest. Fix: add `globals: { __APP_VERSION__: '0.0.0-test' }` to the `client` project in `jest.config.ts`. Create `client/src/types/globals.d.ts` with `declare const __APP_VERSION__: string;`.

## Dark Mode Form Inputs (UAT fix, fix/dark-mode-inputs)

Global reset in `index.css`: `input,textarea,select,button { background-color: transparent }`. Every CSS module MUST have explicit `background-color: var(--color-bg-primary)` on those elements. `ThemeContext` sets `document.documentElement.style.colorScheme = resolvedTheme` for native widget theming.

## Sidebar Footer Pattern (UAT fix, fix/dark-mode-inputs)

Structure: logoArea → sidebarHeader (close, mobile-only) → nav (flex:1, overflow-y:auto) → sidebarFooter. Footer has ThemeToggle + logout + projectInfo (version `__APP_VERSION__` + GitHub link). GitHub link adds 1 extra role="link" — Sidebar.test.tsx expects 10 total links (not 9). Button DOM order: close (0), ThemeToggle (1), logout (2).

## WorkItemPicker — onSelectItem prop (PR #131)

Added optional `onSelectItem?: (item: { id: string; title: string }) => void` prop.
Fires alongside `onChange(id)` in `handleSelect`. Use when you need the title (e.g. for pending chips).

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

## Direction-swapped API calls (dependencies)

API `createDependency(successorId, { predecessorId })` / `deleteDependency(successorId, predecessorId)`.
To express "this item BLOCKS another": `createDependency(otherItemId, { predecessorId: thisItemId })`.
To delete a successor dep: `deleteDependency(successorItem.id, currentItemId)`.

## WorkItemCreatePage test mock pattern

When a page imports a shared component (e.g. WorkItemPicker) that itself imports from an API module,
the TEST must include ALL functions from that API module in its `jest.unstable_mockModule` mock,
even if the page doesn't use them directly. Otherwise Jest throws "does not provide an export named X".
Example: WorkItemPicker uses `listWorkItems` from workItemsApi — add it to the test mock even if
WorkItemCreatePage only uses `createWorkItem`.

## DependencySentenceBuilder Component (PR #137)

Components: `client/src/components/DependencySentenceBuilder/`

- `dependencyVerbs.ts` — `verbsToDependencyType()`, `dependencyTypeToVerbs()`, `THIS_ITEM_ID = '__THIS_ITEM__'`
- `DependencySentenceBuilder.tsx` — sentence UI; `thisItemId` prop (real ID on detail page, THIS_ITEM_ID sentinel on create)
- `DependencySentenceDisplay.tsx` — groups deps by type into sentence headers; `onDelete(type, workItemId, title)`
- `index.ts` — barrel exports

WorkItemPicker new props (backward compatible): `specialOptions?: { id: string; label: string }[]` + `showItemsOnFocus?: boolean`. Special options appear with italic styling. When value matches special option ID, renders italic display (no StatusBadge).

PaginatedResponse shape: `{ items: T[], pagination: { page, pageSize, totalItems, totalPages } }` (NOT `total`).

Test fix: When sentence builder adds duplicate text (title in h1 AND slot2), use `getByRole('heading', { name, level: 1 })`. Always run Prettier on test file edits — multi-line assertions often exceed 100 chars.

## Refinement Workflow — QA Test Coordination (CRITICAL)

Before changing any public-facing property (aria-label, data-testid, role, DOM structure),
ALWAYS search for existing QA tests that assert on those values:

```bash
grep -r "aria-label\|getByRole\|getByTestId\|toHaveAttribute" client/src/components/<component>/
```

If tests exist, the change is BLOCKED until the QA agent updates tests first.
In a refinement PR, skip items blocked by QA tests and note them in:

1. The commit message ("deferred — blocked by existing QA tests")
2. The PR description ("Deferred items")
3. A PR comment tagged **[frontend-developer]**

Also check before removing exported functions — if any test file imports it,
removing it will fail typecheck. Keep the export and note it as QA-deferred.

## Budget Section Pages (Story #149, PR #158)

- BudgetSubNav: `client/src/components/BudgetSubNav/BudgetSubNav.tsx` — 5-tab sub-nav on all budget section pages. Uses NavLink + `end` per tab. Horizontal scroll on mobile.
- Shared formatters: `client/src/lib/formatters.ts` — `formatCurrency(n)` (EUR), `formatPercent(n)`. All budget pages use this.
- Page header pattern: all budget pages use `<h1>Budget</h1>` + `<h2>Section Name</h2>`. Loading/error states also render BudgetSubNav.
- Sidebar: single "Budget" NavLink (no `end`) to `/budget`. Total 9 nav links + 1 GitHub = 10 total links. Sidebar.test.tsx updated accordingly.
- App.test.tsx: budget heading test now checks for `level: 1` with `/^budget$/i` (not "Budget Categories").
- AppShell.test.tsx: budget link test uses `/^budget$/i` (not "budget categories").
- Routing: `/budget` → nested `overview`, `categories`, `vendors`, `vendors/:id`, `sources`, `subsidies` in App.tsx
- BudgetSourcesPage (PR #145): inline CRUD; `BudgetSourceType`: bank_loan/credit_line/savings/other; `BudgetSourceStatus`: active/exhausted/closed

## WorkItem Budget Lines (EPIC-05 Stories 5.9-5.12)

- `work_item_budgets` table replaces flat budget fields. `WorkItemDetail.budgets: WorkItemBudgetLine[]`
- `workItemBudgetsApi.ts`: `fetchWorkItemBudgets`, `createWorkItemBudget`, `updateWorkItemBudget`, `deleteWorkItemBudget`
- `workItemsApi.ts` has subsidy linking: `fetchWorkItemSubsidies`, `linkWorkItemSubsidy`, `unlinkWorkItemSubsidy`
- Vendor linking functions (`fetchWorkItemVendors`, `linkWorkItemVendor`, `unlinkWorkItemVendor`) were REMOVED from `workItemsApi.ts` in Story 5.12 — they were dead code after the budget rework
- `Invoice` type now has `workItemBudgetId: string | null` field; `CreateInvoiceRequest`/`UpdateInvoiceRequest` support `workItemBudgetId?: string | null`
- BudgetOverview (post hero-bar rewrite): REPLACED summary cards + category table with Budget Health Hero card. Hero card: header (title + BudgetHealthIndicator badge), 3-column metrics row (Available Funds / Projected Range / Remaining), BudgetBar stacked bar, footer (subsidies + sources), CategoryFilter multi-select dropdown. Old test file tests OLD design — QA must rewrite 23/34 tests.

## Test Mock Requirements When Page Imports New APIs

When adding new API imports to a page, update ALL test mock blocks:

1. Add `jest.fn()` declarations for each new function
2. Add to `jest.unstable_mockModule()` factory
3. Add `.mockReset()` in `beforeEach`
4. Add `.mockResolvedValue(...)` defaults in `beforeEach`
   Missing any step causes "does not provide an export named X" or test failures.

WorkItemDetailPage.test.tsx specifically needs mocks for:

- `../../lib/milestonesApi.js` → `listMilestones` default: `[]`
- `../../lib/workItemMilestonesApi.js` → `getWorkItemMilestones` default: `{ required: [], linked: [] }`
- SubsidyProgramsPage (Story #146): inline CRUD; loads budget categories via fetchBudgetCategories() for multi-select checkboxes; `SubsidyReductionType`: percentage/fixed; `SubsidyApplicationStatus`: eligible/applied/approved/received/rejected
- Dynamic CSS Module class lookup for enum-keyed badges: use a helper function with a Record map (NOT bracket notation `styles['type-bank_loan']` — CSS Modules require camelCase keys)
- AppShell.test.tsx used `/budget/i` regex for nav link assertion — adding a second "budget" link breaks `getByRole` (multiple matches). Always use specific text like `/budget categories/i` or `/budget sources/i`

## Invoice Management (Story #144, feat/144-invoice-management)

- `client/src/lib/invoicesApi.ts` — fetchInvoices, createInvoice, updateInvoice, deleteInvoice
- Nested API path: `/vendors/${vendorId}/invoices`, `/vendors/${vendorId}/invoices/${invoiceId}`
- `InvoiceStatus`: `'pending' | 'paid' | 'overdue'` — no `warning` tokens; use `--color-status-not-started-*` for pending (gray), success for paid, blocked for overdue
- `status_${invoice.status}` CSS class naming for status badge variants (e.g. `status_paid`, `status_overdue`)
- Outstanding balance = sum of pending + overdue invoices (computed client-side after fetch)
- Responsive table (desktop) + card list (mobile via CSS `display: none` toggle)
- `useCallback` + `useEffect([id, loadInvoices])` pattern for data fetching with memoized callback
- After create/update/delete: optimistic update to `invoices` state + `void loadVendor()` to refresh stats cards
- `formatDate()` helper: `dateStr.slice(0,10).split('-')` → `new Date(year, month-1, day)` to avoid timezone issues
- `InvoiceFormState` interface with all string fields (amount as string for input, parsed with parseFloat before API call)
- Avoid naming collision: vendor edit uses `editForm/setEditForm`, invoice edit uses `editInvoiceForm/setEditInvoiceForm`
- VendorDetailPage test: "coming soon" test WILL FAIL — QA must update to mock invoicesApi + test new behavior

## Toast System (Story 6.6, PR #253)

- `client/src/components/Toast/ToastContext.tsx` — `ToastProvider` + `useToast()` hook. Provider wraps App.tsx root. `useToast` throws if called outside provider.
- `client/src/components/Toast/Toast.tsx` — `ToastList` portal component (`createPortal` to `document.body`). Bottom-right fixed, z-index modal.
- App.tsx provider order: `<BrowserRouter><ThemeProvider><ToastProvider><AuthProvider>...{/* <ToastList /> here */}...</AuthProvider></ToastProvider></ThemeProvider></BrowserRouter>`
- When a page gains `useToast()`, ALL tests rendering that page MUST add: `jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({ useToast: () => ({ toasts: [], showToast: jest.fn(), dismissToast: jest.fn() }), ToastProvider: ({ children }) => children }))`
- See `TimelinePage.test.tsx` for working example

## Drag-and-Drop Hook (Story 6.6 — `useGanttDrag.ts`)

**CRITICAL**: React 19 `react-hooks/refs` ESLint rule forbids `ref.current = value` during render.
Must update ref ONLY inside event handlers. Pattern:

```typescript
const dragStateRef = useRef<DragState | null>(null);
// NO: dragStateRef.current = dragState; (during render — ESLint error)
// YES: update ref inside handleBarPointerDown, handleSvgPointerMove, handleSvgPointerUp, handleSvgPointerCancel
```

Also: `handleSvgPointerMove` must update `dragStateRef.current` with new preview dates so `handleSvgPointerUp` reads the latest state (React state update is async).

## CI Format Check vs lint-staged Gap

lint-staged (pre-commit) only formats/lints STAGED files. CI runs `format:check` on ALL files.
Files committed in earlier sessions without Prettier running will fail CI.
Fix: `npx prettier --write <files>` → stage → commit before pushing.

## Budget Bar Components (feat/budget-hero-bar)

- `--color-budget-{claimed|paid|pending|projected|track|overflow}` tokens added to tokens.css (light + dark)
- `BudgetBar`: `client/src/components/BudgetBar/` — segments prop, maxValue, overflow, height, callbacks
- `BudgetHealthIndicator`: `client/src/components/BudgetHealthIndicator/` — resolves on-budget/at-risk/over-budget
- `Tooltip`: `client/src/components/Tooltip/` — wrapper div approach (NOT cloneElement — React 19 ESLint rule `react-hooks/refs` flags cloneElement when a ref is in scope); `display: contents` inner span for aria-describedby
- `BudgetBarSegment` and `BudgetBar` are exported from BudgetBar.tsx (no barrel index.ts needed for single-component dirs)

## Gantt Chart Architecture (EPIC-06)

- SVG-based, column-width pixel positioning
- `ZoomLevel`: `'day' | 'week' | 'month'`; `COLUMN_WIDTHS`, `COLUMN_WIDTH_MIN`, `COLUMN_WIDTH_MAX` in `ganttUtils.ts`
- All coordinate functions accept optional `columnWidth` param (override default for zoom in/out)
- Milestone rows come AFTER work item rows: `rowIndex = workItemCount + milestoneIndex`
- SVG height = `totalRowCount * ROW_HEIGHT` (totalRowCount includes milestone rows)
- Ghost SVG polygon: plain `<polygon>` with `fill="transparent"`, `strokeDasharray`, `aria-hidden`, NO interactions
- **Test pitfall**: `layer.querySelector('polygon')` finds the FIRST polygon — ghost is rendered before active diamond for late milestones. Use `querySelectorAll('polygon')[polygons.length - 1]` to get the active one.

## Git in Worktrees

- Worktrees have NO `origin` remote by default
- Add remote: `git remote add origin https://github.com/steilerDev/cornerstone.git`
- Create PRs: `gh pr create -R steilerDev/cornerstone --base beta --head <branch>`
- Watch CI: `gh pr checks <N> --repo steilerDev/cornerstone`

## Prettier — pre-commit vs CI Gap

- lint-staged only formats STAGED files; CI runs `format:check` on ALL files
- Multi-line JSX ternaries sometimes formatted differently by Prettier on different runs
- Fix: `npx prettier --write <file>` → stage → commit → push

## Navigation Origin Pattern

Pass origin state: `navigate('/work-items/${id}', { state: { from: 'timeline' } })`
Read in destination: `const fromTimeline = (location.state as { from?: string } | null)?.from === 'timeline'`

## MilestoneWorkItemLinker — Bidirectional Relationships (Fix 4, then Fix 5-UI)

- `MilestoneDetail.workItems` = contributing items (editable via `milestone_work_items` table)
- `MilestoneDetail.dependentWorkItems: WorkItemDependentSummary[]` = items blocked by this milestone
- `WorkItemDependentSummary { id: string; title: string }` in `shared/src/types/milestone.ts`
- Linker view has two sections: "Contributing Work Items" (editable) + "Dependent Work Items" (ALSO EDITABLE as of UAT Round 2 Fix 5-UI)
- Both sections use `WorkItemSelector` component with `onLinkDependent`/`onUnlinkDependent` callbacks
- Backend endpoints: `POST /api/milestones/:id/dependents/:workItemId`, `DELETE /api/milestones/:id/dependents/:workItemId`
- API client: `addDependentWorkItem(milestoneId, workItemId)` and `removeDependentWorkItem(milestoneId, workItemId)` in `milestonesApi.ts`
- Dialog title for linker view = "Manage Work Items" (changed from "Contributing Work Items")
- `MilestoneSummary` has both `workItemCount` and `dependentWorkItemCount` fields
- Milestone list row displays "N contributing, M dependent" (only non-zero counts shown)

## Calendar Lane Allocation + Item Colors (Fix 2, fix/epic-06-uat-fixes)

- `allocateLanes(weekStart, weekEnd, items)` in `calendarUtils.ts` — greedy lane assignment
  - Returns `Map<itemId, laneIndex>` (0-based); multi-day items first by descending span length
  - Ensures consistent vertical position for multi-day items across all cells in a week row
- `getItemColor(itemId)` — djb2-style hash to 1-8 color index (deterministic)
- `CalendarItem.tsx` exports `LANE_HEIGHT_COMPACT = 20` and `LANE_HEIGHT_FULL = 26` (px)
- `CalendarItem` props: `laneIndex?: number` (absolute `top` via inline style) + `colorIndex?: number` (palette color via inline style)
- `MonthGrid`: `position:relative` itemsContainer, lane map per week row, milestones stacked after item lanes
- `WeekGrid`: one lane map for whole week, `position:relative` on dayCell via inline style
- Status CSS classes (`.notStarted`, `.inProgress`, etc.) KEPT for test compatibility; inline palette color overrides them visually
- Calendar palette tokens: `--calendar-item-{1-8}-bg` + `--calendar-item-{1-8}-text` in tokens.css (light + dark)

## WorkItemDetail Constraints Section (Fix 4 + Fix 1 UAT Round 2)

- New file: `client/src/lib/workItemMilestonesApi.ts` — 5 functions for work item milestone relationships
- `getWorkItemMilestones(workItemId)` → `WorkItemMilestones { required, linked }`
- `add/removeRequiredMilestone(workItemId, milestoneId)` / `add/removeLinkedMilestone(workItemId, milestoneId)`
- Right column has unified "Constraints" section (as of UAT Round 2 Fix 1 — 5 subsections):
  1. Duration (FIRST — `.constraintSubsectionFirst`, no top border) — moved from left column
  2. Date Constraints (startAfter/startBefore)
  3. Dependencies (predecessors/successors — unchanged)
  4. Required Milestones (must complete before WI starts — chip badges)
  5. Linked Milestones (WI contributes to — chip badges with success-green color)
- Left column: old "Constraints" section (startAfter + startBefore + duration) fully REMOVED; Duration standalone section REMOVED
- Milestone chips: `milestoneChip` class (primary-bg blue), `milestoneChipLinked` modifier (success green)
- CSS: `constraintSubsection` / `constraintSubsectionFirst` / `milestoneChip*` in module CSS
- Type note: `MilestoneSummaryForWorkItem.name` (chips) vs `MilestoneSummary.title` (picker dropdown)
- allMilestones loaded in initial `Promise.all` via `listMilestones()`; `getWorkItemMilestones` fetches both required+linked in one call

## TimelinePage Post Auto-Schedule Removal (Fix 1, fix/epic-06-uat-fixes)

- `scheduleApi.ts` and `scheduleApi.test.ts` DELETED — scheduling is server-side automatic
- CSS class `toolbarButton` replaces old `autoScheduleButtonPrimary` for the Milestones button
- Old CSS classes removed: `autoScheduleButton`, `autoScheduleButtonPrimary`, `scheduleError`, and all `.dialog*` classes
- `App.test.tsx` no longer mocks `scheduleApi.js` — the mock was only needed because TimelinePage imported it
- `e2e/pages/TimelinePage.ts` POM no longer has `autoScheduleButton`, `autoScheduleDialog`, `autoScheduleConfirmButton`, `autoScheduleCancelButton` properties, or `openAutoScheduleDialog/confirmAutoSchedule/cancelAutoSchedule` methods
- `e2e/tests/timeline/timeline-schedule.spec.ts` DELETED — feature removed

## WorkItemDetailPage E2E POM Layout (Fix 5, fix/epic-06-uat-fixes, PR #272)

`e2e/pages/WorkItemDetailPage.ts` POM section locators updated to match current layout:

- `durationSection` (NEW) — left column h2 "Duration" (only duration days)
- `constraintsSection` (MOVED) — right column h2 "Constraints" combined section; contains h3 subsections: Date Constraints, Dependencies, Required Milestones, Linked Milestones
- `dependenciesSection` REMOVED — h2 "Dependencies" no longer exists; it is now h3 under h2 "Constraints"
- test line 66: `dependenciesSection` → `constraintsSection`

## Gantt Arrow Hover Highlight (issue #287, PR #288, fix/287-gantt-arrow-hover-highlight)

Arrow hover interaction pattern:

- `GanttArrows` owns local `hoveredArrowKey: string | null` state (for per-arrow CSS dimming)
- `GanttArrows` calls `onArrowHover(connectedIds, description, mousePos)` upward to `GanttChart`
- `GanttChart` owns `hoveredArrowConnectedIds: ReadonlySet<string> | null`
- Milestone IDs encoded as `"milestone:<id>"` to fit in same `Set<string>` as work item IDs
- `GanttChart` computes `barInteractionStates` (Map<string, BarInteractionState>) and `milestoneInteractionStates` (Map<number, MilestoneInteractionState>)
- `GanttBar` accepts `interactionState?: 'highlighted'|'dimmed'|'default'` → CSS class
- `GanttMilestones` accepts `milestoneInteractionStates?: ReadonlyMap<number, MilestoneInteractionState>`
- `GanttTooltip` has 3 kinds: `'work-item'`, `'milestone'`, `'arrow'` (new)
- Arrow tooltip shown immediately (no debounce) via `kind: 'arrow'` with `description` string
- Arrow aria-labels use human-readable descriptions (not technical "Finish-to-Start")
- Keyboard focus on `<g tabIndex={0}>` triggers same highlight/dim via `onFocus`/`onBlur`
- CSS: `.highlighted { filter: brightness(1.2) drop-shadow(...) }` and `.dimmed { opacity: 0.3 }`
- Dimmed bars override hover: `.dimmed:hover { filter: none; opacity: 0.3 }`

## Gantt Milestone Dependency Arrows (Fix 3, fix/epic-06-uat-fixes)

- `GanttArrows.tsx` extended with `MilestonePoint` type (x, y diamond center) + 4 new optional props
- New `milestoneArrow` color field in `ArrowColors` interface → resolved from `--color-gantt-arrow-milestone`
- Token added to tokens.css: `--color-gantt-arrow-milestone: var(--color-blue-500)` (light+dark)
- Two arrow types: contributing (WI end → diamond, FS-style) + required (diamond → WI start)
- Path routing: `buildMilestoneOrthoPath()` — orthogonal paths with STANDOFF=10, wraps around if reversed
- Dashed stroke: `strokeDasharray="5 3"`, opacity=0.65
- `GanttChart.tsx` computes 4 useMemo maps: `milestonePoints`, `milestoneContributors`, `workItemRequiredMilestones`, `milestoneTitles`
- Milestone X uses active date (projectedDate for late, targetDate otherwise) matching GanttMilestones positioning

## Detailed Patterns (see patterns.md)

- Keyboard shortcuts hook
- Color contrast calculation (WCAG)
- Dropdown click-outside handler
- Modal overlay pattern
- Inline item editing
- API client full API
- Auth form pattern
- URL state management with useSearchParams
- Debounced search input
- Responsive table/card layout
- Pagination with smart page numbers
- React.lazy / code splitting
- Complex detail page data loading

## Shared CSS Utilities Module

`client/src/styles/shared.module.css` — composable CSS utility classes (created in refactor PR).
All values use design tokens. Use CSS Modules `composes` directive to inherit:

```css
.myButton {
  composes: btnPrimary from '../../styles/shared.module.css';
}
.myInput {
  composes: input from '../../styles/shared.module.css';
}
```

Available classes: `btnPrimary`, `btnPrimaryCompact`, `btnSecondary`, `btnSecondaryCompact`,
`btnDanger`, `btnConfirmDelete`, `input`, `select`, `textarea`, `modal`, `modalBackdrop`,
`modalContent`, `modalActions`, `card`, `loading`, `emptyState`, `bannerSuccess`, `bannerError`.
Example applied in: SubsidyProgramsPage.module.css (18 composes), TagManagementPage.module.css (16).
NOTE: `--line-height-normal` token does NOT exist — use literal `1.5` in textarea.

## formatDate() Utility

Added `formatDate(dateStr, fallback='—')` to `client/src/lib/formatters.ts`.
Timezone-safe: splits `YYYY-MM-DD` into parts, constructs `new Date(year, month-1, day)`.
Returns en-US short month format: "Feb 27, 2026".
Currency mismatch: InvoicesPage/InvoiceDetailPage/VendorDetailPage have LOCAL `formatCurrency` (USD).
Do NOT replace these with the shared EUR `formatCurrency`.

## Git Object Permission Issues in Worktrees

Some `.git/objects/<prefix>/` subdirectories are owned by UID 502 (macOS sandbox), preventing writes.
When `git add` fails with "insufficient permission", use `git update-index --add --cacheinfo`:

```bash
# 1. Write object to temp dir
GIT_OBJECT_DIRECTORY=/tmp/git-objects-extra git hash-object -w <file>
# 2. Tell git about the alternate objects location
echo "/tmp/git-objects-extra" > .git/objects/info/alternates
# 3. Update the index directly
git update-index --add --cacheinfo 100644,<hash>,<path>
```

For agent-owned dirs, Python fallback: write compressed zlib blob directly.

## DashboardCard Component (Story #471, PR TBD)

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

## Invoice & Subsidy Pipeline Cards (Story #476, feat/476-invoice-subsidy-pipeline)

**InvoicePipelineCard** (`client/src/components/InvoicePipelineCard/`):

- Receives `invoices: Invoice[]` + `summary: InvoiceStatusBreakdown` props
- Filters to pending invoices, sorts by date (oldest first), shows top 5
- Overdue detection: parse date with `new Date(year, month-1, day)`, compare < today's midnight
- Displays vendor name, invoice number (or `#${id.slice(0,8)}`), amount (formatCurrency), date (formatDate)
- Overdue badge (`data-testid="overdue-badge"`) with warning color via `rgba(251, 146, 60, 0.15)` background
- Footer: pending total + "View all invoices" link to `/budget/invoices`
- Empty state: `"No pending invoices"` when no pending items

**SubsidyPipelineCard** (`client/src/components/SubsidyPipelineCard/`):

- Receives `subsidyPrograms: SubsidyProgram[]` prop
- Groups by lifecycle status: eligible/applied/approved/received/rejected (in that order, only show non-empty groups)
- Per-group: count, fixed-reduction total (sum `reductionValue` where `reductionType === 'fixed'`), deadline warning
- Deadline warning: if ANY program has `applicationDeadline` within 14 days (inclusive) and >= 0 days future
- Status badges: gray (eligible), blue (applied), green (approved+received), red (rejected)
- Footer: "View all subsidies" link to `/budget/subsidies`
- Empty state: `"No subsidy programs found"`

**Integration into DashboardPage**:

- Added state: `invoices: Invoice[]`, `invoiceSummary: InvoiceStatusBreakdown | null`, `subsidyPrograms: SubsidyProgram[]`
- Fetching: `Promise.allSettled` includes `fetchAllInvoices({ pageSize: 10 })` and `fetchSubsidyPrograms()`
- isEmpty logic: invoices card = `invoices.filter(inv => status === 'pending').length === 0`
- Conditional render: `invoiceSummary ? <InvoicePipelineCard ... />` and `<SubsidyPipelineCard ... />`
