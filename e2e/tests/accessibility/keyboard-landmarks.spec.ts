/**
 * E2E: keyboard and landmark checks (Story #2261, AC2 and AC5). Desktop only: the logic is
 * viewport independent.
 *
 *  - the skip link is the first tab stop, becomes visible and moves focus to main without a
 *    navigation,
 *  - one main, one banner and a named navigation landmark,
 *  - exactly one `aria-current="page"` entry in the navigation landmarks,
 *  - a visible focus change on every tab stop of 6 representative pages,
 *  - the viewport meta allows pinch-zoom,
 *  - completeness: every served page of the route map is a row of the page table or has a
 *    documented exemption, so the axe sweep cannot silently fall behind.
 */

import { test, expect } from '../../fixtures/auth.js';
import { expectVisibleFocusWhileTabbing } from '../../fixtures/a11y.js';
import {
  A11Y_EXEMPT,
  A11Y_ROWS,
  cleanupA11y,
  emptySeed,
  openRow,
  seedA11y,
  seedTag,
  servedPageIds,
} from '../../fixtures/a11yPages.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { routeUrl } from '../../../shared/src/routes/index.js';

const seed = emptySeed('');

function row(id: string) {
  const found = A11Y_ROWS.find((r) => r.id === id);
  if (!found) throw new Error(`no page table row ${id}`);
  return found;
}

test.describe('Keyboard and landmarks', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    seed.tag = seedTag(testInfo.project.name, testInfo.workerIndex);
    await seedA11y(browser, seed);
  });

  test.afterAll(async ({ browser }) => {
    await cleanupA11y(browser, seed);
  });

  test('completeness: every served page has an a11y row or an exemption', () => {
    const served = servedPageIds();
    const covered = [...A11Y_ROWS.map((r) => r.id), ...Object.keys(A11Y_EXEMPT)];
    expect(
      served.filter((id) => !covered.includes(id)),
      'route-map pages missing from the a11y table',
    ).toEqual([]);
    expect(
      covered.filter((id) => !served.includes(id)),
      'a11y rows or exemptions for pages the route map does not serve',
    ).toEqual([]);
  });

  test('the skip link is the first tab stop and moves focus to main without navigating', async ({
    page,
  }) => {
    const appShell = new AppShellPage(page);
    await openRow(page, row('home'), seed);
    const url = page.url();
    // Start from the document, not from an element the page focused on load
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Tab');
    await expect(appShell.skipLink).toBeFocused();
    await expect(appShell.skipLink).toBeInViewport();
    await expect(appShell.skipLink).toHaveCSS('opacity', '1');

    await page.keyboard.press('Enter');
    await expect(appShell.main).toBeFocused();
    expect(page.url()).toBe(url);
  });

  for (const id of ['home', 'workItems', 'workItem']) {
    test(`${id}: one main, one banner and a named navigation`, async ({ page }) => {
      await openRow(page, row(id), seed);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('banner')).toHaveCount(1);
      const navigations = page.getByRole('navigation');
      expect(await navigations.count()).toBeGreaterThanOrEqual(1);
      const names = await navigations.evaluateAll((els) =>
        els.map((el) => el.getAttribute('aria-label') ?? el.getAttribute('aria-labelledby') ?? ''),
      );
      expect(
        names.every((name) => name.length > 0),
        `unnamed navigation in ${names}`,
      ).toBe(true);
    });
  }

  test.describe('aria-current', () => {
    test('a section page marks its sidebar section', async ({ page }) => {
      const appShell = new AppShellPage(page);
      await openRow(page, row('home'), seed);
      await expect(page.getByTestId('sidebar-section-home')).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(appShell.activeEntries).toHaveCount(1);
    });

    test('a view page marks its view and not its section', async ({ page }) => {
      const appShell = new AppShellPage(page);
      await openRow(page, row('scheduleCalendar'), seed);
      await expect(page.getByTestId('sidebar-view-scheduleCalendar')).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.getByTestId('sidebar-section-tasks')).not.toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(appShell.activeEntries).toHaveCount(1);
    });

    test('a detail page marks exactly one sidebar entry', async ({ page }) => {
      const appShell = new AppShellPage(page);
      await openRow(page, row('workItem'), seed);
      await expect(appShell.activeEntries).toHaveCount(1);
    });

    test('the navigation landmarks together hold exactly one current entry', async ({ page }) => {
      const appShell = new AppShellPage(page);
      await openRow(page, row('settingsProfile'), seed);
      const current = appShell.nav
        .locator('[aria-current="page"]')
        .or(appShell.settingsNav.locator('[aria-current="page"]'));
      await expect(current).toHaveCount(1);
    });
  });

  for (const id of [
    'home',
    'workItems',
    'workItem',
    'budgetOverview',
    'settingsProfile',
    'login',
  ]) {
    test(`${id}: every tab stop shows a visible focus indicator`, async ({ page }) => {
      await openRow(page, row(id), seed);
      await expectVisibleFocusWhileTabbing(page, { label: id });
    });
  }

  test('the viewport meta allows pinch-zoom', async ({ page }) => {
    await page.goto(routeUrl('home'));
    const content = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(content).toMatch(/width=device-width/);
    expect(content).not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale/);
  });
});
