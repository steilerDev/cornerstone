---
name: milestones-e2e
description: Key POM selectors and patterns for the milestones E2E tests written in 2026-03
type: project
---

# Milestones E2E — Selectors and Patterns

**Files**: `e2e/pages/MilestonesPage.ts`, `e2e/pages/MilestoneCreatePage.ts`, `e2e/pages/MilestoneDetailPage.ts`, `e2e/tests/milestones/milestones.spec.ts`

## Key Selectors

### MilestonesPage (list)
- Heading: `getByRole('heading', { level: 1, name: 'Project' })` — PageLayout h1 = "Project" (milestones.page.title)
- New Milestone: `getByTestId('new-milestone-button')` — stable data-testid on the button
- Search: `getByLabel('Search items')` — client-side filtering, NO waitForResponse needed after fill()
- Delete modal: `getByRole('dialog', { name: 'Delete Milestone' })` — shared Modal component
- Confirm delete: `[class*="btnConfirmDelete"]` inside delete modal
- Actions menu: `[aria-label="Actions menu"]` in table row/card

### MilestoneCreatePage
- Page h1: `getByRole('heading', { level: 1, name: 'Project' })` — same as list (PageLayout)
- Form h2: `getByRole('heading', { level: 2, name: 'Create Milestone' })`
- Back link: `getByRole('link', { name: '← Milestones' })` — it's an <a>, NOT <button>
- Cancel: `getByRole('link', { name: 'Cancel' })` — also a <Link> (<a>), NOT <button>
- Title: `locator('#title')` or `getByTestId('milestone-title-input')`
- Target date: `locator('#targetDate')` or `getByTestId('milestone-target-date-input')`
- Submit: `getByTestId('create-milestone-button')`
- Error banner: `locator('[role="alert"][class*="errorBanner"]')` — used for BOTH validation + server errors

### MilestoneDetailPage
- h1: `getByRole('heading', { level: 1 })` — the milestone title (dynamic)
- Back button: `getByRole('button', { name: /← Back to Milestones/i })` — <button> NOT <a>
- Edit button: `getByTestId('edit-milestone-button')`
- Delete button: `getByTestId('delete-milestone-button')`
- Status badge: `locator('[class*="statusBadge"]')` — text "Completed" or "Pending"
- Save button: `getByTestId('save-milestone-button')`
- Completed checkbox: `getByTestId('milestone-completed-checkbox')`
- Delete modal: `locator('[role="dialog"][aria-modal="true"]')` — own implementation (NOT shared Modal)
- Confirm delete: `getByTestId('confirm-delete-milestone')`
- Not found state: `locator('[class*="notFound"]')`

## Critical Behavioral Notes

1. **MilestonesPage search is client-side**: All milestones are loaded once at mount. The DataTable
   filters them synchronously on search input change. No API waitForResponse after fill().
   However, `waitForLoaded()` after `goto()` is still needed to wait for the initial GET.

2. **List page heading = "Project"**: Both MilestonesPage and WorkItemsPage use PageLayout with
   `title={t('milestones.page.title')}` = "Project" — the SubNav distinguishes which tab is active.

3. **getMilestoneTitles() fallback**: No `[class*="itemLink"]` or `[class*="vendorLink"]` in
   milestones — the title column renders plain text. Read first `td` of each row (desktop) or
   first `cardCell` (mobile).

4. **Detail page uses its own modal, not shared Modal**: The MilestoneDetailPage delete modal is
   a custom `<div role="dialog" aria-modal="true">`. The MilestonesPage list delete modal uses
   the shared `<Modal>` component. Selectors differ between the two pages.

5. **createMilestoneViaApi returns number**: Unlike work items (string UUID), milestone IDs are
   integers. Use `createdId: number | null` in tests.

6. **POST /api/milestones response shape — NO wrapper**: The server returns `MilestoneDetail`
   directly (e.g. `{ id: 1, title: "...", ... }`), NOT wrapped in `{ milestone: { id: 1 } }`.
   This was a bug in the original test/helper code — `body.milestone.id` caused
   `TypeError: Cannot read properties of undefined (reading 'id')` in CI. Correct pattern:
   `const body = (await response.json()) as { id: number }; return body.id;`
   Same applies to in-test POST response parsing in Scenarios 4 and 5.

**Why**: Milestones feature had zero E2E coverage. Written as part of Gap-1 E2E work (2026-03).
**How to apply**: When adding more milestone-related tests, reuse these POMs and patterns.
