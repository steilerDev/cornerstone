/**
 * E2E tests for Story #2200 [P0.9] Roles and contrast and Story #2219 [P1.12] role guards
 * (EPIC-21).
 *
 * Scenarios:
 *   R0/R1. #2219 AC3 — a member opening EVERY admin-only page of the route map (Users, Backups,
 *             Integrations; derived from the map, never a hard-coded URL list) sees the same
 *             "No access" page in place (URL unchanged, one h1, shell present) and no admin API
 *             is requested.
 *   E3. AC1 — "Back to Home" goes to the project overview; Back returns to the No-access page
 *             (no redirect loop).
 *   E4. AC1 — every legacy URL that redirects to an admin page lands there with No access.
 *   E5. AC2 / D-23 — a member's sidebar Settings group has no Users / Backups entries (#2205:
 *             the check moved from the removed Settings tab row to the sidebar).
 *   E5b. AC5 (#2214) — a member opens Account and sees all four sections (Your details, Calendar &
 *             contacts sync, Preferences, Password).
 *   E6. The server still refuses a member (403 on backups list and user creation).
 *   E6b. #2219 — a member's GET /api/users rows never carry `lockedUntil`.
 *   E7. AC3/AC4 — computed colours in the real build: active sidebar view and primary button
 *             (light), page background and sidebar item (dark). Desktop only.
 *
 * Uses a REAL member account (no /api/auth/me mock) so the server half is exercised too.
 * The route map is imported as source (E2E CI has no `shared/dist`), like page-identity-sweep.
 */

import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/isolatedUser.js';
import { LIVE_REDIRECT_ROUTES, ROUTE_MAP, routeUrl } from '../../../shared/src/routes/index.js';
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

interface RouteMapRow {
  id?: string;
  kind: string;
  guard: string;
  stage: string;
  match?: { condition: string; appliesTo?: readonly string[] };
}

/** Admin-only pages the app serves, derived from the route map (never a hard-coded URL list). */
const ADMIN_PAGE_IDS: string[] = (ROUTE_MAP as unknown as ReadonlyArray<RouteMapRow>)
  .filter(
    (e) => e.id !== undefined && e.kind === 'page' && e.guard === 'admin' && e.stage !== 'planned',
  )
  .map((e) => e.id as string);

/**
 * The admin list endpoint each admin page loads; a member's No-access page must never GET it.
 * Exact paths: `/api/users/me/*` is the member's own API and is requested by the shell.
 */
const ADMIN_API_PREFIX: Record<string, string[]> = {
  settingsUsers: ['/api/users'],
  settingsBackups: ['/api/backups'],
  settingsIntegrations: ['/api/settings/integrations'],
};

