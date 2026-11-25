/**
 * E2E: the language of a first visit follows the browser (#2258, PLT-035 AC4).
 *
 * The app reads the browser's language list (`navigator.languages`) once, when no `locale` choice
 * is stored, and picks the first language it supports (English or German). The user can change it
 * afterwards in the user menu or in Settings › Account.
 *
 * Scenarios
 * L1  a German browser (`de-DE`), no stored choice: the sign-in page is German, `html lang="de"`
 *     and, when single sign-on is configured, the button reads the German value
 * L1b a browser that lists an unsupported language first (`fr-FR`, then `de-DE`): German (the list
 *     is walked, not just its first entry)
 * L2  an English browser (`en-US`): English
 * L3  signed in from a `de-DE` browser: the page is German; the user menu switches to English, the
 *     heading becomes English, and a reload keeps English (the choice is stored)
 *
 * Desktop only: the language does not depend on the viewport, and the sign-in budget is 20 per
 * 15 minutes. The strings are read from the locale files, never typed in.
 *
 * L3 creates its own member (per-user preference row, see `isolatedUser.ts`). It is a plain
 * function, not `test.use()`, so no shard moves.
 */

import type { Browser, BrowserContext, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { createLocalUserViaApi, deleteUserViaApi } from '../../fixtures/apiHelpers.js';
import { i18nValue } from '../../fixtures/i18nValue.js';
import { API, ROUTES } from '../../fixtures/testData.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { LoginPage } from '../../pages/LoginPage.js';

const PASSWORD = 'e2e-first-open-123!';
const NO_STORAGE = { cookies: [], origins: [] };

test.beforeEach(({ page }) => {
  const viewport = page.viewportSize();
  test.skip(viewport !== null && viewport.width < 1200, 'language detection is not viewport-bound');
});

async function openLogin(
  browser: Browser,
  locale: string,
  languages?: readonly string[],
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ locale, storageState: NO_STORAGE });
  const page = await context.newPage();
  if (languages) {
    // A browser whose list starts with a language the app does not offer
    await page.addInitScript((list) => {
      Object.defineProperty(navigator, 'languages', { get: () => list });
      Object.defineProperty(navigator, 'language', { get: () => list[0] });
    }, languages);
  }
  await page.goto(ROUTES.login);
  return { context, page };
}

test.describe('First open: language follows the browser', () => {
  test('L1: a German browser opens the sign-in page in German', async ({ browser }) => {
    const { context, page } = await openLogin(browser, 'de-DE');
    try {
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(
        page.getByRole('heading', { level: 1, name: i18nValue('de', 'auth', 'login.title') }),
      ).toBeVisible();
      // The single sign-on button only exists when the test environment configures OIDC
      const sso = page.getByRole('button', { name: i18nValue('de', 'auth', 'login.ssoButton') });
      const english = page.getByRole('button', {
        name: i18nValue('en', 'auth', 'login.ssoButton'),
      });
      await expect(english).toHaveCount(0);
      if ((await sso.count()) > 0) await expect(sso).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('L1b: the browser language list is walked: fr-FR, then de-DE opens in German', async ({
    browser,
  }) => {
    const { context, page } = await openLogin(browser, 'fr-FR', ['fr-FR', 'de-DE']);
    try {
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(
        page.getByRole('heading', { level: 1, name: i18nValue('de', 'auth', 'login.title') }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('L2: an English browser opens the sign-in page in English', async ({ browser }) => {
    const { context, page } = await openLogin(browser, 'en-US');
    try {
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      const login = new LoginPage(page);
      await expect(login.heading).toBeVisible();
      await expect(login.heading).toHaveText(i18nValue('en', 'auth', 'login.title'));
      if ((await login.ssoButton.count()) > 0) await expect(login.ssoButton).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('L3: the user can change the language; the choice survives a reload', async ({
    browser,
    page: adminPage,
    testPrefix,
  }) => {
    const user = await createLocalUserViaApi(adminPage, {
      email: `first-open-${testPrefix.toLowerCase()}-${Date.now()}@e2e-test.local`,
      displayName: 'E2E First Open User',
      password: PASSWORD,
    });
    const context = await browser.newContext({ locale: 'de-DE', storageState: NO_STORAGE });
    try {
      const page = await context.newPage();
      const login = await page.request.post(API.login, {
        data: { email: user.email, password: PASSWORD },
      });
      expect(login.ok(), `login as ${user.email}: ${login.status()}`).toBeTruthy();

      // No stored choice yet: the browser's German applies
      await page.goto(ROUTES.profile);
      const germanHeading = page.getByRole('heading', {
        level: 1,
        name: i18nValue('de', 'common', 'navigation.account'),
        exact: true,
      });
      await expect(germanHeading).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');

      // Switch to English in the user menu
      const shell = new AppShellPage(page);
      await shell.openUserMenu();
      const stored = page.waitForResponse(
        (response) =>
          response.url().includes('/api/users/me/preferences') &&
          response.request().method() === 'PATCH' &&
          response.ok(),
      );
      await shell.languageOption('en').click();
      await stored;
      const englishHeading = page.getByRole('heading', {
        level: 1,
        name: i18nValue('en', 'common', 'navigation.account'),
        exact: true,
      });
      await expect(englishHeading).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');

      // A reload keeps English although the browser still asks for German
      await page.reload();
      await expect(englishHeading).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    } finally {
      await context.close();
      await deleteUserViaApi(adminPage, user.id);
    }
  });
});
