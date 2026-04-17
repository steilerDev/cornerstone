# E2E Test Engineer — Agent Memory (Index)

> Detailed notes live in topic files. This index links to them.
> See: `e2e-pom-patterns.md`, `e2e-parallel-isolation.md`, `story-epic08-e2e.md`, `story-933-dav-vendor-contacts.md`, `milestones-e2e.md`, `story-1248-mass-move.md`

## Embeds/Pickers Breadcrumb E2E (Story #1239, 2026-04-16)

- Gantt bar: `data-testid="gantt-bar-{id}"` on the SVG `<g>` element — use `page.getByTestId()` for hover
- Gantt sidebar WI row: `data-testid="gantt-sidebar-row-{id}"` — `ganttSidebarRow(id)` helper added to TimelinePage POM
- TimelinePage POM: `ganttBar(id)` helper added for bar hover tests
- Milestone detail linked WI row: `[class*="linkedWorkItem"].filter({hasText:title})` — `linkedWorkItemRow(title)` helper added to MilestoneDetailPage POM
- Link WI to milestone via API: `POST /api/milestones/:id/work-items` with `{ workItemId }`
- GanttChart tooltip areaName: plain text string (not AreaBreadcrumb), joined with `›` — check `tooltip.textContent()` for area names
- **Missing translation key**: `gantt.tooltip.workItem.areaLabel` is used in GanttTooltip.tsx but absent from `schedule.json` — i18next renders the key as fallback label text. Not a test issue; label text may show key string. Assert on the value (area path), not the label.
- WorkItemPicker search results: `[role="option"]` buttons inside `getByRole('listbox')` — compact breadcrumb in `[class*="compact"]` inside option
- Gantt sidebar + bar hover Gantt tests: skip on viewportWidth < 1200 (Gantt collapses on tablet/mobile)
- WI create date pattern for Gantt visibility: `startDate=first of current month`, `endDate=last of 2 months ahead`

## AreaBreadcrumb E2E Selectors (Story #1238, 2026-04-16)

- compact variant: `[tabIndex="0"][class*="compact"]` — spans in list rows/cards
- default variant: `getByRole('navigation', { name: /area path/i })` — in detail header & create preview
- null area (both variants): `getByText('No area', { exact: true })` — span with class\*="muted"
- Tooltip uses CSS opacity (0→1), so `toBeVisible()` works after `focus()` on the compact span
- AreaPicker input: `getByPlaceholder('Select an area')` (i18n key common.aria.selectArea)
- **CRITICAL**: `areaPickerInput` (placeholder locator) is ABSENT from DOM once an area is selected.
  SearchPicker replaces the `<input>` with a `selectedDisplay` chip + clear button. Never click/fill
  the input locator after selection. Use `getByRole('button', { name: 'Clear selection', exact: true })`
  to clear — this is `t('aria.clearSelection')` = "Clear selection". POM: `clearAreaPicker()` helper.
- Listbox option: `getByRole('option', { name: /areaName/ })` inside `getByRole('listbox')`
- "No area" special option in AreaPicker: `getByRole('option', { name: 'No area', exact: true })`
- `createAreaViaApi` and `deleteAreaViaApi` already exist in `e2e/fixtures/apiHelpers.ts`
- `areas` POST response shape: `{ area: { id: string } }` (confirmed from existing helper)
- Milestones validation CI failure (2026-04-16): `milestones.spec.ts` scenarios 6+7 fail on beta/main
  promotion run — `getErrorBannerText()` returns null. Pre-existing on Dependabot bump commits.
  Not from feature work. Triage: pre-existing flaky/broken test on beta.

## Invoices + Manage Settings E2E (2026-03-26) — Fixed 2026-03-26

