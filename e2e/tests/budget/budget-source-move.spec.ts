/**
 * E2E tests for Budget Source multi-select + mass-move dialog (Story #1248)
 *
 * UAT Scenarios covered:
 * 1. Select lines → floating action bar appears with correct count  (@smoke)
 * 2. Deselect all → action bar disappears
 * 3. Open modal — current source is excluded from picker, other source is present
 * 4. Happy path (no claimed invoices) — move succeeds, toast shown  (@smoke)
 * 5. Claimed invoice warning gates confirm button
 * 6. API 409 STALE_OWNERSHIP → FormError visible, modal stays open, cancel closes
 * 7. Area name tri-state click selects all lines in the group  (#1323)
 * 8. Mobile viewport — select line, action bar visible  (@smoke)
 * 9. Parent item card select-all + toggle back  (#1323)
 * 10. Mixed aria-checked + nav icon isolation  (#1323)
 *
 * API mocking strategy:
 * - Real sources created via API for stable IDs.
 * - GET /api/budget-sources/:id/budget-lines is mocked per test to control line content.
 * - PATCH move endpoint mocked for scenario 4 (200 success) and scenario 6 (409 error).
 * - All routes are unregistered in finally blocks.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { BudgetSourcesPage } from '../../pages/BudgetSourcesPage.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

interface BudgetSourceApiData {
  name: string;
  sourceType?: string;
  totalAmount: number;
  interestRate?: number | null;
  terms?: string | null;
  notes?: string | null;
  status?: string;
}

interface BudgetSourceApiResponse {
  id: string;
  name: string;
}

async function createSourceViaApi(page: Page, data: BudgetSourceApiData): Promise<string> {
  const response = await page.request.post(API.budgetSources, {
    data: {
      sourceType: 'bank_loan',
      status: 'active',
      interestRate: null,
      terms: null,
      notes: null,
      ...data,
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { budgetSource: BudgetSourceApiResponse };
  return body.budgetSource.id;
}

async function deleteSourceViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.budgetSources}/${id}`);
}

/** Build a glob URL for the budget-lines endpoint of a specific source. */
function budgetLinesUrl(sourceId: string): string {
  return `**/api/budget-sources/${sourceId}/budget-lines`;
}

/** Build a glob URL for the budget-lines move endpoint. */
function budgetLinesMoveUrl(sourceId: string): string {
  return `**/api/budget-sources/${sourceId}/budget-lines/move`;
}

/**
 * Mock response: two work item lines in the "Kitchen" area, no claimed invoices.
 */
function mockTwoLines(sourceId: string, hasClaimedInvoice = false) {
  return {
    workItemLines: [
      {
        id: `wil-a-${sourceId}`,
        description: 'Hardwood floor installation',
        plannedAmount: 8000,
        confidence: 'quote',
        confidenceMargin: 1.0,
        invoiceLink: null,
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
        parentId: `wi-parent-${sourceId}`,
        parentName: 'Flooring',
        area: { id: `area-k-${sourceId}`, name: 'Kitchen', color: '#4CAF50', ancestors: [] },
        hasClaimedInvoice,
      },
      {
        id: `wil-b-${sourceId}`,
        description: 'Subfloor preparation',
        plannedAmount: 1500,
        confidence: 'own_estimate',
        confidenceMargin: 1.2,
        invoiceLink: null,
        createdAt: '2026-01-02T10:00:00.000Z',
        updatedAt: '2026-01-02T10:00:00.000Z',
        parentId: `wi-parent-${sourceId}`,
        parentName: 'Flooring',
        area: { id: `area-k-${sourceId}`, name: 'Kitchen', color: '#4CAF50', ancestors: [] },
        hasClaimedInvoice: false,
      },
    ],
    householdItemLines: [],
  };
}

/**
 * Mock response: one work item line with hasClaimedInvoice=true.
 */
function mockOneClaimedLine(sourceId: string) {
  return {
    workItemLines: [
      {
        id: `wil-claimed-${sourceId}`,
        description: 'Claimed invoice line',
        plannedAmount: 5000,
        confidence: 'invoice',
        confidenceMargin: 1.0,
        invoiceLink: 'doc-42',
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
        parentId: `wi-parent-${sourceId}`,
        parentName: 'Electrical',
        area: { id: `area-e-${sourceId}`, name: 'Living Room', color: '#2196F3', ancestors: [] },
        hasClaimedInvoice: true,
      },
    ],
    householdItemLines: [],
  };
}

