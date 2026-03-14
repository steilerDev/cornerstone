# E2E Test Engineer — Agent Memory (Index)

> Detailed notes live in topic files. This index links to them.
> See: `e2e-pom-patterns.md`, `e2e-parallel-isolation.md`, `story-epic08-e2e.md`

## E2E Parallel Isolation (2026-02-20)

`testPrefix` fixture in `e2e/fixtures/auth.ts` — use `async (_fixtures, use, testInfo)` (NOT `{}` — ESLint `no-empty-pattern`).
Produces `"E2E-des0 Vendor Name"` — unique per worker+project. See `e2e-parallel-isolation.md`.
Shared-state tests (profile, admin user) use `test.describe.configure({ mode: 'serial' })`.
Count assertions: use `>= DEFAULT_CATEGORIES.length` not `=== 10`; capture `countBefore` before actions.

## Two Critical E2E Anti-Patterns (2026-02-21)

See `e2e-pom-patterns.md` for full details on:

1. **Hardcoded `waitFor({ timeout: N })`** overrides project-level tablet/mobile 15s timeout
   — Always omit explicit timeout in POM `waitFor()` calls (NEVER use `timeout: 5000`)
2. **`[class*="prefix"]` strict mode violations** — `emptyState` matches `emptyStateTitle` too
   — Add element type: `div[class*="emptyState"]` instead of `[class*="emptyState"]`
3. **Mobile CSS-hidden table** — `display:none` elements still in DOM; `textContent()` works,
   clicks fail — check `tableContainer.isVisible()` before using table rows

## E2E Wait Patterns: waitForResponse BEFORE the action (2026-02-23)

`page.waitForResponse(pred)` must ALWAYS be registered BEFORE the action that triggers the request.
After a `waitForResponse` for search/filter, call `waitForLoaded()` to wait for React DOM update.

## EPIC-08 Paperless E2E (2026-03-02)

See `story-epic08-e2e.md` — Paperless NOT available in E2E environment (no testcontainer yet).
All document tests currently validate "not configured" state. Real Paperless container integration is needed.

## Gantt Touch Two-Tap Pattern

`GanttChart.tsx` uses `handleBarOrSidebarClick` which checks `isTouchDevice`.
On touch devices: first tap shows tooltip, second tap navigates.
E2E tests on tablet must click/press Enter twice with 300ms pause between taps.

## Key File Locations

- Test fixtures: `e2e/fixtures/auth.ts` (testPrefix, authenticatedPage)
- Test data: `e2e/fixtures/testData.ts` (routes, API endpoints)
- Page objects: `e2e/pages/` (AppShellPage, WorkItemsPage, etc.)
- Containers: `e2e/containers/cornerstoneContainer.ts`
- Playwright config: `e2e/playwright.config.ts`

## Viewport Timeouts

- Desktop: `timeout: 10_000`, no explicit action/expect timeout (Playwright default 30s)
- Tablet: `timeout: 60_000`, `expect/action/navigationTimeout: 15_000`
- Mobile: `timeout: 60_000`, `expect/action/navigationTimeout: 15_000`

## Tablet POM Readiness: Always wait for interactive elements (2026-03-14)

On tablet (15s action timeout), elements that are visible after `goto()` heading check may not yet
be ready for interaction. Always add `waitFor({ state: 'visible' })` for search inputs, buttons,
etc. in both `goto()` and helper methods. Also add `scrollIntoViewIfNeeded()` before fill().
Pattern: `await this.input.waitFor({ state: 'visible' }); await this.input.scrollIntoViewIfNeeded(); await this.input.fill(value);`

## toBeHidden() vs not.toBeVisible() for Conditionally-Rendered Elements (2026-03-14)

`toBeHidden()` requires the element to be in the DOM (just not visible). If a component uses
conditional rendering `{condition && <Button>}`, when `condition` is false the element is absent
from DOM entirely. `toBeHidden()` times out in this case.
Use `not.toBeVisible()` instead — it passes for both CSS-hidden AND DOM-absent elements.
Example: DashboardPage Customize button only mounts when `hasHiddenCards` is true.

## CSS Selector Staleness After UI Refactors (2026-03-14)

When the UI is refactored, POM CSS class selectors like `[class*="amountLabel"]` become stale.
Always verify selectors against the actual component source after any UI changes.
If a legend/label only renders conditionally (e.g., when values > 0), the test must account for
that — check always-rendered elements (containers, summary rows) rather than conditional labels.
Example: BudgetSourcesPage bar chart `barLegendLabel` only renders for non-zero segments;
use `summaryItem` spans (Total/Available/Planned) for unconditional assertions.

## Dashboard Card Count: 9 not 10 (2026-03-14)

DashboardPage has 9 CARD_DEFINITIONS. Both desktop grid AND mobile sections container render
ALL cards simultaneously (CSS media queries control visibility, not conditional rendering).
So dismiss button count in DOM = up to 18 (9 × 2 containers). Use `>= 9` not `>= 10`.

