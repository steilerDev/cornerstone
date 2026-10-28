/**
 * E2E tests for session-check resilience (in-session fix under EPIC-21 #2190)
 *
 * `GET /api/auth/me` never returns 401: a signed-out visitor gets `200 { user: null }`. An aborted
 * request (a navigation cancelling a document that is still loading), a network failure or a 5xx
 * is therefore NOT a sign-out. The guard shows a retry panel on the same URL; only a real 401 or
 * `200 { user: null }` redirects to sign-in. The protected content is never rendered while the
 * check is failing (fail-closed).
 *
 * Scenarios:
 * - R1 rapid double navigation and a double reload stay signed in
 * - R2 an aborted session check keeps the URL, shows the retry panel; Try again renders the page
 *      and moves focus to `main` (deterministic regression guard)
 * - R3 a 500 session check keeps the URL; a failed retry keeps focus on Try again, never on body
 * - R4 a real sign-out (user menu / More sheet log out, and `200 { user: null }`) still redirects
 *
 * Synthetic data only, no entities are created. Projects: desktop only (the logic is viewport
 * independent). R4's log-out signs in with a fresh session of the seeded admin and logs only that
 * session out; the shared storage-state session is untouched. Login budget: one sign-in.
 */

import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { API, ROUTES, TEST_ADMIN, loginUrlFor } from '../../fixtures/testData.js';

const AUTH_ME = `**${API.authMe}`;
const ERROR_HEADING = "Can't check that you're signed in";

async function openAnonymous(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

/** Delay each session check so a navigation lands while the previous document still loads it. */
async function delaySessionCheck(page: Page): Promise<void> {
  await page.route(AUTH_ME, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue().catch(() => undefined);
  });
}

test.describe('Session check resilience', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'logic is viewport independent');
  });

  test('R1: rapid double navigations and a double reload stay signed in', async ({ browser }) => {
    // A fresh context (the default storage state) so no page from an earlier test is reused
    const context = await browser.newContext({
      storageState: test.info().project.use.storageState as string,
    });
    const page = await context.newPage();
    try {
      await delaySessionCheck(page);
      const pairs: Array<[string, string, string]> = [
        [ROUTES.home, ROUTES.workItems, 'Tasks'],
        [ROUTES.budget, ROUTES.householdItems, 'Purchases'],
        [ROUTES.timeline, ROUTES.profile, 'Account'],
        [ROUTES.workItems, ROUTES.home, 'Home'],
        [ROUTES.householdItems, ROUTES.budget, 'Money'],
      ];

      for (const [first, second, heading] of pairs) {
        await page.goto(first, { waitUntil: 'commit' }).catch(() => undefined);
        await page.goto(second);

        await expect(page).toHaveURL(second);
        await expect(page).not.toHaveURL(/\/login/);
        // Object lists show a count after the name ("Purchases (3)")
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: heading === 'Purchases' ? /^Purchases( \(\d+\))?$/ : heading,
            exact: true,
          }),
        ).toBeVisible();
      }

      // Double reload: the first reload is cancelled by the second while its check is in flight
      await page.reload({ waitUntil: 'commit' }).catch(() => undefined);
      await page.reload();
      await expect(page).toHaveURL(ROUTES.budget);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Money', exact: true }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('R2: an aborted session check keeps the page and Try again recovers', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: test.info().project.use.storageState as string,
    });
    const page = await context.newPage();
    try {
      // The app checks the session once at boot: abort that single request
      await page.route(AUTH_ME, (route) => route.abort('aborted'), { times: 1 });

      await page.goto(ROUTES.workItems);

      // The URL is kept (never /login) and the retry panel shows, with nothing behind it
      await expect(page.getByRole('heading', { level: 1, name: ERROR_HEADING })).toBeVisible();
      await expect(page).toHaveURL(ROUTES.workItems);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(0);
      await expect(page.getByRole('navigation')).toHaveCount(0);
      await expect(page).toHaveTitle(`${ERROR_HEADING} · Cornerstone`);

      // Keyboard retry: the second check goes through
      const retry = page.getByRole('button', { name: 'Try again' });
      await expect(retry).toBeVisible();
      await retry.focus();
      await page.keyboard.press('Enter');

      await expect(
        page.getByRole('heading', { level: 1, name: 'Tasks', exact: true }),
      ).toBeVisible();
      await expect(page).toHaveURL(ROUTES.workItems);
      await expect(page.getByRole('heading', { level: 1, name: ERROR_HEADING })).toHaveCount(0);
      // The panel (and its focused button) unmounted: focus lands in main, not on body
      await expect(page.locator('main')).toBeFocused();
    } finally {
      await context.close();
    }
  });

  test('R3: a 500 session check keeps the page and a failed retry keeps focus on Try again', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: test.info().project.use.storageState as string,
    });
    const page = await context.newPage();
    try {
      let outage = true;
      await page.route(AUTH_ME, async (route) => {
        if (outage) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'INTERNAL_ERROR', message: 'Synthetic failure' },
            }),
          });
          return;
        }
        await route.continue();
      });

      await page.goto(ROUTES.budget);

      const heading = page.getByRole('heading', { level: 1, name: ERROR_HEADING });
      await expect(heading).toBeVisible();
      await expect(page).toHaveURL(ROUTES.budget);
      await expect(page.getByRole('main')).toHaveCount(0);

      // First retry fails again: the button stays focused (never body) and the status says so
      const retry = page.getByRole('button', { name: 'Try again' });
      await retry.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByText("Still can't reach the server.")).toHaveText(
        "Still can't reach the server. Try again in a moment.",
      );
      await expect(retry).toBeFocused();
      await expect(heading).toBeVisible();
      await expect(page).toHaveURL(ROUTES.budget);

      outage = false;
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Money', exact: true }),
      ).toBeVisible();
      await expect(page).toHaveURL(ROUTES.budget);
      await expect(page.locator('main')).toBeFocused();
    } finally {
      await context.close();
    }
  });

  test('R4: logging out still redirects to sign-in', async ({ browser }) => {
    const { context, page } = await openAnonymous(browser);
    try {
      const login = new LoginPage(page);
      const appShell = new AppShellPage(page);

      await login.goto();
      await login.login(TEST_ADMIN.email, TEST_ADMIN.password);
      await expect(page).toHaveURL(ROUTES.home);

      await appShell.logout();
      await expect(page).toHaveURL(ROUTES.login);

      // The session is gone: a protected page now goes to sign-in, remembering the page
      await page.goto(ROUTES.workItems);
      await expect(page).toHaveURL(loginUrlFor(ROUTES.workItems));
      await expect(login.heading).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('R4: a session check answering 200 with no user still redirects to sign-in', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: test.info().project.use.storageState as string,
    });
    const page = await context.newPage();
    try {
      await page.route(AUTH_ME, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: null, setupRequired: false, oidcEnabled: false }),
        }),
      );

      await page.goto(ROUTES.workItems);

      await expect(page).toHaveURL(loginUrlFor(ROUTES.workItems));
      await expect(page.getByRole('heading', { level: 1, name: ERROR_HEADING })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
