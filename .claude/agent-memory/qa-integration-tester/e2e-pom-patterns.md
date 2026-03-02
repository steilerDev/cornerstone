# E2E POM Patterns and Known Pitfalls

## Budget Sub-Navigation (Story #149)

- `/budget` redirects to `/budget/overview` (NOT `/budget/categories`)
- `ROUTES.budget` in `e2e/fixtures/testData.ts` is `/budget/overview`
- Budget sub-nav links: Overview, Categories, Vendors, Sources, Subsidies

## Strict Mode Violations: Sub-Nav Headings vs. List Headings

When the budget sub-navigation is visible, bare heading text like "Categories" appears TWICE:

1. As the sub-nav active item label (rendered as `<h2>` or similar)
2. As the content area list heading "Categories (N)"

**Fix pattern**: Narrow locator to the count format:

```typescript
// BAD — matches sub-nav heading AND list heading
page.getByRole('heading', { level: 2, name: /^Categories/ });

// GOOD — only matches "Categories (10)", not bare "Categories"
page.getByRole('heading', { level: 2, name: /^Categories \(/ });
```

Applied in `e2e/pages/BudgetCategoriesPage.ts` for both `categoriesSection` and `categoriesListHeading`.

## waitForVendorsLoaded() — Mobile Card Layout

On mobile/tablet, vendors render as cards (`[class*="card"]` inside `[class*="cardsContainer"]`),
not as table rows (`tbody tr`). `waitForVendorsLoaded()` must race three options:

```typescript
await Promise.race([
  this.tableBody.locator('tr').first().waitFor({ state: 'visible' }),
  this.cardsContainer.locator('[class*="card"]').first().waitFor({ state: 'visible' }),
  this.emptyState.waitFor({ state: 'visible' }),
]);
```

NOTE: Never add explicit `timeout: N` here — omit it to use the project-level actionTimeout.

The `cardsContainer` locator (`page.locator('[class*="cardsContainer"]')`) already exists in VendorsPage POM.

## General Pattern: Dual-Layout (Desktop Table + Mobile Cards)

Several budget pages render in two layouts. When writing `waitForXLoaded()` helpers:

- Always include table row race, card race, AND empty state race
- Never assume table rows are present on mobile viewports

## Promise.race with waitFor — Error Handling

`Promise.race()` with multiple `waitFor()` calls: if the first race arm that resolves wins,
the others are abandoned (not awaited). Playwright handles this correctly; no cleanup needed.
The losing promises reject after their timeout, but that rejection is ignored by `Promise.race`.

## AppShellPage.openSidebar / closeSidebar — Mobile Race Condition (fixed 2026-02-20)

On mobile, calling `openSidebar()` immediately after `page.goto()` can race the React mount
cycle. The `<aside>` element may not be in the DOM yet when `isSidebarOpen()` reads
`getAttribute('data-open')` (returns null → false), and then `menuButton.click()` can fail
if the header hasn't mounted either.

**Fix**: Add `await this.sidebar.waitFor({ state: 'attached' })` at the start
of both `openSidebar()` and `closeSidebar()`. This ensures the sidebar is in the DOM before
any attribute read or button click. No explicit timeout — uses project-level actionTimeout.

Applied in `e2e/pages/AppShellPage.ts`.

## scrollIntoViewIfNeeded() for Admin Table Action Buttons (tablet)

On tablet viewports, admin user table rows may be below the fold. Calling
`scrollIntoViewIfNeeded()` on the target button before `.click()` ensures it's in the
viewport. Applied in `UserManagementPage.openEditModal()` and `openDeactivateModal()`.

Pattern:

```typescript
const button = row.getByRole('button', { name: 'Edit' });
await button.scrollIntoViewIfNeeded();
await button.click();
```

## Budget Overview POM (BudgetOverviewPage.ts, 2026-02-21)

- `loadingIndicator`: `getByRole('status', { name: 'Loading budget overview' })` — unique role+label combo
- Error card: `page.locator('[role="alert"]').filter({ has: page.getByRole('heading', { name: 'Error', exact: true }) })`
  → Cannot use `getByRole('dialog')` — the error state is NOT a dialog
- Summary cards: `section[aria-labelledby="card-<slug>"]` where slug = `title.replace(/\s+/g, '-').toLowerCase()`
  → "Total Budget" → `card-total-budget`, "Financing" → `card-financing`, etc.
- `getSummaryCardValue(cardTitle, label)` finds `[class*="statRow"]` filtered by `[class*="statLabel"]` text
- Category breakdown table: `[aria-labelledby="category-breakdown-heading"]` → `table` locator chain
- `waitForLoaded()`: race errorCard vs emptyState vs cardsGrid (all three states are valid "loaded" outcomes)
- Empty state: `[class*="emptyState"]` — only shown when ALL of planned/actual/categories/sources are 0
  → Even zero-value data with `sourceCount > 0` will NOT show empty state

