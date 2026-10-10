/**
 * E2E: no page renders its own tab row any more (Story #2205 / EPIC-21, AC5).
 *
 * The in-page tab rows (Project, Budget, Settings and the Schedule view switch) are gone: the
 * sidebar lists the views of the section the user is in. On every page that used to carry a row
 * the page's `main` area holds no navigation landmark, except
 *  - the breadcrumb trail on non-view pages (Funding sources, Grants and Bank report show a
 *    "Money" trail), which is excluded by its row's test id, not by text, and
 *  - the "Area path" trail inside list rows/cards (an object's data, not page navigation),
 *  - the report wizard's step indicator on Bank report ("Report wizard steps").
 *
 * Desktop and mobile run; tablet is skipped (the markup does not differ between them).
 * Only read-only navigation to list/settings pages, so the shared database is untouched.
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';

const PAGES = [
  ['Tasks', () => routeUrl('workItems')],
  ['Purchases', () => routeUrl('householdItems')],
  ['Milestones', () => routeUrl('milestones')],
  ['Schedule', () => routeUrl('scheduleGantt')],
  ['Calendar', () => routeUrl('scheduleCalendar')],
  ['Money overview', () => routeUrl('budgetOverview')],
  ['Invoices', () => routeUrl('invoices')],
  ['Funding sources', () => routeUrl('budgetSources')],
  ['Grants', () => routeUrl('budgetSubsidies')],
  ['Bank report', () => routeUrl('bankReport')],
  ['Account', () => routeUrl('settingsProfile')],
  ['Project setup', () => routeUrl('settingsManage')],
  ['Users', () => routeUrl('settingsUsers')],
  ['Backups', () => routeUrl('settingsBackups')],
  ['Companies', () => routeUrl('vendors')],
  ['Home', () => routeUrl('dashboard')],
] as const;

test.describe('No in-page tab rows (#2205)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name === 'tablet', 'markup is identical on tablet and desktop');
  });

  for (const [name, path] of PAGES) {
    test(`${name}: the page area holds no navigation of its own`, async ({ page }) => {
      await page.goto(path());
      // Settled: the page's own heading (Home's h1 is not asserted by text, only its presence)
      await expect(page.locator('main').getByRole('heading', { level: 1 }).first()).toBeVisible();

      // Also not tab rows: the "Area path" trail inside list rows and the report wizard's step
      // indicator (a progress list, not navigation between views)
      const pageNavs = page
        .locator('main')
        .locator('nav:not([aria-label="Area path"]):not([aria-label="Report wizard steps"])');
      // Only the trail rendered inside main counts: from 1024px it lives in the top bar (#2206),
      // outside main, so a page-wide count would be subtracted from navs that are not there.
      const breadcrumbNavs = page.locator('main').getByTestId('breadcrumbs').locator('nav');
      await expect
        .poll(async () => (await pageNavs.count()) - (await breadcrumbNavs.count()))
        .toBe(0);
    });
  }
});
