/**
 * E2E shell reach, area by area (Story #2208 / EPIC-21, P1.2b, AC2 and AC3)
 *
 * Every area is reachable through the shell at every width. Desktop uses the sidebar; phones
 * and tablets go through the bottom bar, the More sheet and the title menu. All of it through
 * the one helper, `AppShellPage.navigateTo(route)`.
 *
 * Areas (one describe each; one test per entry route or view):
 * - Home        the Home entry lands on the dashboard
 * - Tasks       Tasks, Schedule, Calendar, Milestones
 * - Purchases   Purchases
 * - Site diary  Site diary (plus the New slot below 1024px)
 * - Photos      Photos
 * - Money       Money, Invoices, Funding sources, Grants, Bank report
 * - Companies   Companies (lands on the interim vendors page)
 * - Settings    Project setup, Account, Users, Backups (admin session)
 *
 * Each test: start on Home, navigate, check the final path, the visible h1, exactly one current
 * shell entry, the bar slot or the highlighted More button below 1024px, and no sideways scroll.
 * Nothing is created, no preference is changed and nobody logs out.
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import type { ServedRouteId } from '../../../shared/src/routes/index.js';
import { ROUTES } from '../../fixtures/testData.js';
import { AppShellPage } from '../../pages/AppShellPage.js';

interface Reach {
  readonly route: ServedRouteId;
  /** Final route when the entry redirects (Home, Companies). */
  readonly landing?: ServedRouteId;
}

const AREAS = [
  { area: 'Home', rows: [{ route: 'home', landing: 'dashboard' }] },
  {
    area: 'Tasks',
    rows: [
      { route: 'workItems' },
      { route: 'scheduleGantt' },
      { route: 'scheduleCalendar' },
      { route: 'milestones' },
    ],
  },
  { area: 'Purchases', rows: [{ route: 'householdItems' }] },
  { area: 'Site diary', rows: [{ route: 'diary' }] },
  { area: 'Photos', rows: [{ route: 'photos' }] },
  {
    area: 'Money',
    rows: [
      { route: 'budgetOverview' },
      { route: 'invoices' },
      { route: 'budgetSources' },
      { route: 'budgetSubsidies' },
      { route: 'bankReport' },
    ],
  },
  { area: 'Companies', rows: [{ route: 'companies', landing: 'vendors' }] },
  {
    area: 'Settings',
    rows: [
      { route: 'settingsManage' },
      { route: 'settingsProfile' },
      { route: 'settingsUsers' },
      { route: 'settingsBackups' },
    ],
  },
] as const satisfies readonly { readonly area: string; readonly rows: readonly Reach[] }[];

for (const { area, rows } of AREAS) {
  test.describe(`Shell reach: ${area}`, { tag: '@responsive' }, () => {
    for (const row of rows) {
      const { route } = row;
      const landing: ServedRouteId = 'landing' in row ? row.landing : route;

      test(`${area}: ${route} is reachable through the shell`, async ({ page }) => {
        const appShell = new AppShellPage(page);
        await page.goto(ROUTES.home);
        await expect(page.locator('main h1').first()).toBeVisible();

        await appShell.navigateTo(route);

        await expect(page).toHaveURL(
          (url) => url.pathname === (routeUrl as (id: ServedRouteId) => string)(landing),
        );
        await expect(page.locator('main h1').first()).toBeVisible();

        // Exactly one shell entry is the page's entry
        await expect(appShell.activeEntries).toHaveCount(1);
        if (appShell.isCompact()) {
          const section = appShell.sectionOf(route);
          if (section === 'home' || section === 'diary' || section === 'photos') {
            await expect(appShell.bottomBarSlot(section)).toHaveAttribute('aria-current', 'page');
          } else {
            await expect(appShell.moreButton).toHaveAttribute('aria-current', 'true');
          }
        }

        const sideways = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(sideways, 'no sideways scroll').toBe(false);
      });
    }
  });
}

test.describe('Shell reach: Site diary New slot', { tag: '@responsive' }, () => {
  test('Site diary: the New slot opens a new entry', async ({ page }) => {
    const appShell = new AppShellPage(page);
    test.skip(!appShell.isCompact(), 'the New slot is phone/tablet only');

    await page.goto(ROUTES.home);
    await expect(page.locator('main h1').first()).toBeVisible();

    await appShell.tapBottomBar('new');

    await expect(page).toHaveURL((url) => url.pathname === routeUrl('diaryEntryNew'));
    await expect(appShell.bottomBarSlot('diary')).toHaveAttribute('aria-current', 'page');
  });
});