## Dashboard Card Persistence After Reload (2026-03-14)

`usePreferences()` hook fetches preferences asynchronously on mount. After `page.reload()`,
cards render ALL visible until the preferences API responds. `waitForCardsLoaded()` only
waits for data skeletons (aria-busy), not preferences load. Fix: register
`page.waitForResponse('/api/users/me/preferences', 200)` BEFORE reload, await it after
reload + heading visible, before asserting card count.

## Skip Unreliable WebKit Tablet Tests via viewport width (2026-03-14)

When a search-input or form element consistently times out on WebKit iPad gen 7 (810px)
and works on desktop, skip on non-desktop with:
`test.beforeEach(async ({ page }) => { if (page.viewportSize()?.width < 1200) test.skip(); });`
Applied to: e2e/tests/admin/search-users.spec.ts

## Avoid getSuccessBannerText() — Use expect() Instead (2026-03-14)

POM helper `getSuccessBannerText()` wraps `waitFor` in try/catch, returns null on timeout.
This masks failures: `expect(null).toContain(X)` throws confusing error. Use:
`await expect(sourcesPage.successBanner).toBeVisible()` (uses expect.timeout with retry).
Also add `waitForResponse` BEFORE save click — confirms API 200 before checking UI.

## Diary Forms E2E (Story #805, 2026-03-14)

Files: `e2e/pages/DiaryEntryCreatePage.ts`, `e2e/pages/DiaryEntryEditPage.ts`,
`e2e/tests/diary/diary-forms.spec.ts`. DiaryEntryDetailPage.ts extended with edit/delete locators.

Key selectors:
- Create page type cards: `getByTestId('type-card-{type}')` — clicking immediately transitions to form
- Create form: `#entry-date`, `#title`, `#body` (common); `#weather`, `#temperature`, `#workers`
  (daily_log); `#inspector-name`, `#inspection-outcome` (site_visit); `#severity`,
  `#resolution-status` (issue); `[name="material-input"]` (delivery)
- Create submit: `getByRole('button', { name: /Create Entry|Creating\.\.\./i })`
- Edit page: `getByRole('heading', { level: 1, name: 'Edit Diary Entry' })`
- Edit back: `getByRole('button', { name: /← Back to Entry/i })`
- Edit save: `getByRole('button', { name: /Save Changes|Saving\.\.\./i })`
- Edit delete opens modal: `getByRole('button', { name: 'Delete Entry', exact: true })`
- Detail Edit button: `getByRole('link', { name: 'Edit', exact: true })` (anchor, not button)
- Detail Delete button: `getByRole('button', { name: 'Delete', exact: true })` (NOT "Delete Entry")
- Modal: `getByRole('dialog')` — conditionally rendered; confirmDelete inside modal scope
- Confirm delete: `modal.getByRole('button', { name: /Delete Entry|Deleting\.\.\./i })`
- Edit/Delete buttons NOT rendered for automatic entries (`isAutomatic: true`)
- DiaryEntryEditPage.save() registers waitForResponse (PATCH) BEFORE click — returns after API

## Diary E2E (Story #804, 2026-03-14)

Files: `e2e/pages/DiaryPage.ts`, `e2e/pages/DiaryEntryDetailPage.ts`,
`e2e/tests/diary/diary-list.spec.ts`, `e2e/tests/diary/diary-detail.spec.ts`.

Key selectors:
- DiaryPage heading: `getByRole('heading', { level: 1, name: 'Construction Diary' })`
- Filter bar: `getByTestId('diary-filter-bar')`, search: `getByTestId('diary-search-input')`
- Type switcher: `getByTestId('type-switcher-all|manual|automatic')`
- Entry cards: `getByTestId('diary-card-{id}')`, date groups: `getByTestId('date-group-{date}')`
- Type chips: `getByTestId('type-filter-{entryType}')`, clear: `getByTestId('clear-filters-button')`
- Pagination: `getByTestId('prev-page-button')` / `getByTestId('next-page-button')`
- Detail back button: `getByTitle('Go back')` (title="Go back"), back link: `getByRole('link', { name: 'Back to Diary' })`
- Metadata wrappers: `getByTestId('daily-log-metadata|site-visit-metadata|delivery-metadata|issue-metadata')`
- Outcome badge: `getByTestId('outcome-{pass|fail|conditional}')`, severity: `getByTestId('severity-{level}')`
- Automatic badge: `locator('[class*="badge"]').filter({ hasText: 'Automatic' })`

API: `POST /api/diary-entries` returns `DiaryEntrySummary` with `id` at top level (not nested).
Empty state uses shared.emptyState CSS module class (conditional render — use `.not.toBeVisible()` not `.toBeHidden()`).
DiaryPage.waitForLoaded() races: timeline visible OR emptyState visible OR errorBanner visible.
