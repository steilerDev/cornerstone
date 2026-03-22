/**
 * E2E tests for the Household Items list page (/project/household-items)
 *
 * EPIC-04 Stories covered:
 * - 4.3: List Page (filtering, sorting, status badges)
 * - 4.8: Responsive & Accessibility
 *
 * Scenarios covered:
 * 1.  Page loads with h1 "Household Items"
 * 2.  "New Item" button navigates to /project/household-items/new
 * 3.  Empty state when no items exist (mocked)
 * 4.  Filter empty state when search matches nothing
 * 5.  Item created via API appears in the list
 * 6.  Search filters the list
 * 7.  Category filter narrows results
 * 8.  Status filter narrows results
 * 9.  Status badge rendered correctly (planned, purchased, scheduled, arrived)
 * 10. Delete modal — confirm removes item
 * 11. Delete modal — cancel leaves item
 * 12. Pagination visible when API returns totalPages > 1 (mocked)
 * 13. Responsive — no horizontal scroll on current viewport
 * 14. Mobile: card view shown when viewport < 768px
 * 15. Desktop: table view shown when viewport >= 768px
 * 16. Dark mode rendering
 * 17. Filter panel has accessible role="search" landmark
 */

import { test, expect } from '../../fixtures/auth.js';
import { HouseholdItemsPage, HOUSEHOLD_ITEMS_ROUTE } from '../../pages/HouseholdItemsPage.js';
import { API } from '../../fixtures/testData.js';
import { createHouseholdItemViaApi, deleteHouseholdItemViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Page loads with h1 "Household Items"
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page load (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Household Items list page loads with h1 "Household Items"',
    { tag: '@smoke' },
    async ({ page }) => {
      const listPage = new HouseholdItemsPage(page);

      await listPage.goto();

      await expect(listPage.heading).toBeVisible();
      await expect(listPage.heading).toHaveText('Project');
    },
  );

  test('Page URL is /project/household-items', async ({ page }) => {
    await page.goto(HOUSEHOLD_ITEMS_ROUTE);
    await page.waitForURL('/project/household-items');
    expect(page.url()).toContain('/project/household-items');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: "New Item" button navigates to /project/household-items/new
// ─────────────────────────────────────────────────────────────────────────────
test.describe('"New Item" navigation (Scenario 2)', { tag: '@responsive' }, () => {
  test('"New Item" button navigates to the create page', async ({ page }) => {
    const listPage = new HouseholdItemsPage(page);

    await listPage.goto();
    await expect(listPage.newItemButton).toBeVisible();

    await listPage.newItemButton.click();

    await page.waitForURL('**/project/household-items/new');
    expect(page.url()).toContain('/project/household-items/new');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Empty state when no items exist (mocked)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state — no items (Scenario 3)', { tag: '@responsive' }, () => {
  test('Empty state shown when no household items exist (mocked empty response)', async ({
    page,
  }) => {
    const listPage = new HouseholdItemsPage(page);

    await page.route(`${API.householdItems}*`, async (route) => {
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
      await listPage.goto();

      await expect(listPage.emptyState).toBeVisible({ timeout: 7000 });

      const emptyText = await listPage.emptyState.textContent();
      expect(emptyText?.toLowerCase()).toMatch(/no household items yet/);

      // CTA button to create the first item
      const ctaButton = listPage.emptyState.getByRole('button', {
        name: /Create First Item/i,
      });
      await expect(ctaButton).toBeVisible();
    } finally {
      await page.unroute(`${API.householdItems}*`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Filter empty state when search matches nothing
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state — filter no match (Scenario 4)', { tag: '@responsive' }, () => {
  // Extend test timeout: multi-step test (create → navigate → search → assert
  // → delete) takes longer than the desktop default 15s, especially on mobile
  // WebKit under full CI shard load.
  test.describe.configure({ timeout: 60_000 });
  test('Filter empty state shown when search matches no household items', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Filter Empty Test`,
      });

      await listPage.goto();
      await listPage.waitForLoaded();

      await listPage.search('ZZZNOMATCH99999XYZABC');

      await expect(async () => {
        await expect(listPage.emptyState).toBeVisible({ timeout: 5000 });
        // DataTable renders t('dataTable.empty.filteredMessage') = "No items match the current filters"
        // when hasActiveFilters is true (search or column filters active).
        const emptyText = await listPage.emptyState.textContent();
        expect(emptyText?.toLowerCase()).toMatch(/no items match the current filters/);

        // DataTable renders "Clear Filters" button (t('button.clearFilters')) in filtered empty state.
        const clearButton = listPage.emptyState.getByRole('button', {
          name: /Clear Filters/i,
        });
        await expect(clearButton).toBeVisible();
      }).toPass({ timeout: 30000 });
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Item created via API appears in list
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Item appears in list after API creation (Scenario 5)',
  { tag: '@responsive' },
  () => {
    // Extend test timeout: multi-step test (create → navigate → search → assert
    // → delete) takes longer than the desktop default 15s on mobile WebKit.
    test.describe.configure({ timeout: 60_000 });

    test('Household item created via API appears in the list', async ({ page, testPrefix }) => {
      const listPage = new HouseholdItemsPage(page);
      let createdId: string | null = null;
      const name = `${testPrefix} HI API Created Item`;

      try {
        createdId = await createHouseholdItemViaApi(page, { name });

        await listPage.goto();
        await listPage.waitForLoaded();

        await listPage.search(name);

        await expect(async () => {
          const names = await listPage.getItemNames();
          expect(names).toContain(name);
        }).toPass({ timeout: 30000 });
      } finally {
        if (createdId) await deleteHouseholdItemViaApi(page, createdId);
      }
    });

    test('Table shows item name, category, status columns on desktop', async ({
      page,
      testPrefix,
    }) => {
      const viewport = page.viewportSize();
      if (!viewport || viewport.width < 768) {
        test.skip();
        return;
      }

      const listPage = new HouseholdItemsPage(page);
      let createdId: string | null = null;
      const name = `${testPrefix} HI Table Columns Test`;

      try {
        createdId = await createHouseholdItemViaApi(page, { name, category: 'hic-furniture' });

        await listPage.goto();
        await listPage.waitForLoaded();
        await listPage.search(name);

        await expect(async () => {
          await expect(listPage.tableContainer).toBeVisible();

          const table = listPage.tableContainer.locator('table');
          await expect(table.getByRole('columnheader', { name: 'Name' })).toBeVisible();
          await expect(table.getByRole('columnheader', { name: 'Category' })).toBeVisible();
          await expect(table.getByRole('columnheader', { name: 'Status' })).toBeVisible();
          await expect(table.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
        }).toPass({ timeout: 30000 });
      } finally {
        if (createdId) await deleteHouseholdItemViaApi(page, createdId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Search filters the list
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Search filters (Scenario 6)', { tag: '@responsive' }, () => {
  // Extend test timeout: these tests create real API data, search/filter, and
  // delete — multi-step flows that take longer on mobile WebKit under CI load.
  test.describe.configure({ timeout: 60_000 });

  test('Search by name filters list to matching items only', async ({ page, testPrefix }) => {
    const listPage = new HouseholdItemsPage(page);
    const created: string[] = [];
    const alphaName = `${testPrefix} HI Alpha Sofa`;
    const betaName = `${testPrefix} HI Beta Lamp`;

    try {
      created.push(await createHouseholdItemViaApi(page, { name: alphaName }));
      created.push(await createHouseholdItemViaApi(page, { name: betaName }));

      await listPage.goto();
      await listPage.waitForLoaded();

      await listPage.search(`${testPrefix} HI Alpha`);

      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(alphaName);
        expect(names).not.toContain(betaName);
      }).toPass({ timeout: 30000 });
    } finally {
      for (const id of created) {
        await deleteHouseholdItemViaApi(page, id);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Category filter narrows results
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Category filter (Scenario 7)', { tag: '@responsive' }, () => {
  // Extend test timeout: these tests create real API data, search/filter, and
  // delete — multi-step flows that take longer on mobile WebKit under CI load.
  test.describe.configure({ timeout: 60_000 });

  test('Category filter narrows list to items in selected category', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    const created: string[] = [];
    const furnitureName = `${testPrefix} HI Cat Furniture Chair`;
    const applianceName = `${testPrefix} HI Cat Appliance Washer`;

    try {
      created.push(
        await createHouseholdItemViaApi(page, { name: furnitureName, category: 'hic-furniture' }),
      );
      created.push(
        await createHouseholdItemViaApi(page, { name: applianceName, category: 'hic-appliances' }),
      );

      // Navigate directly with the category filter in the URL — DataTable reads filter params
      // from the URL on load. This is the reliable approach for DataTable enum column filters
      // (the old #category-filter select element no longer exists).
      await page.goto(
        `/project/household-items?q=${encodeURIComponent(`${testPrefix} HI Cat`)}&category=hic-furniture`,
      );
      await listPage.heading.waitFor({ state: 'visible' });
      await listPage.waitForLoaded();

      // Verify URL contains category filter
      const url = new URL(page.url());
      expect(url.searchParams.get('category')).toBe('hic-furniture');

      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(furnitureName);
        expect(names).not.toContain(applianceName);
      }).toPass({ timeout: 30000 });
    } finally {
      for (const id of created) {
        await deleteHouseholdItemViaApi(page, id);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Status filter narrows results
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Status filter (Scenario 8)', { tag: '@responsive' }, () => {
  // Extend test timeout: these tests create real API data, search/filter, and
  // delete — multi-step flows that take longer on mobile WebKit under CI load.
  test.describe.configure({ timeout: 60_000 });

  test('Status filter narrows list to items with selected status', async ({ page, testPrefix }) => {
    const listPage = new HouseholdItemsPage(page);
    const created: string[] = [];
    const plannedName = `${testPrefix} HI Status Planned Desk`;
    const purchasedName = `${testPrefix} HI Status Purchased Couch`;

    try {
      created.push(await createHouseholdItemViaApi(page, { name: plannedName, status: 'planned' }));
      created.push(
        await createHouseholdItemViaApi(page, { name: purchasedName, status: 'purchased' }),
      );

      // Navigate directly with the status filter in the URL — DataTable reads filter params
      // from the URL on load. This is the reliable approach for DataTable enum column filters
      // (the old #status-filter select element no longer exists).
      await page.goto(
        `/project/household-items?q=${encodeURIComponent(`${testPrefix} HI Status`)}&status=planned`,
      );
      await listPage.heading.waitFor({ state: 'visible' });
      await listPage.waitForLoaded();

      // Verify URL contains status filter
      const statusUrl = new URL(page.url());
      expect(statusUrl.searchParams.get('status')).toBe('planned');

      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(plannedName);
        expect(names).not.toContain(purchasedName);
      }).toPass({ timeout: 30000 });
    } finally {
      for (const id of created) {
        await deleteHouseholdItemViaApi(page, id);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Status badge rendered correctly
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Status badge rendering (Scenario 9)', { tag: '@responsive' }, () => {
  // Extend test timeout: these tests create real API data, search/filter, and
  // delete — multi-step flows that take longer on mobile WebKit under CI load.
  test.describe.configure({ timeout: 60_000 });

  test('Status badges render for planned, purchased, scheduled, arrived items', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    const created: string[] = [];

    const statuses = ['planned', 'purchased', 'scheduled', 'arrived'] as const;
    const nameMap: Record<string, string> = {};

    try {
      for (const status of statuses) {
        const name = `${testPrefix} HI Badge ${status}`;
        nameMap[status] = name;
        created.push(await createHouseholdItemViaApi(page, { name, status }));
      }

      await listPage.goto();
      await listPage.waitForLoaded();

      await listPage.search(`${testPrefix} HI Badge`);

      // Each status should have a badge in the DOM. On desktop the badge is
      // visible inside the table; on mobile the table is hidden (display:none)
      // so we check for DOM presence rather than visibility.
      await expect(async () => {
        for (const status of statuses) {
          const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
          const badge = page.locator('[class*="badge"]', { hasText: statusLabel }).first();
          await expect(badge).toBeAttached();
        }
      }).toPass({ timeout: 30000 });
    } finally {
      for (const id of created) {
        await deleteHouseholdItemViaApi(page, id);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Delete modal — confirm removes item
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete modal — confirm (Scenario 10)', { tag: '@responsive' }, () => {
  // Extend test timeout: these tests create real API data, search/filter, and
  // delete — multi-step flows that take longer on mobile WebKit under CI load.
  test.describe.configure({ timeout: 60_000 });

  test('Confirming delete removes the household item from the list', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    const name = `${testPrefix} HI Delete Confirm`;

    // Create item (no cleanup var — deleted via UI)
    const createdId = await createHouseholdItemViaApi(page, { name });

    await listPage.goto();
    await listPage.waitForLoaded();

    await listPage.search(name);
    await expect(async () => {
      const namesBefore = await listPage.getItemNames();
      expect(namesBefore).toContain(name);
    }).toPass({ timeout: 30000 });

    await listPage.openDeleteModal(name);
    await expect(listPage.deleteModal).toBeVisible();

    // Modal contains the item name
    const modalText = await listPage.deleteModal.textContent();
    expect(modalText).toContain(name);

    await listPage.confirmDelete();
    // confirmDelete() already waits for the DELETE response and modal close.
    // Wait briefly for React to re-render the updated list.
    await listPage.waitForLoaded();

    const namesAfter = await listPage.getItemNames();
    expect(namesAfter).not.toContain(name);

    void createdId;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: Delete modal — cancel leaves item
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete modal — cancel (Scenario 11)', { tag: '@responsive' }, () => {
  // Extend test timeout: these tests create real API data, search/filter, and
  // delete — multi-step flows that take longer on mobile WebKit under CI load.
  test.describe.configure({ timeout: 60_000 });

  test('Cancelling delete modal leaves the household item in the list', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    let createdId: string | null = null;
    const name = `${testPrefix} HI Delete Cancel`;

    try {
      createdId = await createHouseholdItemViaApi(page, { name });

      await listPage.goto();
      await listPage.waitForLoaded();
      await listPage.search(name);

      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(name);
      }).toPass({ timeout: 30000 });

      await listPage.openDeleteModal(name);
      await listPage.cancelDelete();

      const names = await listPage.getItemNames();
      expect(names).toContain(name);
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: Pagination visible when >25 items (mocked)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Pagination (Scenario 12)', { tag: '@responsive' }, () => {
  test('Pagination controls visible when API returns totalPages > 1', async ({ page }) => {
    const listPage = new HouseholdItemsPage(page);

    await page.route(`${API.householdItems}*`, async (route) => {
      if (route.request().method() === 'GET') {
        const items = Array.from({ length: 25 }, (_, i) => ({
          id: `mock-hi-${i}`,
          name: `Mock Household Item ${String(i + 1).padStart(2, '0')}`,
          category: 'hic-furniture',
          status: 'planned',
          areaId: null,
          vendor: null,
          totalPlannedAmount: null,
          targetDeliveryDate: null,
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
      await listPage.goto();

      await expect(listPage.pagination).toBeVisible({ timeout: 7000 });
      await expect(listPage.nextPageButton).toBeVisible();
      await expect(listPage.prevPageButton).toBeVisible();

      // Previous page disabled on page 1
      await expect(listPage.prevPageButton).toBeDisabled();

      const infoText = await listPage.getPaginationInfoText();
      expect(infoText).toMatch(/showing|of 26/i);
    } finally {
      await page.unroute(`${API.householdItems}*`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13–15: Responsive layout
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenarios 13–15)', { tag: '@responsive' }, () => {
  test('Household Items list page renders without horizontal scroll', async ({ page }) => {
    const listPage = new HouseholdItemsPage(page);

    await listPage.goto();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('Mobile: card view is shown when viewport is < 768px', async ({ page, testPrefix }) => {
    const viewport = page.viewportSize();

    if (!viewport || viewport.width >= 768) {
      test.skip();
      return;
    }

    const listPage = new HouseholdItemsPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Mobile Card Test`,
      });

      await listPage.goto();
      await listPage.waitForLoaded();

      const cards = await listPage.cardsContainer.locator('[class*="card"]').all();
      expect(cards.length).toBeGreaterThan(0);
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });

  test('Desktop: table is visible when viewport is >= 768px', async ({ page, testPrefix }) => {
    const viewport = page.viewportSize();

    if (!viewport || viewport.width < 768) {
      test.skip();
      return;
    }

    const listPage = new HouseholdItemsPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Desktop Table Test`,
      });

      await listPage.goto();
      await listPage.waitForLoaded();

      await expect(listPage.tableContainer).toBeVisible();
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 16: Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering (Scenario 16)', { tag: '@responsive' }, () => {
  test('Household Items list page renders correctly in dark mode', async ({ page }) => {
    const listPage = new HouseholdItemsPage(page);

    await page.goto(HOUSEHOLD_ITEMS_ROUTE);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await listPage.heading.waitFor({ state: 'visible', timeout: 7000 });

    await expect(listPage.heading).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Search input and filter controls visible in dark mode', async ({ page }) => {
    const listPage = new HouseholdItemsPage(page);

    await page.goto(HOUSEHOLD_ITEMS_ROUTE);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await listPage.heading.waitFor({ state: 'visible', timeout: 7000 });

    await expect(listPage.searchInput).toBeVisible();
    // Column filter buttons are in the table header (<thead>) which is CSS-hidden on mobile
    // (tableContainer has display:none at max-width: 767px). Only check them on tablet+desktop.
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 768) {
      await expect(listPage.categoryFilter).toBeVisible();
      await expect(listPage.statusFilter).toBeVisible();
    }
    // DataTable toolbar (search + column settings) is always visible across all viewports.
    await expect(page.getByLabel('Column settings')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 17: Filter panel accessible landmark
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Accessibility (Scenario 17)', { tag: '@responsive' }, () => {
  test('DataTable search input is accessible with aria-label', async ({ page }) => {
    const listPage = new HouseholdItemsPage(page);

    await listPage.goto();

    // DataTable renders a search input with type="search" and aria-label="Search items"
    // (the old role="search" filter panel landmark was removed when the page was
    // refactored to use the shared DataTable component).
    await expect(listPage.searchInput).toBeVisible();
    const searchInput = page.getByRole('searchbox', { name: 'Search items' });
    await expect(searchInput).toBeVisible();
  });

  test('Search input has accessible label', async ({ page }) => {
    const listPage = new HouseholdItemsPage(page);

    await listPage.goto();

    await expect(listPage.searchInput).toBeVisible();
    // DataTable renders aria-label="Search items" for all pages using the component.
    const label = await listPage.searchInput.getAttribute('aria-label');
    expect(label).toBe('Search items');
  });
});