/** Plain legacy redirects whose target is an admin page. */
const LEGACY_ADMIN_REDIRECTS = LIVE_REDIRECT_ROUTES.flatMap((r) => {
  const path = r.target.split(/[?#]/)[0] ?? '';
  const isAdminTarget = ADMIN_PAGE_IDS.some((id) => routeUrl(id as never) === path);
  return isAdminTarget && !r.from.includes(':') && r.from !== path ? [{ from: r.from, path }] : [];
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

test.describe(
  'Member access to admin-only pages (Stories #2200, #2219)',
  { tag: '@responsive' },
  () => {
    test('R0: the admin page list matches the guard and every admin page has its API prefixes', () => {
      const conditional = (ROUTE_MAP as unknown as ReadonlyArray<RouteMapRow>).find(
        (e) => e.match?.condition === 'not-admin',
      );
      expect(conditional, 'the not-admin conditional entry').toBeDefined();
      expect([...ADMIN_PAGE_IDS].sort()).toEqual([...(conditional?.match?.appliesTo ?? [])].sort());
      // A new admin route fails here until its API prefix is mapped
      expect([...ADMIN_PAGE_IDS].sort()).toEqual(Object.keys(ADMIN_API_PREFIX).sort());
    });

    for (const id of ADMIN_PAGE_IDS) {
      test(`R1 (${id}): a member sees No access in place and no admin API request is made`, async ({
        page,
      }, testInfo) => {
        const requests = recordRequests(page);
        const noAccess = new NoAccessPage(page);
        const shell = new AppShellPage(page);
        const url = routeUrl(id as never);

        await page.goto(url);

        await expect(noAccess.heading).toBeVisible();
        await expect(noAccess.root).toBeVisible();
        await expect(noAccess.backLink).toBeVisible();
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(page).toHaveURL((u) => u.pathname === url);
        // #2204: the tab title has no "Settings" segment
        await expect(page).toHaveTitle(/^No access · [^·]+$/);
        if (testInfo.project.name === 'desktop') {
          await expect(shell.nav).toBeVisible();
        } else {
          await expect(shell.moreButton).toBeVisible();
        }

        for (const prefix of ADMIN_API_PREFIX[id] ?? []) {
          const calls = requests.filter((r) => r.method === 'GET' && r.url.pathname === prefix);
          expect(calls, `GET ${prefix} requests`).toHaveLength(0);
        }
      });
    }

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

    test('E4 (guard): the route map still has a legacy redirect into an admin page', () => {
      expect(LEGACY_ADMIN_REDIRECTS.length).toBeGreaterThan(0);
    });

    for (const redirect of LEGACY_ADMIN_REDIRECTS) {
      test(`E4: legacy ${redirect.from} lands on ${redirect.path} with the No access page`, async ({
        page,
      }) => {
        const noAccess = new NoAccessPage(page);

        await page.goto(redirect.from);

        await expect(page).toHaveURL((u) => u.pathname === redirect.path);
        await expect(noAccess.heading).toBeVisible();
      });
    }

    // Inside Settings the group lists the entry plus its views; on Companies only the entry shows
    for (const [name, route, expected] of [
      ['Account', ROUTES.profile, ['Settings', 'Account']],
      ['Project setup', ROUTES.manage, ['Settings', 'Account']],
      ['Companies', ROUTES.settingsVendors, ['Settings']],
    ] as const) {
      test(`E5 (D-23): member's sidebar Settings group on ${name} has no Users, Backups or Integrations`, async ({
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
          await expect(shell.viewLink('settingsIntegrations')).toHaveCount(0);
          await expect(shell.viewMenu.getByRole('menuitem', { name: 'Users' })).toHaveCount(0);
          await expect(shell.viewMenu.getByRole('menuitem', { name: 'Backups' })).toHaveCount(0);
          return;
        }

        await expect(shell.settingsNav.getByRole('link')).toHaveText([...expected]);
        await expect(shell.viewLink('settingsUsers')).toHaveCount(0);
        await expect(shell.viewLink('settingsBackups')).toHaveCount(0);
        await expect(shell.viewLink('settingsIntegrations')).toHaveCount(0);
        await expect(shell.settingsNav.getByRole('link', { name: 'Users' })).toHaveCount(0);
        await expect(shell.settingsNav.getByRole('link', { name: 'Backups' })).toHaveCount(0);
      });
    }

    test('E5b (AC5): a member opens Account and sees the four sections', async ({ page }) => {
      const profile = new ProfilePage(page);
      await profile.goto();

      await expect(page.locator('main h2')).toHaveText([
        'Your details',
        'Calendar & contacts sync',
        'Preferences',
        'Password',
      ]);
      await expect(profile.passwordSection.locator('#currentPassword')).toBeVisible();
      await expect(profile.preferencesSection.locator('select')).toHaveCount(2);
    });

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

    test('E6b (#2219): a member reads the user list without any lock state', async ({ page }) => {
      const response = await page.request.get(API.users);
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { users: Array<Record<string, unknown>> };
      expect(body.users.length).toBeGreaterThan(0);
      for (const row of body.users) {
        expect(Object.keys(row)).not.toContain('lockedUntil');
      }
    });

    test('E7: token colours apply in the real build (light and dark)', async ({
      page,
    }, testInfo) => {
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
        .poll(() => styleOf(profile.saveDisplayNameButton, 'backgroundColor'))
        .toBe('rgb(37, 99, 235)');

      // Dark theme
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      const content = page.getByRole('main');
      await expect.poll(() => styleOf(content, 'backgroundColor')).toBe('rgb(12, 20, 36)');
      await expect.poll(() => styleOf(activeSettings, 'backgroundColor')).toBe('rgb(37, 99, 235)');
      await expect.poll(() => styleOf(activeSettings, 'color')).toBe('rgb(255, 255, 255)');
    });
  },
);
