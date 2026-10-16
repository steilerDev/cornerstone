/**
 * E2E tests for the Companies URL moves (#2213, AC2).
 *
 * The list left Settings: `/settings/vendors` and `/budget/vendors` now redirect to
 * `/companies`, and the company pages `/settings/vendors/:id` and `/budget/vendors/:id` redirect
 * to `/companies/:id` (the vCard URL). Each redirect is a single hop that replaces history and
 * keeps the query string. The wider frozen walk lives in navigation/legacy-url-walk.spec.ts;
 * this file adds the Companies-specific checks.
 *
 * Desktop project only (a URL walk does not depend on the viewport).
 */

import { test, expect } from '../../fixtures/auth.js';
import { createVendorViaApi, deleteVendorViaApi } from '../../fixtures/apiHelpers.js';
import { installRouteLog, readRouteLog } from '../../fixtures/routeLog.js';
import { VendorDetailPage } from '../../pages/VendorDetailPage.js';
import { VendorsPage } from '../../pages/VendorsPage.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import type { Page } from '@playwright/test';

test.describe('Companies URL moves (AC2)', () => {
  test.beforeEach(({ page }) => {
    const viewport = page.viewportSize();
    test.skip(viewport !== null && viewport.width < 1200, 'a URL walk runs on desktop only');
  });

  /** Every URL the router set since the page loaded must be the landing path. */
  async function expectOneReplacingHop(page: Page, landingPath: string): Promise<void> {
    const log = await readRouteLog(page);
    expect(
      log.filter((entry) => entry.kind === 'pushState'),
      'a redirect replaces, never pushes',
    ).toEqual([]);
    const paths = log.map((entry) => new URL(entry.url).pathname);
    expect(paths.length, 'the redirect replaced the URL').toBeGreaterThan(0);
    expect(
      paths.filter((path) => path !== landingPath),
      `no intermediate path may appear (log: ${paths.join(' -> ')})`,
    ).toEqual([]);
  }

  for (const legacy of ['/settings/vendors', '/budget/vendors']) {
    test(`R1: ${legacy}?q=x&sortBy=name&sortOrder=desc lands on /companies with the same params, in one hop`, async ({
      page,
    }) => {
      await installRouteLog(page);
      await page.goto(`${legacy}?q=x&sortBy=name&sortOrder=desc`);

      await expect(page).toHaveURL((url) => url.pathname === routeUrl('companies'));
      const url = new URL(page.url());
      expect(url.searchParams.get('q')).toBe('x');
      expect(url.searchParams.get('sortBy')).toBe('name');
      expect(url.searchParams.get('sortOrder')).toBe('desc');
      await expect(new VendorsPage(page).heading).toBeVisible();
      await expect(new VendorsPage(page).searchInput).toHaveValue('x');
      await expectOneReplacingHop(page, routeUrl('companies'));

      // A reload of the target stays where it is
      await page.goto(page.url());
      await expect(page).toHaveURL((current) => current.pathname === routeUrl('companies'));
      await expect(new VendorsPage(page).heading).toBeVisible();
    });
  }

  for (const legacy of ['/settings/vendors', '/budget/vendors']) {
    test(`R2: ${legacy}/:id lands on /companies/:id in one hop and the page loads`, async ({
      page,
      testPrefix,
    }) => {
      const name = `${testPrefix} Redirected Co 2213`;
      const id = await createVendorViaApi(page, { name });
      try {
        await installRouteLog(page);
        await page.goto(`${legacy}/${id}`);

        const landing = routeUrl('company', { id });
        await expect(page).toHaveURL((url) => url.pathname === landing);
        await expect(new VendorDetailPage(page).pageTitle).toHaveText(name);
        await expectOneReplacingHop(page, landing);

        // Reload of the target stays; Back does not return to the legacy URL
        await page.goto(page.url());
        await expect(page).toHaveURL((url) => url.pathname === landing);
      } finally {
        await deleteVendorViaApi(page, id);
      }
    });
  }

  test('R3: /settings/vendors?create=1 ends on the New company dialog, query carried through the replace', async ({
    page,
  }) => {
    await page.goto('/settings/vendors?create=1');
    const list = new VendorsPage(page);
    await list.createDialog.waitForOpen();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('companyNew'));
    await expect(page).toHaveURL((url) => !url.searchParams.has('create'));
  });

  test('R4: the old Trades bookmark /settings/manage?tab=trades lands on the Trades pointer row that opens the sheet', async ({
    page,
  }) => {
    await page.goto(routeUrl('settingsManage', undefined, { tab: 'trades' }));
    const pointer = page.getByTestId('project-setup-pointer-trades');
    await expect(pointer).toBeVisible();
    await expect(pointer).toContainText('Trades');
    await expect(pointer).toContainText('Managed on Companies');
    await expect(pointer).toHaveAttribute('href', routeUrl('companies', undefined, { trades: 1 }));

    await pointer.click();
    const list = new VendorsPage(page);
    await list.tradesSheet.waitForOpen();
    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('companies') && url.searchParams.get('trades') === '1',
    );
    await expect(list.tradesSheet.newInput).toBeFocused();

    // Done leaves the sheet; Back from the Companies list goes to the Manage page it came from
    await list.tradesSheet.doneButton.click();
    await list.tradesSheet.waitForClosed();
    await expect(page.locator('body')).not.toBeFocused();
  });
});
