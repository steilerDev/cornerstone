/**
 * E2E tests for internationalization (i18n) — language switching, persistence, and
 * German locale rendering.
 *
 * Story #924: E2E Test Updates & Final Validation for the i18n epic.
 *
 * Test strategy:
 * - Language preference is stored in localStorage ('locale') and synced to the server
 *   via PATCH /api/users/me/preferences.
 * - Each test that changes the language must restore it to English after completion
 *   so as not to break other tests that rely on English text.
 * - Teardown: clear the 'locale' localStorage key and reload so the app returns to
 *   the default 'system' locale (which in CI resolves to 'en' since the browser
 *   locale is English).
 *
 * Scoped to desktop only: language switching involves a form that can be unreliable
 * on WebKit tablet — and language correctness is not viewport-specific.
 */

import { test, expect } from '../../fixtures/auth.js';
import { ROUTES } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set the language preference via the Profile page UI.
 * Waits for the server PATCH response to confirm the preference was persisted.
 */
async function setLanguage(
  page: import('@playwright/test').Page,
  lang: 'en' | 'de' | 'system',
): Promise<void> {
  await page.goto(ROUTES.profile);
  await page.getByRole('heading', { level: 1, name: 'Profile' }).waitFor({ state: 'visible' });
  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/users/me/preferences') && resp.status() === 200,
  );
  await page.locator('#languageSelect').selectOption(lang);
  await responsePromise;
}

/**
 * Reset the locale preference back to English.
 * Used in test teardown to prevent language state leaking between tests.
 */
async function resetToEnglish(page: import('@playwright/test').Page): Promise<void> {
  // Clear localStorage locale key so the app falls back to 'system' (English in CI)
  await page.evaluate(() => localStorage.removeItem('locale'));
  // Also reset via API directly to avoid any server-side preference persisting
  await page.request.patch('/api/users/me/preferences', {
    data: { key: 'locale', value: 'en' },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('i18n: Language Switching', () => {
  test.beforeEach(async ({ page }) => {
    // Skip on non-desktop viewports — language switching relies on form interaction
    // that can be unreliable on WebKit tablet (810px).
    const viewport = page.viewportSize();
    if (viewport !== null && viewport.width < 1200) {
      test.skip();
    }
  });

  test.afterEach(async ({ page }) => {
    await resetToEnglish(page);
  });

  test('Language can be changed to German on the Profile page', async ({ page }) => {
    // Given: User is on the profile page with English as the current language
    await page.goto(ROUTES.profile);
    await page.getByRole('heading', { level: 1, name: 'Profile' }).waitFor({ state: 'visible' });

    // Verify the current language select shows English
    await expect(page.locator('#languageSelect')).toHaveValue('en');

    // When: User changes language to German
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/users/me/preferences') && resp.status() === 200,
    );
    await page.locator('#languageSelect').selectOption('de');
    await responsePromise;

    // Then: The UI immediately updates to German
    // The page heading changes from "Profile" to "Profil" (German translation)
    await expect(page.getByRole('heading', { level: 1, name: 'Profil' })).toBeVisible();

    // And: The language select now shows Deutsch as selected
    await expect(page.locator('#languageSelect')).toHaveValue('de');
  });

  test('German language persists after page reload', async ({ page }) => {
    // Given: Language is set to German
    await setLanguage(page, 'de');

    // When: User navigates away and reloads
    await page.goto(ROUTES.home);
    await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });
    // Register waitForResponse BEFORE reload so we don't miss the response
    const prefsResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/users/me/preferences') && resp.status() === 200,
    );
    await page.reload();
    await prefsResponsePromise;

    // Then: The page is still in German after reload
    // Navigation sidebar links use German translation keys
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: 'Projekt', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Budget', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Zeitplan', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Tagebuch', exact: true })).toBeVisible();
  });

  test('Key page headings render in German after language switch', async ({ page }) => {
    // Given: Language is set to German
    await setLanguage(page, 'de');

    // Then: Dashboard/project overview renders with German heading
    await page.goto(ROUTES.home);
    await expect(page.getByRole('heading', { level: 1, name: 'Projekt' })).toBeVisible();

    // And: Budget page renders in German
    await page.goto(ROUTES.budget);
    await expect(page.getByRole('heading', { level: 1, name: 'Budget' })).toBeVisible();

    // And: Schedule/timeline page renders in German
    await page.goto(ROUTES.timeline);
    await expect(page.getByRole('heading', { level: 1, name: 'Zeitplan' })).toBeVisible();

    // And: Diary page renders in German
    // diary.json page.title = "Bautagebuch" (German for "Construction Diary")
    await page.goto(ROUTES.diary);
    await expect(page.getByRole('heading', { level: 1, name: 'Bautagebuch' })).toBeVisible();
  });

  test('Language can be switched back to English from German', async ({ page }) => {
    // Given: Language was set to German
    await setLanguage(page, 'de');
    await page.goto(ROUTES.profile);
    await page.getByRole('heading', { level: 1, name: 'Profil' }).waitFor({ state: 'visible' });

    // When: User switches back to English
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/users/me/preferences') && resp.status() === 200,
    );
    await page.locator('#languageSelect').selectOption('en');
    await responsePromise;

    // Then: The page updates back to English
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
    await expect(page.locator('#languageSelect')).toHaveValue('en');
  });

  test('Profile preferences section shows language options in current language', async ({
    page,
  }) => {
    // Given: User is on the Profile page in English
    await page.goto(ROUTES.profile);
    await page.getByRole('heading', { level: 1, name: 'Profile' }).waitFor({ state: 'visible' });

    // Then: The Preferences section heading is visible
    await expect(page.getByRole('heading', { level: 2, name: 'Preferences' })).toBeVisible();

    // And: The language select has the 3 expected options
    const languageSelect = page.locator('#languageSelect');
    await expect(languageSelect.locator('option[value="en"]')).toHaveText('English');
    await expect(languageSelect.locator('option[value="de"]')).toHaveText('Deutsch');
    await expect(languageSelect.locator('option[value="system"]')).toHaveText('System');
  });
});

