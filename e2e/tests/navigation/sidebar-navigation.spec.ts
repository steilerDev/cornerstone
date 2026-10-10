/**
 * E2E tests for the sidebar built from NavConfig (Story #2205 / EPIC-21, replaces Story #27's).
 *
 * Scenarios:
 * - E1 (AC1, @smoke) the primary entries read Home, Tasks, Purchases, Site diary, Photos, Money,
 *                    Companies; there is no top-level Schedule; Settings is a link in its own
 *                    landmark; each entry lands on its main view; the logo opens Home
 * - E3 (AC2/AC3)     Tasks views (Schedule, Calendar, Milestones) and Money views (Invoices,
 *                    Funding sources, Grants, Bank report) nest only inside their section; the
 *                    current view is the one highlighted entry; view switches inside a
 *                    section replace, changing section pushes one entry (ADR-038 rule 8)
 * - E4 (AC4, D-23)   admin sees Settings, Account, Users, Backups; a member sees Settings and
 *                    Account only; /settings lands on Project setup
 * - Log out stays in the sidebar below 1024px until #2207 (from 1024px it is in the user menu)
 *
 * E2 (the German labels and landmark names) lives in i18n/i18n.spec.ts, which owns the dedicated
 * user whose locale it may change. E5 (no tab rows) is in no-tab-rows.spec.ts and E6 (the
 * every-page sweep) in page-identity-sweep.spec.ts.
 *
 * No users are created and no extra logins happen (login rate limit): the member case mocks
 * `GET /api/auth/me`, as admin/backup-restore.spec.ts does.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { installRouteLog, readRouteLog } from '../../fixtures/routeLog.js';
import { ROUTES } from '../../fixtures/testData.js';
import { AppShellPage } from '../../pages/AppShellPage.js';

const PRIMARY_LABELS = [
  'Home',
  'Tasks',
  'Purchases',
  'Site diary',
  'Photos',
  'Money',
  'Companies',
] as const;

/** Section id, the main view it opens, and what the user lands on after any interim redirect. */
const SECTION_LANDINGS = [
  { id: 'home', path: () => routeUrl('dashboard') },
  { id: 'tasks', path: () => routeUrl('workItems') },
  { id: 'purchases', path: () => routeUrl('householdItems') },
  { id: 'diary', path: () => routeUrl('diary') },
  { id: 'photos', path: () => routeUrl('photos') },
  { id: 'money', path: () => routeUrl('budgetOverview') },
  { id: 'companies', path: () => routeUrl('vendors') },
  { id: 'settings', path: () => routeUrl('settingsManage') },
] as const;

/** Makes the signed-in user a member for this page only (complete `GET /api/auth/me` payload). */
async function mockMember(page: Page): Promise<void> {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 2,
          email: 'member@e2e-test.local',
          displayName: 'E2E Member',
          role: 'member',
          authProvider: 'local',
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        setupRequired: false,
        oidcEnabled: false,
      }),
    });
  });
}

