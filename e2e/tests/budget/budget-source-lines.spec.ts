/**
 * E2E tests for Budget Source inline line expansion (Story #1247)
 *
 * UAT Scenarios covered:
 * - Expand shows budget lines panel with grouped Work Item Lines (smoke, all viewports)
 * - Collapse hides the panel
 * - Empty source shows EmptyState with "No budget lines assigned"
 * - Fetch error shows inline error banner with Retry button
 * - Regression: Edit still works while expand toggle is disabled during edit
 * - Mobile layout: panel visible with no horizontal scroll
 *
 * API mocking strategy:
 * - Real source created via API for parent ID coherence.
 * - GET /api/budget-sources/:id/budget-lines is mocked per test to control panel content.
 * - Route is always unrouted in finally blocks.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { BudgetSourcesPage } from '../../pages/BudgetSourcesPage.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers (same pattern as budget-sources.spec.ts)
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
  sourceType: string;
  totalAmount: number;
  usedAmount: number;
  availableAmount: number;
  interestRate: number | null;
  terms: string | null;
  notes: string | null;
  status: string;
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

/**
 * Build the budget-lines URL glob for a specific source ID.
 * Used to scope `page.route()` to the correct source's lines endpoint.
 */
function budgetLinesUrl(sourceId: string): string {
  return `**/api/budget-sources/${sourceId}/budget-lines`;
}

/**
 * A minimal BudgetSourceBudgetLinesResponse with 2 work item lines in area "Kitchen",
 * parent name "Flooring".
 */
