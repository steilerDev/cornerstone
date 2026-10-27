/**
 * E2E tests for the Money overview (route `budgetOverview`), rebuilt in #2237 (story 4.5,
 * EPIC-21 P4.5). Replaces the Budget overview suite of the hero card / Add menu / cost
 * perspective generation.
 *
 * UAT scenarios (the AC numbers are those of issue #2237):
 * - AC1  h1 "Money"; the Left to spend headline (figure alone in its `data-figure` element,
 *        verdict, range line beneath, "How is this calculated?") and the five facts in order
 * - AC2  funding rows with "Allocated x of y" and a bar; only an over-allocation gets its amount
 * - AC3  By area / By type / By category / By funding source, each down to cost lines, all adding
 *        up to the same total; Low · Expected · High; Show Grants adds Grants and After grants;
 *        no correction row and no negative cost
 * - AC7  phone: headline tiles and the two-column drill-down list
 * - AC9  an offer-linked line counts at face value (real API, Low = Expected = High)
 * - AC10 (c)/(d)/(f) are covered here and in budget-cost-basis.spec.ts (Payment chips),
 *        budget-source-filter.spec.ts (Funding source) and budget-overview-print.spec.ts (Print)
 * - States: error + Retry, breakdown failure, no cost lines, no figure yet, no horizontal scroll,
 *   dark mode, URL params surviving a reload
 *
 * Mocked responses (fixtures/moneyMocks.ts) give exact, invented figures for the figure checks;
 * the AC9 scenario and the smoke test run against the real server. The breakdown tree is a table
 * from 768px of the card's own width and a drill-down list below, so table assertions run on the
 * desktop project and the phone scenarios on the mobile project.
 */

import { InvoicesPage } from '../../pages/InvoicesPage.js';
import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { BudgetOverviewPage } from '../../pages/BudgetOverviewPage.js';
import type { BreakdownViewValue } from '../../pages/BudgetOverviewPage.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { API } from '../../fixtures/testData.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createBudgetSourceViaApi,
  createVendorViaApi,
  deleteBudgetSourceViaApi,
  createWorkItemViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import {
  MOCK_BREAKDOWN,
  euro,
  mockFundingSource,
  mockMoneyOverview,
  mockOverviewResponse,
} from '../../fixtures/moneyMocks.js';
import { parseMoney } from '../../fixtures/figureSurfaces.js';

const B = MOCK_BREAKDOWN;
const TOTAL_EXPECTED = 18800;

const isDesktop = (page: Page): boolean => (page.viewportSize()?.width ?? 0) >= 1024;
const isPhone = (page: Page): boolean => (page.viewportSize()?.width ?? 0) < 768;

/** Every top-level row's cell of `column` adds up to the total row's cell (cents). */
async function expectTopLevelAddsUp(
  overview: BudgetOverviewPage,
  column: 'expectedCost' | 'paid' | 'stillToPay',
): Promise<void> {
  const keys = await overview.topLevelKeys();
  expect(keys.length).toBeGreaterThan(0);
  let sum = 0;
  for (const key of keys) {
    sum += parseMoney(await overview.cell(key, column).innerText()) ?? 0;
  }
  expect(sum).toBe(parseMoney(await overview.totalCell(column).innerText()));
}

