/**
 * E2E tests for printing the Money overview (AC6 of #2237).
 *
 * ⋯ › Print opens the browser print dialog. In print the breakdown is the full table with every
 * row expanded (the `beforeprint` event expands all rows, `afterprint` restores the on-screen
 * state), the app chrome and the settings toolbar are hidden, and a one-line summary of the
 * settings ("View: Area · Payment: All · Estimates: Expected · Funding sources: 3 of 3") heads
 * the page so a paper copy says which numbers it shows. The summary is invisible on screen.
 *
 * Mocked responses (fixtures/moneyMocks.ts) with invented figures. Print emulation uses
 * `page.emulateMedia({ media: 'print' })` plus a dispatched `beforeprint`, as the browser would.
 */

import { test, expect } from '../../fixtures/auth.js';
import { BudgetOverviewPage } from '../../pages/BudgetOverviewPage.js';
import { ROUTES } from '../../fixtures/testData.js';
import { MOCK_BREAKDOWN, mockMoneyOverview } from '../../fixtures/moneyMocks.js';

const B = MOCK_BREAKDOWN;

test.describe('Money overview — print (AC6)', { tag: '@responsive' }, () => {
  test('The print summary line is invisible on screen and visible in print', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    try {
      await overview.goto();
      await overview.waitForBreakdown();
      await expect(overview.printSummary).toBeHidden();

      await overview.startPrint();

      await expect(overview.printSummary).toBeVisible();
      await expect(overview.printSummary).toHaveText(
        'View: Area · Payment: All · Estimates: Expected · Funding sources: 3 of 3',
      );
    } finally {
      await overview.endPrint();
    }
  });

  test('The summary names the current settings', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    try {
      await overview.goto(
        `?by=type&paymentStatus=paid&estimate=high&deselectedSources=${B.sources.loan.id}`,
      );
      await overview.waitForBreakdown();
      await overview.startPrint();

      await expect(overview.printSummary).toHaveText(
        'View: Type · Payment: Paid · Estimates: High · Funding sources: 2 of 3',
      );
    } finally {
      await overview.endPrint();
    }
  });

  test('With Grants on, the summary adds the Grants column', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    try {
      await overview.goto('?by=source&estimate=low&grants=1');
      await overview.waitForBreakdown();
      await overview.startPrint();

      await expect(overview.printSummary).toHaveText(
        'View: Funding source · Payment: All · Estimates: Low · Columns: Grants · Funding sources: 3 of 3',
      );
    } finally {
      await overview.endPrint();
    }
  });

  test('Print shows the full table, expanded, on every viewport', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    try {
      await overview.goto();
      await overview.waitForBreakdown();

      await overview.startPrint();

      // The table (not the phone list) prints
      await expect(overview.table).toBeVisible();
      await expect(overview.list).toBeHidden();
      // Every row is expanded: no hidden row remains, down to the cost lines
      await expect(overview.table.locator('tbody tr[hidden]')).toHaveCount(0);
      await expect(overview.row(`area:${B.areas.kitchen}`)).toBeVisible();
      await expect(overview.row(`item:work_item:${B.items.cabinets}`)).toBeVisible();
      await expect(overview.row(`line:${B.lines.units}`)).toBeVisible();
      await expect(overview.row('orphans')).toBeVisible();
      await expect(overview.row(`line:${B.lines.loose}`)).toBeVisible();
    } finally {
      await overview.endPrint();
    }
  });

  test('Print hides the app chrome, the settings toolbar and the expand chevrons', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    try {
      await overview.goto();
      await overview.waitForBreakdown();
      await expect(overview.toolbar).toBeVisible();

      await overview.startPrint();

      // The title prints at every width: below 1024px the h1 is the title-menu button, which
      // print.css shows through its data-print-title exception (without the chevron)
      await expect(overview.heading).toBeVisible();
      await expect(overview.heading).toHaveText(/Money/);
      await expect(
        page.locator('h1 svg:visible, button[data-print-title] svg:visible'),
      ).toHaveCount(0);
      await expect(overview.headline).toBeVisible();
      await expect(overview.toolbar).toBeHidden();
      await expect(overview.toggle(`area:${B.areas.ground}`)).toBeHidden();
      await expect(page.locator('aside')).toBeHidden();
    } finally {
      await overview.endPrint();
    }
  });

  test('The on-screen expansion is restored after printing', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1024, 'the table is on screen from desktop');
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    try {
      await overview.goto();
      await overview.waitForBreakdown();
      await overview.expand(`area:${B.areas.ground}`);

      await overview.startPrint();
      await expect(overview.table.locator('tbody tr[hidden]')).toHaveCount(0);

      await overview.endPrint();
      // Only the rows expanded on screen stay open
      await expect(overview.row(`area:${B.areas.garden}`)).toBeVisible();
      await expect(overview.row(`item:work_item:${B.items.hedge}`)).toBeHidden();
      await expect(overview.printSummary).toBeHidden();
    } finally {
      await overview.endPrint();
    }
  });

  test('The ⋯ menu stays out of the printed page', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    try {
      await overview.goto();
      await overview.waitForBreakdown();
      await expect(overview.pageActions).toBeVisible();

      await overview.startPrint();

      await expect(overview.pageActions).toBeHidden();
    } finally {
      await overview.endPrint();
    }
  });

  test('Dark mode: print resets the surface variables to light values', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    try {
      await overview.goto();
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await overview.waitForBreakdown();

      const darkBackground = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-bg-primary').trim(),
      );
      expect(darkBackground.toLowerCase()).not.toBe('#ffffff');

      // `emulateMedia` does not re-run the cascade for custom properties, so the shipped
      // `@media print` rule (client/src/styles/print.css) is asserted in the loaded CSS.
      const hasPrintReset = await page.evaluate(async () => {
        const whiteValue =
          /--color-bg-primary\s*:\s*(?:#fff(?:fff)?|rgb\(255\s*,\s*255\s*,\s*255\s*\))/i;
        for (const sheet of Array.from(document.styleSheets)) {
          if (!sheet.href) continue;
          try {
            const response = await fetch(sheet.href);
            if (!response.ok) continue;
            const raw = await response.text();
            if (raw.includes('@media print') && whiteValue.test(raw)) return true;
          } catch {
            /* skip an unreadable sheet */
          }
        }
        return false;
      });
      expect(hasPrintReset).toBe(true);
    } finally {
      await overview.endPrint();
    }
  });

  test('Other pages are unaffected by the Money overview print styles', async ({ page }) => {
    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [],
            pagination: { totalItems: 0, totalPages: 1, page: 1, pageSize: 20 },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await page.goto(ROUTES.diary);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Site diary');

      await page.emulateMedia({ media: 'print' });

      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Site diary');
    } finally {
      await page.emulateMedia({ media: 'screen' });
      await page.unroute('**/api/diary-entries*').catch(() => {});
    }
  });
});