## BudgetSourcesPage POM (BudgetSourcesPage.ts, 2026-02-21)

- Section title: `getByRole('heading', { level: 2, name: 'Sources', exact: true })`
  → NOT 'Sources (N)' — BudgetSourcesPage uses a plain h2 "Sources", not a count variant
- createCancelButton: scoped to `createFormHeading.locator('..')` to avoid matching edit-row Cancel buttons
- emptyState: `page.locator('p[class*="emptyState"]')` — it's a `<p>` tag (NOT a `<div>`)
- sourcesList: `page.locator('[class*="sourcesList"]')` — inside the "Sources (N)" list card
- Delete modal: `role="dialog" aria-labelledby="delete-modal-title"` → use `getByRole('dialog', { name: 'Delete Budget Source' })`
  → Delete confirm button: `/Delete Source|Deleting\.\.\./` (NOT "Delete Budget Source")
- API response: `{ budgetSource: { id, ... } }` (singular `budgetSource`, not `budgetSources`)
- No edit modal — all editing is inline (form with `aria-label="Edit <name>"`)

## SubsidyProgramsPage POM (SubsidyProgramsPage.ts, 2026-02-21)

- createCancelButton scoped to `createFormHeading.locator('..')` parent — avoids matching edit-row Cancel
- createCategoryCheckboxList: `page.locator('[class*="categoryCheckboxList"]').first()` — `.first()` needed
  because the EDIT form also renders a checkbox list when editing a program
- Delete modal name: `getByRole('dialog', { name: 'Delete Subsidy Program' })`
  → Delete confirm button: `/Delete Program|Deleting\.\.\./` (NOT "Delete Subsidy Program")
- API response: `{ subsidyProgram: { id, ... } }` (singular, not `subsidyPrograms`)
- Both `BudgetSourcesPage` and `SubsidyProgramsPage` follow the identical inline-edit pattern as BudgetCategoriesPage
- `getProgramsCount()` reads `Programs (N)` heading inside the list card (NOT the section header)
- `getEditForm(name)` → `aria-label={`Edit ${name}`}` — same as BudgetCategoriesPage and BudgetSourcesPage

## CRITICAL: Hardcoded Timeouts Override Project-Level Timeouts (2026-02-21)

**Never use hardcoded `{ timeout: N }` in POM `waitFor()` calls** unless the value is HIGHER
than the project-level setting for ALL projects.

The Playwright config sets:

- Desktop: `timeout: 10_000` (per-test), no explicit action/expect timeout → Playwright default (30s)
- Tablet: `timeout: 60_000`, `expect.timeout: 15_000`, `actionTimeout: 15_000`, `navigationTimeout: 15_000`
- Mobile: `timeout: 60_000`, `expect.timeout: 15_000`, `actionTimeout: 15_000`, `navigationTimeout: 15_000`

An explicit `waitFor({ timeout: 5000 })` in a POM method OVERRIDES the tablet/mobile 15s
setting, causing spurious timeouts on the slow WebKit engine.

**Cleanup performed 2026-02-21**: All `timeout: 5000` removed from all POM files and spec
files in a single pass (19 files, ~40 occurrences). Only `timeout: 7000` and higher remain.

**Rule**: POM `waitFor()` calls must omit `timeout` entirely (let project config apply):

```typescript
// BAD — breaks on tablet/mobile with WebKit
await this.heading.waitFor({ state: 'visible', timeout: 5000 });
// GOOD — uses project-level actionTimeout
await this.heading.waitFor({ state: 'visible' });
```

**Exception**: Short probe timeouts (`isInErrorState()`, `isVisible()` probes) may use small
explicit timeouts intentionally — document why with a comment.

## CRITICAL: CSS Module Class Substring Selectors — Strict Mode Violations

`[class*="prefix"]` matches ALL elements whose class contains "prefix" as a substring.
In CSS Modules with `[local]_[hash]` naming:

- `.emptyState` → class `emptyState_abc12`
- `.emptyStateTitle` → class `emptyStateTitle_abc12`
- `.emptyStateDescription` → class `emptyStateDescription_abc12`

All three match `[class*="emptyState"]`! This causes **strict mode violations** when the
locator is used directly (not with `.all()` or `.first()`).

**Fix pattern**: Add element type qualifier:

```typescript
// BAD — matches container AND child elements
page.locator('[class*="emptyState"]');
// GOOD — matches only the div container
page.locator('div[class*="emptyState"]');
```

Applied to `BudgetOverviewPage.ts` — the `.emptyState` div has sibling class patterns
`.emptyStateTitle` (p) and `.emptyStateDescription` (p).

## Mobile Delete Flow — CSS-Hidden Table Issue (WorkItemsPage, 2026-02-21)

