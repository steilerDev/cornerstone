/**
 * E2E tests for Work Items List page (/work-items)
 *
 * Scenarios covered:
 * 1.  Page loads with h1 "Work Items"
 * 2.  Empty state when no work items (mock API)
 * 3.  "New Work Item" button navigates to /work-items/new
 * 4.  Search filters work items
 * 5.  Create via API + verify appears in list + delete via API cleanup
 * 6.  Delete modal — confirm removes work item
 * 7.  Delete modal — cancel leaves work item
 * 8.  Pagination visible when >25 items (mock API)
 * 9.  Responsive — no horizontal scroll on current viewport
 * 10. Dark mode rendering
 */

import { test, expect } from '../../fixtures/auth.js';
import { WorkItemsPage, WORK_ITEMS_ROUTE } from '../../pages/WorkItemsPage.js';
import { API } from '../../fixtures/testData.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Page loads with h1 "Work Items"
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page load (Scenario 1)', { tag: '@responsive' }, () => {
  test('Work Items list page loads with h1 "Work Items"', { tag: '@smoke' }, async ({ page }) => {
    const workItemsPage = new WorkItemsPage(page);

    await workItemsPage.goto();

    await expect(workItemsPage.heading).toBeVisible();
    await expect(workItemsPage.heading).toHaveText('Work Items');
  });

  test('Page URL is /work-items', async ({ page }) => {
    await page.goto(WORK_ITEMS_ROUTE);
    await page.waitForURL('/work-items');
    expect(page.url()).toContain('/work-items');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Empty state when no work items exist
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state (Scenario 2)', { tag: '@responsive' }, () => {
  test('Empty state shown when no work items exist (mocked empty response)', async ({ page }) => {
    const workItemsPage = new WorkItemsPage(page);

    // Intercept the work items API to return an empty list
    await page.route(`${API.workItems}*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [],
            pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await workItemsPage.goto();

      // Empty state should be visible
      await expect(workItemsPage.emptyState).toBeVisible({ timeout: 7000 });

      // Heading in empty state mentions "No work items yet"
      const emptyText = await workItemsPage.emptyState.textContent();
      expect(emptyText?.toLowerCase()).toMatch(/no work items yet/);

      // A CTA button to create the first item is visible
      const ctaButton = workItemsPage.emptyState.getByRole('button', {
        name: /Create First Work Item/i,
      });
      await expect(ctaButton).toBeVisible();
    } finally {
      await page.unroute(`${API.workItems}*`);
    }
  });

  test('Filter empty state message shown when search matches nothing', async ({
    page,
    testPrefix,
  }) => {
    const workItemsPage = new WorkItemsPage(page);
    let createdId: string | null = null;

    try {
      // Create a work item so we know the list isn't globally empty
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Filter Empty Test` });

      await workItemsPage.goto();
      await workItemsPage.waitForLoaded();

      // Search for something that will not match any work item
      await workItemsPage.search('ZZZNOMATCH99999XYZABC');

      // Empty state with filter message should appear
      await expect(workItemsPage.emptyState).toBeVisible({ timeout: 7000 });
      const emptyText = await workItemsPage.emptyState.textContent();
      expect(emptyText?.toLowerCase()).toMatch(/no work items match your filters/);

      // "Clear All Filters" button visible
      const clearButton = workItemsPage.emptyState.getByRole('button', {
        name: /Clear All Filters/i,
      });
      await expect(clearButton).toBeVisible();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: "New Work Item" button navigates to /work-items/new
// ─────────────────────────────────────────────────────────────────────────────
test.describe('"New Work Item" navigation (Scenario 3)', { tag: '@responsive' }, () => {
  test('"New Work Item" button navigates to the create page', async ({ page }) => {
    const workItemsPage = new WorkItemsPage(page);

    await workItemsPage.goto();
    await expect(workItemsPage.newWorkItemButton).toBeVisible();

    await workItemsPage.newWorkItemButton.click();

    // Should navigate to /work-items/new
    await page.waitForURL('**/work-items/new');
    expect(page.url()).toContain('/work-items/new');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Search filters work items
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Search filters (Scenario 4)', { tag: '@responsive' }, () => {
  test('Search by partial title filters list to matching items only', async ({
    page,
    testPrefix,
  }) => {
    const workItemsPage = new WorkItemsPage(page);
    const created: string[] = [];
    const alphaTitle = `${testPrefix} Alpha Work Item`;
    const betaTitle = `${testPrefix} Beta Work Item`;

    try {
      created.push(await createWorkItemViaApi(page, { title: alphaTitle }));
      created.push(await createWorkItemViaApi(page, { title: betaTitle }));

      await workItemsPage.goto();
      await workItemsPage.waitForLoaded();

      // Search specifically for the alpha item
      await workItemsPage.search(`${testPrefix} Alpha`);

      const titles = await workItemsPage.getWorkItemTitles();
      expect(titles).toContain(alphaTitle);
      expect(titles).not.toContain(betaTitle);
    } finally {
      for (const id of created) {
        await deleteWorkItemViaApi(page, id);
      }
    }
  });

  test('Clearing search restores full list', async ({ page, testPrefix }) => {
    const workItemsPage = new WorkItemsPage(page);
    const created: string[] = [];
    const alphaTitle = `${testPrefix} Clear Search Alpha`;
    const betaTitle = `${testPrefix} Clear Search Beta`;

    try {
      created.push(await createWorkItemViaApi(page, { title: alphaTitle }));
      created.push(await createWorkItemViaApi(page, { title: betaTitle }));

      await workItemsPage.goto();
      await workItemsPage.waitForLoaded();

      // Search so only alpha is shown
      await workItemsPage.search(`${testPrefix} Clear Search Alpha`);
      let titles = await workItemsPage.getWorkItemTitles();
      expect(titles).toContain(alphaTitle);
      expect(titles).not.toContain(betaTitle);

      // Clear search — both should reappear
      await workItemsPage.clearSearch();
      await workItemsPage.search(testPrefix);
      titles = await workItemsPage.getWorkItemTitles();
      expect(titles).toContain(alphaTitle);
      expect(titles).toContain(betaTitle);
    } finally {
      for (const id of created) {
        await deleteWorkItemViaApi(page, id);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Create via API + verify appears in list + delete via API cleanup
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Work item appears in list after API creation (Scenario 5)',
  { tag: '@responsive' },
  () => {
    test('Work item created via API appears in the list', async ({ page, testPrefix }) => {
      const workItemsPage = new WorkItemsPage(page);
      let createdId: string | null = null;
      const title = `${testPrefix} API Created Item`;

      try {
        // Create via API
        createdId = await createWorkItemViaApi(page, { title });

        await workItemsPage.goto();
        await workItemsPage.waitForLoaded();

        // Search to ensure this item is visible regardless of pagination
        await workItemsPage.search(title);

        const titles = await workItemsPage.getWorkItemTitles();
        expect(titles).toContain(title);
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('Table shows work item title, status, and other columns on desktop', async ({
      page,
      testPrefix,
    }) => {
      const viewport = page.viewportSize();
      // Table is hidden on mobile (< 768px)
      if (!viewport || viewport.width < 768) {
        test.skip();
        return;
      }

      const workItemsPage = new WorkItemsPage(page);
      let createdId: string | null = null;
      const title = `${testPrefix} Table Info Test`;

      try {
        createdId = await createWorkItemViaApi(page, { title });

        await workItemsPage.goto();
        await workItemsPage.waitForLoaded();
        await workItemsPage.search(title);

        // Verify the table container is visible
        await expect(workItemsPage.tableContainer).toBeVisible();

        // Verify table headers
        const table = workItemsPage.tableContainer.locator('table');
        await expect(table.getByRole('columnheader', { name: 'Title' })).toBeVisible();
        await expect(table.getByRole('columnheader', { name: 'Status' })).toBeVisible();
        await expect(table.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Delete modal — confirm removes work item
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete modal — confirm (Scenario 6)', { tag: '@responsive' }, () => {
  test('Confirming delete removes the work item from the list', async ({ page, testPrefix }) => {
    const workItemsPage = new WorkItemsPage(page);
    const title = `${testPrefix} Delete Confirm Item`;

    // Create the item (no cleanup variable — it is deleted via UI)
    const createdId = await createWorkItemViaApi(page, { title });

    await workItemsPage.goto();
    await workItemsPage.waitForLoaded();

    // Search for this specific item
    await workItemsPage.search(title);
    const titlesBefore = await workItemsPage.getWorkItemTitles();
    expect(titlesBefore).toContain(title);

    // Open delete modal and confirm
    await workItemsPage.openDeleteModal(title);
    await expect(workItemsPage.deleteModal).toBeVisible();

    // Modal content includes the work item title
    const modalText = await workItemsPage.deleteModal.textContent();
    expect(modalText).toContain(title);

    // Confirm deletion
    await workItemsPage.confirmDelete();

    // Work item no longer in list
    await workItemsPage.waitForLoaded();
    const titlesAfter = await workItemsPage.getWorkItemTitles();
    expect(titlesAfter).not.toContain(title);

    // Note: item was deleted via UI — no API cleanup needed
    void createdId;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Delete modal — cancel leaves work item
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete modal — cancel (Scenario 7)', { tag: '@responsive' }, () => {
  test('Cancelling delete modal leaves the work item in the list', async ({ page, testPrefix }) => {
    const workItemsPage = new WorkItemsPage(page);
    let createdId: string | null = null;
    const title = `${testPrefix} Cancel Delete Item`;

    try {
      createdId = await createWorkItemViaApi(page, { title });

      await workItemsPage.goto();
      await workItemsPage.waitForLoaded();
      await workItemsPage.search(title);

      await workItemsPage.openDeleteModal(title);
      await workItemsPage.cancelDelete();

      // Work item still present
      const titles = await workItemsPage.getWorkItemTitles();
      expect(titles).toContain(title);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Pagination visible when >25 items (mock API)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Pagination (Scenario 8)', { tag: '@responsive' }, () => {
  test('Pagination controls visible when API returns totalPages > 1', async ({ page }) => {
    const workItemsPage = new WorkItemsPage(page);

    // Mock 26 items across 2 pages
    await page.route(`${API.workItems}*`, async (route) => {
      if (route.request().method() === 'GET') {
        const items = Array.from({ length: 25 }, (_, i) => ({
          id: `mock-item-${i}`,
          title: `Mock Work Item ${String(i + 1).padStart(2, '0')}`,
          status: 'not_started',
          assignedUser: null,
          startDate: null,
          endDate: null,
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items,
            pagination: { page: 1, pageSize: 25, totalItems: 26, totalPages: 2 },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await workItemsPage.goto();

      // Pagination controls should be visible
      await expect(workItemsPage.pagination).toBeVisible({ timeout: 7000 });
      await expect(workItemsPage.nextPageButton).toBeVisible();
      await expect(workItemsPage.prevPageButton).toBeVisible();

      // Previous page disabled on page 1
      await expect(workItemsPage.prevPageButton).toBeDisabled();

      // Pagination info text
      const infoText = await workItemsPage.getPaginationInfoText();
      expect(infoText).toMatch(/showing|of 26/i);
    } finally {
      await page.unroute(`${API.workItems}*`);
    }
  });

  test('Pagination not shown when result fits on a single page', async ({ page }) => {
    const workItemsPage = new WorkItemsPage(page);

    // Mock a single-page response
    await page.route(`${API.workItems}*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'solo-item-1',
                title: 'Solo Work Item',
                status: 'not_started',
                assignedUser: null,
                startDate: null,
                endDate: null,
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await workItemsPage.goto();
      await workItemsPage.waitForLoaded();

      // Pagination should NOT be visible
      await expect(workItemsPage.pagination).not.toBeVisible();
    } finally {
      await page.unroute(`${API.workItems}*`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Responsive — no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 9)', { tag: '@responsive' }, () => {
  test('Work Items list page renders without horizontal scroll on current viewport', async ({
    page,
  }) => {
    const workItemsPage = new WorkItemsPage(page);

    await workItemsPage.goto();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('Mobile: card view is shown when viewport is < 768px', async ({ page, testPrefix }) => {
    const viewport = page.viewportSize();

    // Only run the mobile-specific assertion on narrow viewports
    if (!viewport || viewport.width >= 768) {
      test.skip();
      return;
    }

    const workItemsPage = new WorkItemsPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Mobile Card Item` });

      await workItemsPage.goto();
      await workItemsPage.waitForLoaded();

      // At least one card should be visible
      const cards = await workItemsPage.cardsContainer.locator('[class*="card"]').all();
      expect(cards.length).toBeGreaterThan(0);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Desktop: table is visible when viewport is >= 768px', async ({ page, testPrefix }) => {
    const viewport = page.viewportSize();

    // Only run on desktop/tablet viewports
    if (!viewport || viewport.width < 768) {
      test.skip();
      return;
    }

    const workItemsPage = new WorkItemsPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Desktop Table Item` });

      await workItemsPage.goto();
      await workItemsPage.waitForLoaded();

      await expect(workItemsPage.tableContainer).toBeVisible();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering (Scenario 10)', { tag: '@responsive' }, () => {
  test('Work Items list page renders correctly in dark mode', async ({ page }) => {
    const workItemsPage = new WorkItemsPage(page);

    await page.goto(WORK_ITEMS_ROUTE);
    // Apply dark theme before waiting for heading — avoids race with React hydration
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await workItemsPage.heading.waitFor({ state: 'visible', timeout: 7000 });

    await expect(workItemsPage.heading).toBeVisible();

    // No horizontal scroll in dark mode
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Filters card and search input visible in dark mode', async ({ page }) => {
    const workItemsPage = new WorkItemsPage(page);

    await page.goto(WORK_ITEMS_ROUTE);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await workItemsPage.heading.waitFor({ state: 'visible', timeout: 7000 });

    await expect(workItemsPage.searchInput).toBeVisible();
    await expect(workItemsPage.statusFilter).toBeVisible();
    await expect(workItemsPage.sortOrderButton).toBeVisible();
  });
});
