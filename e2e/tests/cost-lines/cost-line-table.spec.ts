/**
 * E2E tests for the cost line table (#2235, EPIC-21 P4.3): `CostLinesSection` / `CostLineTable`
 * on the task page, the purchase page and the offer / invoice page.
 *
 * - AC1 the State chip per line: Estimate, Offered, Invoiced, Paid, Submitted;
 * - AC3 amounts are gross; the net amount and VAT sit in a tooltip that opens on hover and on
 *   keyboard focus and closes with Escape (task and purchase pages);
 * - AC4 an offer / invoice shows quantity × unit price, Entered as, gross and the task or
 *   purchase each line belongs to, the gross total, "Not yet split" with Split, and "over";
 * - phones show two-line cards instead of the table; dark mode keeps the table legible.
 *
 * Data is created through the API with the per-test `testPrefix`; all names are invented.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createCostLine,
  createFundingSource,
  createInvoice,
  createLinkedCostLine,
  createPurchase,
  createTask,
  createVendor,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import type { InvoiceStatus, SeedCleanup } from '../../fixtures/costLineSeed.js';
import { enableDarkTheme, expectLegibleInDark } from '../../fixtures/darkMode.js';
import { CostLinesPanel } from '../../pages/components/CostLinesPanel.js';

let cleanup: SeedCleanup;

test.beforeEach(() => {
  cleanup = newCleanup();
});

test.afterEach(async () => {
  await runCleanup(cleanup);
});

function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 768;
}

/** A task with one line per state: Estimate, Offered, Invoiced, Paid and Submitted. */
async function seedAllStates(page: Page, prefix: string) {
  const sourceId = await createFundingSource(page, cleanup, `${prefix} Savings`);
  const taskId = await createTask(page, cleanup, `${prefix} Kitchen task`);
  const vendorId = await createVendor(page, cleanup, `${prefix} Example Joinery Ltd`);
  const base = { kind: 'work_item' as const, hostId: taskId, budgetSourceId: sourceId };

  await createCostLine(page, {
    ...base,
    description: `${prefix} Estimate line`,
    plannedAmount: 100,
  });
  const states: Array<[string, InvoiceStatus]> = [
    ['Offered line', 'quotation'],
    ['Invoiced line', 'pending'],
    ['Paid line', 'paid'],
    ['Submitted line', 'claimed'],
  ];
  for (const [index, [label, status]] of states.entries()) {
    const invoice = await createInvoice(page, cleanup, vendorId, {
      amount: 1000,
      status,
      invoiceNumber: `${prefix}-DOC${index + 1}`,
    });
    await createLinkedCostLine(page, invoice.id, {
      ...base,
      description: `${prefix} ${label}`,
      plannedAmount: 200,
      itemizedAmount: 200,
    });
  }
  return { taskId, sourceId, vendorId };
}

