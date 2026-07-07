---
name: general-e2e-patterns
description: Cross-cutting E2E patterns not tied to one feature — wait/timing strategy, POM readiness, breadcrumbs, print, i18n, Gantt touch, dashboard cards, DataTable migration fallout, key file locations. Consolidated from dated notes 2026-02 through 2026-04.
metadata:
  type: project
---

## Wait & timing strategy

- **`page.waitForResponse(pred)` must ALWAYS be registered BEFORE the action that triggers the request** — registering after risks a race where the response arrives before the listener exists. Applies everywhere (search, filters, saves).
- **Tablet POM readiness**: on tablet (15s action timeout), elements visible right after `goto()`'s heading check may not yet be interactive. Always `waitFor({state:'visible'})` + `scrollIntoViewIfNeeded()` before `fill()`/`click()` in both `goto()` and helper methods.
- **`toBeHidden()` vs `not.toBeVisible()`**: `toBeHidden()` requires the element to exist in the DOM (just not visible) — for conditionally-rendered elements (`{cond && <X/>}`) that are absent when `cond` is false, `toBeHidden()` times out. Use `not.toBeVisible()` — passes for both CSS-hidden and DOM-absent.
- **CSS selector staleness after refactors**: verify `[class*="..."]` selectors against actual component source after any UI change; conditionally-rendered labels (e.g. only shown when value > 0) need an always-rendered fallback anchor (containers/summary rows) instead.
- **Skip unreliable WebKit tablet tests by viewport width**: `test.beforeEach(({page}) => { if (page.viewportSize()?.width < 1200) test.skip(); })` when a form element consistently times out on iPad gen 7 (810px) but works on desktop.
- **Avoid `getSuccessBannerText()`-style helpers** that swallow timeouts in try/catch and return `null` — `expect(null).toContain(x)` gives a confusing failure. Use `await expect(locator).toBeVisible()` directly (retries via `expect.timeout`). Also register `waitForResponse` before the triggering save click.
- **`waitForURL` on WebKit tablet after browser-back**: pass `{timeout: 15_000}` explicitly (seen needed in `diary-detail.spec.ts` Scenarios 2/3).
- **`waitForURL` glob false-positive**: `waitForURL('**/project/work-items/**')` resolves immediately on `/new` (glob `**` matches `new` too) — use a UUID regex instead.
- After `fill(query)` in a search box, add `page.waitForURL(url => url.searchParams.get('q') === query)` BEFORE `waitForResponse` — confirms the debounce fired and React committed state. Don't call `waitForLoaded()` after the response for search — it can resolve on stale DOM from a WebKit clear-event race; let the assertion's own retry converge.
- Dashboard reload: register `waitForResponse('/api/users/me/preferences')` BEFORE reload, but prefer `page.waitForLoadState('networkidle')` AFTER the heading is visible for "dismissed card stays hidden" — LocaleContext's GET resolves first and `usePreferences`'s second GET (which applies hiddenCards) arrives later.
- Count assertions with parallel workers sharing one DB are fragile — use `>=` / `not.toContain(name)` instead of exact equality.

## Viewport timeouts (Playwright projects)

- Desktop: `timeout: 10_000`, default action/expect timeouts (Playwright default 30s / no override).
- Tablet & Mobile: `timeout: 60_000`, `expect/action/navigationTimeout: 15_000`.
- Never hardcode a lower `{timeout:N}` in a POM `waitFor()` call — it silently overrides the project-level tablet/mobile timeout.

## Strict-mode / selector anti-patterns

- `[class*="prefix"]` matches longer class names too (e.g. `emptyState` matches `emptyStateTitle`) — add an element type (`div[class*="emptyState"]`) to disambiguate.
- Mobile CSS-hidden tables: `display:none` rows are still in the DOM; `textContent()` works but `.click()` fails — check `tableContainer.isVisible()` before using table rows on mobile.
- Substring text collisions (e.g. "Keller" matching "Kellerbau"): `getByRole('row').filter({has: page.locator('span',{hasText:/^Keller$/})})` for exact match.

## DataTable Migration (EPIC-18, PR #1177) POM fallout

- Modal `useId()` IDs (`#create-modal-title` etc.) don't exist post-migration — always use `getByRole('dialog', {name:...})` + `getByRole('heading', {level:2})` inside.
- `confirmDeleteButton` renamed `btnConfirmDelete` (from `shared.module.css`, `[class*="btnConfirmDelete"]`) for WorkItems/HouseholdItems.
- Mobile `DataTableCard` has no `cardName` class — the same render() function runs for cells and cards, so use the actual column class (e.g. `[class*="vendorLink"]`) inside `cardsContainer`.
- HouseholdItems actions menu buttons are `role="button"` (default), not `role="menuitem"` — scope via `[class*="menuItemDanger"]:visible` + text.
- **Production bug #1178** (not a test issue): `DateRangePicker` phase resets after clicking the start date — `DateFilter.handleChange` only fires when both dates are set, and the picker's own `useEffect` resets phase when `startDate` stays `''`.

## Gantt touch two-tap pattern

`GanttChart.tsx`'s `handleBarOrSidebarClick` checks `isTouchDevice`: on touch devices the first tap shows a tooltip, the second navigates. E2E tests on tablet must click/press-Enter twice with a ~300ms pause between taps.

## Breadcrumb E2E selectors (AreaBreadcrumb, Stories #1238/#1239/#1240)

