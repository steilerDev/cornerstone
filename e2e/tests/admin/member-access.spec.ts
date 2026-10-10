/**
 * E2E tests for Story #2200 [P0.9] Roles and contrast (EPIC-21).
 *
 * Scenarios:
 *   E1. AC1 — a member opening /settings/users sees "No access" in place (URL unchanged), the
 *             shell still renders, and the users list is never requested.
 *   E2. AC1 — same for /settings/backups (no /api/backups request).
 *   E3. AC1 — "Back to Home" goes to the project overview; Back returns to the No-access page
 *             (no redirect loop).
 *   E4. AC1 — the legacy /admin/users URL lands on /settings/users with the No-access page.
 *   E5. AC2 / D-23 — a member's sidebar Settings group has no Users / Backups entries (#2205:
 *             the check moved from the removed Settings tab row to the sidebar).
 *   E6. The server still refuses a member (403 on backups list and user creation).
 *   E7. AC3/AC4 — computed colours in the real build: active sidebar view and primary button
 *             (light), page background and sidebar item (dark). Desktop only.
 *
 * Uses a REAL member account (no /api/auth/me mock) so the server half is exercised too.
 */

import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/isolatedUser.js';
import { API, ROUTES } from '../../fixtures/testData.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { DashboardPage } from '../../pages/DashboardPage.js';
import { NoAccessPage } from '../../pages/NoAccessPage.js';
import { ProfilePage } from '../../pages/ProfilePage.js';

test.use({
  isolatedUserPerWorker: {
    emailPrefix: 'member-access',
    displayName: 'E2E Member Access',
    role: 'member',
  },
});

/** Records every request fired by the page from now on. */
function recordRequests(page: Page): { method: string; url: URL }[] {
  const seen: { method: string; url: URL }[] = [];
  page.on('request', (req) => {
    seen.push({ method: req.method(), url: new URL(req.url()) });
  });
  return seen;
}

function styleOf(loc: Locator, prop: 'backgroundColor' | 'color'): Promise<string> {
  return loc.evaluate((el, p) => getComputedStyle(el)[p], prop);
}

