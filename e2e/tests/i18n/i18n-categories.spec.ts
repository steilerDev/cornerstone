/**
 * E2E tests for i18n translation of predefined category names (Story #1143).
 *
 * Predefined trades, budget categories, and household item categories now have a
 * `translationKey` field. The frontend uses `getCategoryDisplayName()` to resolve
 * the translated name for the current locale, falling back to the raw database
 * name if no translation key or translation string is present.
 *
 * Test strategy:
 * - Each test navigates to the relevant ManagePage tab in English, verifies the
 *   English name is visible, then switches to German and verifies the German
 *   translation is shown instead.
 * - Locale is restored to English in afterEach to prevent cross-test state leakage.
 * - Scoped to desktop only — language state changes involve localStorage + API
 *   interactions that are unreliable on WebKit tablet (810px), consistent with
 *   the existing i18n.spec.ts test strategy.
 * - No test data is created or destroyed — tests read the predefined (seeded)
 *   categories that are always present after migration.
 */

import { test, expect } from '../../fixtures/auth.js';

// ─────────────────────────────────────────────────────────────────────────────
// Locale helpers (copied pattern from i18n.spec.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set the language preference via API + localStorage.
 * After patching, navigate to / so localStorage can be written on the correct
 * origin. The LocaleContext reads localStorage on mount for synchronous locale
 * resolution without waiting for the preferences API response.
 */
async function setLanguage(
  page: import('@playwright/test').Page,
  lang: 'en' | 'de' | 'system',
): Promise<void> {
  await page.request.patch('/api/users/me/preferences', {
    data: { key: 'locale', value: lang },
  });
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate((locale) => localStorage.setItem('locale', locale), lang);
}

/**
 * Reset locale to English in afterEach to prevent state leakage between tests.
 */