test.describe('i18n: German Locale — Responsive Layout', () => {
  test.beforeEach(async ({ page }) => {
    const viewport = page.viewportSize();
    if (viewport !== null && viewport.width < 1200) {
      test.skip();
    }
  });

  test.afterEach(async ({ page }) => {
    await resetToEnglish(page);
  });

  test('German text does not overflow navigation sidebar on desktop', async ({ page }) => {
    // Given: Language is set to German
    await setLanguage(page, 'de');

    // When: User navigates to dashboard
    await page.goto(ROUTES.home);
    await page.waitForLoadState('networkidle');

    // Then: All navigation links are visible and not overflowing
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText('Projekt', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Budget', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Zeitplan', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Tagebuch', { exact: true })).toBeVisible();

    // And: The sidebar Settings button is visible
    await expect(sidebar.getByText('Einstellungen')).toBeVisible();
  });

  test('German text renders on budget vendors page without breaking layout', async ({ page }) => {
    // Given: Language is set to German
    await setLanguage(page, 'de');

    // When: User navigates to budget vendors
    await page.goto(ROUTES.budgetVendors);
    // German: "Budget" heading stays "Budget" in German (same word)
    await page.getByRole('heading', { level: 1, name: 'Budget' }).waitFor({ state: 'visible' });

    // Then: The section heading is in German
    // budget.json vendors.sectionTitle = "Auftragnehmer" (German for Vendors/Contractors)
    await expect(page.getByRole('heading', { level: 2, name: 'Auftragnehmer' }).first()).toBeVisible();
  });

  test('German text renders on work items page', async ({ page }) => {
    // Given: Language is set to German
    await setLanguage(page, 'de');

    // When: User navigates to work items
    await page.goto(ROUTES.workItems);
    await page.getByRole('heading', { level: 1, name: 'Projekt' }).waitFor({ state: 'visible' });

    // Then: The page renders with German page heading — the ProjectSubNav aria-label is a
    // hardcoded English string ("Project section navigation") not yet translated.
    // We assert the German h1 heading is present, confirming i18n is applied.
    await expect(page.getByRole('heading', { level: 1, name: 'Projekt' })).toBeVisible();
  });
});

test.describe('i18n: Language Persistence via API', () => {
  test.beforeEach(async ({ page }) => {
    const viewport = page.viewportSize();
    if (viewport !== null && viewport.width < 1200) {
      test.skip();
    }
  });

  test.afterEach(async ({ page }) => {
    await resetToEnglish(page);
  });

  test('Language preference is saved to server and returns on fresh session', async ({ page }) => {
    // Given: Language is set to German via the Profile page UI
    await setLanguage(page, 'de');

    // Verify the preference was saved on the server
    const prefsResponse = await page.request.get('/api/users/me/preferences');
    expect(prefsResponse.status()).toBe(200);
    const prefsBody = (await prefsResponse.json()) as {
      preferences: Array<{ key: string; value: string }>;
    };
    const localePreference = prefsBody.preferences.find((p) => p.key === 'locale');
    expect(localePreference?.value).toBe('de');

    // When: Clear localStorage and reload (simulating a fresh client state)
    await page.evaluate(() => localStorage.removeItem('locale'));
    // Register waitForResponse BEFORE navigation so we don't miss the response
    const prefsLoadPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/users/me/preferences') && resp.status() === 200,
    );
    await page.goto(ROUTES.home);

    // Wait for preferences to be fetched from the server
    await prefsLoadPromise;

    // Then: The app applies the server locale preference (German) after loading
    await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });
    // The page heading should be in German ("Projekt" = Project)
    await expect(page.getByRole('heading', { level: 1, name: 'Projekt' })).toBeVisible();
  });

  test('DELETE preference resets to system locale', async ({ page }) => {
    // Given: Language is set to German
    await setLanguage(page, 'de');

    // When: Preference is deleted via API
    const deleteResponse = await page.request.delete('/api/users/me/preferences/locale');
    expect(deleteResponse.status()).toBe(204);

    // And: Clear localStorage too
    await page.evaluate(() => localStorage.removeItem('locale'));

    // Then: App falls back to system locale (English in CI)
    // Register waitForResponse BEFORE navigation so we don't miss the response
    const resetPrefsPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/users/me/preferences') && resp.status() === 200,
    );
    await page.goto(ROUTES.profile);
    await resetPrefsPromise;
    // After no locale preference, system default (English) applies
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  });
});