/**
 * Mock response: three work item lines in the same "Bathroom" area and parent.
 */
function mockThreeLinesSameArea(sourceId: string) {
  return {
    workItemLines: [
      {
        id: `wil-1-${sourceId}`,
        description: 'Tile installation',
        plannedAmount: 2000,
        confidence: 'quote',
        confidenceMargin: 1.0,
        invoiceLink: null,
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
        parentId: `wi-bath-${sourceId}`,
        parentName: 'Bathroom Remodel',
        area: { id: `area-b-${sourceId}`, name: 'Bathroom', color: '#9C27B0', ancestors: [] },
        hasClaimedInvoice: false,
      },
      {
        id: `wil-2-${sourceId}`,
        description: 'Plumbing fixtures',
        plannedAmount: 3500,
        confidence: 'own_estimate',
        confidenceMargin: 1.2,
        invoiceLink: null,
        createdAt: '2026-01-02T10:00:00.000Z',
        updatedAt: '2026-01-02T10:00:00.000Z',
        parentId: `wi-bath-${sourceId}`,
        parentName: 'Bathroom Remodel',
        area: { id: `area-b-${sourceId}`, name: 'Bathroom', color: '#9C27B0', ancestors: [] },
        hasClaimedInvoice: false,
      },
      {
        id: `wil-3-${sourceId}`,
        description: 'Vanity cabinet',
        plannedAmount: 1200,
        confidence: 'quote',
        confidenceMargin: 1.0,
        invoiceLink: null,
        createdAt: '2026-01-03T10:00:00.000Z',
        updatedAt: '2026-01-03T10:00:00.000Z',
        parentId: `wi-bath-${sourceId}`,
        parentName: 'Bathroom Remodel',
        area: { id: `area-b-${sourceId}`, name: 'Bathroom', color: '#9C27B0', ancestors: [] },
        hasClaimedInvoice: false,
      },
    ],
    householdItemLines: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Select lines → action bar appears (@smoke)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Select lines → action bar appears', { tag: ['@smoke', '@responsive'] }, () => {
  test(
    'checking two line checkboxes shows the action bar with "2 lines selected"',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const sourcesPage = new BudgetSourcesPage(page);
      const sourceName = `${testPrefix} ActionBar Source`;
      let sourceId: string | null = null;

      try {
        sourceId = await createSourceViaApi(page, { name: sourceName, totalAmount: 50000 });

        await page.route(budgetLinesUrl(sourceId), async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockTwoLines(sourceId!)),
          });
        });

        await sourcesPage.goto();
        await sourcesPage.waitForSourcesLoaded();

        // Expand the source to show lines
        const expandResponse = page.waitForResponse(budgetLinesUrl(sourceId));
        await sourcesPage.expandSourceLines(sourceName);
        await expandResponse;

        // Check first line
        const checkbox1 = sourcesPage.getLineCheckbox(sourceId, 'Hardwood floor installation');
        await checkbox1.waitFor({ state: 'visible' });
        await checkbox1.check();

        // After first check: action bar should show "1 line selected"
        const actionBar = sourcesPage.getActionBar(sourceId);
        await expect(actionBar).toBeVisible();
        await expect(actionBar).toContainText('1 line selected');

        // Check second line
        const checkbox2 = sourcesPage.getLineCheckbox(sourceId, 'Subfloor preparation');
        await checkbox2.check();

        // Action bar updates to "2 lines selected"
        await expect(actionBar).toContainText('2 lines selected');

        // "Move to another source…" button is visible inside the action bar
        const moveButton = sourcesPage.getMoveButton(sourceId);
        await expect(moveButton).toBeVisible();
      } finally {
        if (sourceId) await page.unroute(budgetLinesUrl(sourceId));
        if (sourceId) await deleteSourceViaApi(page, sourceId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Deselect all → action bar disappears
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Deselect all → action bar disappears', { tag: '@responsive' }, () => {
  test('unchecking the last selected line hides the action bar', async ({ page, testPrefix }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    const sourceName = `${testPrefix} Deselect Source`;
    let sourceId: string | null = null;

    try {
      sourceId = await createSourceViaApi(page, { name: sourceName, totalAmount: 20000 });

      await page.route(budgetLinesUrl(sourceId), async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockTwoLines(sourceId!)),
        });
      });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      const expandResponse = page.waitForResponse(budgetLinesUrl(sourceId));
      await sourcesPage.expandSourceLines(sourceName);
      await expandResponse;

      // Select one line
      const checkbox = sourcesPage.getLineCheckbox(sourceId, 'Hardwood floor installation');
      await checkbox.waitFor({ state: 'visible' });
      await checkbox.check();

      const actionBar = sourcesPage.getActionBar(sourceId);
      await expect(actionBar).toBeVisible();

      // Uncheck it.
      // The sticky action bar that appears after check() renders at bottom:0
      // and may cover the checkbox on narrow viewports when Playwright's
      // internal scrollIntoViewIfNeeded() positions the element directly
      // beneath the sticky bar. Use click({ force: true }) to bypass the
      // coverage check — the underlying <input type="checkbox"> still
      // receives the click and fires React's onChange handler correctly.
      await checkbox.click({ force: true });

      // Action bar must no longer be visible (React removes it from DOM when count=0)
      await expect(actionBar).not.toBeVisible();
    } finally {
      if (sourceId) await page.unroute(budgetLinesUrl(sourceId));
      if (sourceId) await deleteSourceViaApi(page, sourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Open modal — current source excluded, other source in picker
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Open modal — current source excluded from picker', { tag: '@responsive' }, () => {
  test('typing the source name in the picker excludes the current source and includes other sources', async ({
    page,
    testPrefix,
  }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    const sourceAName = `${testPrefix} Source A Excl`;
    const sourceBName = `${testPrefix} Source B Excl`;
    let sourceAId: string | null = null;
    let sourceBId: string | null = null;

    try {
      sourceAId = await createSourceViaApi(page, { name: sourceAName, totalAmount: 30000 });
      sourceBId = await createSourceViaApi(page, { name: sourceBName, totalAmount: 25000 });

      // Mock lines for source A (one line so we can select it)
      await page.route(budgetLinesUrl(sourceAId), async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockTwoLines(sourceAId!)),
        });
      });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      // Expand source A and select a line
      const expandResponse = page.waitForResponse(budgetLinesUrl(sourceAId));
      await sourcesPage.expandSourceLines(sourceAName);
      await expandResponse;

      const checkbox = sourcesPage.getLineCheckbox(sourceAId, 'Hardwood floor installation');
      await checkbox.waitFor({ state: 'visible' });
      await checkbox.check();

      // Open the move modal
      await sourcesPage.openMoveModal(sourceAId);

      // Modal is visible with correct title
      await expect(sourcesPage.moveModal).toBeVisible();
      await expect(
        sourcesPage.moveModal.getByRole('heading', {
          level: 2,
          name: 'Move lines to another source',
        }),
      ).toBeVisible();

      // Type source A's unique prefix in the search input — should NOT appear
      const searchInput = sourcesPage.moveModalSearchInput;
      await searchInput.waitFor({ state: 'visible' });
      await searchInput.fill(sourceAName);

      // Source A must NOT be in the dropdown
      await expect(
        sourcesPage.moveModal.getByRole('option', { name: sourceAName }),
      ).not.toBeVisible();

      // Type source B's name — should appear
      await searchInput.fill(sourceBName);
      await expect(sourcesPage.moveModal.getByRole('option', { name: sourceBName })).toBeVisible();

      // Cancel the modal
      await sourcesPage.moveModalCancelButton.click();
      await expect(sourcesPage.moveModal).not.toBeVisible();
    } finally {
      if (sourceAId) await page.unroute(budgetLinesUrl(sourceAId));
      if (sourceAId) await deleteSourceViaApi(page, sourceAId);
      if (sourceBId) await deleteSourceViaApi(page, sourceBId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Happy path (no claimed invoices) (@smoke)
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Happy path — move lines with no claimed invoices',
  { tag: ['@smoke', '@responsive'] },
  () => {
    test(
      'selecting a line, picking a target, and confirming moves the line and shows a toast',
      { tag: '@smoke' },
      async ({ page, testPrefix }) => {
        const sourcesPage = new BudgetSourcesPage(page);
        const sourceAName = `${testPrefix} Source Happy A`;
        const sourceBName = `${testPrefix} Source Happy B`;
        let sourceAId: string | null = null;
        let sourceBId: string | null = null;

        try {
          sourceAId = await createSourceViaApi(page, { name: sourceAName, totalAmount: 40000 });
          sourceBId = await createSourceViaApi(page, { name: sourceBName, totalAmount: 20000 });

          // Mock lines for source A (one unclaimed line)
          await page.route(budgetLinesUrl(sourceAId), async (route) => {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                workItemLines: [
                  {
                    id: `wil-happy-${sourceAId}`,
                    description: 'Window installation',
                    plannedAmount: 6000,
                    confidence: 'quote',
                    confidenceMargin: 1.0,
                    invoiceLink: null,
                    createdAt: '2026-01-01T10:00:00.000Z',
                    updatedAt: '2026-01-01T10:00:00.000Z',
                    parentId: `wi-windows-${sourceAId}`,
                    parentName: 'Windows',
                    area: {
                      id: `area-lr-${sourceAId}`,
                      name: 'Living Room',
                      color: '#FF9800',
                      ancestors: [],
                    },
                    hasClaimedInvoice: false,
                  },
                ],
                householdItemLines: [],
              }),
            });
          });

          // Mock the PATCH move endpoint — line IDs are fake (not in DB), so let the real
          // server be bypassed to avoid a 409 STALE_OWNERSHIP response.
          await page.route(
            (url) => url.pathname === `/api/budget-sources/${sourceAId}/budget-lines/move`,
            async (route) => {
              if (route.request().method() !== 'PATCH') {
                await route.continue();
                return;
              }
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ movedWorkItemLines: 1, movedHouseholdItemLines: 0 }),
              });
            },
          );

          await sourcesPage.goto();
          await sourcesPage.waitForSourcesLoaded();

          // Expand source A and select the line
          const expandResponse = page.waitForResponse(budgetLinesUrl(sourceAId));
          await sourcesPage.expandSourceLines(sourceAName);
          await expandResponse;

          const checkbox = sourcesPage.getLineCheckbox(sourceAId, 'Window installation');
          await checkbox.waitFor({ state: 'visible' });
          await checkbox.check();

          // Open the move modal
          await sourcesPage.openMoveModal(sourceAId);
          await expect(sourcesPage.moveModal).toBeVisible();

          // The confirm button must be disabled (no target selected yet)
          await expect(sourcesPage.moveModalConfirmButton).toBeDisabled();

          // Select target source B
          await sourcesPage.selectMoveTarget(sourceBName);

          // The confirm button must now be enabled (no claimed lines, target selected)
          await expect(sourcesPage.moveModalConfirmButton).toBeEnabled();

          // Confirm — PATCH is mocked to return 200 (line IDs are synthetic, not in the DB)
          const moveResponse = page.waitForResponse(
            (resp) =>
              resp.url().includes(`/budget-sources/${sourceAId}/budget-lines/move`) &&
              resp.status() === 200,
          );
          await sourcesPage.confirmMove();
          await moveResponse;

          // Modal must close
          await expect(sourcesPage.moveModal).not.toBeVisible();

          // Success toast must appear
          const toast = page.locator('[role="alert"]').filter({ hasText: /Moved 1 line to/ });
          await expect(toast).toBeVisible();
          await expect(toast).toContainText(sourceBName);
        } finally {
          if (sourceAId) await page.unroute(budgetLinesUrl(sourceAId));
          if (sourceAId) await page.unroute(budgetLinesMoveUrl(sourceAId));
          if (sourceAId) await deleteSourceViaApi(page, sourceAId);
          if (sourceBId) await deleteSourceViaApi(page, sourceBId);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Claimed invoice warning gates confirm button
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Claimed invoice warning gates confirm button', { tag: '@responsive' }, () => {
  test('selecting a line with hasClaimedInvoice shows a warning block and disables confirm until "I understand" is checked', async ({
    page,
    testPrefix,
  }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    const sourceAName = `${testPrefix} Claimed Source A`;
    const sourceBName = `${testPrefix} Claimed Source B`;
    let sourceAId: string | null = null;
    let sourceBId: string | null = null;

    try {
      sourceAId = await createSourceViaApi(page, { name: sourceAName, totalAmount: 30000 });
      sourceBId = await createSourceViaApi(page, { name: sourceBName, totalAmount: 20000 });

      // Mock lines with one claimed invoice line
      await page.route(budgetLinesUrl(sourceAId), async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockOneClaimedLine(sourceAId!)),
        });
      });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      const expandResponse = page.waitForResponse(budgetLinesUrl(sourceAId));
      await sourcesPage.expandSourceLines(sourceAName);
      await expandResponse;

      // Select the claimed line
      const checkbox = sourcesPage.getLineCheckbox(sourceAId, 'Claimed invoice line');
      await checkbox.waitFor({ state: 'visible' });
      await checkbox.check();

      // Open move modal
      await sourcesPage.openMoveModal(sourceAId);
      await expect(sourcesPage.moveModal).toBeVisible();

      // Select target source B
      await sourcesPage.selectMoveTarget(sourceBName);

      // Warning block must be visible
      await expect(sourcesPage.moveModalWarningBlock).toBeVisible();
      await expect(sourcesPage.moveModalWarningBlock).toContainText('claimed invoice');

      // Confirm button must be disabled (understood not checked)
      await expect(sourcesPage.moveModalConfirmButton).toBeDisabled();

      // Check "I understand"
      const understoodCheckbox = sourcesPage.moveModalUnderstoodCheckbox;
      await understoodCheckbox.waitFor({ state: 'visible' });
      await understoodCheckbox.check();

      // Confirm button must now be enabled
      await expect(sourcesPage.moveModalConfirmButton).toBeEnabled();

      // Cancel to avoid performing the actual move
      await sourcesPage.moveModalCancelButton.click();
      await expect(sourcesPage.moveModal).not.toBeVisible();
    } finally {
      if (sourceAId) await page.unroute(budgetLinesUrl(sourceAId));
      if (sourceAId) await deleteSourceViaApi(page, sourceAId);
      if (sourceBId) await deleteSourceViaApi(page, sourceBId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: API 409 → FormError visible, modal stays open, cancel closes
// ─────────────────────────────────────────────────────────────────────────────
test.describe('API error → FormError in modal', { tag: '@responsive' }, () => {
  test('a 409 STALE_OWNERSHIP response from the move endpoint shows a FormError banner and keeps the modal open', async ({
    page,
    testPrefix,
  }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    const sourceAName = `${testPrefix} Error Source A`;
    const sourceBName = `${testPrefix} Error Source B`;
    let sourceAId: string | null = null;
    let sourceBId: string | null = null;

    try {
      sourceAId = await createSourceViaApi(page, { name: sourceAName, totalAmount: 30000 });
      sourceBId = await createSourceViaApi(page, { name: sourceBName, totalAmount: 20000 });

      // Mock lines for source A
      await page.route(budgetLinesUrl(sourceAId), async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockTwoLines(sourceAId!)),
        });
      });

      // Mock the PATCH move endpoint to return 409
      await page.route(budgetLinesMoveUrl(sourceAId), async (route) => {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'STALE_OWNERSHIP',
              message: 'One or more lines no longer belong to this source.',
            },
          }),
        });
      });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      const expandResponse = page.waitForResponse(budgetLinesUrl(sourceAId));
      await sourcesPage.expandSourceLines(sourceAName);
      await expandResponse;

      // Select a line
      const checkbox = sourcesPage.getLineCheckbox(sourceAId, 'Hardwood floor installation');
      await checkbox.waitFor({ state: 'visible' });
      await checkbox.check();

      // Open move modal
      await sourcesPage.openMoveModal(sourceAId);
      await expect(sourcesPage.moveModal).toBeVisible();

      // Select target
      await sourcesPage.selectMoveTarget(sourceBName);

      // Confirm — PATCH returns 409
      const moveResponse = page.waitForResponse(budgetLinesMoveUrl(sourceAId));
      await sourcesPage.confirmMove();
      await moveResponse;

      // Modal must still be visible (not closed on error)
      await expect(sourcesPage.moveModal).toBeVisible();

      // FormError banner must be visible inside the modal
      await expect(sourcesPage.moveModalFormError).toBeVisible();

      // Cancelling closes the modal
      await sourcesPage.moveModalCancelButton.click();
      await expect(sourcesPage.moveModal).not.toBeVisible();
    } finally {
      if (sourceAId) await page.unroute(budgetLinesUrl(sourceAId));
      if (sourceAId) await page.unroute(budgetLinesMoveUrl(sourceAId));
      if (sourceAId) await deleteSourceViaApi(page, sourceAId);
      if (sourceBId) await deleteSourceViaApi(page, sourceBId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Area name tri-state click selects all lines (#1323)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Area name tri-state click selects all lines', { tag: '@responsive' }, () => {
  test('clicking the area name selects all 3 lines and shows correct action bar count', async ({
    page,
    testPrefix,
  }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    const sourceName = `${testPrefix} TriState Source`;
    let sourceId: string | null = null;

    try {
      sourceId = await createSourceViaApi(page, { name: sourceName, totalAmount: 30000 });

      await page.route(budgetLinesUrl(sourceId), async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockThreeLinesSameArea(sourceId!)),
        });
      });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      const expandResponse = page.waitForResponse(budgetLinesUrl(sourceId));
      await sourcesPage.expandSourceLines(sourceName);
      await expandResponse;

      // The area name element (role="checkbox", aria-label="Select all in Bathroom")
      const areaNameEl = sourcesPage.getAreaNameSelector(sourceId, 'Bathroom');
      await areaNameEl.waitFor({ state: 'visible' });

      // Initially unchecked (aria-checked="false")
      await expect(areaNameEl).toHaveAttribute('aria-checked', 'false');

      // Click the area name — should select all 3 lines
      await areaNameEl.click();

      // All 3 individual line checkboxes must be checked
      await expect(sourcesPage.getLineCheckbox(sourceId, 'Tile installation')).toBeChecked();
      await expect(sourcesPage.getLineCheckbox(sourceId, 'Plumbing fixtures')).toBeChecked();
      await expect(sourcesPage.getLineCheckbox(sourceId, 'Vanity cabinet')).toBeChecked();

      // Action bar shows "3 lines selected"
      const actionBar = sourcesPage.getActionBar(sourceId);
      await expect(actionBar).toBeVisible();
      await expect(actionBar).toContainText('3 lines selected');

      // aria-checked must reflect fully selected state
      await expect(areaNameEl).toHaveAttribute('aria-checked', 'true');
    } finally {
      if (sourceId) await page.unroute(budgetLinesUrl(sourceId));
      if (sourceId) await deleteSourceViaApi(page, sourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Mobile viewport (@smoke)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Mobile — select line shows action bar', { tag: ['@smoke', '@responsive'] }, () => {
  test(
    'on mobile viewport, selecting a line makes the action bar visible',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const sourcesPage = new BudgetSourcesPage(page);
      const sourceName = `${testPrefix} Mobile Move Source`;
      let sourceId: string | null = null;

      try {
        sourceId = await createSourceViaApi(page, { name: sourceName, totalAmount: 20000 });

        await page.route(budgetLinesUrl(sourceId), async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockTwoLines(sourceId!)),
          });
        });

        await sourcesPage.goto();
        await sourcesPage.waitForSourcesLoaded();

        const expandResponse = page.waitForResponse(budgetLinesUrl(sourceId));
        await sourcesPage.expandSourceLines(sourceName);
        await expandResponse;

        // Select one line
        const checkbox = sourcesPage.getLineCheckbox(sourceId, 'Hardwood floor installation');
        await checkbox.waitFor({ state: 'visible' });
        await checkbox.scrollIntoViewIfNeeded();
        await checkbox.check();

        // Action bar must be visible on mobile
        const actionBar = sourcesPage.getActionBar(sourceId);
        await expect(actionBar).toBeVisible();
        await expect(actionBar).toContainText('1 line selected');

        // "Move" button must be visible (action bar is a single column on mobile)
        const moveButton = sourcesPage.getMoveButton(sourceId);
        await expect(moveButton).toBeVisible();
      } finally {
        if (sourceId) await page.unroute(budgetLinesUrl(sourceId));
        if (sourceId) await deleteSourceViaApi(page, sourceId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Parent item card select-all + toggle back (#1323)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Parent item card tri-state click', { tag: '@responsive' }, () => {
  test('clicking the parent item card selects all its lines and toggling back deselects them', async ({
    page,
    testPrefix,
  }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    const sourceName = `${testPrefix} ParentCard Source`;
    let sourceId: string | null = null;

    try {
      sourceId = await createSourceViaApi(page, { name: sourceName, totalAmount: 30000 });

      // mockTwoLines uses "Flooring" as the parentName for both lines in "Kitchen" area
      await page.route(budgetLinesUrl(sourceId), async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockTwoLines(sourceId!)),
        });
      });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      const expandResponse = page.waitForResponse(budgetLinesUrl(sourceId));
      await sourcesPage.expandSourceLines(sourceName);
      await expandResponse;

      // The parent item card for "Flooring" (role="checkbox", aria-label="Select all under Flooring")
      const parentCard = sourcesPage.getParentItemCard(sourceId, 'Flooring');
      await parentCard.waitFor({ state: 'visible' });

      // Initially unchecked (aria-checked="false")
      await expect(parentCard).toHaveAttribute('aria-checked', 'false');

      // Click the parent card — should select both lines under "Flooring"
      await parentCard.click();

      await expect(
        sourcesPage.getLineCheckbox(sourceId, 'Hardwood floor installation'),
      ).toBeChecked();
      await expect(sourcesPage.getLineCheckbox(sourceId, 'Subfloor preparation')).toBeChecked();

      const actionBar = sourcesPage.getActionBar(sourceId);
      await expect(actionBar).toBeVisible();
      await expect(actionBar).toContainText('2 lines selected');
      await expect(parentCard).toHaveAttribute('aria-checked', 'true');

      // Toggle off — click again to deselect all
      await parentCard.click();

      await expect(
        sourcesPage.getLineCheckbox(sourceId, 'Hardwood floor installation'),
      ).not.toBeChecked();
      await expect(actionBar).not.toBeVisible();
      await expect(parentCard).toHaveAttribute('aria-checked', 'false');
    } finally {
      if (sourceId) await page.unroute(budgetLinesUrl(sourceId));
      if (sourceId) await deleteSourceViaApi(page, sourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Mixed aria-checked + nav icon isolation (#1323)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Mixed aria-checked and nav icon isolation', { tag: '@responsive' }, () => {
  test('selecting one of two lines yields aria-checked="mixed" on parent card; nav icon has correct aria-label and href', async ({
    page,
    testPrefix,
  }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    const sourceName = `${testPrefix} MixedState Source`;
    let sourceId: string | null = null;

    try {
      sourceId = await createSourceViaApi(page, { name: sourceName, totalAmount: 30000 });

      // mockTwoLines: both lines share parentName "Flooring"
      await page.route(budgetLinesUrl(sourceId), async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockTwoLines(sourceId!)),
        });
      });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      const expandResponse = page.waitForResponse(budgetLinesUrl(sourceId));
      await sourcesPage.expandSourceLines(sourceName);
      await expandResponse;

      // Select only one of the two lines under "Flooring"
      const cb = sourcesPage.getLineCheckbox(sourceId, 'Hardwood floor installation');
      await cb.waitFor({ state: 'visible' });
      await cb.check();

      // Parent card must show "mixed" when only a subset of its lines are selected
      const parentCard = sourcesPage.getParentItemCard(sourceId, 'Flooring');
      await expect(parentCard).toHaveAttribute('aria-checked', 'mixed');

      // Nav icon verification — do not click (would navigate away from the test page)
      const navIcon = sourcesPage.getParentItemNavIcon(sourceId, 'Flooring');
      await expect(navIcon).toBeVisible();
      await expect(navIcon).toHaveAttribute('aria-label', 'Open Flooring');

      // The href must point to a work-item or household-item detail page
      const href = await navIcon.getAttribute('href');
      expect(href).toMatch(/\/project\/(work-items|household-items)\//);
    } finally {
      if (sourceId) await page.unroute(budgetLinesUrl(sourceId));
      if (sourceId) await deleteSourceViaApi(page, sourceId);
    }
  });
});