POMs: `InvoicesPage.ts`, `InvoiceDetailPage.ts`, `HouseholdItemEditPage.ts`.
Tests: `e2e/tests/invoices/invoices.spec.ts`, `e2e/tests/navigation/settings-manage.spec.ts`.
Key API response shapes: Areas POST → `{area:{id}}`, Trades POST → `{trade:{id}}`, HI-Categories POST → `{id}` (entity directly), Invoices POST → `{invoice:{id}}`.
InvoicesPage.heading = "Budget" (from PageLayout title=t('invoices.title')). Modal locator: `getByRole('dialog',{name:/Invoice/i})`.
InvoiceDetailPage: edit modal `[role="dialog"][aria-labelledby="edit-modal-title"]`, delete modal `[aria-labelledby="delete-modal-title"]`, confirm delete button `[class*="confirmDeleteButton"]`.
ManagePage tab panel IDs: `areas-panel`, `trades-panel`, `budget-categories-panel`, `hi-categories-panel`. Create form IDs: `#areaName`, `#tradeName`, `#categoryName` (same for budget AND hi-cat tabs — only one renders at a time).
**ManagePage area/trade delete buttons have NO aria-label** — only text "Delete". Must scope via
`panel.locator('[class*="itemRow"]').filter({ hasText: entityName }).getByRole('button', { name: 'Delete', exact: true })`.
HI-categories delete buttons DO have `aria-label={Delete \${name}}` — getByRole with name works.
InvoicesPage.waitForLoaded() uses Promise.any() (not Promise.race()) to avoid dangling rejections.

## Milestones E2E (2026-03-26) — See milestones-e2e.md

Heading="Project", newMilestone=testId("new-milestone-button"), search=client-side (no waitForResponse).
List deleteModal=`getByRole('dialog',{name:'Delete Milestone'})`. Detail deleteModal=`[role="dialog"][aria-modal="true"]` (own impl).
Milestone IDs are integers (not strings). Back/cancel on CreatePage are `<Link>` anchors, not buttons.

## i18n German Locale: page.reload() Required After setLanguage() + page.goto() (2026-03-23)

After `setLanguage(page, 'de')` + `page.goto(targetUrl)`, always add `page.reload()` before
asserting German text. Pattern from "Key page headings render in German" test (passing) confirms.
Applied in i18n.spec.ts "German sidebar" test and all three i18n-categories.spec.ts German tests.
**The FIRST German locale switch in a test file needs `test.setTimeout(30000)` and a 20s expect
timeout** for the heading assertion — i18next cold-start initialization takes 10-15s on CI.
Pattern: `test.setTimeout(30000); setLanguage(de); goto(URL); reload(); expect(heading).toBeVisible({ timeout: 20000 })`.
Extra warm-up navigations (goto('/') to confirm 'Projekt') consume the 30s budget — avoid them.

**Known flaky test**: "German locale: Manage trades tab shows 'Sanitär' instead of 'Plumbing'"
(`i18n-categories.spec.ts`) fails intermittently on CI — locale doesn't initialize before the
English page renders. Was failing before PR #1186 too (run 23429182196). Not blocking for beta PRs.

## WorkItemsPage.search(): URL-based Wait Prevents Stale-DOM Race (2026-03-23)

After `fill(query)`, add `page.waitForURL(url => url.searchParams.get('q') === query)` BEFORE
awaiting the `waitForResponse`. This confirms the debounce fired and React committed search state.
Do NOT call `waitForLoaded()` after the response — it resolves on stale DOM rows from the WebKit
clear-event response and creates a race where betaTitle stays visible for 10s. The test's own
`expect().not.toBeVisible()` retry handles DOM convergence. Same pattern for `clearSearch()`.

## Dashboard Card Dismiss Reload: Use networkidle, Not waitForResponse (2026-03-23)

For "dismissed card stays hidden after page reload" test: register `waitForResponse(GET preferences)`
before reload failed — LocaleContext fires FIRST GET and resolves the promise, but usePreferences
hook's second GET (which applies hiddenCards) arrives later. Fix: use `page.waitForLoadState('networkidle')`
AFTER `heading.waitFor({ state: 'visible', timeout: 10000 })` to ensure BOTH preference fetches
complete. The heading waitFor needs 10s timeout (not 5s actionTimeout) since SPA reinit takes time.

## Vendor Count Assertions Are Fragile (2026-03-23)

`getVendorNames().length` assertions are unreliable with parallel workers sharing the same DB.
Use `not.toContain(specificName)` instead of exact count equality. Remove `namesBefore`/
`namesAfter` length comparisons in cancel/no-create tests.

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

