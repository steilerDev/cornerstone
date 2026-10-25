/**
 * E2E tests for the Payment basis of the Money overview breakdown (AC4 and AC10 (c) of #2237).
 *
 * The "Cost basis" dropdown is gone (retired word): three chips in a group labelled "Payment"
 * choose what the breakdown shows. All shows Expected cost, Paid and Still to pay; Paid shows
 * Paid only; Not yet paid shows Not yet paid only (Expected cost minus Paid); a row whose figure
 * for the chosen basis is 0 is hidden. `?paymentStatus` keeps `paid` and `outstanding`, every
 * write replaces the history entry and keeps the other params, and the choice is a client-side
 * selection of the one breakdown response (no refetch).
 *
 * Invented figures from fixtures/moneyMocks.ts (`buildMockBreakdown`): Expected cost 18,800.00,
 * Paid 2,000.00 (the hedge plants), Still to pay 1,100.00, Not yet paid 16,800.00.
 *
 * Table assertions run on the desktop project; the chip and URL scenarios run at every viewport,
 * and the phone list repeats the hiding rule.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { BudgetOverviewPage } from '../../pages/BudgetOverviewPage.js';
import { MOCK_BREAKDOWN, euro, mockMoneyOverview } from '../../fixtures/moneyMocks.js';

const B = MOCK_BREAKDOWN;
const isDesktop = (page: Page): boolean => (page.viewportSize()?.width ?? 0) >= 1024;
const isPhone = (page: Page): boolean => (page.viewportSize()?.width ?? 0) < 768;

test.describe('Payment chips (AC4, AC10 c)', { tag: '@responsive' }, () => {
  test('The chips sit in a group labelled Payment: All · Paid · Not yet paid, All pressed', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForBreakdown();

    const group = overview.breakdownCard.getByRole('group', { name: 'Payment' });
    await expect(group).toBeVisible();
    await expect(group.getByRole('button')).toHaveText(['All', 'Paid', 'Not yet paid']);
    await expect(overview.paymentChip('all')).toHaveAttribute('aria-pressed', 'true');
    await expect(overview.paymentChip('paid')).toHaveAttribute('aria-pressed', 'false');
    await expect(overview.paymentChip('outstanding')).toHaveAttribute('aria-pressed', 'false');
    // "Cost basis" is a retired word and the old dropdown is gone
    await expect(page.locator('main').getByText('Cost basis')).toHaveCount(0);
    await expect(page.locator('#cost-basis-select')).toHaveCount(0);
    expect(new URL(page.url()).searchParams.has('paymentStatus')).toBe(false);
  });

  test('Choosing Paid and Not yet paid sets ?paymentStatus; All removes it; no refetch', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    const mocked = await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForBreakdown();
    expect(mocked.breakdownRequests).toHaveLength(1);

    await overview.paymentChip('paid').click();
    await page.waitForURL((url) => url.searchParams.get('paymentStatus') === 'paid');
    await expect(overview.paymentChip('paid')).toHaveAttribute('aria-pressed', 'true');
    await expect(overview.paymentChip('all')).toHaveAttribute('aria-pressed', 'false');

    await overview.paymentChip('outstanding').click();
    await page.waitForURL((url) => url.searchParams.get('paymentStatus') === 'outstanding');
    await expect(overview.paymentChip('outstanding')).toHaveAttribute('aria-pressed', 'true');

    await overview.paymentChip('all').click();
    await page.waitForURL((url) => !url.searchParams.has('paymentStatus'));
    await expect(overview.paymentChip('all')).toHaveAttribute('aria-pressed', 'true');

    // Payment is a client-side selection of the one response
    expect(mocked.breakdownRequests).toHaveLength(1);
  });

  test('A chip change keeps the other params and does not grow the history', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto('?by=type&estimate=low');
    await overview.waitForBreakdown();
    const lengthBefore = await page.evaluate(() => window.history.length);

    await overview.paymentChip('paid').click();
    await page.waitForURL((url) => url.searchParams.get('paymentStatus') === 'paid');

    const params = new URL(page.url()).searchParams;
    expect(params.get('by')).toBe('type');
    expect(params.get('estimate')).toBe('low');
    expect(await page.evaluate(() => window.history.length)).toBe(lengthBefore);
  });

  test('Deep links ?paymentStatus=paid and =outstanding press the matching chip', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto('?paymentStatus=outstanding');
    await overview.waitForBreakdown();
    await expect(overview.paymentChip('outstanding')).toHaveAttribute('aria-pressed', 'true');

    await overview.goto('?paymentStatus=paid');
    await overview.waitForBreakdown();
    await expect(overview.paymentChip('paid')).toHaveAttribute('aria-pressed', 'true');
  });

  test('An unknown ?paymentStatus falls back to All and leaves the URL', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto('?paymentStatus=bogus');
    await overview.waitForBreakdown();

    await expect(overview.paymentChip('all')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForURL((url) => !url.searchParams.has('paymentStatus'));
  });

  test('The Grants chip is shown only with All; ?grants=1 stays in the URL', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto('?grants=1');
    await overview.waitForBreakdown();
    await expect(overview.grantsChip).toBeVisible();

    await overview.paymentChip('paid').click();
    await page.waitForURL((url) => url.searchParams.get('paymentStatus') === 'paid');
    await expect(overview.grantsChip).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('grants')).toBe('1');

    await overview.paymentChip('all').click();
    await expect(overview.grantsChip).toHaveAttribute('aria-pressed', 'true');
  });

  test('The headline stays the whole project while the basis is changed', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForBreakdown();
    await expect(overview.headline).not.toContainText('Whole project');

    await overview.paymentChip('paid').click();
    await page.waitForURL((url) => url.searchParams.get('paymentStatus') === 'paid');
    await expect(overview.headline).toContainText('Whole project');
    await expect(overview.leftToSpendFigure).toHaveText(euro(7200));
  });

  test('The Payment chips are keyboard operable', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForBreakdown();
    await overview.paymentChip('outstanding').focus();
    await page.keyboard.press('Enter');

    await page.waitForURL((url) => url.searchParams.get('paymentStatus') === 'outstanding');
    await expect(overview.paymentChip('outstanding')).toHaveAttribute('aria-pressed', 'true');
    await expect(overview.paymentChip('outstanding')).toBeFocused();
  });
});

test.describe('Payment basis — columns and hidden rows on the table (AC10 c)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!isDesktop(page), 'table surface assertions run on the desktop project');
    await mockMoneyOverview(page);
  });

  test('All shows Expected cost, Paid and Still to pay', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto();
    await overview.waitForBreakdown();

    await expect(overview.columnHeaders()).toHaveText([
      'Name',
      'Expected cost',
      'Paid',
      'Still to pay',
    ]);
    await expect(overview.totalCell('expectedCost')).toHaveText(euro(18800));
    await expect(overview.totalCell('paid')).toHaveText(euro(2000));
    await expect(overview.totalCell('stillToPay')).toHaveText(euro(1100));
    await expect(overview.total).toContainText('Total');
    await expect(overview.total).not.toContainText('for the current settings');
  });

  test('Paid shows Paid only and hides rows with nothing paid', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto('?paymentStatus=paid');
    await overview.waitForBreakdown();

    await expect(overview.columnHeaders()).toHaveText(['Name', 'Paid']);
    expect(await overview.topLevelKeys()).toEqual([`area:${B.areas.garden}`]);
    await expect(overview.cell(`area:${B.areas.garden}`, 'paid')).toHaveText(euro(2000));
    await expect(overview.row(`area:${B.areas.ground}`)).toHaveCount(0);
    await expect(overview.row('not-yet-split')).toHaveCount(0);
    await expect(overview.totalCell('paid')).toHaveText(euro(2000));
    await expect(overview.total).toContainText('Total for the current settings');

    await overview.expand(`area:${B.areas.garden}`);
    await overview.expand(`item:work_item:${B.items.hedge}`);
    await expect(overview.row(`line:${B.lines.plants}`)).toBeVisible();
    await expect(overview.cell(`line:${B.lines.plants}`, 'paid')).toHaveText(euro(2000));
    // The unpaid delivery line of the same task is hidden
    await expect(overview.row(`line:${B.lines.delivery}`)).toHaveCount(0);
  });

  test('Not yet paid shows Expected cost minus Paid and hides fully paid rows', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto('?paymentStatus=outstanding');
    await overview.waitForBreakdown();

    await expect(overview.columnHeaders()).toHaveText(['Name', 'Not yet paid']);
    expect(await overview.topLevelKeys()).toEqual([
      `area:${B.areas.ground}`,
      `area:${B.areas.garden}`,
      'area:none',
    ]);
    await expect(overview.cell(`area:${B.areas.ground}`, 'notYetPaid')).toHaveText(euro(14000));
    // Garden: 2,800.00 expected minus 2,000.00 paid
    await expect(overview.cell(`area:${B.areas.garden}`, 'notYetPaid')).toHaveText(euro(800));
    await expect(overview.totalCell('notYetPaid')).toHaveText(euro(16800));
    await expect(overview.total).toContainText('Total for the current settings');

    await overview.expand(`area:${B.areas.garden}`);
    await overview.expand(`item:work_item:${B.items.hedge}`);
    await expect(overview.row(`line:${B.lines.delivery}`)).toBeVisible();
    // The fully paid plants line is hidden
    await expect(overview.row(`line:${B.lines.plants}`)).toHaveCount(0);
  });

  test('Not yet paid follows the estimate: Low and High change Expected cost minus Paid', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto('?paymentStatus=outstanding&estimate=low');
    await overview.waitForBreakdown();
    await expect(overview.totalCell('notYetPaid')).toHaveText(euro(15600));

    await overview.estimateChip('high').click();
    await page.waitForURL((url) => url.searchParams.get('estimate') === 'high');
    await expect(overview.totalCell('notYetPaid')).toHaveText(euro(18000));
  });

  test('Every basis still adds up: All equals Paid plus Not yet paid for the whole project', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto();
    await overview.waitForBreakdown();
    await expect(overview.totalCell('expectedCost')).toHaveText(euro(18800));
    await overview.paymentChip('paid').click();
    await expect(overview.totalCell('paid')).toHaveText(euro(2000));
    await overview.paymentChip('outstanding').click();
    await expect(overview.totalCell('notYetPaid')).toHaveText(euro(16800));
    // 2,000.00 + 16,800.00 = 18,800.00
  });
});

test.describe('Payment basis — phone list (AC10 c)', { tag: '@responsive' }, () => {
  test('The drill-down list shows the chosen basis and hides rows with a 0 figure', async ({
    page,
  }) => {
    test.skip(!isPhone(page), 'phone layout');
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto('?paymentStatus=paid');
    await overview.waitForBreakdown();
    await expect(overview.listRow(`area:${B.areas.garden}`)).toContainText(euro(2000));
    await expect(overview.listRow(`area:${B.areas.ground}`)).toHaveCount(0);

    await overview.paymentChip('outstanding').click();
    await page.waitForURL((url) => url.searchParams.get('paymentStatus') === 'outstanding');
    await expect(overview.listRow(`area:${B.areas.garden}`)).toContainText(euro(800));
    await expect(overview.listRow(`area:${B.areas.ground}`)).toContainText(euro(14000));
  });
});