On mobile (< 768px), the table has `display: none` via CSS but remains **in the DOM**.
`textContent()` and `locator.all()` work on CSS-hidden elements — so iterating table rows
via `tableBody.locator('tr').all()` finds rows on mobile, but clicking buttons inside them
fails (they are not interactable).

**Fix**: Always check `tableContainer.isVisible()` before using table rows:

```typescript
const tableVisible = await this.tableContainer.isVisible();
if (tableVisible) {
  // Desktop: use table rows
} else {
  // Mobile: use card container
}
```

Applied to `WorkItemsPage.openDeleteModal()`.

## WorkItemsPage / WorkItemCreatePage / WorkItemDetailPage POM Notes (2026-02-21)

### WorkItemsPage key facts

- "New Work Item" is a `<button>` (calls `navigate()`), NOT a `<Link>` — use `getByRole('button')`.
- Delete modal uses `role="dialog"` with `aria-modal="true"` but NO `aria-labelledby`.
  Confirm button has class `confirmDeleteButton` — use `this.deleteModal.locator('[class*="confirmDeleteButton"]')`.
- `openDeleteModal(title)` clicks `aria-label="Actions menu"` (⋮) in the row, then "Delete".
- `waitForLoaded()` races table rows, mobile cards, and empty state (same pattern as VendorsPage).
- `getWorkItemTitles()` reads `[class*="titleCell"]` (desktop) or `[class*="cardTitle"]` (mobile).
- Status filter ID: `#status-filter`, user: `#user-filter`, tag: `#tag-filter`, sort: `#sort-filter`.

### WorkItemCreatePage key facts

- Back button is a `<button>` with onClick `navigate('/work-items')`, NOT a `<Link>`.
- Submit is type="submit" disabled during `isSubmitting`; text changes to "Creating...".
- Validation runs on submit; shows `[class*="errorText"]` below `#title` for empty title.
  NO submit-disabled state for empty title — button is always enabled; validation fires on click.
- On success: navigates to `/work-items/:id`.
- Status select `#status` has values: not_started, in_progress, completed, blocked.

### WorkItemDetailPage key facts

- Delete modal is plain `div[class*="modal"]` — NO `role="dialog"`. Scope by heading filter.
  Confirm button: `[class*="modalDeleteButton"]`, cancel: `[class*="modalCancelButton"]`.
  Modal heading: "Delete Work Item?" (with question mark — note difference from WorkItemsPage modal).
- Error state (404): `[class*="error"]` + contains a `<button>` "Back to Work Items".
- Vendor picker: `fetchVendors({ pageSize: 500 })` — regression test validates no error banner.
- Budget Edit button: `aria-label="Edit budget fields"`.
- Vendor picker `selectOption({ label: string })` — label must be `string`, NOT `RegExp`.
- `linkVendor(name)` / `linkSubsidy(name)` — picker only renders when un-linked items exist.
- `startEditingDescription()` must use `:not()` chain to avoid matching `.descriptionEdit`,
  `.descriptionTextarea`, `.descriptionEditActions` in edit mode (strict mode violation).
- `saveDescription()` must `waitFor({ state: 'hidden' })` on the textarea AFTER click, so
  callers can assert on display-mode text without a mixed edit+display strict-mode violation.

## Modal Backdrop Click — Geometry Issue (2026-02-21)

**Problem**: `page.locator('[class*="modalBackdrop"]').click()` clicks the geometric center of
the full-viewport backdrop. If the modal content div is centered on top of the backdrop, the
click lands on the modal content (not the backdrop's onClick handler), so the modal does NOT close.

**Fix**: Click at `{ position: { x: 10, y: 10 } }` — the top-left corner, outside the centered
modal box:

```typescript
// BAD — clicks center of backdrop → lands on modal content
await page.locator('[class*="modalBackdrop"]').click();

// GOOD — clicks top-left corner, outside the modal box
await page.locator('[class*="modalBackdrop"]').click({ position: { x: 10, y: 10 } });
```

## Known App Bugs (affecting E2E tests, not fixable in test code)

### BudgetSources / SubsidyPrograms create/edit failure (issue #175)

`createBudgetSource`, `updateBudgetSource`, `createSubsidyProgram`, `updateSubsidyProgram`
in the API client return `Promise<BudgetSource>` / `Promise<SubsidyProgram>` but the server
wraps responses in `{ budgetSource: {...} }` / `{ subsidyProgram: {...} }`.

**Symptoms**:

- Create: page goes blank (React crash — `getSourceTypeClass(styles, undefined)` throws TypeError)
- Edit/update: success banner shows `"undefined"` (e.g. `Budget source "undefined" updated successfully`)

**Not fixable in test code**. Fix must be applied to `client/src/lib/budgetSourcesApi.ts`
and `client/src/lib/subsidyProgramsApi.ts`. Tracked in GitHub issue #175.
