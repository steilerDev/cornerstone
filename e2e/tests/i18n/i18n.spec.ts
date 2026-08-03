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
 *
 * Serial mode (file scope): every test here mutates the SAME row —
 * user_preferences(locale) of the shared TEST_ADMIN user. Under `fullyParallel: true`
 * two of these tests run concurrently in different workers, so one test's
 * `setLanguage()`/`resetToEnglish()` PATCH lands inside another's assertions. That is
 * not merely "stale data": LocaleContext.syncWithServer treats the server value as
 * authoritative, so it applies the other test's locale AND deletes the victim's
 * 'locale' localStorage key, permanently flipping the victim's UI language mid-test.
 * Observed in CI run 30790367863 shard 4, where "Key page headings render in German"
 * asserted 'Projekt' successfully at 06:35:35.49 and then found an English sidebar
 * ('Main navigation', 'Schedule') at 06:35:36.11 — the window in which the
 * concurrently running "Language can be switched back to English from German"
 * (06:35:34.41–35.88, worker 1) PATCHed locale='en'.
 * There is only one admin user, so `testPrefix` cannot isolate this; serial mode is
 * the established remedy for shared-admin-mutating specs (cf. change-password.spec.ts,
 * edit-user.spec.ts). It must be file-scoped, not describe-scoped: the interference
 * observed above crossed describe boundaries.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { ROUTES } from '../../fixtures/testData.js';

test.describe.configure({ mode: 'serial' });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set the language preference via the API directly.
 * The ProfilePage does not have a language selector UI — the locale preference is
 * only exposed via the API (PATCH /api/users/me/preferences).
 *
 * After patching the server preference, we navigate to the home page so the app
 * initialises with the new locale (LocaleContext reads 'locale' from localStorage
 * or falls back to the server preference). We also write directly to localStorage
 * so the locale is applied synchronously on the next navigation without waiting
 * for the preferences API response.
 */
async function setLanguage(page: Page, lang: 'en' | 'de' | 'system'): Promise<void> {
  // Persist preference server-side
  await page.request.patch('/api/users/me/preferences', {
    data: { key: 'locale', value: lang },
  });
  // Navigate to home so we can set localStorage on the correct origin
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  // Write locale to localStorage — LocaleContext reads this on mount
  await page.evaluate((locale) => localStorage.setItem('locale', locale), lang);
}

/**
 * Reset the locale preference back to English.
 * Used in test teardown to prevent language state leaking between tests.
 * We reset both localStorage (client-side) and the server preference.
 */
