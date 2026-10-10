/**
 * E2E deep links through local sign-in (Story #2204 / EPIC-21, D-13, PLT-021)
 *
 * A signed-out visit to a protected page lands on `/login?next=<full in-app URL>`; signing in
 * locally lands on that URL (replacing the sign-in page in history), never on Home.
 *
 * Scenarios:
 * - E6 (AC3) `/settings/users?q=pi` -> `/login?next=...`; h1 "Sign In", tab title "Sign In ·
 *            Cornerstone"; local sign-in lands on the deep link with h1 "Users" (not "No access":
 *            the auth state is refreshed before navigating)
 * - E8 (AC5) an SSO failure redirect keeps the banner (visible and focused, h1 "Sign In", title
 *            "Sign In · Cornerstone"); signing in locally from `/login?error=oidc_error&next=...`
 *            lands on `next`
 *
 * The SSO half of the deep link (E7) lives in auth/oidc.spec.ts, which owns the mock IdP.
 *
 * Login rate limit (20 per 15 minutes per IP): this file signs in exactly twice (E6, E8) and
 * creates no users. Projects: desktop only (the logic is viewport independent).
 */

import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage.js';
import { ROUTES, TEST_ADMIN, loginUrlFor } from '../../fixtures/testData.js';

async function openAnonymous(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

test.describe('Deep links through sign-in (#2204)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'logic is viewport independent');
  });

  test('E6: a signed-out deep link goes through sign-in and lands on the requested page', async ({
    browser,
  }) => {
    const { context, page } = await openAnonymous(browser);
    try {
      const login = new LoginPage(page);
      const target = `${ROUTES.userManagement}?q=pi`;

      await page.goto(target);

      // The sign-in page remembers the full URL, search included
      await expect(page).toHaveURL(loginUrlFor(target));
      await expect(login.heading).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page).toHaveTitle('Sign In · Cornerstone');

      await login.login(TEST_ADMIN.email, TEST_ADMIN.password);

      // Lands on the deep link as an admin: the Users page, not "No access"
      await expect(page).toHaveURL(
        (url) => url.pathname === ROUTES.userManagement && url.searchParams.get('q') === 'pi',
      );
      await expect(
        page.getByRole('heading', { level: 1, name: 'Users', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page).toHaveTitle(/^Users · Settings · [^·]+$/);
    } finally {
      await context.close();
    }
  });

  test('E8: an SSO failure keeps the sign-in banner and a local sign-in still lands on next', async ({
    browser,
  }) => {
    const { context, page } = await openAnonymous(browser);
    try {
      const login = new LoginPage(page);

      // A provider error without a known sign-in state: plain error redirect, no next
      await page.goto('/api/auth/oidc/callback?error=access_denied');
      await expect(page).toHaveURL(`${ROUTES.login}?error=oidc_error`);
      await expect(login.errorBanner).toBeVisible();
      await expect(login.errorBanner).toBeFocused();
      await expect(login.heading).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page).toHaveTitle('Sign In · Cornerstone');

      // The same banner with a remembered deep link: signing in locally lands on it
      await page.goto(`${ROUTES.login}?error=oidc_error&next=${encodeURIComponent('/diary')}`);
      await expect(login.errorBanner).toBeVisible();
      await login.login(TEST_ADMIN.email, TEST_ADMIN.password);

      await expect(page).toHaveURL((url) => url.pathname === ROUTES.diary);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Site diary');
    } finally {
      await context.close();
    }
  });
});
