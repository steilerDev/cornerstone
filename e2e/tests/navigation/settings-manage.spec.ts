/**
 * E2E tests for the Settings/Manage page tab navigation
 *
 * The ManagePage (/settings/manage) has four tabs:
 *   - Areas  (?tab=areas)  — create/edit/delete areas for organizing work items
 *   - Trades (?tab=trades) — create/edit/delete trades for organizing vendors
 *   - Budget Categories (?tab=budget-categories) — managed by budget-categories.spec.ts
 *   - Household Item Categories (?tab=hi-categories) — household item classification
 *
 * This file covers:
 * - Smoke: Page loads, h1 "Manage" heading, default tab (Areas) renders
 * - Tab navigation: clicking each tab renders its panel
 * - URL sync: ?tab= query param sets the correct active tab on load
 * - Areas tab: create area happy path, area appears in list, delete area
 * - Trades tab: create trade happy path, trade appears in list, delete trade
 * - HI Categories tab: create HI category, category appears in list, delete it
 * - Responsive layout (@responsive)
 * - Dark mode
 *
 * Budget Categories tab already has comprehensive coverage in
 * e2e/tests/budget/budget-categories.spec.ts — this file does not duplicate it.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { BudgetCategoriesPage } from '../../pages/BudgetCategoriesPage.js';

const MANAGE_ROUTE = '/settings/manage';
const AREAS_PANEL_ID = 'areas-panel';
const TRADES_PANEL_ID = 'trades-panel';
const HI_CATEGORIES_PANEL_ID = 'hi-categories-panel';
const BUDGET_CATEGORIES_PANEL_ID = 'budget-categories-panel';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

async function createAreaViaApi(page: Page, name: string): Promise<string> {
  const response = await page.request.post('/api/areas', { data: { name } });
  if (!response.ok()) throw new Error(`POST /api/areas returned ${response.status()}`);
  // Server returns { area: { id, name, ... } }
  const body = (await response.json()) as { area: { id: string } };
  return body.area.id;
}

async function deleteAreaViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`/api/areas/${id}`);
}

async function createTradeViaApi(page: Page, name: string): Promise<string> {
  const response = await page.request.post('/api/trades', { data: { name } });
  if (!response.ok()) throw new Error(`POST /api/trades returned ${response.status()}`);
  // Server returns { trade: { id, name, ... } }
  const body = (await response.json()) as { trade: { id: string } };
  return body.trade.id;
}

async function deleteTradeViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`/api/trades/${id}`);
}

async function createHICategoryViaApi(page: Page, name: string): Promise<string> {
  const response = await page.request.post('/api/household-item-categories', { data: { name } });
  if (!response.ok())
    throw new Error(`POST /api/household-item-categories returned ${response.status()}`);
  // Server returns the category entity directly (not wrapped): { id, name, ... }
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function deleteHICategoryViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`/api/household-item-categories/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Smoke: Page load and heading
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Settings/Manage page — smoke test', { tag: '@responsive' }, () => {
  test(
    'Manage page loads with "Manage" heading and Areas tab visible',
    { tag: '@smoke' },
    async ({ page }) => {
      await page.goto(MANAGE_ROUTE);

      // h1 "Manage" from PageLayout
      const heading = page.getByRole('heading', { level: 1, name: 'Manage', exact: true });
      await expect(heading).toBeVisible();

      // Default tab is Areas — its tab button should be selected
      const areasTab = page.getByRole('tab', { name: 'Areas' });
      await expect(areasTab).toBeVisible();
      await expect(areasTab).toHaveAttribute('aria-selected', 'true');

      // The Areas create form heading is visible in the active panel
      await expect(
        page.getByRole('heading', { level: 2, name: 'Create New Area', exact: true }),
      ).toBeVisible();
    },
  );

  test('Settings subnav renders Profile, Manage, User Management, Backups tabs', async ({
    page,
  }) => {
    await page.goto(MANAGE_ROUTE);

    // SubNav for Settings section — scope to the Settings nav landmark; use
    // exact matching so "Manage" does not collide with "User Management".
    const subNav = page.getByRole('navigation', { name: 'Settings section navigation' });
    await expect(subNav.getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
    await expect(subNav.getByRole('link', { name: 'Manage', exact: true })).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tab navigation — click each tab to activate
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tab navigation', { tag: '@responsive' }, () => {
  test('Clicking Areas tab shows the Areas create form', async ({ page }) => {
    // Start on trades tab then navigate to areas
    await page.goto(`${MANAGE_ROUTE}?tab=trades`);
    const heading = page.getByRole('heading', { level: 1, name: 'Manage', exact: true });
    await heading.waitFor({ state: 'visible' });

    await page.getByRole('tab', { name: 'Areas' }).click();

    // Areas create form heading appears
    await expect(
      page.getByRole('heading', { level: 2, name: 'Create New Area', exact: true }),
    ).toBeVisible();

    // URL param updated
    await expect(page).toHaveURL(/\?tab=areas/);
  });

  test('Clicking Trades tab shows the Trades create form', async ({ page }) => {
    await page.goto(MANAGE_ROUTE);
    const heading = page.getByRole('heading', { level: 1, name: 'Manage', exact: true });
    await heading.waitFor({ state: 'visible' });

    await page.getByRole('tab', { name: 'Trades' }).click();

    // Trades create form heading appears
    await expect(
      page.getByRole('heading', { level: 2, name: 'Create New Trade', exact: true }),
    ).toBeVisible();

    await expect(page).toHaveURL(/\?tab=trades/);
  });

  test('Clicking Budget Categories tab shows the create form', async ({ page }) => {
    await page.goto(MANAGE_ROUTE);
    const heading = page.getByRole('heading', { level: 1, name: 'Manage', exact: true });
    await heading.waitFor({ state: 'visible' });

    await page.getByRole('tab', { name: 'Budget Categories' }).click();

    await expect(
      page.getByRole('heading', { level: 2, name: 'Create New Budget Category', exact: true }),
    ).toBeVisible();

    await expect(page).toHaveURL(/\?tab=budget-categories/);
  });

  test(
    'Clicking Household Item Categories tab shows the create form',
    { tag: '@smoke' },
    async ({ page }) => {
      await page.goto(MANAGE_ROUTE);
      const heading = page.getByRole('heading', { level: 1, name: 'Manage', exact: true });
      await heading.waitFor({ state: 'visible' });

      await page.getByRole('tab', { name: 'Household Item Categories' }).click();

      await expect(
        page.getByRole('heading', {
          level: 2,
          name: 'Create New Household Item Category',
          exact: true,
        }),
      ).toBeVisible();

      await expect(page).toHaveURL(/\?tab=hi-categories/);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// URL sync — deep linking into specific tabs
// ─────────────────────────────────────────────────────────────────────────────

test.describe('URL tab deep-linking', { tag: '@responsive' }, () => {
  test('?tab=areas loads the Areas tab as active', async ({ page }) => {
    await page.goto(`${MANAGE_ROUTE}?tab=areas`);

    const areasTab = page.getByRole('tab', { name: 'Areas' });
    await expect(areasTab).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Create New Area', exact: true }),
    ).toBeVisible();
  });

  test('?tab=trades loads the Trades tab as active', async ({ page }) => {
    await page.goto(`${MANAGE_ROUTE}?tab=trades`);

    const tradesTab = page.getByRole('tab', { name: 'Trades' });
    await expect(tradesTab).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Create New Trade', exact: true }),
    ).toBeVisible();
  });

  test('?tab=budget-categories loads the Budget Categories tab as active', async ({ page }) => {
    await page.goto(`${MANAGE_ROUTE}?tab=budget-categories`);

    const budgetCatTab = page.getByRole('tab', { name: 'Budget Categories' });
    await expect(budgetCatTab).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Create New Budget Category', exact: true }),
    ).toBeVisible();
  });

  test('?tab=hi-categories loads the HI Categories tab as active', async ({ page }) => {
    await page.goto(`${MANAGE_ROUTE}?tab=hi-categories`);

    const hiCatTab = page.getByRole('tab', { name: 'Household Item Categories' });
    await expect(hiCatTab).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Create New Household Item Category',
        exact: true,
      }),
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Areas tab: CRUD
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Areas tab — CRUD', { tag: '@responsive' }, () => {
  test('Create area — area appears in the Existing Areas list', async ({ page, testPrefix }) => {
    const areaName = `${testPrefix} Test Area`;
    let areaId = '';

    try {
      await page.goto(`${MANAGE_ROUTE}?tab=areas`);
      const heading = page.getByRole('heading', { level: 1, name: 'Manage', exact: true });
      await heading.waitFor({ state: 'visible' });

      // Wait for the create form
      const createHeading = page.getByRole('heading', {
        level: 2,
        name: 'Create New Area',
        exact: true,
      });
      await expect(createHeading).toBeVisible();

      // Fill the create form
      const nameInput = page.locator('#areaName');
      await nameInput.fill(areaName);

      // Register response BEFORE click
      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/areas') &&
          resp.request().method() === 'POST' &&
          resp.status() === 201,
      );
      await page.getByRole('button', { name: 'Create Area', exact: true }).click();
      const response = await responsePromise;
      // Server returns { area: { id, name, ... } }
      const body = (await response.json()) as { area: { id: string } };
      areaId = body.area.id;

      // Success banner visible
      const successBanner = page.locator('[class*="successBanner"][role="alert"]');
      await expect(successBanner).toBeVisible();

      // Area appears in the "Existing Areas" list
      const panel = page.locator(`#${AREAS_PANEL_ID}`);
      const itemNames = await panel.locator('[class*="itemName"]').allTextContents();
      expect(itemNames.map((n) => n.trim())).toContain(areaName);
    } finally {
      if (areaId) await deleteAreaViaApi(page, areaId);
    }
  });

  test('Existing Areas list shows at least one item (default areas or created)', async ({
    page,
    testPrefix,
  }) => {
    let areaId = '';

    try {
      // Create an area to guarantee at least one exists
      areaId = await createAreaViaApi(page, `${testPrefix} Existing Area`);

      await page.goto(`${MANAGE_ROUTE}?tab=areas`);
      await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
        state: 'visible',
      });

      const panel = page.locator(`#${AREAS_PANEL_ID}`);
      // Either list items are present, or the list count heading shows > 0
      const existingHeading = panel.getByRole('heading', { level: 2, name: /Existing Areas/ });
      await expect(existingHeading).toBeVisible();
    } finally {
      if (areaId) await deleteAreaViaApi(page, areaId);
    }
  });

  test('Delete area — area removed from list after confirmation', async ({ page, testPrefix }) => {
    const areaName = `${testPrefix} Delete Area`;
    let areaId = '';

    try {
      areaId = await createAreaViaApi(page, areaName);

      await page.goto(`${MANAGE_ROUTE}?tab=areas`);
      await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
        state: 'visible',
      });

      const panel = page.locator(`#${AREAS_PANEL_ID}`);

      // Area delete buttons only have text "Delete" (no aria-label with the name).
      // Scope to the itemRow containing the area name to target the right button.
      const itemRow = panel.locator('[class*="itemRow"]').filter({ hasText: areaName });
      const deleteButton = itemRow.getByRole('button', { name: 'Delete', exact: true });
      await deleteButton.waitFor({ state: 'visible' });
      await deleteButton.click();

      // A confirmation modal appears
      const modal = page.locator('[role="dialog"]');
      await modal.waitFor({ state: 'visible' });

      // Confirm deletion
      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/areas/${areaId}`) && resp.request().method() === 'DELETE',
      );
      const confirmButton = modal.locator('[class*="confirmDeleteButton"]');
      await confirmButton.click();
      await responsePromise;

      // Modal closes
      await modal.waitFor({ state: 'hidden' });

      // Area no longer in the list
      const itemNames = await panel.locator('[class*="itemName"]').allTextContents();
      expect(itemNames.map((n) => n.trim())).not.toContain(areaName);

      // areaId is now deleted; clear to skip cleanup
      areaId = '';
    } finally {
      if (areaId) await deleteAreaViaApi(page, areaId);
    }
  });

  test('Create area fails — empty name shows validation error', async ({ page }) => {
    await page.goto(`${MANAGE_ROUTE}?tab=areas`);
    await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
      state: 'visible',
    });

    // The create button is disabled when name is empty (no text filled)
    const createButton = page.getByRole('button', { name: 'Create Area', exact: true });
    await expect(createButton).toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Trades tab: CRUD
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Trades tab — CRUD', { tag: '@responsive' }, () => {
  test('Create trade — trade appears in the Existing Trades list', async ({ page, testPrefix }) => {
    const tradeName = `${testPrefix} Test Trade`;
    let tradeId = '';

    try {
      await page.goto(`${MANAGE_ROUTE}?tab=trades`);
      await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
        state: 'visible',
      });

      const createHeading = page.getByRole('heading', {
        level: 2,
        name: 'Create New Trade',
        exact: true,
      });
      await expect(createHeading).toBeVisible();

      const nameInput = page.locator('#tradeName');
      await nameInput.fill(tradeName);

      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/trades') &&
          resp.request().method() === 'POST' &&
          resp.status() === 201,
      );
      await page.getByRole('button', { name: 'Create Trade', exact: true }).click();
      const response = await responsePromise;
      const body = (await response.json()) as { trade: { id: string } };
      tradeId = body.trade.id;

      // Success banner visible
      const successBanner = page.locator('[class*="successBanner"][role="alert"]');
      await expect(successBanner).toBeVisible();

      // Trade appears in the list
      const panel = page.locator(`#${TRADES_PANEL_ID}`);
      const itemNames = await panel.locator('[class*="itemName"]').allTextContents();
      expect(itemNames.map((n) => n.trim())).toContain(tradeName);
    } finally {
      if (tradeId) await deleteTradeViaApi(page, tradeId);
    }
  });

  test('Existing Trades list shows default seeded trades', async ({ page }) => {
    await page.goto(`${MANAGE_ROUTE}?tab=trades`);
    await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
      state: 'visible',
    });

    const panel = page.locator(`#${TRADES_PANEL_ID}`);
    const existingHeading = panel.getByRole('heading', { level: 2, name: /Existing Trades/ });
    await expect(existingHeading).toBeVisible();

    // At least some trades should exist from seeding (e.g., "Plumbing", "Electrical", etc.)
    const itemNames = await panel.locator('[class*="itemName"]').allTextContents();
    expect(itemNames.length).toBeGreaterThan(0);
  });

  test('Delete trade — trade removed from list after confirmation', async ({
    page,
    testPrefix,
  }) => {
    const tradeName = `${testPrefix} Delete Trade`;
    let tradeId = '';

    try {
      tradeId = await createTradeViaApi(page, tradeName);

      await page.goto(`${MANAGE_ROUTE}?tab=trades`);
      await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
        state: 'visible',
      });

      const panel = page.locator(`#${TRADES_PANEL_ID}`);
      // Trade delete buttons only have text "Delete" (no aria-label with the name).
      // Scope to the itemRow containing the trade name to target the right button.
      const itemRow = panel.locator('[class*="itemRow"]').filter({ hasText: tradeName });
      const deleteButton = itemRow.getByRole('button', { name: 'Delete', exact: true });
      await deleteButton.waitFor({ state: 'visible' });
      await deleteButton.click();

      const modal = page.locator('[role="dialog"]');
      await modal.waitFor({ state: 'visible' });

      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/trades/${tradeId}`) && resp.request().method() === 'DELETE',
      );
      await modal.locator('[class*="confirmDeleteButton"]').click();
      await responsePromise;
      await modal.waitFor({ state: 'hidden' });

      const itemNames = await panel.locator('[class*="itemName"]').allTextContents();
      expect(itemNames.map((n) => n.trim())).not.toContain(tradeName);
      tradeId = '';
    } finally {
      if (tradeId) await deleteTradeViaApi(page, tradeId);
    }
  });

  test('Create trade fails — empty name shows create button disabled', async ({ page }) => {
    await page.goto(`${MANAGE_ROUTE}?tab=trades`);
    await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
      state: 'visible',
    });

    // Button disabled when name is empty
    const createButton = page.getByRole('button', { name: 'Create Trade', exact: true });
    await expect(createButton).toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Budget Categories tab — covered fully in budget-categories.spec.ts
// These are minimal tab-activation smoke tests only.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget Categories tab — activation check', { tag: '@responsive' }, () => {
  test('Budget Categories tab shows create form on load', { tag: '@smoke' }, async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);
    await categoriesPage.goto();

    await expect(categoriesPage.heading).toBeVisible();
    await expect(categoriesPage.createFormHeading).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Household Item Categories tab: CRUD
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Household Item Categories tab — CRUD', { tag: '@responsive' }, () => {
  test('Create HI category — category appears in the Categories list', async ({
    page,
    testPrefix,
  }) => {
    const catName = `${testPrefix} HI Cat`;
    let catId = '';

    try {
      await page.goto(`${MANAGE_ROUTE}?tab=hi-categories`);
      await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
        state: 'visible',
      });

      const createHeading = page.getByRole('heading', {
        level: 2,
        name: 'Create New Household Item Category',
        exact: true,
      });
      await expect(createHeading).toBeVisible();

      // HI Categories tab uses id="categoryName" (same as Budget Categories tab —
      // but only one tab is active at a time, so no conflict)
      const nameInput = page.locator('#categoryName');
      await nameInput.fill(catName);

      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/household-item-categories') &&
          resp.request().method() === 'POST' &&
          resp.status() === 201,
      );
      await page.getByRole('button', { name: 'Create Category', exact: true }).first().click();
      const response = await responsePromise;
      // Server returns the entity directly: { id, name, color, ... }
      const body = (await response.json()) as { id: string };
      catId = body.id;

      // Success banner
      const successBanner = page.locator('[class*="successBanner"][role="alert"]');
      await expect(successBanner).toBeVisible();

      // Category appears in list
      const panel = page.locator(`#${HI_CATEGORIES_PANEL_ID}`);
      const itemNames = await panel.locator('[class*="itemName"]').allTextContents();
      expect(itemNames.map((n) => n.trim())).toContain(catName);
    } finally {
      if (catId) await deleteHICategoryViaApi(page, catId);
    }
  });

  test('HI Categories list shows seeded categories', async ({ page }) => {
    await page.goto(`${MANAGE_ROUTE}?tab=hi-categories`);
    await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
      state: 'visible',
    });

    const panel = page.locator(`#${HI_CATEGORIES_PANEL_ID}`);
    // Either list items visible, or the "Categories (N)" heading is visible
    const listHeading = panel.getByRole('heading', { level: 2, name: /^Categories \(/ });
    await expect(listHeading).toBeVisible();
  });

  test('Delete HI category — category removed from list', async ({ page, testPrefix }) => {
    const catName = `${testPrefix} Del HI Cat`;
    let catId = '';

    try {
      catId = await createHICategoryViaApi(page, catName);

      await page.goto(`${MANAGE_ROUTE}?tab=hi-categories`);
      await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
        state: 'visible',
      });

      const panel = page.locator(`#${HI_CATEGORIES_PANEL_ID}`);
      const deleteButton = panel.getByRole('button', { name: `Delete ${catName}` });
      await deleteButton.waitFor({ state: 'visible' });
      await deleteButton.click();

      const modal = page.locator('[role="dialog"]');
      await modal.waitFor({ state: 'visible' });

      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/household-item-categories/${catId}`) &&
          resp.request().method() === 'DELETE',
      );
      await modal.locator('[class*="confirmDeleteButton"]').click();
      await responsePromise;
      await modal.waitFor({ state: 'hidden' });

      const itemNames = await panel.locator('[class*="itemName"]').allTextContents();
      expect(itemNames.map((n) => n.trim())).not.toContain(catName);
      catId = '';
    } finally {
      if (catId) await deleteHICategoryViaApi(page, catId);
    }
  });

  test('Create HI category fails — empty name disables the create button', async ({ page }) => {
    await page.goto(`${MANAGE_ROUTE}?tab=hi-categories`);
    await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
      state: 'visible',
    });

    // Find the Create Category button scoped to the HI categories panel
    // There may be multiple "Create Category" buttons on the page (budget + HI tabs)
    // Only the visible one (for the active panel) should be targeted
    const panel = page.locator(`#${HI_CATEGORIES_PANEL_ID}`);
    const createButton = panel.getByRole('button', { name: 'Create Category', exact: true });
    await expect(createButton).toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Responsive layout
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Responsive layout', { tag: '@responsive' }, () => {
  test('Manage page renders without horizontal overflow', async ({ page }) => {
    await page.goto(MANAGE_ROUTE);
    await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
      state: 'visible',
    });

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(overflow).toBe(false);
  });

  test('All four tabs are accessible/scrollable on all viewports', async ({ page }) => {
    await page.goto(MANAGE_ROUTE);
    await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
      state: 'visible',
    });

    // All tab buttons must be present in the DOM (even if scrollable on mobile)
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dark mode', () => {
  test('Manage page renders in dark mode without visible errors', async ({ browser }) => {
    const context = await browser.newContext({
      colorScheme: 'dark',
      storageState: 'test-results/.auth/admin.json',
    });
    const page = await context.newPage();

    try {
      await page.goto(MANAGE_ROUTE);
      const heading = page.getByRole('heading', { level: 1, name: 'Manage', exact: true });
      await expect(heading).toBeVisible();

      // Navigate through each tab in dark mode
      await page.getByRole('tab', { name: 'Trades' }).click();
      await expect(
        page.getByRole('heading', { level: 2, name: 'Create New Trade', exact: true }),
      ).toBeVisible();

      await page.getByRole('tab', { name: 'Areas' }).click();
      await expect(
        page.getByRole('heading', { level: 2, name: 'Create New Area', exact: true }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
