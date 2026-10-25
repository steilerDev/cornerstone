/**
 * E2E tests for the Funding source filter of the Money overview breakdown (AC5 and AC10 (e)
 * of #2237).
 *
 * The filter is a "Funding source" chip with the muted count "n of N". It opens an anchored panel
 * (from 768px) or a bottom sheet (below) with one checkbox per funding source (plus Unassigned
 * when some line has none), at least one source always stays checked, and every change refetches
 * the breakdown with `?deselectedSources` and announces the result to screen readers. The server
 * filters every view the same way, "Left to spend" stays the whole project.
 *
 * Mocked scenarios use fixtures/moneyMocks.ts (the mocked breakdown honours the filter like the
 * server and records each request); one scenario runs against the real server.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { BudgetOverviewPage } from '../../pages/BudgetOverviewPage.js';
import { MOCK_BREAKDOWN, UNASSIGNED, euro, mockMoneyOverview } from '../../fixtures/moneyMocks.js';
import { createBudgetSourceViaApi, deleteBudgetSourceViaApi } from '../../fixtures/apiHelpers.js';

const B = MOCK_BREAKDOWN;
const LOAN = B.sources.loan.id;
const SAVINGS = B.sources.savings.id;
const isDesktop = (page: Page): boolean => (page.viewportSize()?.width ?? 0) >= 1024;

test.describe('Funding source chip (AC5, AC10 e)', { tag: '@responsive' }, () => {
  test('The chip reads "Funding source" with the muted count "n of N" and opens one checkbox per source', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForBreakdown();

    await expect(overview.sourcesButton).toContainText('Funding source');
    await expect(overview.sourcesButton).toContainText('3 of 3');
    await overview.openSources();
    await expect(overview.sourcesPanel.getByRole('checkbox')).toHaveCount(3);
    await expect(overview.sourceCheckbox(LOAN)).toBeChecked();
    await expect(overview.sourceCheckbox(SAVINGS)).toBeChecked();
    await expect(overview.sourceCheckbox(UNASSIGNED)).toBeChecked();
    await expect(overview.sourcesPanel).toContainText(B.sources.loan.name);
    await expect(overview.sourcesPanel).toContainText('Unassigned');
    expect(new URL(page.url()).searchParams.has('deselectedSources')).toBe(false);
  });

  test('The panel is an anchored dialog from 768px and a bottom sheet below', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForBreakdown();
    await overview.openSources();

    const wide = (page.viewportSize()?.width ?? 0) >= 768;
    if (wide) {
      await expect(page.getByTestId('breakdown-sources-panel')).toBeVisible();
      await expect(overview.sourcesSheet).toHaveCount(0);
    } else {
      await expect(overview.sourcesSheet).toBeVisible();
      await expect(page.getByTestId('breakdown-sources-panel')).toHaveCount(0);
    }
    await expect(page.getByRole('dialog', { name: 'Funding source' })).toBeVisible();
  });

  test('Unchecking a source refetches with deselectedSources and announces the result', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    const mocked = await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForBreakdown();
    expect(mocked.breakdownRequests).toEqual([null]);

    await overview.openSources();
    await overview.sourceCheckbox(LOAN).click();

    await page.waitForURL((url) => url.searchParams.get('deselectedSources') === LOAN);
    await expect(overview.sourcesButton).toContainText('2 of 3');
    // 18,800.00 minus the two loan-funded lines (2,000.00 and 800.00)
    await expect(overview.status).toHaveText(
      `2 of 3 funding sources shown. Expected cost ${euro(16000)}.`,
    );
    await expect.poll(() => mocked.breakdownRequests).toEqual([null, LOAN]);
    await expect(overview.sourceCheckbox(LOAN)).not.toBeChecked();
    // The headline is the whole project and reads so while a filter is on
    await expect(overview.leftToSpendFigure).toHaveText(euro(7200));
    await expect(overview.headline).toContainText('Whole project');
  });

  test('Re-checking every source announces all sources and clears the param', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    const mocked = await mockMoneyOverview(page);

    await overview.goto(`?deselectedSources=${LOAN}`);
    await overview.waitForBreakdown();
    await overview.openSources();
    await expect(overview.sourceCheckbox(LOAN)).not.toBeChecked();

    await overview.sourceCheckbox(LOAN).click();

    await page.waitForURL((url) => !url.searchParams.has('deselectedSources'));
    await expect(overview.status).toHaveText(
      `All funding sources shown. Expected cost ${euro(18800)}.`,
    );
    await expect.poll(() => mocked.breakdownRequests).toEqual([LOAN, null]);
  });

  test('Select all clears the param and refetches the whole project', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    const mocked = await mockMoneyOverview(page);

    await overview.goto(`?deselectedSources=${LOAN},${SAVINGS}`);
    await overview.waitForBreakdown();
    await expect(overview.sourcesButton).toContainText('1 of 3');
    await overview.openSources();

    await overview.sourcesSelectAll.click();

    await page.waitForURL((url) => !url.searchParams.has('deselectedSources'));
    await expect(overview.sourcesButton).toContainText('3 of 3');
    await expect(overview.sourceCheckbox(LOAN)).toBeChecked();
    await expect(overview.sourceCheckbox(SAVINGS)).toBeChecked();
    await expect.poll(() => mocked.breakdownRequests).toEqual([`${LOAN},${SAVINGS}`, null]);
  });

  test('At least one source always stays selected: the last checked box is aria-disabled', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto(`?deselectedSources=${LOAN},${SAVINGS}`);
    await overview.waitForBreakdown();
    await overview.openSources();

    const last = overview.sourceCheckbox(UNASSIGNED);
    await expect(last).toBeChecked();
    await expect(last).toHaveAttribute('aria-disabled', 'true');
    await expect(last).toHaveAccessibleDescription('Keep at least one funding source selected');
    // The other boxes are not locked
    await expect(overview.sourceCheckbox(LOAN)).not.toHaveAttribute('aria-disabled', 'true');

    // A keyboard toggle is refused too (a click can sit outside the viewport inside a sheet)
    await last.focus();
    await page.keyboard.press('Space');
    await expect(last).toBeChecked();
    expect(new URL(page.url()).searchParams.get('deselectedSources')).toBe(`${LOAN},${SAVINGS}`);
  });

  test('Escape closes the panel and focus returns to the chip', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForBreakdown();
    await overview.openSources();

    await page.keyboard.press('Escape');

    await expect(overview.sourcesPanel).toBeHidden();
    await expect(overview.sourcesButton).toBeFocused();
    await expect(overview.sourcesButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('Done closes the panel and returns focus to the chip', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForBreakdown();
    await overview.openSources();
    await overview.sourcesDone.click();

    await expect(overview.sourcesPanel).toBeHidden();
    await expect(overview.sourcesButton).toBeFocused();
  });

  test('The deselected sources are restored from the URL on load, including the first fetch', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    const mocked = await mockMoneyOverview(page);

    await overview.goto(`?deselectedSources=${SAVINGS}`);
    await overview.waitForBreakdown();

    await expect(overview.sourcesButton).toContainText('2 of 3');
    expect(mocked.breakdownRequests).toEqual([SAVINGS]);
    await overview.openSources();
    await expect(overview.sourceCheckbox(SAVINGS)).not.toBeChecked();
    await expect(overview.sourceCheckbox(LOAN)).toBeChecked();
  });

  test('A stale source id in the URL is ignored and every real source stays checked', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto('?deselectedSources=00000000-gone');
    await overview.waitForBreakdown();

    await expect(overview.sourcesButton).toContainText('3 of 3');
    await overview.openSources();
    await expect(overview.sourceCheckbox(LOAN)).toBeChecked();
    await expect(overview.sourceCheckbox(SAVINGS)).toBeChecked();
  });

  test('Every source off in an old URL shows the empty state with Select all', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto(`?deselectedSources=${LOAN},${SAVINGS},${UNASSIGNED}`);
    await overview.waitForBreakdown();

    await expect(overview.breakdownCard).toContainText('Nothing matches these settings.');
    await expect(overview.sourcesButton).toContainText('0 of 3');
    await overview.breakdownCard.getByRole('button', { name: 'Select all' }).click();

    await page.waitForURL((url) => !url.searchParams.has('deselectedSources'));
    await expect(overview.breakdownCard).not.toContainText('Nothing matches these settings.');
    await expect(overview.sourcesButton).toContainText('3 of 3');
  });

  test('The status region is a polite live region that stays in the page', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForBreakdown();

    await expect(overview.status).toHaveAttribute('role', 'status');
    await expect(overview.status).toBeAttached();
    await expect(overview.status).toHaveText('');
  });
});

test.describe('Funding source filter — all four views recompute (AC5)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!isDesktop(page), 'table surface assertions run on the desktop project');
    await mockMoneyOverview(page);
  });

  test('Deselecting the loan source removes its lines from By area, type, category and source', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto(`?deselectedSources=${LOAN}`);
    await overview.waitForBreakdown();

    // By area: the garden task was loan-funded only, so the whole area is gone
    await expect(overview.row(`area:${B.areas.garden}`)).toHaveCount(0);
    await expect(overview.cell(`area:${B.areas.ground}`, 'expectedCost')).toHaveText(euro(14000));
    await expect(overview.totalCell('expectedCost')).toHaveText(euro(16000));
    await expect(overview.totalCell('paid')).toHaveText(euro(0));
    // "Not yet split" is not tied to a source and is never filtered
    await expect(overview.cell('not-yet-split', 'stillToPay')).toHaveText(euro(300));

    await overview.viewChip('type').click();
    await expect(overview.cell('type:work_items', 'expectedCost')).toHaveText(euro(14500));
    await expect(overview.totalCell('expectedCost')).toHaveText(euro(16000));

    await overview.viewChip('category').click();
    await expect(overview.cell(`category:${B.categories.materials.id}`, 'expectedCost')).toHaveText(
      euro(10000),
    );
    await expect(overview.cell(`category:${B.categories.labour.id}`, 'expectedCost')).toHaveText(
      euro(4000),
    );
    await expect(overview.totalCell('expectedCost')).toHaveText(euro(16000));

    await overview.viewChip('source').click();
    await expect(overview.row(`source:${LOAN}`)).toHaveCount(0);
    await expect(overview.row(`source:${SAVINGS}`)).toBeVisible();
    await expect(overview.totalCell('expectedCost')).toHaveText(euro(16000));
  });

  test('The total label names the current settings while a source is off', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto();
    await overview.waitForBreakdown();
    await expect(overview.total).not.toContainText('for the current settings');

    await overview.openSources();
    await overview.sourceCheckbox(SAVINGS).click();
    await expect(overview.total).toContainText('Total for the current settings');
    await expect(overview.totalCell('expectedCost')).toHaveText(euro(4800));
  });

  test('The previous breakdown stays visible while the filtered one loads', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    // Re-register the mocks with a delay: the first breakdown is slow too, so wait for it
    await mockMoneyOverview(page, { breakdownDelayMs: 600 });

    await overview.goto();
    await overview.waitForBreakdown();
    await expect(overview.totalCell('expectedCost')).toHaveText(euro(18800));

    await overview.openSources();
    await overview.sourceCheckbox(LOAN).click();

    await expect(overview.breakdownCard).toHaveAttribute('aria-busy', 'true');
    // No flicker to a skeleton: the old rows are still there
    await expect(overview.totalCell('expectedCost')).toHaveText(euro(18800));
    await expect(overview.totalCell('expectedCost')).toHaveText(euro(16000));
    await expect(overview.breakdownCard).toHaveAttribute('aria-busy', 'false');
  });
});

test.describe('Funding source filter — real server (AC5)', () => {
  test('Unchecking a real source sends deselectedSources, gets a 200 and announces the count', async ({
    page,
    testPrefix,
  }) => {
    test.skip(!isDesktop(page), 'desktop project');
    const overview = new BudgetOverviewPage(page);
    let sourceId = '';
    try {
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Filter Source`,
        totalAmount: 1000,
      });

      await overview.goto();
      await overview.waitForBreakdown();
      await overview.openSources();
      await expect(overview.sourceCheckbox(sourceId)).toBeChecked();

      const filtered = page.waitForResponse(
        (response) =>
          response.url().includes('/api/budget/breakdown') &&
          response.url().includes('deselectedSources'),
      );
      await overview.sourceCheckbox(sourceId).click();
      const response = await filtered;

      expect(response.status()).toBe(200);
      expect(decodeURIComponent(response.url())).toContain(sourceId);
      await expect(overview.status).toHaveText(/funding sources shown\. Expected cost €/);
      await expect(overview.sourcesButton).toContainText(/\d+ of \d+/);
      expect(new URL(page.url()).searchParams.get('deselectedSources')).toContain(sourceId);

      // The filter survives a reload
      await page.reload();
      await overview.waitForBreakdown();
      await overview.openSources();
      await expect(overview.sourceCheckbox(sourceId)).not.toBeChecked();
    } finally {
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
    }
  });
});