test.describe('Sidebar Navigation', { tag: '@responsive' }, () => {
  test(
    'E1: the primary entries read in order and each opens its main view',
    { tag: '@smoke' },
    async ({ page }) => {
      const appShell = new AppShellPage(page);
      await page.goto(ROUTES.home);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

      // Order, with Home first and no top-level Schedule
      await expect(appShell.nav.locator('[data-testid^="sidebar-section-"]')).toHaveText([
        ...PRIMARY_LABELS,
      ]);
      await expect(appShell.nav.getByRole('link', { name: 'Schedule', exact: true })).toHaveCount(
        0,
      );

      // Settings is a link in its own landmark (not a button)
      const settingsLink = appShell.settingsNav.getByRole('link', {
        name: 'Settings',
        exact: true,
      });
      await expect(settingsLink).toHaveCount(1);
      await expect(
        appShell.sidebar.getByRole('button', { name: 'Settings', exact: true }),
      ).toHaveCount(0);

      // Each entry opens its main view; wait for the final URL (Home and Companies redirect)
      for (const { id, path } of SECTION_LANDINGS) {
        await appShell.openSection(id);
        await expect(page).toHaveURL((url) => url.pathname === path());
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await expect(appShell.activeEntries).toHaveCount(1);
        await expect(appShell.activeEntries).toHaveAttribute(
          'data-testid',
          `sidebar-section-${id}`,
        );
      }
    },
  );

  test('E1: the logo opens Home and names it', async ({ page }) => {
    const appShell = new AppShellPage(page);
    await page.goto(ROUTES.photos);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

    await appShell.openSidebarIfDrawer();
    const logo = appShell.sidebar.getByRole('link', { name: 'Go to Home', exact: true });
    await expect(logo).toHaveAttribute('href', '/');
    await logo.click();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('dashboard'));
    await expect(appShell.sectionLink('home')).toHaveAttribute('aria-current', 'page');
  });

  test('E3: Tasks views nest under Tasks and the current one is the only highlighted entry', async ({
    page,
  }) => {
    const appShell = new AppShellPage(page);
    await page.goto(routeUrl('workItems'));
    await expect(page.getByRole('heading', { level: 1, name: 'Tasks', exact: true })).toBeVisible();

    // On the Tasks list the entry itself is current and the three views are listed
    await expect(appShell.viewLinks).toHaveText(['Schedule', 'Calendar', 'Milestones']);
    await expect(appShell.activeEntries).toHaveCount(1);
    await expect(appShell.sectionLink('tasks')).toHaveAttribute('aria-current', 'page');

    // Calendar: the view is current, Tasks no longer is
    await appShell.openView('scheduleCalendar');
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('scheduleCalendar'));
    await expect(
      page.getByRole('heading', { level: 1, name: 'Calendar', exact: true }),
    ).toBeVisible();
    await expect(appShell.activeEntries).toHaveCount(1);
    await expect(appShell.viewLink('scheduleCalendar')).toHaveAttribute('aria-current', 'page');
    await expect(appShell.sectionLink('tasks')).not.toHaveAttribute('aria-current', 'page');

    // "Tasks" always opens the list
    await appShell.openSection('tasks');
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('workItems'));
    await expect(appShell.sectionLink('tasks')).toHaveAttribute('aria-current', 'page');
  });

  test('E3: views show only inside their section', async ({ page }) => {
    const appShell = new AppShellPage(page);
    await page.goto(routeUrl('photos'));
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

    await expect(appShell.viewLinks).toHaveCount(0);
    await expect(appShell.sectionLink('photos')).toHaveAttribute('aria-current', 'page');
  });

  test('E3: Money lists its views and highlights Invoices on the invoices list', async ({
    page,
  }) => {
    const appShell = new AppShellPage(page);
    await page.goto(routeUrl('invoices'));
    await expect(
      page.getByRole('heading', { level: 1, name: 'Invoices', exact: true }),
    ).toBeVisible();

    await expect(appShell.viewLinks).toHaveText([
      'Invoices',
      'Funding sources',
      'Grants',
      'Bank report',
    ]);
    // No Financing view until that page exists
    await expect(appShell.viewLink('financing')).toHaveCount(0);
    await expect(appShell.activeEntries).toHaveCount(1);
    await expect(appShell.viewLink('invoices')).toHaveAttribute('aria-current', 'page');
    await expect(appShell.sectionLink('money')).not.toHaveAttribute('aria-current', 'page');
  });

  test('E3: view switches inside a section replace; changing section pushes', async ({ page }) => {
    // A fresh page in the same signed-in context: its history and route log start empty.
    // (A same-URL goto on `page` would keep the previous visit's history state.)
    const fresh = await page.context().newPage();
    try {
      const appShell = new AppShellPage(fresh);
      const h1 = (name: string) => fresh.getByRole('heading', { level: 1, name, exact: true });
      const log = async () =>
        (await readRouteLog(fresh)).map((e) => [e.kind, new URL(e.url).pathname]);
      const pushes = async () => (await log()).filter(([kind]) => kind === 'pushState');

      await installRouteLog(fresh);
      await fresh.goto(routeUrl('workItems'));
      await expect(h1('Tasks')).toBeVisible();

      // View switch inside Tasks: no push, one replace
      await appShell.openView('scheduleCalendar');
      await expect(h1('Calendar')).toBeVisible();
      expect(await pushes()).toEqual([]);
      expect(await log()).toContainEqual(['replaceState', routeUrl('scheduleCalendar')]);

      // Back to the section entry: still no push
      await appShell.openSection('tasks');
      await expect(h1('Tasks')).toBeVisible();
      expect(await pushes()).toEqual([]);

      // Changing section pushes exactly one entry
      await appShell.openSection('money');
      await expect(h1('Money')).toBeVisible();
      expect(await pushes()).toEqual([['pushState', routeUrl('budgetOverview')]]);

      // A view switch inside Money adds no further push
      await appShell.openView('invoices');
      await expect(h1('Invoices')).toBeVisible();
      expect(await pushes()).toEqual([['pushState', routeUrl('budgetOverview')]]);
    } finally {
      await fresh.close();
    }
  });

  test('E4 (D-23): an admin sees Settings, Account, Users and Backups; Account is current', async ({
    page,
  }) => {
    const appShell = new AppShellPage(page);
    await page.goto(ROUTES.profile);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Account', exact: true }),
    ).toBeVisible();

    await expect(appShell.settingsNav.getByRole('link')).toHaveText([
      'Settings',
      'Account',
      'Users',
      'Backups',
    ]);
    await expect(appShell.activeEntries).toHaveCount(1);
    await expect(appShell.viewLink('settingsProfile')).toHaveAttribute('aria-current', 'page');
  });

  test('E4 (D-23): a member is offered Settings and Account only', async ({ page }) => {
    const appShell = new AppShellPage(page);
    await mockMember(page);
    await page.goto(ROUTES.profile);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Account', exact: true }),
    ).toBeVisible();

    await expect(appShell.settingsNav.getByRole('link')).toHaveText(['Settings', 'Account']);
    await expect(appShell.viewLink('settingsUsers')).toHaveCount(0);
    await expect(appShell.viewLink('settingsBackups')).toHaveCount(0);
  });

  test('E4: /settings lands on Project setup', async ({ page }) => {
    const appShell = new AppShellPage(page);
    await page.goto('/settings');

    await expect(page).toHaveURL((url) => url.pathname === routeUrl('settingsManage'));
    await expect(
      page.getByRole('heading', { level: 1, name: 'Project setup', exact: true }),
    ).toBeVisible();
    await expect(appShell.sectionLink('settings')).toHaveAttribute('aria-current', 'page');
  });

  test('Log out button is in the sidebar below 1024px only', async ({ page }) => {
    const appShell = new AppShellPage(page);
    await page.goto(ROUTES.home);

    const logoutButton = appShell.sidebar.getByRole('button', { name: /^(Log out|Abmelden)$/ });
    if ((page.viewportSize()?.width ?? 0) < 1024) {
      await appShell.openSidebar();
      await expect(logoutButton).toBeVisible();
    } else {
      // The sidebar footer is display:none from 1024px, so the role query finds nothing
      await expect(appShell.sectionLink('home')).toBeVisible();
      await expect(logoutButton).toHaveCount(0);
    }
  });
});