test.describe('Cost line table - state chip (AC1)', { tag: '@responsive' }, () => {
  test('each line shows its state: Estimate, Offered, Invoiced, Paid, Submitted', async ({
    page,
    testPrefix,
  }) => {
    const { taskId } = await seedAllStates(page, testPrefix);
    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    await expect(panel.rows()).toHaveCount(5);
    const chip = (label: string) => panel.stateChip(panel.row(`${testPrefix} ${label}`));
    // An Estimate adds its Basis as text beside the chip, so the state never depends on colour
    await expect(chip('Estimate line')).toHaveText('Estimate');
    await expect(panel.row(`${testPrefix} Estimate line`)).toContainText('Own estimate');
    await expect(chip('Offered line')).toHaveText('Offered');
    await expect(chip('Invoiced line')).toHaveText('Invoiced');
    await expect(chip('Paid line')).toHaveText('Paid');
    await expect(chip('Submitted line')).toContainText('Submitted');
  });

  test('lines are grouped into Estimates and one group per offer or invoice', async ({
    page,
    testPrefix,
  }) => {
    const { taskId } = await seedAllStates(page, testPrefix);
    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    await expect(panel.groupHeading('Estimates')).toBeVisible();
    await expect(panel.groupHeading(`Offer ${testPrefix}-DOC1`)).toBeVisible();
    await expect(panel.groupHeading(`Invoice ${testPrefix}-DOC2`)).toBeVisible();
    // The offer group links to its page
    await expect(
      panel.groupHeading(`Offer ${testPrefix}-DOC1`).getByRole('link').first(),
    ).toHaveAttribute('href', /\/invoices\//);
  });

  test('a purchase shows the same states', async ({ page, testPrefix }) => {
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Savings`);
    const purchaseId = await createPurchase(page, cleanup, `${testPrefix} Oven`);
    const vendorId = await createVendor(page, cleanup, `${testPrefix} Example Appliances Ltd`);
    const base = { kind: 'household_item' as const, hostId: purchaseId, budgetSourceId: sourceId };
    await createCostLine(page, {
      ...base,
      description: `${testPrefix} Oven estimate`,
      plannedAmount: 80,
    });
    const offer = await createInvoice(page, cleanup, vendorId, {
      amount: 500,
      status: 'quotation',
    });
    await createLinkedCostLine(page, offer.id, {
      ...base,
      description: `${testPrefix} Oven offer`,
      plannedAmount: 300,
      itemizedAmount: 300,
    });

    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('householdItem', { id: purchaseId }));
    await panel.waitForLoaded();

    await expect(panel.rows()).toHaveCount(2);
    await expect(panel.stateChip(panel.row(`${testPrefix} Oven estimate`))).toContainText(
      'Estimate',
    );
    await expect(panel.stateChip(panel.row(`${testPrefix} Oven offer`))).toHaveText('Offered');
  });
});

test.describe('Cost line table - gross with net in a tooltip (AC3)', { tag: '@responsive' }, () => {
  test('a net-entered line shows gross; the net amount and VAT open on hover and focus, Escape closes', async ({
    page,
    testPrefix,
  }) => {
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Savings`);
    const taskId = await createTask(page, cleanup, `${testPrefix} Paint task`);
    // 100.00 entered net at the default VAT rate (19%) is 119.00 gross
    await createCostLine(page, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Net line`,
      plannedAmount: 100,
      includesVat: false,
    });

    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    const row = panel.row(`${testPrefix} Net line`);
    await expect(panel.gross(row)).toHaveText(/119\.00/);
    const trigger = panel.netTipButton(row);
    await expect(trigger).toBeVisible();

    if (isPhone(page)) {
      // Touch has no hover or focus: a tap opens the tip, a second tap closes it
      await trigger.tap();
    } else {
      await trigger.hover();
    }
    await expect(panel.tooltip.first()).toHaveCSS('opacity', '1');
    await expect(panel.tooltip.first()).toContainText('Net amount');
    await expect(panel.tooltip.first()).toContainText('100.00');
    await expect(panel.tooltip.first()).toContainText('19%');

    // Escape closes the tip without moving focus or the pointer
    await trigger.focus();
    await page.keyboard.press('Escape');
    await expect(panel.tooltip.first()).toHaveCSS('opacity', '0');
  });

  test('keyboard focus alone opens the tip', async ({ page, testPrefix }) => {
    test.skip(isPhone(page), 'phones use a tap, covered by the previous test');
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Savings`);
    const purchaseId = await createPurchase(page, cleanup, `${testPrefix} Sofa`);
    await createCostLine(page, {
      kind: 'household_item',
      hostId: purchaseId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Sofa line`,
      plannedAmount: 200,
      includesVat: false,
    });

    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('householdItem', { id: purchaseId }));
    await panel.waitForLoaded();

    const row = panel.row(`${testPrefix} Sofa line`);
    await expect(panel.gross(row)).toHaveText(/238\.00/);
    await panel.netTipButton(row).focus();
    await expect(panel.tooltip.first()).toHaveCSS('opacity', '1');
    await expect(panel.tooltip.first()).toContainText('200.00');
  });
});

test.describe('Cost line table - offer and invoice page (AC4)', { tag: '@responsive' }, () => {
  test('rows show quantity × unit price, Entered as, gross and the task they belong to', async ({
    page,
    testPrefix,
  }) => {
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Savings`);
    const taskId = await createTask(page, cleanup, `${testPrefix} Cabinet task`);
    const vendorId = await createVendor(page, cleanup, `${testPrefix} Example Joinery Ltd`);
    const offer = await createInvoice(page, cleanup, vendorId, {
      amount: 1000,
      status: 'quotation',
    });
    // 4 pcs x 50.00 net (plannedAmount = unit total) = 200.00 net, 238.00 gross
    await createLinkedCostLine(page, offer.id, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Cabinet door`,
      plannedAmount: 200,
      quantity: 4,
      unit: 'pcs',
      unitPrice: 50,
      includesVat: false,
      itemizedAmount: 238,
    });

    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('invoice', { id: offer.id }));
    await panel.waitForLoaded();

    const row = panel.row(`${testPrefix} Cabinet door`);
    await expect(row).toContainText('4 pcs × €50.00');
    // Entered as: a table column, and the Net badge on the two-line cards
    await expect(row.getByText('Net', { exact: true })).toBeVisible();
    await expect(panel.gross(row)).toHaveText('€238.00');
    // Document mode groups by task: the task link is the group heading, not a column (#2239)
    await expect(
      panel.groupHeading(`${testPrefix} Cabinet task`).getByRole('link', {
        name: `${testPrefix} Cabinet task`,
      }),
    ).toBeVisible();
    await expect(panel.stateChip(row)).toHaveText('Offered');
    await expect(panel.total()).toHaveText('€238.00');
  });

  test('the part of the offer that is not split shows "Not yet split" with Split', async ({
    page,
    testPrefix,
  }) => {
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Savings`);
    const taskId = await createTask(page, cleanup, `${testPrefix} Tile task`);
    const vendorId = await createVendor(page, cleanup, `${testPrefix} Example Tiles Ltd`);
    const offer = await createInvoice(page, cleanup, vendorId, {
      amount: 1000,
      status: 'quotation',
    });
    await createLinkedCostLine(page, offer.id, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Tile line`,
      plannedAmount: 400,
      includesVat: true,
      itemizedAmount: 400,
    });

    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('invoice', { id: offer.id }));
    await panel.waitForLoaded();

    await expect(panel.notYetSplit()).toHaveText('Not yet split · €600.00');
    await expect(
      panel.splitButton(),
      'Split is offered while part of the offer is unsplit',
    ).toBeVisible();
    await expect(panel.splitButton()).toHaveAccessibleName(
      'Split the rest of this offer into cost lines',
    );
  });

  test('lines worth more than the offer show "Lines are € over" without Split', async ({
    page,
    testPrefix,
  }) => {
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Savings`);
    const taskId = await createTask(page, cleanup, `${testPrefix} Over task`);
    const vendorId = await createVendor(page, cleanup, `${testPrefix} Example Doors Ltd`);
    const offer = await createInvoice(page, cleanup, vendorId, {
      amount: 1000,
      status: 'quotation',
    });
    await createLinkedCostLine(page, offer.id, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Big line`,
      plannedAmount: 800,
      includesVat: true,
      itemizedAmount: 800,
    });
    // The server never lets lines exceed the offer, so the over state is simulated with the
    // remainder it would report after the offer was revised down by 200
    await page.route(`**/api/invoices/${offer.id}/budget-lines`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const body = (await response.json()) as { remainingAmount: number };
      await route.fulfill({ response, json: { ...body, remainingAmount: -200 } });
    });

    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('invoice', { id: offer.id }));
    await panel.waitForLoaded();

    await expect(panel.over()).toHaveText('Lines are €200.00 over');
    await expect(panel.notYetSplit()).toHaveCount(0);
    await expect(panel.splitButton()).toHaveCount(0);
  });

  test('an offer without lines shows the empty state with Split', async ({ page, testPrefix }) => {
    const vendorId = await createVendor(page, cleanup, `${testPrefix} Example Roofing Ltd`);
    const offer = await createInvoice(page, cleanup, vendorId, {
      amount: 800,
      status: 'quotation',
    });

    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('invoice', { id: offer.id }));
    await panel.waitForLoaded();

    await expect(panel.emptyTitle).toBeVisible();
    await expect(panel.section).toContainText('Split this offer into cost lines');
    await expect(panel.emptySplitButton()).toBeVisible();
  });

  test('a fully split offer shows neither Not yet split nor Split', async ({
    page,
    testPrefix,
  }) => {
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Savings`);
    const taskId = await createTask(page, cleanup, `${testPrefix} Floor task`);
    const vendorId = await createVendor(page, cleanup, `${testPrefix} Example Floors Ltd`);
    const invoice = await createInvoice(page, cleanup, vendorId, {
      amount: 500,
      status: 'pending',
    });
    await createLinkedCostLine(page, invoice.id, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Floor line`,
      plannedAmount: 500,
      includesVat: true,
      itemizedAmount: 500,
    });

    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('invoice', { id: invoice.id }));
    await panel.waitForLoaded();

    await expect(panel.rows()).toHaveCount(1);
    await expect(panel.notYetSplit()).toHaveCount(0);
    await expect(panel.over()).toHaveCount(0);
    await expect(panel.stateChip(panel.row(`${testPrefix} Floor line`))).toHaveText('Invoiced');
  });
});

test.describe('Cost overview - face value and After grants (A5)', { tag: '@responsive' }, () => {
  test('without grants the first row reads Expected cost; a linked offer shows its amount with no range', async ({
    page,
    testPrefix,
  }) => {
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Savings`);
    const taskId = await createTask(page, cleanup, `${testPrefix} Overview task`);
    const vendorId = await createVendor(page, cleanup, `${testPrefix} Example Joinery Ltd`);
    const offer = await createInvoice(page, cleanup, vendorId, {
      amount: 1000,
      status: 'quotation',
    });
    await createLinkedCostLine(page, offer.id, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Offered line`,
      plannedAmount: 600,
      includesVat: true,
      itemizedAmount: 500,
    });

    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    const costSection = page.locator('section').filter({
      has: page.getByRole('heading', { level: 2, name: 'Cost', exact: true }),
    });
    await expect(costSection).toContainText('Expected cost');
    await expect(costSection).toContainText('Planned cost');
    await expect(costSection).not.toContainText('After grants');
    // The offered amount counts at face value: €500.00 once, never a ±5% range such as
    // €475.00 – €525.00
    await expect(costSection).toContainText('€500.00');
    await expect(costSection).not.toContainText(/€475\.00|€525\.00/);
  });

  test('with a grant linked the first row reads After grants', async ({ page, testPrefix }) => {
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Savings`);
    const taskId = await createTask(page, cleanup, `${testPrefix} Grant task`);
    await createCostLine(page, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Grant line`,
      plannedAmount: 1000,
      includesVat: true,
    });
    const program = await page.request.post('/api/subsidy-programs', {
      data: {
        name: `${testPrefix} Example grant`,
        reductionType: 'percentage',
        reductionValue: 10,
        applicationStatus: 'approved',
        applicationDeadline: null,
        description: null,
        eligibility: null,
        notes: null,
        categoryIds: [],
        maximumAmount: null,
      },
    });
    expect(program.ok(), `POST subsidy program failed: ${program.status()}`).toBeTruthy();
    const programId = ((await program.json()) as { subsidyProgram: { id: string } }).subsidyProgram
      .id;
    cleanup.fns.push(async () => {
      await page.request.delete(`/api/subsidy-programs/${programId}`);
    });
    const link = await page.request.post(`/api/work-items/${taskId}/subsidies`, {
      data: { subsidyProgramId: programId },
    });
    expect(link.ok(), `POST subsidy link failed: ${link.status()}`).toBeTruthy();

    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    const costSection = page.locator('section').filter({
      has: page.getByRole('heading', { level: 2, name: 'Cost', exact: true }),
    });
    await expect(costSection).toContainText('After grants');
    await expect(costSection).not.toContainText('Expected cost');
    await expect(costSection).toContainText('Planned cost');
  });
});

test.describe('Cost line table - surfaces and dark mode', { tag: '@responsive' }, () => {
  test('phones show two-line cards, wider screens the table, never both', async ({
    page,
    testPrefix,
  }) => {
    const { taskId } = await seedAllStates(page, testPrefix);
    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    // The list switches by its OWN width (768px), not the viewport's: a task page keeps the list
    // in a column that can be narrower than the screen. Exactly one surface shows.
    const tableRows = page.locator(
      `[data-testid^="cost-lines-row-"]:not([data-testid^="cost-lines-row-mobile-"])`,
    );
    const cards = page.locator(`[data-testid^="cost-lines-row-mobile-"]`);
    await expect(panel.rows()).toHaveCount(5);
    const cardsShown = await cards.first().isVisible();
    expect(await tableRows.first().isVisible()).toBe(!cardsShown);
    if (isPhone(page)) expect(cardsShown).toBe(true);
    const width = await panel.root.evaluate((el) => el.getBoundingClientRect().width);
    expect(cardsShown).toBe(width < 768);
    // No horizontal page scroll at any width
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });

  test('dark mode: the table, its chips and the total stay legible', async ({
    page,
    testPrefix,
  }) => {
    const { taskId } = await seedAllStates(page, testPrefix);
    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();
    await enableDarkTheme(page);

    const row = panel.row(`${testPrefix} Paid line`);
    await expect(row).toBeVisible();
    await expectLegibleInDark(panel.stateChip(row));
    await expectLegibleInDark(panel.total());
  });
});