async function resetToEnglish(page: Page): Promise<void> {
  // Reset server-side preference
  await page.request.patch('/api/users/me/preferences', {
    data: { key: 'locale', value: 'en' },
  });
  // Clear localStorage locale key so the app re-reads from server on next load
  // page.evaluate requires an open page — it's fine since tests always navigate first
  try {
    await page.evaluate(() => localStorage.removeItem('locale'));
  } catch {
    // Ignore errors if the page is in a navigating/closed state during teardown
  }
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
    // Given: User is on the profile page with English as the current language.
    // Explicitly set English first via API + navigate so the #languageSelect
    // is guaranteed to show 'en' regardless of prior test state in this worker.
    await setLanguage(page, 'en');
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
    // Given: Language is set to German (via API + localStorage)
    await setLanguage(page, 'de');

    // When: User navigates to the home page
    await page.goto(ROUTES.home);
    await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

    // Then: The page is in German (localStorage sets locale before first render)
    // Navigation sidebar links use German translation keys
    const nav = page.getByRole('navigation', { name: /Main navigation|Hauptnavigation/ });
    await expect(nav.getByRole('link', { name: 'Projekt', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Budget', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Zeitplan', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Tagebuch', exact: true })).toBeVisible();
  });

  test('Key page headings render in German after language switch', async ({ page }) => {
    // Given: Language is set to German
    await setLanguage(page, 'de');

    // Then: Dashboard/project overview renders with German heading
    // Reload after setLanguage to ensure the app re-reads locale from localStorage.
    // Wait for the network to be idle so the dashboard's data + translations are
    // both resolved before asserting on the localized heading.
    await page.goto(ROUTES.home);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: 'Projekt' })).toBeVisible({
      timeout: 15000,
    });

    // And: Budget page renders in German
    await page.goto(ROUTES.budget);
    await expect(page.getByRole('heading', { level: 1, name: 'Budget' })).toBeVisible();

    // And: Schedule/timeline page renders in German
    await page.goto(ROUTES.timeline);
    await page.waitForURL('**/schedule/gantt');
    await expect(page.getByRole('heading', { level: 1, name: 'Zeitplan' })).toBeVisible();

    // And: Diary page renders in German
    // diary.json page.title = "Bautagebuch" (German for "Construction Diary")
    await page.goto(ROUTES.diary);
    await expect(page.getByRole('heading', { level: 1, name: 'Bautagebuch' })).toBeVisible();
  });

  test('Language can be switched back to English from German', async ({ page }) => {
    // Given: Language was set to German (via API + localStorage)
    await setLanguage(page, 'de');

    // When: User switches back to English via API + localStorage
    await setLanguage(page, 'en');

    // Then: Navigating to the Profile page shows the English heading
    await page.goto(ROUTES.profile);
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
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
    await expect(languageSelect.locator('option[value="system"]')).toHaveText(
      'System (auto-detect)',
    );
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

    // When: User navigates to dashboard with a fresh full page load.
    // setLanguage navigates to '/' (which redirects to /project/overview) and writes
    // localStorage. A second goto to the same URL reuses the cached SPA state and
    // LocaleContext does not re-read localStorage, so a reload() is required to
    // force i18next to initialise with the new locale.
    await page.goto(ROUTES.home);
    await page.reload();
    // Wait for German page heading to confirm locale switch took effect
    await expect(page.getByRole('heading', { level: 1, name: 'Projekt' })).toBeVisible();

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

  test('German text renders on vendors page without breaking layout', async ({ page }) => {
    // Given: Language is set to German
    await setLanguage(page, 'de');

    // When: User navigates to vendors (moved to Settings in Story #1283)
    await page.goto(ROUTES.settingsVendors);
    // German heading is "Auftragnehmer" (plural form of Vendor)
    await page
      .getByRole('heading', { level: 1, name: 'Auftragnehmer' })
      .waitFor({ state: 'visible' });

    // Then: The Settings sub-nav shows "Auftragnehmer" (German for Vendors/Contractors)
    // Vendors moved from Budget section to Settings section (Story #1283).
    // The Settings sub-nav link is the reliable indicator that the page is in German and loaded.
    const subNav = page.getByRole('navigation', { name: 'Settings section navigation' });
    await expect(subNav.getByRole('link', { name: 'Auftragnehmer' })).toBeVisible();
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
    // Given: Language is set to German via the API
    await setLanguage(page, 'de');

    // When: Clear localStorage and reload to simulate a fresh client state where
    // the locale must come from the server preference, not from localStorage.
    await page.evaluate(() => localStorage.removeItem('locale'));
    // Register waitForResponse BEFORE navigation so we don't miss the response
    const prefsLoadPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/users/me/preferences') && resp.status() === 200,
    );
    await page.goto(ROUTES.home);

    // Wait for preferences to be fetched from the server
    await prefsLoadPromise;

    // Then: The app applies the server locale preference (German) after loading.
    // Use expect.poll to tolerate the async React state update after syncWithServer.
    await expect
      .poll(
        async () => {
          const h1 = page.getByRole('heading', { level: 1 });
          return (await h1.count()) > 0 ? await h1.textContent() : null;
        },
        { timeout: 10000 },
      )
      .toBe('Projekt');
  });

  test('DELETE preference resets to system locale', async ({ page }) => {
    // Given: German is the *server* preference. Deliberately NOT via setLanguage(),
    // which also writes localStorage — and a non-'system' localStorage value is
    // precisely what LocaleContext.syncWithServer migrates back to the server when it
    // finds no server preference, silently re-creating the row this test deletes.
    // That is the confirmed cause of this test's CI failures (run 30790367863 shard 4):
    // the app issued its own PATCH /api/users/me/preferences 13 ms after the test's
    // DELETE (18 ms on the retry), restoring locale='de' before the assertion ran.
    await page.request.patch('/api/users/me/preferences', {
      data: { key: 'locale', value: 'de' },
    });

    // Loading a page now drives syncWithServer down its "server has a preference"
    // branch, which applies 'de' AND removes the 'locale' localStorage key — no arbitrary
    // wait needed, because those two happen in the same synchronous block, so a rendered
    // German heading cannot precede the removal.
    await page.goto(ROUTES.profile);
    await expect(page.getByRole('heading', { level: 1, name: 'Profil' })).toBeVisible();

    // Assert that precondition instead of inferring it. The heading only proves the
    // server branch ran if the German render was driven by that branch; were the auth
    // storage state (test-results/.auth/admin.json) ever to carry locale='de', the page
    // would render German from localStorage before listPreferences() resolves, the
    // assertion above would pass early, and the removal might not have happened yet —
    // silently reopening the migration window this test exists to close. Polling (at the
    // project-default timeout) tolerates the removal landing a tick after the render
    // without reintroducing a fixed wait, and fails loudly here rather than resurfacing
    // as an unexplained locale flake later.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('locale'))).toBeNull();

    // When: Preference is deleted via API. With localStorage empty, readStoredPreference()
    // returns 'system' and syncWithServer's migration branch is a guarded no-op, so no
    // in-flight sync can re-create the row.
    const deleteResponse = await page.request.delete('/api/users/me/preferences/locale');
    expect(deleteResponse.status()).toBe(204);

    // Then: A full reload re-initialises LocaleContext with no localStorage key and no
    // server preference → 'system' → the CI browser locale, English.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  });
});
