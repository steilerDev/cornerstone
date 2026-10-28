/**
 * E2E tests for the Purchases list (/project/household-items)
 *
 * EPIC-04 (list, status badges, responsive), rebuilt on the object-list template by #2246
 * (EPIC-21 P5.2): grouped by Status, status chips, Filters panel, totals footer, ⋯ row menu.
 *
 * Scenarios covered:
 * 1.  Page loads with h1 "Purchases (n)"
 * 2.  "New purchase" opens the create dialog over the list
 * 3.  Empty state when no purchases exist (mocked)
 * 4.  "No purchases match." with Clear filters when a search matches nothing
 * 5.  Purchase created via API appears; AC1 column headers and the hidden-by-default columns
 * 6.  Search filters the list
 * 7.  Category filter (URL and Filters panel)
 * 8.  Status chips narrow the list
 * 9.  Status badges for every status
 * 10. Delete with Confirm
 * 11. Delete with Cancel
 * 12. Legacy ?page= / ?pageSize= are removed from the URL and the list renders
 * 13. Responsive: no horizontal scroll, surface switch
 * 14. Dark mode
 * 15. Accessible search
 * 16. Status chip colour (#2195)
 * 17. Grouped by Status by default, Delivered collapsed while other groups have rows
 * 18. Four status chips plus All, no "Searching all"
 * 19. Footer totals equal the API totals; the label changes with a filter
 * 20. Filters: Area (incl. No area), Target delivery
 * 21. Row link opens the purchase
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  HouseholdItemsPage,
  HOUSEHOLD_ITEMS_ROUTE,
  parseMoney,
} from '../../pages/HouseholdItemsPage.js';
import { HouseholdItemCreatePage } from '../../pages/HouseholdItemCreatePage.js';
import { API } from '../../fixtures/testData.js';
import {
  createAreaViaApi,
  createHouseholdItemViaApi,
  deleteAreaViaApi,
  deleteHouseholdItemViaApi,
} from '../../fixtures/apiHelpers.js';
import {
  createCostLine,
  createFundingSource,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';

/** A well-formed empty list answer (chip scope, totals and status counts included). */
const EMPTY_LIST_BODY = {
  items: [],
  pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
  groupCounts: { planned: 0, purchased: 0, scheduled: 0, arrived: 0 },
  scopeTotal: 0,
  totals: { expectedCost: 0, invoiced: 0, paid: 0 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Page loads
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page load (Scenario 1)', { tag: '@responsive' }, () => {
  test('Purchases list page loads with h1 "Purchases"', { tag: '@smoke' }, async ({ page }) => {
    const listPage = new HouseholdItemsPage(page);

    await listPage.goto();

    await expect(listPage.heading).toBeVisible();
    // A count is always shown: "Purchases (n)"
    await expect(listPage.heading).toHaveText(/^Purchases \(\d+\)$/);
  });

  test('Page URL is /project/household-items', async ({ page }) => {
    await page.goto(HOUSEHOLD_ITEMS_ROUTE);
    await page.waitForURL('/project/household-items');
    expect(page.url()).toContain('/project/household-items');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: "New purchase"
// ─────────────────────────────────────────────────────────────────────────────
test.describe('"New purchase" (Scenario 2)', { tag: '@responsive' }, () => {
  test('"New purchase" opens the create dialog over the list', async ({ page }) => {
    const listPage = new HouseholdItemsPage(page);
    const createPage = new HouseholdItemCreatePage(page);

    await listPage.goto();
    await listPage.waitForLoaded();
    await expect(listPage.newItemButton).toBeVisible();
    await expect(listPage.newItemButton).toHaveText('New purchase');

    await listPage.newItemButton.click();

    await page.waitForURL('**/project/household-items/new');
    await expect(createPage.heading).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Empty state (mocked)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state — no purchases (Scenario 3)', { tag: '@responsive' }, () => {
  test('Empty state shown when no purchases exist (mocked empty response)', async ({ page }) => {
    const listPage = new HouseholdItemsPage(page);
    const isList = (url: URL) => url.pathname === API.householdItems;

    await page.route(isList, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_LIST_BODY),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await listPage.goto();
      await listPage.waitForLoaded();

      await expect(listPage.emptyState).toContainText('No purchases yet');
      // No rows, so no totals footer
      await expect(listPage.footer).toHaveCount(0);
    } finally {
      await page.unroute(isList);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: No match
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state — no match (Scenario 4)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  test('"No purchases match." with Clear filters when a search matches nothing', async ({
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
      await listPage.typeSearch('ZZZNOMATCH99999XYZABC');

      await expect(listPage.emptyState).toContainText('No purchases match.');
      await expect(
        listPage.emptyState.getByRole('button', { name: 'Clear filters' }),
      ).toBeVisible();

      // Clear filters empties the search again
      await listPage.emptyState.getByRole('button', { name: 'Clear filters' }).click();
      await expect(listPage.searchInput).toHaveValue('');
      await expect(listPage.emptyState).toBeHidden();
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Purchase appears; AC1 columns
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Purchase appears in the list (Scenario 5)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  test('Purchase created via API appears in the list', async ({ page, testPrefix }) => {
    const listPage = new HouseholdItemsPage(page);
    let createdId: string | null = null;
    const name = `${testPrefix} HI API Created Item`;

    try {
      createdId = await createHouseholdItemViaApi(page, { name });

      await listPage.search(name);

      await expect(async () => {
        expect(await listPage.getItemNames()).toContain(name);
      }).toPass();
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });

  test('Table headers are Purchase, Area, Company, Delivery, Expected cost, Invoiced, Status; the other columns are hidden by default', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    let createdId: string | null = null;
    const name = `${testPrefix} HI Table Columns Test`;

    try {
      createdId = await createHouseholdItemViaApi(page, { name, category: 'hic-furniture' });

      await listPage.search(name);
      await expect(listPage.itemRow(name)).toHaveCount(1);

      if (!(await listPage.isTableSurface())) {
        // Card surface: the three facts are Area, Delivery and Expected cost
        await expect(listPage.itemRow(name)).toContainText('No area');
        return;
      }

      for (const header of [
        'Purchase',
        'Area',
        'Company',
        'Delivery',
        'Expected cost',
        'Invoiced',
        'Status',
      ]) {
        await expect(listPage.columnHeader(header)).toBeVisible();
      }
      for (const hidden of ['Category', 'Order date', 'Grants', 'After grants', 'Cost lines']) {
        await expect(listPage.columnHeader(hidden)).toHaveCount(0);
      }
      // "Actual cost" is gone (it is the same number as Invoiced)
      await expect(listPage.columnHeader('Actual cost')).toHaveCount(0);
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Search
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Search filters (Scenario 6)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  test('Search by name filters list to matching purchases only', async ({ page, testPrefix }) => {
    const listPage = new HouseholdItemsPage(page);
    const created: string[] = [];
    const alphaName = `${testPrefix} HI Alpha Sofa`;
    const betaName = `${testPrefix} HI Beta Lamp`;

    try {
      created.push(await createHouseholdItemViaApi(page, { name: alphaName }));
      created.push(await createHouseholdItemViaApi(page, { name: betaName }));

      await listPage.goto();
      await listPage.waitForLoaded();
      await listPage.typeSearch(`${testPrefix} HI Alpha`);

      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(alphaName);
        expect(names).not.toContain(betaName);
      }).toPass();
    } finally {
      for (const id of created) await deleteHouseholdItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Category filter
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Category filter (Scenario 7)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  test('Filters › Category narrows the list to the selected category', async ({
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

      await listPage.search(`${testPrefix} HI Cat`);
      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(furnitureName);
        expect(names).toContain(applianceName);
      }).toPass();

      await listPage.pickCategoryFilter('hic-furniture');
      await page.waitForURL((url) => url.searchParams.get('category') === 'hic-furniture');

      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(furnitureName);
        expect(names).not.toContain(applianceName);
      }).toPass();
    } finally {
      for (const id of created) await deleteHouseholdItemViaApi(page, id);
    }
  });

  test('?category= in the URL pre-selects the filter', async ({ page, testPrefix }) => {
    const listPage = new HouseholdItemsPage(page);
    const created: string[] = [];
    const furnitureName = `${testPrefix} HI CatUrl Furniture`;
    const applianceName = `${testPrefix} HI CatUrl Appliance`;

    try {
      created.push(
        await createHouseholdItemViaApi(page, { name: furnitureName, category: 'hic-furniture' }),
      );
      created.push(
        await createHouseholdItemViaApi(page, { name: applianceName, category: 'hic-appliances' }),
      );

      await listPage.goto(
        `q=${encodeURIComponent(`${testPrefix} HI CatUrl`)}&category=hic-furniture`,
      );
      await listPage.waitForLoaded();

      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(furnitureName);
        expect(names).not.toContain(applianceName);
      }).toPass();
      await listPage.openFilters();
      await expect(listPage.categoryFilter).toHaveValue('hic-furniture');
    } finally {
      for (const id of created) await deleteHouseholdItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Status chips
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Status chips (Scenario 8)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  test('Pressing a status chip narrows the list and writes status= to the URL', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    const created: string[] = [];
    const plannedName = `${testPrefix} HI Status Planned Desk`;
    const purchasedName = `${testPrefix} HI Status Purchased Couch`;

    try {
      created.push(await createHouseholdItemViaApi(page, { name: plannedName, status: 'planned' }));
      created.push(
        await createHouseholdItemViaApi(page, { name: purchasedName, status: 'purchased' }),
      );

      await listPage.search(`${testPrefix} HI Status`);
      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(plannedName);
        expect(names).toContain(purchasedName);
      }).toPass();

      await listPage.selectChip('planned');
      await page.waitForURL((url) => url.searchParams.get('status') === 'planned');

      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(plannedName);
        expect(names).not.toContain(purchasedName);
      }).toPass();
    } finally {
      for (const id of created) await deleteHouseholdItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Status badges
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Status badge rendering (Scenario 9)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  test('A status badge renders for planned, purchased, scheduled and arrived purchases', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    const created: string[] = [];
    const statuses = [
      ['planned', 'Planned'],
      ['purchased', 'Ordered'],
      ['scheduled', 'Delivery scheduled'],
      ['arrived', 'Delivered'],
    ] as const;
    const ids: Record<string, string> = {};

    try {
      for (const [status] of statuses) {
        const id = await createHouseholdItemViaApi(page, {
          name: `${testPrefix} HI Badge ${status}`,
          status,
        });
        ids[status] = id;
        created.push(id);
      }

      await listPage.search(`${testPrefix} HI Badge`);
      // The Delivered group is collapsed while other groups have rows
      await listPage.expandGroup('arrived');

      for (const [status, label] of statuses) {
        await expect(listPage.statusBadge(ids[status]!)).toHaveText(label);
      }
    } finally {
      for (const id of created) await deleteHouseholdItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 10 and 11: Delete
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete (Scenarios 10 and 11)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  test('⋯ › Delete › Confirm removes the purchase from the list', async ({ page, testPrefix }) => {
    const listPage = new HouseholdItemsPage(page);
    const name = `${testPrefix} HI Delete Confirm`;
    await createHouseholdItemViaApi(page, { name });

    await listPage.search(name);
    await expect(listPage.itemRow(name)).toHaveCount(1);

    await listPage.openDeleteModal(name);
    await expect(listPage.deleteModal).toContainText(name);

    await listPage.confirmDelete();

    await expect(listPage.itemRow(name)).toHaveCount(0);
  });

  test('⋯ › Delete › Cancel leaves the purchase in the list', async ({ page, testPrefix }) => {
    const listPage = new HouseholdItemsPage(page);
    let createdId: string | null = null;
    const name = `${testPrefix} HI Delete Cancel`;

    try {
      createdId = await createHouseholdItemViaApi(page, { name });

      await listPage.search(name);
      await expect(listPage.itemRow(name)).toHaveCount(1);

      await listPage.openDeleteModal(name);
      await listPage.cancelDelete();

      await expect(listPage.itemRow(name)).toHaveCount(1);
      // Focus returns to the page, never to <body>
      await expect(listPage.heading).toBeFocused();
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: Legacy paging URL
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Legacy URL (Scenario 12)', { tag: '@responsive' }, () => {
  test('?page=2&pageSize=10 is removed from the URL and the list renders', async ({ page }) => {
    const listPage = new HouseholdItemsPage(page);

    await listPage.goto('page=2&pageSize=10');
    await listPage.waitForLoaded();

    await page.waitForURL(
      (url) => !url.searchParams.has('page') && !url.searchParams.has('pageSize'),
    );
    await expect(listPage.heading).toBeVisible();
    await expect(listPage.olist.retryButton).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13: Responsive
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 13)', { tag: '@responsive' }, () => {
  test('Purchases list renders without horizontal scroll', async ({ page }) => {
    const listPage = new HouseholdItemsPage(page);

    await listPage.goto();
    await listPage.waitForLoaded();

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Phone: cards are shown below 768px; larger: the table', async ({ page, testPrefix }) => {
    const listPage = new HouseholdItemsPage(page);
    let createdId: string | null = null;
    const name = `${testPrefix} HI Surface Test`;

    try {
      createdId = await createHouseholdItemViaApi(page, { name });

      await listPage.search(name);
      await expect(listPage.itemRow(name)).toHaveCount(1);

      const width = page.viewportSize()?.width ?? 0;
      if (width < 768) {
        expect(await listPage.isTableSurface()).toBe(false);
      } else if (width >= 1024) {
        expect(await listPage.isTableSurface()).toBe(true);
      }
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 14: Dark mode
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering (Scenario 14)', { tag: '@responsive' }, () => {
  test('Purchases list renders correctly in dark mode', async ({ page }) => {
    const listPage = new HouseholdItemsPage(page);

    await page.goto(HOUSEHOLD_ITEMS_ROUTE);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await listPage.heading.waitFor({ state: 'visible' });
    await listPage.waitForLoaded();

    await expect(listPage.searchInput).toBeVisible();
    await expect(listPage.olist.filtersButton).toBeVisible();
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 15: Accessibility
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Accessibility (Scenario 15)', { tag: '@responsive' }, () => {
  test('Search field is a search box named "Search purchases" inside a search landmark', async ({
    page,
  }) => {
    const listPage = new HouseholdItemsPage(page);

    await listPage.goto();

    await expect(page.getByRole('search')).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search purchases' })).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 16: Status chip colour (Story #2195, AC2; D-08 regression guard)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Purchase status chip colour (Story #2195, AC2)', { tag: '@responsive' }, () => {
  test('Every purchase status chip has a non-transparent background', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    const created: string[] = [];
    const statuses = [
      ['planned', 'Planned'],
      ['purchased', 'Ordered'],
      ['scheduled', 'Delivery scheduled'],
      ['arrived', 'Delivered'],
    ] as const;
    const ids: Record<string, string> = {};

    try {
      for (const [status] of statuses) {
        const id = await createHouseholdItemViaApi(page, {
          name: `${testPrefix} HI Colour ${status}`,
          status,
        });
        ids[status] = id;
        created.push(id);
      }

      await listPage.search(`${testPrefix} HI Colour`);
      await listPage.expandGroup('arrived');

      for (const [status, label] of statuses) {
        const chip = listPage.statusBadge(ids[status]!);
        await expect(chip).toHaveText(label);
        const bg = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(
          bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)',
          `"${label}" chip background "${bg}" must not be transparent`,
        ).toBe(true);
      }
    } finally {
      for (const id of created) await deleteHouseholdItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 17: Grouped by Status by default
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Grouped by Status (Scenario 17)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  test('Status groups appear in status order; Delivered is collapsed while other groups have rows', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    const created: string[] = [];
    const arrivedName = `${testPrefix} HI Group Arrived`;
    const plannedName = `${testPrefix} HI Group Planned`;
    const orderedName = `${testPrefix} HI Group Ordered`;

    try {
      created.push(await createHouseholdItemViaApi(page, { name: arrivedName, status: 'arrived' }));
      created.push(await createHouseholdItemViaApi(page, { name: plannedName, status: 'planned' }));
      created.push(
        await createHouseholdItemViaApi(page, { name: orderedName, status: 'purchased' }),
      );

      await listPage.search(`${testPrefix} HI Group`);

      await expect(async () => {
        expect(await listPage.groupKeys()).toEqual(['planned', 'purchased', 'arrived']);
      }).toPass();
      await expect(listPage.groupToggle('planned')).toHaveAttribute('aria-expanded', 'true');
      await expect(listPage.groupToggle('arrived')).toHaveAttribute('aria-expanded', 'false');
      // The collapsed group hides its row
      expect(await listPage.getItemNames()).not.toContain(arrivedName);

      await listPage.expandGroup('arrived');
      await expect(async () => {
        expect(await listPage.getItemNames()).toContain(arrivedName);
      }).toPass();
    } finally {
      for (const id of created) await deleteHouseholdItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 18: Chips
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Status chips and search (Scenario 18)', { tag: '@responsive' }, () => {
  test('The four status chips and All are offered; searching never says "Searching all"', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);

    await listPage.goto();
    await listPage.waitForLoaded();

    for (const chip of ['planned', 'purchased', 'scheduled', 'arrived', 'all'] as const) {
      await expect(listPage.chip(chip)).toBeVisible();
    }
    await expect(listPage.chip('planned')).toContainText('Planned');
    await expect(listPage.chip('purchased')).toContainText('Ordered');
    await expect(listPage.chip('scheduled')).toContainText('Delivery scheduled');
    await expect(listPage.chip('arrived')).toContainText('Delivered');

    // No chip is pressed by default (all purchases are listed)
    await expect(listPage.chip('planned')).toHaveAttribute('aria-pressed', 'false');

    await listPage.typeSearch(`${testPrefix} HI NoSuchPurchase`);
    await expect(listPage.olist.searchingAll).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 19: Footer totals
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Totals footer (Scenario 19)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 90_000 });

  test('Footer Expected cost, Invoiced and Paid equal the API totals and the sum of the rows', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    const cleanup = newCleanup();
    const created: string[] = [];
    const prefix = `${testPrefix} HI Totals`;

    try {
      const sourceId = await createFundingSource(page, cleanup, `${prefix} Source`);
      for (const [suffix, amount] of [
        ['One', 1200],
        ['Two', 3400.5],
      ] as const) {
        const id = await createHouseholdItemViaApi(page, { name: `${prefix} ${suffix}` });
        created.push(id);
        await createCostLine(page, {
          kind: 'household_item',
          hostId: id,
          budgetSourceId: sourceId,
          description: `${prefix} ${suffix} line`,
          plannedAmount: amount,
        });
      }

      const answered = page.waitForResponse((resp) => {
        const url = new URL(resp.url());
        return (
          url.pathname === API.householdItems &&
          url.searchParams.get('q') === prefix &&
          resp.request().method() === 'GET'
        );
      });
      await listPage.search(prefix);
      const body = (await (await answered).json()) as {
        items: Array<{
          expectedCost: number | null;
          paid: number;
          budgetSummary: { totalActual: number };
        }>;
        totals: { expectedCost: number; invoiced: number; paid: number };
      };

      expect(body.items).toHaveLength(2);
      expect(body.totals.expectedCost).toBeGreaterThan(0);

      await expect(listPage.footer).toBeVisible();
      await expect
        .poll(async () => parseMoney(await listPage.footerExpected.innerText()))
        .toBeCloseTo(body.totals.expectedCost, 2);
      expect(parseMoney(await listPage.footerInvoiced.innerText())).toBeCloseTo(
        body.totals.invoiced,
        2,
      );
      expect(parseMoney(await listPage.footerPaid.innerText())).toBeCloseTo(body.totals.paid, 2);

      // Each total is the sum of the rows
      const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
      expect(sum(body.items.map((i) => i.expectedCost ?? 0))).toBeCloseTo(
        body.totals.expectedCost,
        2,
      );
      expect(sum(body.items.map((i) => i.budgetSummary.totalActual))).toBeCloseTo(
        body.totals.invoiced,
        2,
      );
      expect(sum(body.items.map((i) => i.paid))).toBeCloseTo(body.totals.paid, 2);
    } finally {
      await runCleanup(cleanup);
      for (const id of created) await deleteHouseholdItemViaApi(page, id);
    }
  });

  test('The footer label is "Totals", and "Totals (filtered)" once a chip narrows the list', async ({
    page,
  }) => {
    const listPage = new HouseholdItemsPage(page);

    await listPage.goto();
    await listPage.waitForLoaded();

    // The shared database may be empty of purchases at this moment: the footer needs a row
    test.skip((await listPage.footer.count()) === 0, 'No purchase in the list, so no footer');
    await expect(listPage.footer).toHaveAccessibleName('Totals');

    await listPage.selectChip('planned');
    await page.waitForURL((url) => url.searchParams.get('status') === 'planned');
    if ((await listPage.footer.count()) > 0) {
      await expect(listPage.footer).toHaveAccessibleName('Totals (filtered)');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 20: Filters
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Filters panel (Scenario 20)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 90_000 });

  test('Filters › Area narrows the list, "No area" lists the purchases without one', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    const created: string[] = [];
    const areaIds: string[] = [];
    const areaName = `${testPrefix} HI Filter Area`;
    const inAreaName = `${testPrefix} HI Filter In Area`;
    const noAreaName = `${testPrefix} HI Filter No Area`;

    try {
      const areaId = await createAreaViaApi(page, { name: areaName });
      areaIds.push(areaId);
      created.push(await createHouseholdItemViaApi(page, { name: inAreaName, areaId }));
      created.push(await createHouseholdItemViaApi(page, { name: noAreaName }));

      await listPage.search(`${testPrefix} HI Filter`);
      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(inAreaName);
        expect(names).toContain(noAreaName);
      }).toPass();

      await listPage.pickAreaFilter(areaName);
      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(inAreaName);
        expect(names).not.toContain(noAreaName);
      }).toPass();

      await listPage.pickAreaFilter('No area');
      await page.waitForURL((url) => url.searchParams.get('areaId') === '__none__');
      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(noAreaName);
        expect(names).not.toContain(inAreaName);
      }).toPass();
    } finally {
      for (const id of created) await deleteHouseholdItemViaApi(page, id);
      for (const id of areaIds) await deleteAreaViaApi(page, id);
    }
  });

  test('Filters › Target delivery narrows the list to the date range', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    const created: string[] = [];
    const earlyName = `${testPrefix} HI Target Early`;
    const lateName = `${testPrefix} HI Target Late`;

    try {
      // The target delivery date is derived: the scheduler sets it from the earliest delivery
      // constraint, so patch that (a create cannot set it) and read the result back.
      for (const [name, earliest] of [
        [earlyName, '2031-03-10'],
        [lateName, '2031-09-20'],
      ] as const) {
        const id = await createHouseholdItemViaApi(page, { name });
        created.push(id);
        const patched = await page.request.patch(`${API.householdItems}/${id}`, {
          data: { earliestDeliveryDate: earliest },
        });
        expect(patched.ok(), `PATCH purchase: ${patched.status()}`).toBeTruthy();
        const detail = (await (await page.request.get(`${API.householdItems}/${id}`)).json()) as {
          householdItem: { targetDeliveryDate: string | null };
        };
        expect(detail.householdItem.targetDeliveryDate).toBe(earliest);
      }

      await listPage.search(`${testPrefix} HI Target`);
      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(earlyName);
        expect(names).toContain(lateName);
      }).toPass();

      await listPage.setTargetDelivery('2031-01-01', '2031-06-30');
      await page.waitForURL((url) => url.searchParams.has('targetDelivery'));

      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(earlyName);
        expect(names).not.toContain(lateName);
      }).toPass();
    } finally {
      for (const id of created) await deleteHouseholdItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 21: Row link
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Row link (Scenario 21)', { tag: '@responsive' }, () => {
  test('The purchase name links to the purchase page', async ({ page, testPrefix }) => {
    const listPage = new HouseholdItemsPage(page);
    let createdId: string | null = null;
    const name = `${testPrefix} HI Open Link`;

    try {
      createdId = await createHouseholdItemViaApi(page, { name });

      await listPage.search(name);
      await expect(listPage.itemRow(name)).toHaveCount(1);
      await listPage.olist.titleLink(await listPage.idOf(name)).click();

      await page.waitForURL(`**${routeUrl('householdItem', { id: createdId })}`);
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});