// ─────────────────────────────────────────────────────────────────────────────
// AC1: headline, facts, page actions
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money overview — headline and facts (AC1)', { tag: '@responsive' }, () => {
  test(
    'The Money overview loads with its headline, facts, funding and breakdown, and no Add menu',
    { tag: '@smoke' },
    async ({ page }) => {
      const overview = new BudgetOverviewPage(page);

      await overview.goto();
      await overview.waitForLoaded();
      await overview.waitForBreakdown();

      await expect(overview.heading).toHaveText('Money');
      await expect(overview.headline).toBeVisible();
      await expect(overview.leftToSpendFigure).toBeVisible();
      await expect(overview.summary).toBeVisible();
      await expect(overview.funding).toBeVisible();
      await expect(overview.breakdownCard).toBeVisible();

      // The Add dropdown is gone (MNY-013: the New menu creates things)
      await expect(page.getByTestId('budget-overview-add-button')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
      await expect(overview.pageActions).toBeVisible();
    },
  );

  test('Left to spend shows the figure alone, a verdict, and the range as the line beneath it', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForLoaded();

    await expect(overview.headline.getByRole('heading', { name: /^Left to spend/ })).toBeVisible();
    // The data-figure element holds only the formatted figure (#2232)
    await expect(overview.leftToSpendFigure).toHaveAttribute('data-figure', 'left-to-spend');
    await expect(overview.leftToSpendFigure).toHaveText(euro(7200));
    await expect(overview.verdictBadge).toHaveText('On budget');
    await expect(overview.range).toContainText('Range');
    await expect(overview.range).toContainText(euro(6000));
    await expect(overview.range).toContainText(euro(8400));
    // The range is the line directly beneath the figure
    const figureBox = await overview.leftToSpendFigure.boundingBox();
    const rangeBox = await overview.range.boundingBox();
    expect(figureBox).not.toBeNull();
    expect(rangeBox).not.toBeNull();
    expect(rangeBox!.y).toBeGreaterThanOrEqual(figureBox!.y + figureBox!.height - 2);
    expect(rangeBox!.y - (figureBox!.y + figureBox!.height)).toBeLessThan(60);
    await expect(overview.leftToSpendFigure).not.toHaveAttribute('data-negative', 'true');
  });

  test('Below zero the verdict reads Over budget and the figure is marked negative', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page, {
      leftToSpend: { expected: -1200, best: -400, worst: -2000, verdict: 'over_budget' },
    });

    await overview.goto();
    await overview.waitForLoaded();

    await expect(overview.verdictBadge).toHaveText('Over budget');
    await expect(overview.leftToSpendFigure).toHaveAttribute('data-negative', 'true');
    await expect(overview.leftToSpendFigure).toHaveText(/^[-−]€1,200\.00$/);
  });

  test('Without a figure the headline shows an en dash named "No figure yet" and the rest renders', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page, {
      leftToSpend: { expected: 0, best: 0, worst: 0, verdict: null },
      money: { fundingTotal: 0, sources: [] },
    });

    await overview.goto();
    await overview.waitForLoaded();

    // No page-level empty state: the headline and the sections always render (FC4: one figure)
    await expect(page.locator('[data-figure="left-to-spend"]')).toHaveCount(1);
    await expect(overview.leftToSpendFigure).toHaveAccessibleName('No figure yet');
    await expect(overview.leftToSpendFigure).toHaveText('–');
    await expect(overview.verdictBadge).toHaveCount(0);
    await expect(overview.summary).toBeVisible();
    await expect(overview.funding).toBeVisible();
    await expect(overview.breakdownCard).toBeVisible();
  });

  test('"How is this calculated?" toggles a visible panel that names the capped grants', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page, { cappedGrants: ['Energy grant (mock)'] });

    await overview.goto();
    await overview.waitForLoaded();

    await expect(overview.explainToggle).toHaveText('How is this calculated?');
    await expect(overview.explainToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(overview.explainPanel).toBeHidden();

    await overview.explainToggle.click();
    await expect(overview.explainToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(overview.explainPanel).toBeVisible();
    await expect(overview.explainPanel).toContainText('Funding total plus Expected grants');
    await expect(overview.explainPanel).toContainText(
      'These grants count only up to their eligible-costs cap:',
    );
    await expect(overview.explainPanel.getByText('Energy grant (mock)')).toBeVisible();

    await overview.explainToggle.click();
    await expect(overview.explainPanel).toBeHidden();
  });

  test('The cap note is absent when no grant is capped', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForLoaded();
    await overview.explainToggle.click();

    await expect(overview.explainPanel).toBeVisible();
    await expect(overview.explainPanel).not.toContainText('eligible-costs cap');
  });

  test('The facts read Funding total · Expected cost · Expected grants · Paid · Still to pay', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForLoaded();

    const facts: Array<[string, string, string]> = [
      ['funding-total', 'Funding total', euro(25000)],
      ['expected-cost', 'Expected cost', euro(18800)],
      ['expected-grants', 'Expected grants', euro(1000)],
      ['paid', 'Paid', euro(2000)],
      ['still-to-pay', 'Still to pay', euro(1100)],
    ];
    await expect(overview.summary.locator('dt')).toHaveText(facts.map(([, label]) => label));
    for (const [id, , value] of facts) {
      await expect(overview.fact(id)).toHaveText(value);
    }
    await expect(overview.fact('paid').locator('[data-figure]')).toHaveAttribute(
      'data-figure',
      'paid',
    );
    await expect(overview.fact('still-to-pay').locator('[data-figure]')).toHaveAttribute(
      'data-figure',
      'still-to-pay',
    );
  });

  test('Paid and Still to pay link to Invoices; the first three facts are plain values', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForLoaded();

    for (const id of ['funding-total', 'expected-cost', 'expected-grants']) {
      await expect(overview.fact(id)).not.toHaveAttribute('href', /.+/);
    }
    // Paid opens the Paid chip; Still to pay opens the list as it is by default (the To pay chip)
    await expect(overview.fact('paid')).toHaveAttribute('href', /\/budget\/invoices\?status=paid/);
    await expect(overview.fact('still-to-pay')).toHaveAttribute('href', /\/budget\/invoices$/);

    await overview.fact('still-to-pay').click();
    await page.waitForURL((url) => url.pathname === '/budget/invoices');
    expect(new URL(page.url()).search).toBe('');
    await expect(new InvoicesPage(page).chip('pending')).toHaveAttribute('aria-pressed', 'true');
  });

  test('On desktop the five facts share one row', async ({ page }) => {
    test.skip(!isDesktop(page), 'five columns from 1024px');
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForLoaded();

    const ys: number[] = [];
    for (const id of [
      'funding-total',
      'expected-cost',
      'expected-grants',
      'paid',
      'still-to-pay',
    ]) {
      const box = await overview.fact(id).boundingBox();
      expect(box, id).not.toBeNull();
      ys.push(Math.round(box!.y));
    }
    expect(new Set(ys).size).toBe(1);
  });

  test('The retired labels and controls are gone', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForLoaded();
    await overview.waitForBreakdown();

    const main = page.locator('main');
    for (const retired of [
      'Remaining Budget',
      'Available funds',
      'Available Funds',
      'Outstanding',
      'Cost basis',
      'Subsidies',
      'Min',
      'Max',
    ]) {
      await expect(main.getByText(retired, { exact: true }), retired).toHaveCount(0);
    }
    await expect(page.locator('#cost-basis-select')).toHaveCount(0);
    await expect(page.locator('section[aria-label="Budget overview"]')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⋯ menu
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money overview — page actions (AC6)', { tag: '@responsive' }, () => {
  test('⋯ lists Print and "Budget overview for the bank" and nothing else', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForLoaded();
    await overview.openPageActions();

    await expect(page.getByRole('menuitem')).toHaveText(['Print', 'Budget overview for the bank']);
  });

  test('"Budget overview for the bank" opens the bank report with the preset type', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForLoaded();
    await overview.openPageActions();
    await expect(overview.bankOverviewAction).toHaveAttribute(
      'href',
      /\/budget\/reports\?type=budget-overview/,
    );
    await overview.bankOverviewAction.click();

    await page.waitForURL(
      (url) =>
        url.pathname === '/budget/reports' && url.searchParams.get('type') === 'budget-overview',
    );
  });

  test('Print calls the browser print dialog', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);
    await page.addInitScript(() => {
      (window as unknown as { __printCalls: number }).__printCalls = 0;
      window.print = () => {
        (window as unknown as { __printCalls: number }).__printCalls += 1;
      };
    });

    await overview.goto();
    await overview.waitForLoaded();
    await overview.openPageActions();
    await overview.printAction.click();

    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls))
      .toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2: funding rows
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money overview — funding rows (AC2)', { tag: '@responsive' }, () => {
  test('Every source is a row with "Allocated x of y" and a bar, always visible', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForLoaded();

    await expect(overview.fundingRows).toHaveCount(2);
    const loan = overview.fundingRow(B.sources.loan.id);
    await expect(loan).toBeVisible();
    await expect(loan).toContainText(B.sources.loan.name);
    await expect(loan).toContainText(`Allocated ${euro(14000)} of ${euro(15000)}`);
    await expect(loan.getByRole('img')).toBeVisible();
    await expect(overview.fundingRow(B.sources.savings.id)).toContainText(
      `Allocated ${euro(4800)} of ${euro(10000)}`,
    );

    // Normal rows carry no remaining / unallocated text and no disclosure button
    await expect(loan).not.toContainText(/Unallocated|Remaining|Over-allocated/);
    await expect(overview.fundingRows.getByRole('button')).toHaveCount(0);
    await expect(overview.funding.getByRole('heading', { name: 'Funding sources' })).toBeVisible();
    await expect(overview.fundingManageLink).toHaveAttribute('href', /\/budget\/financing/);
  });

  test('Only an over-allocation gets its own amount, shown as it is', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page, {
      sources: [
        mockFundingSource('mock-source-over', 'Bridge loan (mock)', 5000, 6000),
        mockFundingSource('mock-source-ok', 'Savings (mock)', 10000, 4800),
      ],
    });

    await overview.goto();
    await overview.waitForLoaded();

    const over = overview.fundingRow('mock-source-over');
    await expect(over).toContainText(`Allocated ${euro(6000)} of ${euro(5000)}`);
    await expect(over).toContainText(`Over-allocated by ${euro(1000)}`);
    await expect(overview.fundingRow('mock-source-ok')).not.toContainText('Over-allocated');
  });

  test('With no funding sources the section offers to add the first one', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page, { sources: [] });

    await overview.goto();
    await overview.waitForLoaded();

    await expect(overview.fundingRows).toHaveCount(0);
    await expect(overview.funding).toContainText('No funding sources added yet');
    await expect(
      overview.funding.getByRole('link', { name: 'Add your first funding source' }),
    ).toHaveAttribute('href', /\/budget\/sources/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 / AC10 (d)(f): the four views, down to cost lines (table surface)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money overview — breakdown views (AC3)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!isDesktop(page), 'table surface assertions run on the desktop project');
    await mockMoneyOverview(page);
  });

  test('By area is the default and ends with Not yet split', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto();
    await overview.waitForBreakdown();

    await expect(overview.viewChip('area')).toHaveAttribute('aria-pressed', 'true');
    expect(new URL(page.url()).searchParams.has('by')).toBe(false);
    await expect(overview.table).toBeVisible();
    expect(await overview.topLevelKeys()).toEqual([
      `area:${B.areas.ground}`,
      `area:${B.areas.garden}`,
      'area:none',
      'not-yet-split',
    ]);
    await expect(overview.row('not-yet-split')).toContainText('Not yet split');
    await expect(overview.cell('not-yet-split', 'stillToPay')).toHaveText(euro(300));
    await expect(overview.columnHeaders()).toHaveText([
      'Name',
      'Expected cost',
      'Paid',
      'Still to pay',
    ]);
  });

  const VIEW_TOP_LEVEL: Array<[BreakdownViewValue, string[]]> = [
    ['area', [`area:${B.areas.ground}`, `area:${B.areas.garden}`, 'area:none', 'not-yet-split']],
    ['type', ['type:work_items', 'type:household_items', 'not-yet-split']],
    [
      'category',
      [
        `category:${B.categories.materials.id}`,
        `category:${B.categories.labour.id}`,
        'category:none',
        'not-yet-split',
      ],
    ],
    [
      'source',
      [
        `source:${B.sources.loan.id}`,
        `source:${B.sources.savings.id}`,
        'source:none',
        'not-yet-split',
      ],
    ],
  ];

  for (const [view, keys] of VIEW_TOP_LEVEL) {
    test(`By ${view}: the groups render and add up to the same total (AC3, AC10 f)`, async ({
      page,
    }) => {
      const overview = new BudgetOverviewPage(page);

      await overview.goto();
      await overview.waitForBreakdown();
      if (view !== 'area') {
        await overview.viewChip(view).click();
        await page.waitForURL((url) => url.searchParams.get('by') === view);
      }
      await expect(overview.viewChip(view)).toHaveAttribute('aria-pressed', 'true');

      expect(await overview.topLevelKeys()).toEqual(keys);
      // Every view adds up to the headline facts: Expected cost, Paid and Still to pay
      await expect(overview.totalCell('expectedCost')).toHaveText(euro(TOTAL_EXPECTED));
      await expect(overview.totalCell('paid')).toHaveText(euro(2000));
      await expect(overview.totalCell('stillToPay')).toHaveText(euro(1100));
      await expectTopLevelAddsUp(overview, 'expectedCost');
      await expectTopLevelAddsUp(overview, 'paid');
      await expectTopLevelAddsUp(overview, 'stillToPay');
      await expect(overview.total).toContainText('Total');
    });
  }

  test('The By chips are labelled Area, Type, Cost category and Funding source', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto();
    await overview.waitForBreakdown();

    await expect(
      overview.breakdownCard.getByRole('group', { name: 'Break down by' }),
    ).toBeVisible();
    await expect(overview.viewChip('area')).toHaveText('Area');
    await expect(overview.viewChip('type')).toHaveText('Type');
    await expect(overview.viewChip('category')).toHaveText('Cost category');
    await expect(overview.viewChip('source')).toHaveText('Funding source');
  });

  test('By area goes down to cost lines: area › area › task › cost line', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    const task = `item:work_item:${B.items.cabinets}`;
    const units = `line:${B.lines.units}`;
    const fitting = `line:${B.lines.fitting}`;

    await overview.goto();
    await overview.waitForBreakdown();

    // Collapsed children stay in the DOM but are hidden
    await expect(overview.row(`area:${B.areas.kitchen}`)).toBeHidden();
    await overview.expand(`area:${B.areas.ground}`);
    await expect(overview.row(`area:${B.areas.kitchen}`)).toContainText('Kitchen (mock)');
    await overview.expand(`area:${B.areas.kitchen}`);
    await expect(overview.row(task)).toContainText('Fit kitchen cabinets (mock)');
    await expect(overview.row(task).getByRole('link')).toHaveAttribute(
      'href',
      new RegExp(`/work-items/${B.items.cabinets}`),
    );
    await overview.expand(task);

    // The line rows carry the shared state chip and the funding source name
    await expect(overview.row(units)).toContainText('Cabinet units (mock)');
    await expect(overview.row(units)).toContainText('Estimate');
    await expect(overview.row(units)).toContainText(B.sources.savings.name);
    await expect(overview.row(fitting)).toContainText('Offered');
    await expect(overview.cell(units, 'expectedCost')).toHaveText(euro(10000));
    await expect(overview.cell(fitting, 'expectedCost')).toHaveText(euro(4000));

    // Collapsing the root hides its whole subtree again
    await overview.toggle(`area:${B.areas.ground}`).click();
    await expect(overview.row(units)).toBeHidden();
    await expect(overview.row(`area:${B.areas.kitchen}`)).toBeHidden();
  });

  test('Lines without a task sit under "Without a task" inside No area', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto();
    await overview.waitForBreakdown();
    await expect(overview.row('area:none')).toContainText('No area');
    await overview.expand('area:none');

    await expect(overview.row('orphans')).toContainText('Without a task');
    await expect(overview.row(`item:household_item:${B.items.table}`)).toContainText(
      'Dining table (mock)',
    );
    await overview.expand('orphans');
    await expect(overview.row(`line:${B.lines.loose}`)).toContainText('Loose line (mock)');
    await expect(overview.cell('orphans', 'expectedCost')).toHaveText(euro(500));
    await expect(overview.cell('area:none', 'expectedCost')).toHaveText(euro(2000));
  });

  test('By type lists Tasks and Purchases; By funding source hides the source name on lines', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto('?by=type');
    await overview.waitForBreakdown();
    await expect(overview.row('type:work_items')).toContainText('Tasks');
    await expect(overview.row('type:household_items')).toContainText('Purchases');
    await overview.expand('type:work_items');
    await expect(overview.row('orphans')).toContainText('Without a task');

    await overview.viewChip('source').click();
    await page.waitForURL((url) => url.searchParams.get('by') === 'source');
    await overview.expand(`source:${B.sources.savings.id}`);
    await expect(overview.row(`line:${B.lines.units}`)).toBeVisible();
    await expect(overview.row(`line:${B.lines.units}`)).not.toContainText(B.sources.savings.name);
    await expect(overview.row('source:none')).toContainText('Unassigned');
  });

  test('Show estimates at Low and High move estimates but never an offer at face value', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    const units = `line:${B.lines.units}`;
    const fitting = `line:${B.lines.fitting}`;

    await overview.goto();
    await overview.waitForBreakdown();
    await overview.expand(`area:${B.areas.ground}`);
    await overview.expand(`area:${B.areas.kitchen}`);
    await overview.expand(`item:work_item:${B.items.cabinets}`);

    await expect(overview.estimateChip('expected')).toHaveAttribute('aria-pressed', 'true');
    await expect(overview.breakdownCard.getByText('Show estimates at')).toBeVisible();

    await overview.estimateChip('low').click();
    await page.waitForURL((url) => url.searchParams.get('estimate') === 'low');
    await expect(overview.cell(units, 'expectedCost')).toHaveText(euro(9000));
    await expect(overview.cell(fitting, 'expectedCost')).toHaveText(euro(4000));
    await expect(overview.totalCell('expectedCost')).toHaveText(euro(17600));
    await expect(overview.total).toContainText('Total for the current settings');
    await expect(overview.headline).toContainText('Whole project');

    await overview.estimateChip('high').click();
    await page.waitForURL((url) => url.searchParams.get('estimate') === 'high');
    await expect(overview.cell(units, 'expectedCost')).toHaveText(euro(11000));
    await expect(overview.cell(fitting, 'expectedCost')).toHaveText(euro(4000));
    await expect(overview.totalCell('expectedCost')).toHaveText(euro(20000));

    await overview.estimateChip('expected').click();
    await page.waitForURL((url) => !url.searchParams.has('estimate'));
    await expect(overview.cell(units, 'expectedCost')).toHaveText(euro(10000));
    await expect(overview.total).not.toContainText('for the current settings');
    // The headline figure never moves with the breakdown settings
    await expect(overview.leftToSpendFigure).toHaveText(euro(7200));
  });

  test('Show › Grants adds the Grants and After grants columns', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    const units = `line:${B.lines.units}`;

    await overview.goto();
    await overview.waitForBreakdown();
    await expect(overview.breakdownCard.getByText('Show', { exact: true })).toBeVisible();
    await expect(overview.grantsChip).toHaveText('Grants');
    await expect(overview.grantsChip).toHaveAttribute('aria-pressed', 'false');
    await expect(
      overview.breakdownCard.getByRole('group', { name: 'Show', exact: true }),
    ).toBeVisible();
    await expect(overview.columnHeaders()).toHaveCount(4);

    await overview.grantsChip.click();
    await page.waitForURL((url) => url.searchParams.get('grants') === '1');
    await expect(overview.grantsChip).toHaveAttribute('aria-pressed', 'true');
    await expect(overview.columnHeaders()).toHaveText([
      'Name',
      'Expected cost',
      'Grants',
      'After grants',
      'Paid',
      'Still to pay',
    ]);
    await overview.expand(`area:${B.areas.ground}`);
    await overview.expand(`area:${B.areas.kitchen}`);
    await overview.expand(`item:work_item:${B.items.cabinets}`);
    await expect(overview.cell(units, 'grants')).toHaveText(euro(1000));
    await expect(overview.cell(units, 'afterGrants')).toHaveText(euro(9000));
    await expect(overview.totalCell('afterGrants')).toHaveText(euro(17800));

    await overview.grantsChip.click();
    await page.waitForURL((url) => !url.searchParams.has('grants'));
    await expect(overview.columnHeaders()).toHaveCount(4);
  });

  test('Costs are always positive and there is no correction row', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto('?grants=1');
    await overview.waitForBreakdown();

    for (const view of ['area', 'type', 'category', 'source'] as const) {
      await overview.viewChip(view).click();
      await expect(overview.viewChip(view)).toHaveAttribute('aria-pressed', 'true');
      const costCells = overview.table.locator('td[data-testid$="-expectedCost"]');
      const texts = await costCells.allInnerTexts();
      expect(texts.length).toBeGreaterThan(0);
      for (const text of texts) expect(text.trim()).not.toMatch(/^[-−]/);
      await expect(overview.table).not.toContainText(/Subsid(y|ies)|Correction/i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// URL state
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money overview — URL parameters (AC10 d)', { tag: '@responsive' }, () => {
  test('?by, ?paymentStatus, ?estimate, ?grants and ?deselectedSources survive a reload', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForBreakdown();
    await overview.viewChip('source').click();
    await overview.estimateChip('high').click();
    await overview.grantsChip.click();
    await overview.openSources();
    await overview.sourceCheckbox(B.sources.loan.id).click();
    await overview.sourcesDone.click();
    await page.waitForURL((url) => url.searchParams.has('deselectedSources'));

    const before = new URL(page.url()).searchParams;
    expect(before.get('by')).toBe('source');
    expect(before.get('estimate')).toBe('high');
    expect(before.get('grants')).toBe('1');
    expect(before.get('deselectedSources')).toBe(B.sources.loan.id);

    await page.reload();
    await overview.waitForBreakdown();

    const after = new URL(page.url()).searchParams;
    expect(after.get('by')).toBe('source');
    expect(after.get('estimate')).toBe('high');
    expect(after.get('grants')).toBe('1');
    expect(after.get('deselectedSources')).toBe(B.sources.loan.id);
    await expect(overview.viewChip('source')).toHaveAttribute('aria-pressed', 'true');
    await expect(overview.estimateChip('high')).toHaveAttribute('aria-pressed', 'true');
    await expect(overview.grantsChip).toHaveAttribute('aria-pressed', 'true');
    await expect(overview.sourcesButton).toContainText('2 of 3');
  });

  test('?paymentStatus=outstanding survives a reload', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForBreakdown();
    await overview.paymentChip('outstanding').click();
    await page.waitForURL((url) => url.searchParams.get('paymentStatus') === 'outstanding');
    await page.reload();
    await overview.waitForBreakdown();

    await expect(overview.paymentChip('outstanding')).toHaveAttribute('aria-pressed', 'true');
    await expect(overview.paymentChip('all')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Unknown values and explicit defaults are dropped from the URL', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto('?by=bogus&estimate=expected&paymentStatus=nonsense&grants=0');
    await overview.waitForBreakdown();

    await page.waitForURL((url) => url.search === '');
    await expect(overview.viewChip('area')).toHaveAttribute('aria-pressed', 'true');
    await expect(overview.paymentChip('all')).toHaveAttribute('aria-pressed', 'true');
    await expect(overview.estimateChip('expected')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Changing a setting replaces the history entry instead of pushing one', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForBreakdown();
    const lengthBefore = await page.evaluate(() => window.history.length);
    await overview.viewChip('category').click();
    await page.waitForURL((url) => url.searchParams.get('by') === 'category');
    await overview.estimateChip('low').click();
    await page.waitForURL((url) => url.searchParams.get('estimate') === 'low');

    expect(await page.evaluate(() => window.history.length)).toBe(lengthBefore);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC7: phone
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money overview — phone (AC7)', { tag: '@responsive' }, () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!isPhone(page), 'phone layout');
    await mockMoneyOverview(page);
  });

  test('Headline tiles are full width and the facts sit in two columns', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto();
    await overview.waitForLoaded();

    const viewport = page.viewportSize()!.width;
    const headlineBox = await overview.headline.boundingBox();
    expect(headlineBox!.width).toBeGreaterThan(viewport * 0.85);

    const box = async (id: string) => (await overview.fact(id).boundingBox())!;
    const [fundingTotal, expectedCost, expectedGrants, paid] = [
      await box('funding-total'),
      await box('expected-cost'),
      await box('expected-grants'),
      await box('paid'),
    ];
    // Two columns: the first two share a row, the third wraps beneath the first
    expect(Math.abs(fundingTotal.y - expectedCost.y)).toBeLessThan(4);
    expect(expectedCost.x).toBeGreaterThan(fundingTotal.x + 40);
    expect(expectedGrants.y).toBeGreaterThan(fundingTotal.y + 20);
    expect(Math.abs(expectedGrants.x - fundingTotal.x)).toBeLessThan(4);
    expect(Math.abs(paid.y - expectedGrants.y)).toBeLessThan(4);
  });

  test('The breakdown is a drill-down list, not a table', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto();
    await overview.waitForBreakdown();

    await expect(overview.table).toBeHidden();
    await expect(overview.list).toBeVisible();
    const ground = overview.listRow(`area:${B.areas.ground}`);
    await expect(ground).toContainText('Ground floor (mock)');
    await expect(ground).toContainText(euro(14000));
    await expect(ground).toContainText('Paid: €0.00');
    await expect(ground).toContainText('Still to pay: €0.00');
  });

  test('Tapping a group shows its children under an h3 with focus; Back returns', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto();
    await overview.waitForBreakdown();

    await overview.listRow(`area:${B.areas.ground}`).click();
    await expect(overview.listHeading).toHaveText('Ground floor (mock)');
    await expect(overview.listHeading).toBeFocused();
    await expect(overview.list.getByRole('heading', { level: 3 })).toHaveText(
      'Ground floor (mock)',
    );
    await expect(overview.status).toHaveText('Showing Ground floor (mock)');
    await expect(overview.listBack).toHaveText(/Back to the breakdown/);
    await expect(overview.listRow(`area:${B.areas.kitchen}`)).toBeVisible();
    await expect(overview.listRow(`area:${B.areas.garden}`)).toHaveCount(0);

    // Down to a cost line: task rows link, line rows are plain
    await overview.listRow(`area:${B.areas.kitchen}`).click();
    await overview.listRow(`item:work_item:${B.items.cabinets}`).click();
    await expect(overview.listHeading).toHaveText('Fit kitchen cabinets (mock)');
    await expect(overview.listRow(`line:${B.lines.units}`)).toContainText('Cabinet units (mock)');
    await expect(overview.listRow(`line:${B.lines.units}`)).toContainText(euro(10000));

    await overview.listBack.click();
    await expect(overview.listHeading).toHaveText('Kitchen (mock)');
    await overview.listBack.click();
    await expect(overview.listHeading).toHaveText('Ground floor (mock)');
    await overview.listBack.click();
    await expect(overview.listHeading).toHaveCount(0);
    await expect(overview.listRow(`area:${B.areas.garden}`)).toBeVisible();
    // Focus returns to the list
    await expect(overview.list.locator('button').first()).toBeFocused();
  });

  test('Cost lines at the bottom of the list are plain rows, not links', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto('?by=type');
    await overview.waitForBreakdown();
    await overview.listRow('type:work_items').click();

    await expect(overview.listRow(`item:work_item:${B.items.hedge}`)).toBeVisible();
    // The task has cost lines, so it drills in like a group; the lines themselves are plain rows
    await overview.listRow(`item:work_item:${B.items.hedge}`).click();
    // The drilled-in heading links to that task's page
    await expect(overview.listHeadingLink).toBeVisible();
    await expect(overview.listHeadingLink).toHaveAttribute(
      'href',
      new RegExp(`${routeUrl('workItem', { id: B.items.hedge })}(\\?|$)`),
    );
    await expect(overview.listRow(`line:${B.lines.plants}`)).not.toHaveAttribute('href', /.+/);
  });

  test('The page does not scroll sideways', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);

    await overview.goto('?grants=1');
    await overview.waitForBreakdown();

    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
    }));
    expect(overflow.doc).toBeLessThanOrEqual(0);
    expect(overflow.body).toBeLessThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// States, layout and dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money overview — states and layout', { tag: '@responsive' }, () => {
  test('An overview failure shows the error card and Retry loads the page', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    let fail = true;
    await mockMoneyOverview(page);
    await page.route('**/api/budget/overview', async (route) => {
      if (fail) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'boom', details: {} } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockOverviewResponse()),
        });
      }
    });

    await overview.goto();
    await expect(overview.errorCard).toBeVisible();
    await expect(overview.heading).toBeVisible();
    await expect(overview.headline).toHaveCount(0);

    fail = false;
    await overview.retryButton.click();
    await expect(overview.headline).toBeVisible();
    await expect(overview.errorCard).toHaveCount(0);
  });

  test('A breakdown failure keeps the headline and offers Retry inside the card', async ({
    page,
  }) => {
    const overview = new BudgetOverviewPage(page);
    let fail = true;
    await mockMoneyOverview(page);
    await page.route('**/api/budget/breakdown**', async (route) => {
      if (fail) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'boom', details: {} } }),
        });
      } else {
        await route.fallback();
      }
    });

    await overview.goto();
    await overview.waitForLoaded();

    await expect(overview.leftToSpendFigure).toHaveText(euro(7200));
    await expect(overview.breakdownCard).toContainText('could not be refreshed');
    fail = false;
    await overview.breakdownCard.getByRole('button', { name: 'Retry' }).click();
    await overview.waitForBreakdown();
    await expect(overview.breakdownCard.getByRole('alert')).toHaveCount(0);
  });

  test('A project without cost lines shows the breakdown empty state', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);
    await page.route('**/api/budget/breakdown**', async (route) => {
      const empty = {
        sourceOptions: [],
        hasUnassignedLines: false,
        lines: [],
        items: [],
        byArea: [],
        noArea: null,
        orphanLines: null,
        byType: {
          work_items: zeroFigures(),
          household_items: zeroFigures(),
        },
        byCategory: [],
        bySource: [],
        notYetSplit: null,
        total: zeroFigures(),
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ breakdown: empty }),
      });
    });

    await overview.goto();
    await overview.waitForBreakdown();

    await expect(overview.breakdownCard).toContainText(
      'Costs appear here once tasks or purchases have cost lines.',
    );
    await expect(overview.table).toHaveCount(0);
  });

  test('The page renders in dark mode without sideways scroll', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForBreakdown();
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

    await expect(overview.heading).toBeVisible();
    await expect(overview.headline).toBeVisible();
    // The headline card paints a dark surface and the figure text stays readable (light on dark)
    const colors = await overview.headline.evaluate((el) => {
      const figure = el.querySelector('[data-figure]') as HTMLElement;
      return {
        background: getComputedStyle(el).backgroundColor,
        text: getComputedStyle(figure).color,
      };
    });
    const luminance = (rgb: string): number => {
      const [r = 0, g = 0, b = 0] = (rgb.match(/\d+(\.\d+)?/g) ?? []).map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    expect(luminance(colors.background)).toBeLessThan(0.5);
    expect(luminance(colors.text)).toBeGreaterThan(luminance(colors.background));

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });

  test('The page does not scroll sideways at this viewport', async ({ page }) => {
    const overview = new BudgetOverviewPage(page);
    await mockMoneyOverview(page);

    await overview.goto();
    await overview.waitForBreakdown();

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });
});