test.describe('Member access to admin-only pages (Story #2200)', { tag: '@responsive' }, () => {
  test('E1: member opening Users sees No access in place and no users list is requested', async ({
    page,
  }, testInfo) => {
    const requests = recordRequests(page);
    const noAccess = new NoAccessPage(page);
    const shell = new AppShellPage(page);

    await page.goto(ROUTES.userManagement);

    await expect(noAccess.heading).toBeVisible();
    await expect(noAccess.backLink).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/users$/);
    // #2204: one h1, and the tab title has no "Settings" segment
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page).toHaveTitle(/^No access · [^·]+$/);
    if (testInfo.project.name === 'desktop') {
      await expect(shell.nav).toBeVisible();
    } else {
      await expect(shell.moreButton).toBeVisible();
    }

    const usersListCalls = requests.filter(
      (r) => r.method === 'GET' && r.url.pathname === '/api/users',
    );
    expect(usersListCalls).toHaveLength(0);
  });

  test('E2: member opening Backups sees No access in place and no backups request is made', async ({
    page,
  }, testInfo) => {
    const requests = recordRequests(page);
    const noAccess = new NoAccessPage(page);
    const shell = new AppShellPage(page);

    await page.goto(ROUTES.backups);

    await expect(noAccess.heading).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/backups$/);
    if (testInfo.project.name === 'desktop') {
      await expect(shell.nav).toBeVisible();
    } else {
      await expect(shell.moreButton).toBeVisible();
    }

    expect(requests.filter((r) => r.url.pathname.startsWith('/api/backups'))).toHaveLength(0);
  });

  test('E3: Back to Home leads to the project overview and Back returns without a redirect loop', async ({
    page,
  }) => {
    const noAccess = new NoAccessPage(page);
    const dashboard = new DashboardPage(page);

    await page.goto(ROUTES.userManagement);
    await expect(noAccess.heading).toBeVisible();

    await expect(noAccess.backLink).toHaveAttribute('href', '/');
    await noAccess.backLink.click();
    await expect(page).toHaveURL(/\/project\/overview/);
    await expect(dashboard.heading).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/settings\/users$/);
    await expect(noAccess.heading).toBeVisible();
  });

  test('E4: legacy /admin/users lands on Users with the No access page', async ({ page }) => {
    const noAccess = new NoAccessPage(page);

    await page.goto('/admin/users');

    await expect(page).toHaveURL(/\/settings\/users$/);
    await expect(noAccess.heading).toBeVisible();
  });

  // Inside Settings the group lists the entry plus its views; on Companies only the entry shows
  for (const [name, route, expected] of [
    ['Account', ROUTES.profile, ['Settings', 'Account']],
    ['Project setup', ROUTES.manage, ['Settings', 'Account']],
    ['Companies', ROUTES.settingsVendors, ['Settings']],
  ] as const) {
    test(`E5 (D-23): member's sidebar Settings group on ${name} has no Users or Backups`, async ({
      page,
    }) => {
      const shell = new AppShellPage(page);
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

      if (shell.isCompact()) {
        // Below 1024px the views are the title menu's items (#2207). Companies has no Settings
        // views, so it offers no menu; the other two list Project setup and Account only.
        if (name !== 'Companies') {
          await shell.revealViews();
          await expect(shell.viewMenu.getByRole('menuitem')).toHaveCount(2);
          await expect(shell.viewMenu.getByRole('menuitem')).toContainText([
            'Project setup',
            'Account',
          ]);
        }
        await expect(shell.viewLink('settingsUsers')).toHaveCount(0);
        await expect(shell.viewLink('settingsBackups')).toHaveCount(0);
        await expect(shell.viewMenu.getByRole('menuitem', { name: 'Users' })).toHaveCount(0);
        await expect(shell.viewMenu.getByRole('menuitem', { name: 'Backups' })).toHaveCount(0);
        return;
      }

      await expect(shell.settingsNav.getByRole('link')).toHaveText([...expected]);
      await expect(shell.viewLink('settingsUsers')).toHaveCount(0);
      await expect(shell.viewLink('settingsBackups')).toHaveCount(0);
      await expect(shell.settingsNav.getByRole('link', { name: 'Users' })).toHaveCount(0);
      await expect(shell.settingsNav.getByRole('link', { name: 'Backups' })).toHaveCount(0);
    });
  }

  test('E6: the server still refuses a member on backups and user creation', async ({
    page,
    isolatedUserSession,
  }) => {
    const me = await page.request.get(API.profile);
    expect(me.ok()).toBe(true);

    const backups = await page.request.get(API.backups);
    expect(backups.status()).toBe(403);

    if (!isolatedUserSession) throw new Error('isolated member session missing');
    const domain = isolatedUserSession.email.split('@')[1];
    const create = await page.request.post(API.users, {
      data: {
        email: `should-fail-${Date.now()}@${domain}`,
        displayName: 'E2E Should Fail',
        role: 'member',
        password: 'e2e-should-fail-pw-123!',
      },
    });
    expect(create.status()).toBe(403);
  });

  test('E7: token colours apply in the real build (light and dark)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Computed colour spot check: desktop only');

    const profile = new ProfilePage(page);
    await profile.goto();

    // The active sidebar entry on the Account page is its nested view link
    const shell = new AppShellPage(page);
    await shell.revealViews();
    const activeSettings = shell.viewLink('settingsProfile');
    await expect(activeSettings).toHaveAttribute('aria-current', 'page');

    // Light theme
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await expect.poll(() => styleOf(activeSettings, 'backgroundColor')).toBe('rgb(37, 99, 235)');
    await expect.poll(() => styleOf(activeSettings, 'color')).toBe('rgb(255, 255, 255)');
    await expect
      .poll(() => styleOf(profile.changePasswordButton, 'backgroundColor'))
      .toBe('rgb(37, 99, 235)');

    // Dark theme
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const content = page.getByRole('main');
    await expect.poll(() => styleOf(content, 'backgroundColor')).toBe('rgb(12, 20, 36)');
    await expect.poll(() => styleOf(activeSettings, 'backgroundColor')).toBe('rgb(37, 99, 235)');
    await expect.poll(() => styleOf(activeSettings, 'color')).toBe('rgb(255, 255, 255)');
  });
});