## DataTable Migration (EPIC-18, PR #1177) POM Fixes (2026-03-22)

After DataTable migration, three POM fix patterns applied:

- **Modal `useId()` IDs broken**: `#create-modal-title`/`#delete-modal-title` don't exist.
  Always use `getByRole('dialog', { name: ... })` + `getByRole('heading', { level: 2 })` inside.
- **`confirmDeleteButton` → `btnConfirmDelete`**: WorkItems + HouseholdItems use
  `sharedStyles.btnConfirmDelete` from `shared.module.css`. Selector: `[class*="btnConfirmDelete"]`.
- **Mobile card name lookup**: DataTableCard has NO `cardName` class. The render() function
  runs identically for table cells AND cards. Name column with `styles.vendorLink` → use
  `[class*="vendorLink"]` inside `cardsContainer`. Applied in both getVendorNames() and
  openDeleteModal() mobile paths in VendorsPage.
- **HouseholdItems actions menu**: buttons are `role="button"` (default), NOT `role="menuitem"`.
  Use `[class*="menuItemDanger"]:visible` filtered by text "Delete".
- **Production bug #1178**: DateRangePicker phase resets after clicking start date.
  DateFilter.handleChange only fires when both dates set; DateRangePicker useEffect resets
  phase when startDate stays ''. Affects datatable-date-range-picker.spec.ts and
  datatable-ux-fixes.spec.ts — PRODUCTION BUG, not a test issue.

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

## Dashboard Card Count: 10 (UAT fix #844 added Recent Diary, 2026-03-15)