function zeroFigures() {
  const zero = { expected: 0, best: 0, worst: 0 };
  return {
    expectedCost: zero,
    expectedGrants: zero,
    afterGrants: zero,
    paid: 0,
    stillToPay: 0,
    notYetPaid: zero,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC9: an offer-linked line counts at face value (real API)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money overview — offers at face value (AC9)', () => {
  test('An offer-linked cost line shows its amount at Low, Expected and High, as on the task page', async ({
    page,
    testPrefix,
  }) => {
    test.skip(!isDesktop(page), 'table surface assertions run on the desktop project');
    test.slow();
    const overview = new BudgetOverviewPage(page);
    let workItemId = '';
    let vendorId = '';
    let sourceId = '';
    try {
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Offer Source`,
        totalAmount: 5000,
      });
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Offer Vendor` });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} Offer Task` });

      const offerLine = await createLine(page, workItemId, {
        description: `${testPrefix} Offer line`,
        plannedAmount: 1000,
        budgetSourceId: sourceId,
      });
      const estimateLine = await createLine(page, workItemId, {
        description: `${testPrefix} Estimate line`,
        plannedAmount: 500,
        budgetSourceId: sourceId,
      });
      const offer = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
        data: {
          invoiceNumber: `${testPrefix}-OFFER`,
          amount: 1000,
          date: '2026-03-01',
          status: 'quotation',
        },
      });
      expect(offer.ok(), `POST offer: ${offer.status()}`).toBeTruthy();
      const offerId = ((await offer.json()) as { invoice: { id: string } }).invoice.id;
      const link = await page.request.post(`/api/invoices/${offerId}/budget-lines`, {
        data: { workItemBudgetId: offerLine, itemizedAmount: 1000 },
      });
      expect(link.ok(), `POST link: ${link.status()}`).toBeTruthy();

      // The API: face value in every scenario for the offer line, a spread for the estimate
      const api = await page.request.get(API.budgetBreakdown);
      expect(api.ok()).toBeTruthy();
      const lines = (
        (await api.json()) as {
          breakdown: {
            lines: Array<{
              id: string;
              figures: { expectedCost: { expected: number; best: number; worst: number } };
            }>;
          };
        }
      ).breakdown.lines;
      const offerApi = lines.find((l) => l.id === offerLine)!.figures.expectedCost;
      expect(offerApi).toEqual({ expected: 1000, best: 1000, worst: 1000 });
      const estimateApi = lines.find((l) => l.id === estimateLine)!.figures.expectedCost;
      expect(estimateApi.best).toBeLessThan(estimateApi.expected);
      expect(estimateApi.worst).toBeGreaterThan(estimateApi.expected);

      // The page: the same amount at Low, Expected and High
      await overview.goto();
      await overview.waitForBreakdown();
      await overview.expand('area:none');
      await overview.expand(`item:work_item:${workItemId}`);
      const offerCell = overview.cell(`line:${offerLine}`, 'expectedCost');
      const estimateCell = overview.cell(`line:${estimateLine}`, 'expectedCost');
      await expect(overview.row(`line:${offerLine}`)).toContainText('Offered');

      await expect(offerCell).toHaveText(euro(1000));
      const expectedText = await estimateCell.innerText();
      await overview.estimateChip('low').click();
      await page.waitForURL((url) => url.searchParams.get('estimate') === 'low');
      await expect(offerCell).toHaveText(euro(1000));
      await expect(estimateCell).not.toHaveText(expectedText);
      await overview.estimateChip('high').click();
      await page.waitForURL((url) => url.searchParams.get('estimate') === 'high');
      await expect(offerCell).toHaveText(euro(1000));
      await expect(estimateCell).not.toHaveText(expectedText);

      // The task page shows the same line at the same amount
      const task = new WorkItemDetailPage(page);
      await task.goto(workItemId);
      await task.costLines.waitForLoaded();
      const row = task.costLines.row(`${testPrefix} Offer line`);
      await expect(row).toBeVisible();
      const gross = parseMoney(await task.costLines.gross(row).innerText());
      expect(gross).toBe(100000);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
    }
  });
});

async function createLine(
  page: Page,
  workItemId: string,
  data: { description: string; plannedAmount: number; budgetSourceId: string },
): Promise<string> {
  const response = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
    data: { confidence: 'own_estimate', ...data },
  });
  expect(
    response.ok(),
    `POST cost line: ${response.status()} ${await response.text()}`,
  ).toBeTruthy();
  return ((await response.json()) as { budget: { id: string } }).budget.id;
}