- Compact variant: `[tabIndex="0"][class*="compact"]` (list rows/cards). Default variant: `getByRole('navigation', {name:/area path/i})` (detail headers, create preview). Null area (both): `getByText('No area', {exact:true})`.
- AreaPicker input `getByPlaceholder('Select an area')` is ABSENT from the DOM once an area is selected (SearchPicker swaps it for a `selectedDisplay` chip) — never click/fill it post-selection; use the "Clear selection" button (`aria-label`) to reset.
- Gantt bar: `data-testid="gantt-bar-{id}"` on the SVG `<g>`. Gantt sidebar row: `data-testid="gantt-sidebar-row-{id}"`. Milestone detail linked-WI row: `[class*="linkedWorkItem"]` filtered by title text.
- GanttTooltip area names are plain joined text (`›` separator), not an AreaBreadcrumb component — check `tooltip.textContent()`.
- Missing translation key `gantt.tooltip.workItem.areaLabel` (absent from `schedule.json`) means the raw key may render as label text — assert on the value (area path), not the label.
- Gantt sidebar/bar hover tests: skip below `viewportWidth < 1200` (Gantt collapses on tablet/mobile).
- WI create date pattern for Gantt visibility: `startDate=first of current month`, `endDate=last of 2 months ahead`.

## Milestones / Diary auto-events / HI dependencies odds and ends (Stories #1239/#1271-#1273)

- Milestone WI link: `POST /api/milestones/:id/work-items {workItemId}`. See milestones-e2e.md for the full POM.
- Diary auto-events from WI status change: `PATCH /api/work-items/:id {status}` → find via `GET /api/diary-entries?type=work_item_status&pageSize=50`, filter `sourceEntityId === workItemId`. Enabled by default (`DIARY_AUTO_EVENTS=true`) — no E2E container config needed.
- `InvoiceDetailPage.budgetLinesSection` correct selector is `[aria-labelledby="budget-lines-title"]` (not a `budgetLinesSection` class, which doesn't exist).
- Invoice budget line creation is `POST /api/invoices/:invoiceId/budget-lines` (not nested under vendor). WI/HI budget POST responses: `{budget:{id}}`. Invoice budget line POST: `{budgetLine:{id}}`.
- HI dependency creation: `POST /api/household-items/:id/dependencies {predecessorType, predecessorId}`.

## Budget Source Lines/Move + WI Create regressions (fix/1279, 2026-04-18)

- `getByText('Unassigned', {exact:true})` strict-mode violation after PR #1265 (TriStateCheckbox adds a "Select all in Unassigned" span alongside the area-name span) — scope via `[class*="areaName"]` filtered by text instead.
- Sticky `actionBar` (position:sticky;bottom:0) can cover a checkbox on narrow viewports after Playwright auto-scrolls it into view — use `checkbox.click({force:true})`.

## Print E2E patterns (Issue #1310, 2026-04-19) — see also print-and-i18n.md

- `page.emulateMedia({media:'print'})` applies `@media print` CSS without firing window events — dispatch `beforeprint`/`afterprint` manually via `page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))` BEFORE `emulateMedia` if a hook (`usePrintExpansion`) listens for them.
- After dispatching `beforeprint`, wait for the resulting DOM update with `page.waitForFunction(...)`, not an immediate assertion.
- **afterprint race**: if some rows are already expanded pre-print, a generic `waitForFunction('[aria-expanded=true]')` resolves immediately (element already exists) and `endPrint()` fires before full expansion completes — wait for a SPECIFIC previously-hidden element instead.
- Always call `endPrint()` in a `finally` (`.catch(() => {})`) — `emulateMedia` state can leak across same-worker tests.
- CSS var color assertions: create a throwaway element, set `background-color: var(--x)`, read `getComputedStyle().backgroundColor` — always normalized `rgb()` regardless of how the variable itself is stored.
- Prefer route globs with leading `**` (`**/api/foo*`) over path-only (`/api/foo**`) — matches the full URL including the `http://localhost:PORT/` prefix reliably.

## i18n German locale timing (2026-03-23)

After `setLanguage(page,'de')` + `page.goto()`, always `page.reload()` before asserting German text. The FIRST locale switch in a test file needs `test.setTimeout(30000)` and a 20s expect timeout (i18next cold-start takes 10-15s on CI) — avoid burning that budget on extra warm-up navigations.

## Dashboard cards

- Card count is 10 (`CARD_DEFINITIONS`, added `'recent-diary'` in UAT fix #844). Both desktop grid AND mobile sections render ALL cards simultaneously (CSS media queries control visibility, not conditional mount) — dismiss-button count in DOM can be up to 20 (10 × 2 containers). Use `>= 10`, not `=== 10`.

## SearchPicker/AreaPicker filter pattern (2026-03-19, issue #1074)

AreaPicker has two DOM states: unselected (input visible, `placeholder="Select an area"`) vs selected (`[class*="selectedDisplay"]` visible, input gone). After selection, URL gets `?areaId=<id>`; clearing removes it. Use `waitForResponse` BEFORE selection.

## Key file locations

- Test fixtures: `e2e/fixtures/auth.ts` (testPrefix, authenticatedPage)
- Test data: `e2e/fixtures/testData.ts` (routes, API endpoints)
- Page objects: `e2e/pages/`
- Containers: `e2e/containers/cornerstoneContainer.ts`
- Playwright config: `e2e/playwright.config.ts`
