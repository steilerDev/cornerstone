/**
 * E2E tests for i18n translation of predefined category names (Story #1143).
 *
 * Predefined trades, budget categories, and household item categories now have a
 * `translationKey` field. The frontend uses `getCategoryDisplayName()` to resolve
 * the translated name for the current locale, falling back to the raw database
 * name if no translation key or translation string is present.
 *
 * Test strategy:
 * - Each test creates a dedicated local user so that PATCH /api/users/me/preferences
 *   never mutates the shared TEST_ADMIN user, eliminating locale-state leakage across
 *   parallel workers.
 * - A fresh browser context (no storageState) is created per test, logged in as the
 *   dedicated user, and closed in a finally block.
 * - Scoped to desktop only — language state changes involve localStorage + API
 *   interactions that are unreliable on WebKit tablet (810px), consistent with
 *   the existing i18n.spec.ts test strategy.
 * - No test data is created or destroyed — tests read the predefined (seeded)
 *   categories that are always present after migration.
 */

import type { Browser, BrowserContext, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { createLocalUserViaApi, deleteUserViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Route helpers
// ─────────────────────────────────────────────────────────────────────────────

const MANAGE_TRADES_URL = '/settings/manage?tab=trades';
const MANAGE_BUDGET_CATEGORIES_URL = '/settings/manage?tab=budget-categories';
const MANAGE_HI_CATEGORIES_URL = '/settings/manage?tab=hi-categories';

// ─────────────────────────────────────────────────────────────────────────────
// Per-test context helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new isolated browser context, logs in as the given user, sets the
 * locale preference on that user's session, and writes the locale to localStorage
 * so LocaleContext picks it up synchronously on the next navigation.
 */
async function loginAsUserInNewContext(
  browser: Browser,
  email: string,
  password: string,
  locale: 'en' | 'de' | 'system',
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const scopedPage = await context.newPage();
  // Authenticate via API
  await scopedPage.request.post('/api/auth/login', { data: { email, password } });
  // Set locale preference on THIS user (never touches the shared admin)
  await scopedPage.request.patch('/api/users/me/preferences', {
    data: { key: 'locale', value: locale },
  });
  // Navigate to root so we can write localStorage on the correct origin
  await scopedPage.goto('/');
  await scopedPage.waitForLoadState('domcontentloaded');
  await scopedPage.evaluate((l) => localStorage.setItem('locale', l), locale);
  return { context, page: scopedPage };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('i18n: Predefined category name translations', () => {
  const dedicatedPassword = 'e2e-i18n-pw-123!';
  let dedicatedUser: { id: string; email: string } | null = null;

  test.beforeEach(async ({ page, testPrefix }, testInfo) => {
    // Skip on non-desktop viewports — consistent with i18n.spec.ts strategy
    const viewport = page.viewportSize();
    if (viewport !== null && viewport.width < 1200) {
      test.skip();
      return;
    }
    // Create a dedicated user per test — each test gets its own isolated locale state
    dedicatedUser = await createLocalUserViaApi(page, {
      email: `i18n-${testPrefix}-${testInfo.workerIndex}-${Date.now()}@e2e-test.local`,
      displayName: 'E2E i18n User',
      password: dedicatedPassword,
    });
  });

  test.afterEach(async ({ page }) => {
    if (dedicatedUser) {
      await deleteUserViaApi(page, dedicatedUser.id);
      dedicatedUser = null;
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Trades tab
  // ───────────────────────────────────────────────────────────────────────────

  test('English baseline: Manage trades tab shows "Plumbing"', async ({ browser }) => {
    const { context, page: scopedPage } = await loginAsUserInNewContext(
      browser,
      dedicatedUser!.email,
      dedicatedPassword,
      'en',
    );
    try {
      // When: User navigates to the Manage page trades tab
      await scopedPage.goto(MANAGE_TRADES_URL);
      await scopedPage.locator('#trades-panel').waitFor({ state: 'attached' });

      const tradesPanel = scopedPage.locator('#trades-panel');
      await tradesPanel.locator('[class*="itemRow"]').first().waitFor({ state: 'visible' });

      // Then: The predefined "Plumbing" trade is visible with its English name
      await expect(tradesPanel.getByText('Plumbing', { exact: true }).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('German locale: Manage trades tab shows "Sanitär" instead of "Plumbing"', async ({
    browser,
  }) => {
    // Extend timeout: i18next cold-start locale initialization from localStorage
    // can take 10-15s on the first German page load in CI.
    test.setTimeout(60000);

    const { context, page: scopedPage } = await loginAsUserInNewContext(
      browser,
      dedicatedUser!.email,
      dedicatedPassword,
      'de',
    );
    try {
      // goto() + reload() pattern: loginAsUserInNewContext writes localStorage on '/'
      // but the subsequent goto() to a different route may not trigger a full re-render
      // of i18next. A reload() forces the SPA to re-read localStorage on the target route,
      // ensuring the German bundle is initialized before asserting translated text.
      await scopedPage.goto(MANAGE_TRADES_URL, { waitUntil: 'networkidle' });
      await scopedPage.reload({ waitUntil: 'networkidle' });

      const tradesPanel = scopedPage.locator('#trades-panel');
      await expect(tradesPanel.getByText('Sanitär', { exact: true }).first()).toBeVisible({
        timeout: 30000,
      });

      // And: The raw English name "Plumbing" is NOT shown as a category name
      await expect(
        tradesPanel.locator('[class*="itemName"]').filter({ hasText: 'Plumbing' }),
      ).not.toBeVisible();
    } finally {
      await context.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Budget Categories tab
  // ───────────────────────────────────────────────────────────────────────────

  test('English baseline: Manage budget categories tab shows "Materials"', async ({ browser }) => {
    const { context, page: scopedPage } = await loginAsUserInNewContext(
      browser,
      dedicatedUser!.email,
      dedicatedPassword,
      'en',
    );
    try {
      await scopedPage.goto(MANAGE_BUDGET_CATEGORIES_URL);
      await scopedPage.locator('#budget-categories-panel').waitFor({ state: 'attached' });

      const budgetPanel = scopedPage.locator('#budget-categories-panel');
      await budgetPanel.locator('[class*="itemRow"]').first().waitFor({ state: 'visible' });

      // Then: The predefined "Materials" budget category is visible with its English name
      await expect(budgetPanel.getByText('Materials', { exact: true }).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('German locale: Manage budget categories tab shows "Materialien" instead of "Materials"', async ({
    browser,
  }) => {
    test.setTimeout(60000);

    const { context, page: scopedPage } = await loginAsUserInNewContext(
      browser,
      dedicatedUser!.email,
      dedicatedPassword,
      'de',
    );
    try {
      await scopedPage.goto(MANAGE_BUDGET_CATEGORIES_URL, { waitUntil: 'networkidle' });
      await scopedPage.reload({ waitUntil: 'networkidle' });

      const budgetPanel = scopedPage.locator('#budget-categories-panel');
      await expect(budgetPanel.getByText('Materialien', { exact: true }).first()).toBeVisible({
        timeout: 30000,
      });

      // And: The raw English name "Materials" is NOT shown as a category name
      await expect(
        budgetPanel.locator('[class*="itemName"]').filter({ hasText: 'Materials' }),
      ).not.toBeVisible();
    } finally {
      await context.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Household Item Categories tab
  // ───────────────────────────────────────────────────────────────────────────

  test('English baseline: Manage household item categories tab shows "Furniture"', async ({
    browser,
  }) => {
    const { context, page: scopedPage } = await loginAsUserInNewContext(
      browser,
      dedicatedUser!.email,
      dedicatedPassword,
      'en',
    );
    try {
      await scopedPage.goto(MANAGE_HI_CATEGORIES_URL);
      await scopedPage.locator('#hi-categories-panel').waitFor({ state: 'attached' });

      const hiPanel = scopedPage.locator('#hi-categories-panel');
      await hiPanel.locator('[class*="itemRow"]').first().waitFor({ state: 'visible' });

      // Then: The predefined "Furniture" household item category is visible with its English name
      await expect(hiPanel.getByText('Furniture', { exact: true }).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('German locale: Manage household item categories tab shows "Möbel" instead of "Furniture"', async ({
    browser,
  }) => {
    test.setTimeout(60000);

    const { context, page: scopedPage } = await loginAsUserInNewContext(
      browser,
      dedicatedUser!.email,
      dedicatedPassword,
      'de',
    );
    try {
      await scopedPage.goto(MANAGE_HI_CATEGORIES_URL, { waitUntil: 'networkidle' });
      await scopedPage.reload({ waitUntil: 'networkidle' });

      const hiPanel = scopedPage.locator('#hi-categories-panel');
      await expect(hiPanel.getByText('Möbel', { exact: true }).first()).toBeVisible({
        timeout: 30000,
      });

      // And: The raw English name "Furniture" is NOT shown as a category name
      await expect(
        hiPanel.locator('[class*="itemName"]').filter({ hasText: 'Furniture' }),
      ).not.toBeVisible();
    } finally {
      await context.close();
    }
  });
});