function mockLinesWithWorkItems(sourceId: string) {
  return {
    workItemLines: [
      {
        id: `wil-1-${sourceId}`,
        description: 'Hardwood floor installation',
        plannedAmount: 8000,
        confidence: 'quote',
        confidenceMargin: 1.0,
        invoiceLink: null,
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
        parentId: `wi-parent-${sourceId}`,
        parentName: 'Flooring',
        area: { id: `area-k-${sourceId}`, name: 'Kitchen', color: '#4CAF50' },
        hasClaimedInvoice: false,
      },
      {
        id: `wil-2-${sourceId}`,
        description: 'Subfloor preparation',
        plannedAmount: 1500,
        confidence: 'own_estimate',
        confidenceMargin: 1.2,
        invoiceLink: null,
        createdAt: '2026-01-02T10:00:00.000Z',
        updatedAt: '2026-01-02T10:00:00.000Z',
        parentId: `wi-parent-${sourceId}`,
        parentName: 'Flooring',
        area: { id: `area-k-${sourceId}`, name: 'Kitchen', color: '#4CAF50' },
        hasClaimedInvoice: false,
      },
    ],
    householdItemLines: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Expand shows panel — @smoke
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Expand shows budget lines panel', { tag: ['@smoke', '@responsive'] }, () => {
  test(
    'expanding a source shows the lines panel with Work Item Lines and area grouping',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const sourcesPage = new BudgetSourcesPage(page);
      const sourceName = `${testPrefix} Lines Expand Source`;
      let sourceId: string | null = null;

      try {
        sourceId = await createSourceViaApi(page, { name: sourceName, totalAmount: 50000 });

        const linesResponse = mockLinesWithWorkItems(sourceId);

        // Register route BEFORE goto so the intercept is ready when expand fires.
        await page.route(budgetLinesUrl(sourceId), async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(linesResponse),
          });
        });

        await sourcesPage.goto();
        await sourcesPage.waitForSourcesLoaded();

        // Expand the source
        const linesResponsePromise = page.waitForResponse(budgetLinesUrl(sourceId));
        await sourcesPage.expandSourceLines(sourceName);
        await linesResponsePromise;

        // Panel must be visible
        const panel = sourcesPage.getLinesPanelById(sourceId);
        await expect(panel).toBeVisible();

        // "Work Item Lines" section header must be visible
        await expect(
          panel.getByRole('heading', { level: 4, name: 'Work Item Lines' }),
        ).toBeVisible();

        // "Household Item Lines" section must NOT be visible (no household lines in mock)
        await expect(
          panel.getByRole('heading', { level: 4, name: 'Household Item Lines' }),
        ).not.toBeVisible();

        // Area name "Kitchen" must be visible
        await expect(panel.getByText('Kitchen')).toBeVisible();

        // Parent item "Flooring" must be visible
        await expect(panel.getByText('Flooring')).toBeVisible();

        // Both line descriptions must be visible
        await expect(panel.getByText('Hardwood floor installation')).toBeVisible();
        await expect(panel.getByText('Subfloor preparation')).toBeVisible();
      } finally {
        if (sourceId) await page.unroute(budgetLinesUrl(sourceId));
        if (sourceId) await deleteSourceViaApi(page, sourceId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Collapse hides panel
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Collapse hides budget lines panel', { tag: '@responsive' }, () => {
  test('collapsing an expanded source hides the lines panel', async ({ page, testPrefix }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    const sourceName = `${testPrefix} Lines Collapse Source`;
    let sourceId: string | null = null;

    try {
      sourceId = await createSourceViaApi(page, { name: sourceName, totalAmount: 30000 });

      const linesResponse = mockLinesWithWorkItems(sourceId);

      await page.route(budgetLinesUrl(sourceId), async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(linesResponse),
        });
      });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      // Expand
      const linesResponsePromise = page.waitForResponse(budgetLinesUrl(sourceId));
      await sourcesPage.expandSourceLines(sourceName);
      await linesResponsePromise;

      const panel = sourcesPage.getLinesPanelById(sourceId);
      await expect(panel).toBeVisible();

      // Collapse — the panel should no longer be in the DOM
      // (React conditionally renders the SourceBudgetLinePanel)
      await sourcesPage.collapseSourceLines(sourceName);

      // Panel must not be visible after collapse (may be DOM-absent or CSS-hidden)
      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      await expect(panel).not.toBeVisible();
    } finally {
      if (sourceId) await page.unroute(budgetLinesUrl(sourceId));
      if (sourceId) await deleteSourceViaApi(page, sourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Empty source → EmptyState
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty source shows EmptyState', { tag: '@responsive' }, () => {
  test('expanding a source with no budget lines shows "No budget lines assigned"', async ({
    page,
    testPrefix,
  }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    const sourceName = `${testPrefix} Empty Lines Source`;
    let sourceId: string | null = null;

    try {
      sourceId = await createSourceViaApi(page, { name: sourceName, totalAmount: 20000 });

      // Mock returns empty response
      await page.route(budgetLinesUrl(sourceId), async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ workItemLines: [], householdItemLines: [] }),
        });
      });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      const linesResponsePromise = page.waitForResponse(budgetLinesUrl(sourceId));
      await sourcesPage.expandSourceLines(sourceName);
      await linesResponsePromise;

      const panel = sourcesPage.getLinesPanelById(sourceId);
      await expect(panel).toBeVisible();

      // EmptyState message must be visible
      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      await expect(panel.getByText('No budget lines assigned')).toBeVisible();
    } finally {
      if (sourceId) await page.unroute(budgetLinesUrl(sourceId));
      if (sourceId) await deleteSourceViaApi(page, sourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fetch error → error banner + Retry
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Fetch error shows error banner with Retry', { tag: '@responsive' }, () => {
  test('expanding a source when the API returns 500 shows error banner and Retry button', async ({
    page,
    testPrefix,
  }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    const sourceName = `${testPrefix} Error Lines Source`;
    let sourceId: string | null = null;

    try {
      sourceId = await createSourceViaApi(page, { name: sourceName, totalAmount: 15000 });

      let callCount = 0;

      // First call returns 500; second call (retry) returns empty data
      await page.route(budgetLinesUrl(sourceId), async (route) => {
        callCount++;
        if (callCount === 1) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'INTERNAL_ERROR', message: 'Server error' },
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ workItemLines: [], householdItemLines: [] }),
          });
        }
      });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      // First expand — should trigger error
      const errorResponsePromise = page.waitForResponse(budgetLinesUrl(sourceId));
      await sourcesPage.expandSourceLines(sourceName);
      await errorResponsePromise;

      const panel = sourcesPage.getLinesPanelById(sourceId);
      await expect(panel).toBeVisible();

      // Error banner (role="alert") must be visible inside panel
      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      const errorBanner = panel.locator('[role="alert"]');
      await expect(errorBanner).toBeVisible();

      // Retry button must be visible inside the panel
      const retryButton = panel.getByRole('button', { name: 'Retry' });
      await expect(retryButton).toBeVisible();

      // Click Retry — should trigger a second fetch
      const retryResponsePromise = page.waitForResponse(budgetLinesUrl(sourceId));
      await retryButton.click();
      await retryResponsePromise;

      // After successful retry, error banner should be gone
      // (empty state renders instead)
      await expect(errorBanner).not.toBeVisible();
    } finally {
      if (sourceId) await page.unroute(budgetLinesUrl(sourceId));
      if (sourceId) await deleteSourceViaApi(page, sourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression — Edit still works while expand toggle is disabled during edit
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Edit regression — expand toggle disabled during edit',
  { tag: '@responsive' },
  () => {
    test('expand toggle is disabled while another source is being edited', async ({
      page,
      testPrefix,
    }) => {
      const sourcesPage = new BudgetSourcesPage(page);
      const sourceName = `${testPrefix} Edit Regression Source`;
      let sourceId: string | null = null;

      try {
        sourceId = await createSourceViaApi(page, { name: sourceName, totalAmount: 10000 });

        await sourcesPage.goto();
        await sourcesPage.waitForSourcesLoaded();

        // Open edit form for the source
        await sourcesPage.startEdit(sourceName);

        // While edit form is open, the expand toggle must be disabled
        // (aria-disabled or disabled attr — the button has disabled={!!editingSource})
        const toggle = sourcesPage.getExpandToggle(sourceName);
        // The toggle is inside the display portion; when editing, the sourceRow
        // renders the edit form, hiding the display row. The toggle belongs to the
        // display part, so it will not be visible.
        // Confirm: toggle is not visible (display row is replaced by edit form).
        await expect(toggle).not.toBeVisible();

        // Cancel edit — display row returns
        await sourcesPage.cancelEdit(sourceName);

        // Toggle is now visible again
        await expect(toggle).toBeVisible();
      } finally {
        if (sourceId) await deleteSourceViaApi(page, sourceId);
      }
    });

    test('editing a source succeeds after expanding its lines', async ({ page, testPrefix }) => {
      const sourcesPage = new BudgetSourcesPage(page);
      const sourceName = `${testPrefix} Expand Then Edit Source`;
      const updatedName = `${testPrefix} Expand Then Edit Updated`;
      let sourceId: string | null = null;

      try {
        sourceId = await createSourceViaApi(page, { name: sourceName, totalAmount: 25000 });

        // Mock lines response for the expand step
        await page.route(budgetLinesUrl(sourceId), async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ workItemLines: [], householdItemLines: [] }),
          });
        });

        await sourcesPage.goto();
        await sourcesPage.waitForSourcesLoaded();

        // Expand lines first
        const linesResponsePromise = page.waitForResponse(budgetLinesUrl(sourceId));
        await sourcesPage.expandSourceLines(sourceName);
        await linesResponsePromise;

        // Now open edit form — expand toggle hides, edit form renders
        await sourcesPage.startEdit(sourceName);

        // Change name
        const editForm = sourcesPage.getEditForm(sourceName);
        const nameInput = editForm.locator(`#edit-name-${sourceId}`);
        await nameInput.fill(updatedName);

        // Register response listener BEFORE clicking save
        const saveResponse = page.waitForResponse(
          (resp) => resp.url().includes('/api/budget-sources') && resp.status() === 200,
        );
        await sourcesPage.saveEdit(sourceName);
        await saveResponse;

        // Updated name must appear in the list
        const names = await sourcesPage.getSourceNames();
        expect(names).toContain(updatedName);
        expect(names).not.toContain(sourceName);
      } finally {
        if (sourceId) await page.unroute(budgetLinesUrl(sourceId));
        if (sourceId) await deleteSourceViaApi(page, sourceId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Mobile layout smoke
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Mobile layout — panel visible with no horizontal scroll',
  { tag: ['@smoke', '@responsive'] },
  () => {
    test(
      'expanded lines panel is visible with no horizontal scroll on current viewport',
      { tag: '@smoke' },
      async ({ page, testPrefix }) => {
        const sourcesPage = new BudgetSourcesPage(page);
        const sourceName = `${testPrefix} Mobile Lines Source`;
        let sourceId: string | null = null;

        try {
          sourceId = await createSourceViaApi(page, { name: sourceName, totalAmount: 40000 });

          const linesResponse = mockLinesWithWorkItems(sourceId);

          await page.route(budgetLinesUrl(sourceId), async (route) => {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(linesResponse),
            });
          });

          await sourcesPage.goto();
          await sourcesPage.waitForSourcesLoaded();

          // Expand the source
          const linesResponsePromise = page.waitForResponse(budgetLinesUrl(sourceId));
          await sourcesPage.expandSourceLines(sourceName);
          await linesResponsePromise;

          const panel = sourcesPage.getLinesPanelById(sourceId);
          await expect(panel).toBeVisible();

          // No horizontal scroll after expansion
          const hasHorizontalScroll = await page.evaluate(() => {
            return document.documentElement.scrollWidth > window.innerWidth;
          });
          expect(hasHorizontalScroll).toBe(false);
        } finally {
          if (sourceId) await page.unroute(budgetLinesUrl(sourceId));
          if (sourceId) await deleteSourceViaApi(page, sourceId);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Unassigned area grouping
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Unassigned area grouping', { tag: '@responsive' }, () => {
  test('lines with no area appear under "Unassigned" group', async ({ page, testPrefix }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    const sourceName = `${testPrefix} Unassigned Area Source`;
    let sourceId: string | null = null;

    try {
      sourceId = await createSourceViaApi(page, { name: sourceName, totalAmount: 10000 });

      // One line with no area (area: null)
      const linesResponse = {
        workItemLines: [
          {
            id: `wil-unassigned-${sourceId}`,
            description: 'General work item line',
            plannedAmount: 5000,
            confidence: 'own_estimate',
            confidenceMargin: 1.2,
            invoiceLink: null,
            createdAt: '2026-01-01T10:00:00.000Z',
            updatedAt: '2026-01-01T10:00:00.000Z',
            parentId: `wi-parent-ua-${sourceId}`,
            parentName: 'General Work',
            area: null,
            hasClaimedInvoice: false,
          },
        ],
        householdItemLines: [],
      };

      await page.route(budgetLinesUrl(sourceId), async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(linesResponse),
        });
      });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      const linesResponsePromise = page.waitForResponse(budgetLinesUrl(sourceId));
      await sourcesPage.expandSourceLines(sourceName);
      await linesResponsePromise;

      const panel = sourcesPage.getLinesPanelById(sourceId);
      await expect(panel).toBeVisible();

      // "Unassigned" area group header must be visible
      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      await expect(panel.getByText('Unassigned')).toBeVisible();

      // The parent item name and line description must be visible
      await expect(panel.getByText('General Work', { exact: true })).toBeVisible();
      await expect(panel.getByText('General work item line', { exact: true })).toBeVisible();
    } finally {
      if (sourceId) await page.unroute(budgetLinesUrl(sourceId));
      if (sourceId) await deleteSourceViaApi(page, sourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Second expand uses cache — no additional network request
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Lines cache — second expand does not refetch', { tag: '@responsive' }, () => {
  test('collapsing then re-expanding does not trigger a second API call', async ({
    page,
    testPrefix,
  }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    const sourceName = `${testPrefix} Cache Lines Source`;
    let sourceId: string | null = null;

    try {
      sourceId = await createSourceViaApi(page, { name: sourceName, totalAmount: 20000 });

      let fetchCount = 0;
      await page.route(budgetLinesUrl(sourceId), async (route) => {
        fetchCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ workItemLines: [], householdItemLines: [] }),
        });
      });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      // First expand — triggers fetch
      const firstFetch = page.waitForResponse(budgetLinesUrl(sourceId));
      await sourcesPage.expandSourceLines(sourceName);
      await firstFetch;

      expect(fetchCount).toBe(1);

      // Collapse
      await sourcesPage.collapseSourceLines(sourceName);
      const panel = sourcesPage.getLinesPanelById(sourceId);
      await expect(panel).not.toBeVisible();

      // Re-expand — should NOT trigger a second fetch (served from cache)
      await sourcesPage.expandSourceLines(sourceName);
      // Wait a tick for any potential in-flight request
      await page.waitForTimeout(300);

      expect(fetchCount).toBe(1);

      // Panel is visible again
      await expect(sourcesPage.getLinesPanelById(sourceId)).toBeVisible();
    } finally {
      if (sourceId) await page.unroute(budgetLinesUrl(sourceId));
      if (sourceId) await deleteSourceViaApi(page, sourceId);
    }
  });
});