async function resetToEnglish(page: import('@playwright/test').Page): Promise<void> {
  await page.request.patch('/api/users/me/preferences', {
    data: { key: 'locale', value: 'en' },
  });
  try {
    await page.evaluate(() => localStorage.removeItem('locale'));
  } catch {
    // Ignore errors if the page is in a navigating/closed state during teardown
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route helpers
// ─────────────────────────────────────────────────────────────────────────────

const MANAGE_TRADES_URL = '/settings/manage?tab=trades';
const MANAGE_BUDGET_CATEGORIES_URL = '/settings/manage?tab=budget-categories';
const MANAGE_HI_CATEGORIES_URL = '/settings/manage?tab=hi-categories';

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('i18n: Predefined category name translations', () => {
  test.beforeEach(async ({ page }) => {
    // Skip on non-desktop viewports — consistent with i18n.spec.ts strategy
    const viewport = page.viewportSize();
    if (viewport !== null && viewport.width < 1200) {
      test.skip();
    }
  });

  test.afterEach(async ({ page }) => {
    await resetToEnglish(page);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Trades tab
  // ───────────────────────────────────────────────────────────────────────────

  test('English baseline: Manage trades tab shows "Plumbing"', async ({ page }) => {
    // Given: locale is English (default in CI)
    // When: User navigates to the Manage page trades tab
    // Visual cleanup #1185: the <h1>Manage</h1> heading was removed; wait for the tab panel instead.
    await page.goto(MANAGE_TRADES_URL);
    await page.locator('#trades-panel').waitFor({ state: 'attached' });

    // Wait for the trades list to load — the tab panel becomes active after navigation
    const tradesPanel = page.locator('#trades-panel');
    await tradesPanel.locator('[class*="itemRow"]').first().waitFor({ state: 'visible' });

    // Then: The predefined "Plumbing" trade is visible with its English name
    await expect(tradesPanel.getByText('Plumbing', { exact: true }).first()).toBeVisible();
  });

  test('German locale: Manage trades tab shows "Sanitär" instead of "Plumbing"', async ({
    page,
  }) => {
    // Extend test timeout to 60s: i18next cold-start locale initialization from localStorage
    // can take 10-15s on the first German page load in CI; combined with warm-up navigation,
    // manage page load, and potential retry on slow CI runners, 30s is too tight.
    test.setTimeout(60000);

    // Given: locale is set to German
    // setLanguage() patches preferences API + navigates to '/' + writes localStorage.
    await setLanguage(page, 'de');

    // When: User navigates to the Manage page trades tab.
    // goto() + reload() pattern: setLanguage() writes localStorage on '/' but the
    // subsequent goto() to a different route may not trigger a full re-render of i18next.
    // A reload() forces the SPA to re-read localStorage on the target route, ensuring
    // the German bundle is initialized before asserting translated text.
    await page.goto(MANAGE_TRADES_URL, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    // Wait for the trades panel to render with German content — use "Sanitär" as the
    // locale-readiness indicator instead of a generic item row (which could appear with
    // English text before i18next finishes loading the German bundle).
    const tradesPanel = page.locator('#trades-panel');
    await expect(tradesPanel.getByText('Sanitär', { exact: true }).first()).toBeVisible({
      timeout: 30000,
    });

    // And: The raw English name "Plumbing" is NOT shown as a category name
    await expect(
      tradesPanel.locator('[class*="itemName"]').filter({ hasText: 'Plumbing' }),
    ).not.toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Budget Categories tab
  // ───────────────────────────────────────────────────────────────────────────

  test('English baseline: Manage budget categories tab shows "Materials"', async ({ page }) => {
    // Given: locale is English — set explicitly to avoid state leakage from a prior German test
    // in the same shard. setLanguage() patches the API preference AND writes localStorage,
    // ensuring i18next is fully initialized to English before we navigate to the Manage page.
    await setLanguage(page, 'en');

    // When: User navigates to the Manage page budget categories tab
    // Visual cleanup #1185: the <h1>Manage</h1> heading was removed; wait for the tab panel instead.
    await page.goto(MANAGE_BUDGET_CATEGORIES_URL);
    await page.locator('#budget-categories-panel').waitFor({ state: 'attached' });

    const budgetPanel = page.locator('#budget-categories-panel');
    await budgetPanel.locator('[class*="itemRow"]').first().waitFor({ state: 'visible' });

    // Then: The predefined "Materials" budget category is visible with its English name
    await expect(budgetPanel.getByText('Materials', { exact: true }).first()).toBeVisible();
  });

  test('German locale: Manage budget categories tab shows "Materialien" instead of "Materials"', async ({
    page,
  }) => {
    test.setTimeout(60000);

    // Given: locale is set to German
    await setLanguage(page, 'de');

    // When: User navigates to the Manage page budget categories tab.
    // goto() + reload() pattern: see trades test for explanation.
    await page.goto(MANAGE_BUDGET_CATEGORIES_URL, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    // Wait for the budget categories panel to render with German content.
    const budgetPanel = page.locator('#budget-categories-panel');
    await expect(budgetPanel.getByText('Materialien', { exact: true }).first()).toBeVisible({
      timeout: 30000,
    });

    // And: The raw English name "Materials" is NOT shown as a category name
    await expect(
      budgetPanel.locator('[class*="itemName"]').filter({ hasText: 'Materials' }),
    ).not.toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Household Item Categories tab
  // ───────────────────────────────────────────────────────────────────────────

  test('English baseline: Manage household item categories tab shows "Furniture"', async ({
    page,
  }) => {
    // Given: locale is English — set explicitly to avoid state leakage from a prior German test
    await setLanguage(page, 'en');

    // When: User navigates to the Manage page household item categories tab
    // Visual cleanup #1185: the <h1>Manage</h1> heading was removed; wait for the tab panel instead.
    await page.goto(MANAGE_HI_CATEGORIES_URL);
    await page.locator('#hi-categories-panel').waitFor({ state: 'attached' });

    const hiPanel = page.locator('#hi-categories-panel');
    await hiPanel.locator('[class*="itemRow"]').first().waitFor({ state: 'visible' });

    // Then: The predefined "Furniture" household item category is visible with its English name
    await expect(hiPanel.getByText('Furniture', { exact: true }).first()).toBeVisible();
  });

  test('German locale: Manage household item categories tab shows "Möbel" instead of "Furniture"', async ({
    page,
  }) => {
    test.setTimeout(60000);

    // Given: locale is set to German
    await setLanguage(page, 'de');

    // When: User navigates to the Manage page household item categories tab.
    // goto() + reload() pattern: see trades test for explanation.
    await page.goto(MANAGE_HI_CATEGORIES_URL, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    // Wait for the household item categories panel to render with German content.
    const hiPanel = page.locator('#hi-categories-panel');
    await expect(hiPanel.getByText('Möbel', { exact: true }).first()).toBeVisible({
      timeout: 30000,
    });

    // And: The raw English name "Furniture" is NOT shown as a category name
    await expect(
      hiPanel.locator('[class*="itemName"]').filter({ hasText: 'Furniture' }),
    ).not.toBeVisible();
  });
});