DashboardPage has 10 CARD_DEFINITIONS (added 'recent-diary' in UAT fix #844). Both desktop
grid AND mobile sections container render ALL cards simultaneously (CSS media queries control
visibility, not conditional rendering). Dismiss button count in DOM = up to 20 (10 × 2 containers).
Use `>= 10`. DashboardPage POM CARD_TITLES and DashboardCardId type updated to include 'recent-diary'.

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
  NOTE: PR #830 changed updateDiaryEntry from PUT to PATCH — save() was broken; fixed in PR #832

## Diary E2E (Story #804, 2026-03-14)

Files: `e2e/pages/DiaryPage.ts`, `e2e/pages/DiaryEntryDetailPage.ts`,
`e2e/tests/diary/diary-list.spec.ts`, `e2e/tests/diary/diary-detail.spec.ts`.

Key selectors:

- DiaryPage heading: `getByRole('heading', { level: 1, name: 'Construction Diary' })`
- Filter bar: `getByTestId('diary-filter-bar')`, search: `getByTestId('diary-search-input')`
- Type switcher: REMOVED from DiaryPage (UAT fix #840 removed DiaryEntryTypeSwitcher)
- Entry cards: `getByTestId('diary-card-{id}')`, date groups: `getByTestId('date-group-{date}')`
- Type chips: `getByTestId('type-filter-{entryType}')`, clear: `getByTestId('clear-filters-button')`
- Pagination: `getByTestId('prev-page-button')` / `getByTestId('next-page-button')`
- Detail back button: `getByLabel('Go back to diary')` (aria-label="Go back to diary"), back link: `getByRole('link', { name: 'Back to Diary' })`
- Metadata wrappers: `getByTestId('daily-log-metadata|site-visit-metadata|delivery-metadata|issue-metadata')`
- Outcome badge: `getByTestId('outcome-{pass|fail|conditional}')`, severity: `getByTestId('severity-{level}')`
- Automatic badge: `locator('[class*="badge"]').filter({ hasText: 'Automatic' })`

API: `POST /api/diary-entries` returns `DiaryEntrySummary` with `id` at top level (not nested).
Empty state uses shared.emptyState CSS module class (conditional render — use `.not.toBeVisible()` not `.toBeHidden()`).
DiaryPage.waitForLoaded() races: timeline visible OR emptyState visible OR errorBanner visible.

## Photos API Mock Must Return { photos: [] } Not [] (2026-03-15)

`GET /api/photos?entityType=...&entityId=...` returns `{ photos: [] }` (wrapped object).
`getPhotosForEntity()` in `photoApi.ts` does `.then(r => r.photos)` — if mock returns `[]`,
`r.photos` is `undefined` → `setPhotos(undefined)` → `PhotoGrid` crashes on `photos.length`.
ALWAYS mock photos as: `body: JSON.stringify({ photos: [] })` not `body: '[]'`.

## waitForURL on WebKit Tablet: pass `{ timeout: 15_000 }` for navigation after browser-back

Applied to: diary-detail.spec.ts Scenarios 2 and 3.

## Diary E2E Extended (Stories #806-#809, 2026-03-15)

Files: `diary-photos-signatures.spec.ts`, `diary-automatic-events.spec.ts`
POMs extended: DiaryEntryDetailPage (photoHeading, photoEmptyState, signatureSection, photoCountBadge),
DiaryPage (photoCountBadge).
NOTE: diary-export.spec.ts DELETED (UAT fix #845 removed export/print feature).
DiaryEntryDetailPage.printButton locator REMOVED. DiaryPage.exportButton/exportDialog REMOVED.

Key selectors:

- Photo count badge on entry card: `data-testid="photo-count-{entryId}"` (only rendered when photoCount > 0)
- Photo section heading: `[class*="photoHeading"]` — text "Photos (N)"
- Photo empty state: `[class*="photoEmptyState"]` — text "No photos attached yet."
- Signature section: `[class*="signatureSection"]` — conditional render (isSigned entries)
- `isSigned=true` entries (UAT fix #837): Edit hidden, Delete VISIBLE, "Add photos" VISIBLE
- `isAutomatic=true` entries: Edit hidden, Delete hidden, "Add photos" hidden
- Auto events: must mock photos endpoint (`**/api/photos*`) when mocking diary detail entries
- "Add photos" guard is `!isAutomatic` (not `!isAutomatic && !isSigned` as it was before #837)

## Diary UAT Fixes E2E (2026-03-15)

File: `e2e/tests/diary/diary-uat-fixes.spec.ts`

Key behavioral changes validated:

- Post-create navigation: `/diary/:id` (detail, NOT `/diary/:id/edit`) — UAT R2 fix #867 reverted #843
- Detail back button: `getByLabel('Go back to diary')` navigates to `/diary` (NOT browser-back) — #842
- Source link text: `data-testid="source-link-{sourceEntityId}"` shows `sourceEntityTitle` — #842
- Automatic events: flat `<div data-testid="automatic-section-{date}">` with "Automated Events" heading — UAT R2 #868
  (was collapsible `<details>/<summary>` in UAT R1 #838 — CHANGED in UAT R2)
- Dashboard "Recent Diary" card: title='Recent Diary', `recentDiaryCard()` helper in DashboardPage POM — #844
- RecentDiaryCard "View All" link only rendered when `entries.length > 0` — mock with ≥1 entry
- New Entry button: `getByRole('link', { name: 'New Entry', exact: true })` (no "+" prefix) — UAT R2 #866-C
- Signed badge on cards: `data-testid="signed-badge-{entryId}"` text "✓ Signed" — UAT R2 #869
- Mode filter chips: `data-testid="mode-filter-all/manual/automatic"` — UAT R2 #866-A
- Photo input on create: `data-testid="create-photo-input"` (file, multiple, accept image/\*) — UAT R2 #867

## SearchPicker/AreaPicker Filter Pattern (2026-03-19, issue #1074)

AreaPicker has two DOM states: unselected (input visible) vs selected (selectedDisplay visible, input gone).

- Unselected: `input[placeholder="Select an area"]` — click to open dropdown (role="listbox")
- Selected: `[class*="selectedDisplay"]` with `[class*="selectedTitle"]` + clear btn (aria-label="Clear selection")
- areaFilterContainer: `'#hi-filter-panel [class*="container"]:has(input[placeholder="Select an area"])'`
  (only valid in unselected state — use direct filter-panel scoping for selected-state methods)
- createAreaViaApi/deleteAreaViaApi: added to e2e/fixtures/apiHelpers.ts; API.areas in testData.ts
- After area selection, URL gets `?areaId=<id>`; clearing removes it. Use waitForResponse BEFORE selection.
