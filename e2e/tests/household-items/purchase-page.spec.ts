/**
 * E2E tests for the Purchase page on the object template (#2249, EPIC-21 P5.5).
 *
 * The basics (heading, Cost tab, Documents, 404, dark mode) live in `household-item-detail.spec.ts`.
 * This file holds the acceptance scenarios of the story:
 *
 *  P1  AC1   Mark ordered (date step, Undo restores status AND order date); Mark delivered with
 *            As planned and with a picked date; Delivered shows Log (with area and company)
 *  P2  AC6   the strip: facts and their order, Delivery wording (Window / Target / Delivered),
 *            Where and Company links, Call, Expected cost with the grant, Invoiced, Waits for
 *  P3  AC6   Where / Company without a value open the Details card in edit mode
 *  P4  AC6   the strip stays short (bounding box and column / row counts)
 *  P5  AC2   tabs and `?tab=`: selecting, deep links, counts, History line
 *  P6  AC3   Details card: empty fields are hidden, "Nothing added yet", edit and save,
 *            validation, `e` shortcut, an unsafe product link is not a link
 *  P7  AC2   Delivery card: edit, validation, computed target
 *  P8  AC2/7 Late: strip badge, specific reason (latest date passed) and generic reason; none when
 *            delivered
 *  P9  AC7   Waits for: add a task and a milestone, Remove + Undo
 *  P10 AC2   Cost: cost lines on their tab, grants with Remove + Undo
 *  P11 AC2   Site diary: the company block, empty state, "Log for this purchase" pre-fills
 *  P12 AC4   `/edit` URLs (current and legacy) land on the page with Details in edit mode, focus
 *            on Name, `edit` gone from the URL
 *  P13 AC5   Delete via the ⋯ menu: Cancel keeps it, Delete removes it and lands on the list
 *
 * Data is created through the API with per-test names; every name and phone number is invented.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { API } from '../../fixtures/testData.js';
import {
  createAreaViaApi,
  createHouseholdItemViaApi,
  createMilestoneViaApi,
  createVendorViaApi,
  createWorkItemViaApi,
  deleteAreaViaApi,
  deleteHouseholdItemViaApi,
  deleteMilestoneViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { todayIso } from '../../fixtures/captureSeed.js';
import {
  newCleanup,
  runCleanup,
  createCostLine,
  createFundingSource,
  createInvoice,
  createLinkedCostLine,
} from '../../fixtures/costLineSeed.js';
import type { SeedCleanup } from '../../fixtures/costLineSeed.js';
import { seedDiaryFeed } from '../../fixtures/diaryFeedSeed.js';
import { createGrant } from '../../fixtures/financingSeed.js';
import { mockPaperlessConfigured } from '../../fixtures/paperlessMocks.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';

let cleanup: SeedCleanup;

test.beforeEach(() => {
  cleanup = newCleanup();
});

test.afterEach(async () => {
  await runCleanup(cleanup);
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Today as YYYY-MM-DD in the browser's local time (what the StatusMenu "Today" chip sends). */
function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A purchase created through the API; deleted by the per-test cleanup. */
async function makePurchase(
  page: Page,
  name: string,
  fields: Record<string, unknown> = {},
): Promise<string> {
  const id = await createHouseholdItemViaApi(page, { name, ...fields });
  cleanup.fns.push(() => deleteHouseholdItemViaApi(page, id));
  return id;
}

async function makeCompany(page: Page, name: string, phone?: string): Promise<string> {
  const id = await createVendorViaApi(page, { name, ...(phone ? { phone } : {}) });
  cleanup.fns.push(() => deleteVendorViaApi(page, id));
  return id;
}

async function makeArea(page: Page, name: string): Promise<string> {
  const id = await createAreaViaApi(page, { name });
  cleanup.fns.push(() => deleteAreaViaApi(page, id));
  return id;
}

async function makeTask(page: Page, title: string): Promise<string> {
  const id = await createWorkItemViaApi(page, { title });
  cleanup.fns.push(() => deleteWorkItemViaApi(page, id));
  return id;
}

async function makeMilestone(page: Page, title: string): Promise<number> {
  const id = await createMilestoneViaApi(page, { title, targetDate: todayIso(30) });
  cleanup.fns.push(() => deleteMilestoneViaApi(page, id));
  return id;
}

interface ApiPurchase {
  status: string;
  orderDate: string | null;
  earliestDeliveryDate: string | null;
  latestDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  targetDeliveryDate: string | null;
  isLate: boolean;
  name: string;
  quantity: number;
  description: string | null;
  url: string | null;
}

async function fetchPurchase(page: Page, id: string): Promise<ApiPurchase> {
  const response = await page.request.get(`${API.householdItems}/${id}`);
  expect(response.ok(), `GET purchase: ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { householdItem: ApiPurchase }).householdItem;
}

/** A PATCH of the delivery dates or status runs the scheduler (target date, Late). */
async function patchPurchase(page: Page, id: string, data: Record<string, unknown>): Promise<void> {
  const response = await page.request.patch(`${API.householdItems}/${id}`, { data });
  expect(response.ok(), `PATCH purchase: ${response.status()}`).toBeTruthy();
}

async function fetchWaitsForKeys(page: Page, id: string): Promise<string[]> {
  const response = await page.request.get(`${API.householdItems}/${id}/dependencies`);
  expect(response.ok(), `GET purchase dependencies: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as {
    dependencies: Array<{ predecessorType: string; predecessorId: string }>;
  };
  return body.dependencies.map((dep) => `${dep.predecessorType}:${dep.predecessorId}`).sort();
}

async function fetchGrantIds(page: Page, id: string): Promise<string[]> {
  const response = await page.request.get(`${API.householdItems}/${id}/subsidies`);
  expect(response.ok(), `GET purchase grants: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { subsidies: Array<{ id: string }> };
  return body.subsidies.map((grant) => grant.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// P1 (AC1): the header primary
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Header primary (P1, AC1)', { tag: '@responsive' }, () => {
  test('Mark ordered asks for a date; Undo restores the status and the order date', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} P1 Ordered Purchase`;
    const id = await makePurchase(page, name);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    // Planned: the one primary is Mark ordered; the others are not offered
    await expect(purchase.orderedPrimary.trigger).toContainText('Mark ordered');
    await expect(purchase.deliveredPrimary.trigger).toHaveCount(0);
    await expect(purchase.logPrimary).toHaveCount(0);

    await purchase.orderedPrimary.actionToday();

    await expect(purchase.statusMenu.trigger).toHaveText('Ordered');
    await expect(purchase.toasts.undoToastWith(`${name} is now “Ordered”.`)).toBeVisible();
    // Ordered: the primary became Mark delivered
    await expect(purchase.deliveredPrimary.trigger).toContainText('Mark delivered');
    await expect(purchase.orderedPrimary.trigger).toHaveCount(0);
    const ordered = await fetchPurchase(page, id);
    expect(ordered.status).toBe('purchased');
    expect(ordered.orderDate).toBe(localToday());

    await purchase.toasts.undoViaButton();

    await expect(purchase.statusMenu.trigger).toHaveText('Planned');
    await expect(purchase.orderedPrimary.trigger).toContainText('Mark ordered');
    const restored = await fetchPurchase(page, id);
    expect(restored.status).toBe('planned');
    expect(restored.orderDate).toBeNull();
  });

  test('Mark ordered with a picked date stores it', async ({ page, testPrefix }) => {
    const id = await makePurchase(page, `${testPrefix} P1 Picked Order Date`);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await purchase.orderedPrimary.actionPickedDate(todayIso(-3));

    await expect(purchase.statusMenu.trigger).toHaveText('Ordered');
    await expect.poll(async () => (await fetchPurchase(page, id)).orderDate).toBe(todayIso(-3));
  });

  test('Mark delivered with Today stores today; Undo clears it; then Log appears', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} P1 Delivered Purchase`;
    const id = await makePurchase(page, name, {
      status: 'purchased',
      orderDate: todayIso(-2),
      earliestDeliveryDate: todayIso(4),
      latestDeliveryDate: todayIso(9),
    });
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await expect(purchase.deliveredPrimary.trigger).toContainText('Mark delivered');

    await purchase.deliveredPrimary.open();
    // The planned date is never before today for an undelivered purchase, so no "As planned" chip
    await expect(purchase.deliveredPrimary.dateToday).toBeVisible();
    await expect(purchase.deliveredPrimary.datePlanned).toHaveCount(0);
    await purchase.deliveredPrimary.dateToday.click();

    await expect(purchase.statusMenu.trigger).toHaveText('Delivered');
    await expect(purchase.toasts.undoToastWith(`${name} is now “Delivered”.`)).toBeVisible();
    // Delivered: Log replaces the status primary
    await expect(purchase.logPrimary).toBeVisible();
    await expect(purchase.logPrimary).toContainText('Log');
    await expect(purchase.deliveredPrimary.trigger).toHaveCount(0);
    await expect
      .poll(async () => (await fetchPurchase(page, id)).actualDeliveryDate)
      .toBe(todayIso());

    await purchase.toasts.undoViaButton();

    await expect(purchase.statusMenu.trigger).toHaveText('Ordered');
    await expect(purchase.deliveredPrimary.trigger).toContainText('Mark delivered');
    await expect(purchase.logPrimary).toHaveCount(0);
    expect((await fetchPurchase(page, id)).actualDeliveryDate).toBeNull();
  });

  test('Mark delivered with a picked date stores it', async ({ page, testPrefix }) => {
    const id = await makePurchase(page, `${testPrefix} P1 Picked Delivery`, {
      status: 'purchased',
      orderDate: todayIso(-6),
    });
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await purchase.deliveredPrimary.actionPickedDate(todayIso(-1));

    await expect(purchase.statusMenu.trigger).toHaveText('Delivered');
    await expect
      .poll(async () => (await fetchPurchase(page, id)).actualDeliveryDate)
      .toBe(todayIso(-1));
  });

  test("Log on a delivered purchase opens the capture screen with the purchase's area and company", async ({
    page,
    testPrefix,
  }) => {
    const companyId = await makeCompany(page, `${testPrefix} P1 Log Co`);
    const areaId = await makeArea(page, `${testPrefix} P1 Log Area`);
    const id = await makePurchase(page, `${testPrefix} P1 Log Purchase`, {
      status: 'arrived',
      vendorId: companyId,
      areaId,
      actualDeliveryDate: todayIso(-1),
    });
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await expect(purchase.logPrimary).toBeVisible();
    await purchase.logPrimary.click();

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('diaryEntryNew') &&
        url.searchParams.get('areaId') === areaId &&
        url.searchParams.get('companyId') === companyId,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2 (AC6): the strip
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Summary strip (P2, AC6)', { tag: '@responsive' }, () => {
  test('The strip shows Delivery, Where, Company, Expected cost, Invoiced and Waits for, in that order', async ({
    page,
    testPrefix,
  }) => {
    const companyName = `${testPrefix} P2 Furniture Ltd`;
    const areaName = `${testPrefix} P2 Lounge`;
    const grantName = `${testPrefix} P2 Efficiency grant`;
    const taskTitle = `${testPrefix} P2 Predecessor`;
    const companyId = await makeCompany(page, companyName, '+49 30 5550123');
    const areaId = await makeArea(page, areaName);
    const taskId = await makeTask(page, taskTitle);
    const id = await makePurchase(page, `${testPrefix} P2 Main`, {
      vendorId: companyId,
      areaId,
      earliestDeliveryDate: todayIso(3),
      latestDeliveryDate: todayIso(9),
    });
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} P2 Savings`);
    await createCostLine(page, {
      kind: 'household_item',
      hostId: id,
      budgetSourceId: sourceId,
      description: `${testPrefix} P2 Line`,
      plannedAmount: 1000,
      includesVat: true,
    });
    const grantId = await createGrant(page, cleanup, {
      name: grantName,
      reductionValue: 10,
      applicationStatus: 'approved',
    });
    const linked = await page.request.post(`${API.householdItems}/${id}/subsidies`, {
      data: { subsidyProgramId: grantId },
    });
    expect(linked.ok(), 'POST grant link').toBeTruthy();
    const dependency = await page.request.post(`${API.householdItems}/${id}/dependencies`, {
      data: { predecessorType: 'work_item', predecessorId: taskId },
    });
    expect(dependency.ok(), 'POST dependency').toBeTruthy();
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);

    // Documents appears only when Paperless is configured or links are kept
    await expect(purchase.summary.item('delivery')).toBeVisible();
    expect(await purchase.summary.factIds()).toEqual([
      'delivery',
      'where',
      'company',
      'cost',
      'invoiced',
      'waitsFor',
    ]);
    // No money figure markers: the purchase strip has no FigureKind
    await expect(purchase.summary.root.locator('[data-figure]')).toHaveCount(0);

    // Delivery: the target the scheduler computed, else the window (any item's change reschedules)
    await expect(purchase.summary.label('delivery')).toHaveText('Delivery');
    await expect(purchase.summary.fact('delivery')).toContainText(/Target|Window/);
    // Where: the area as a link
    await expect(purchase.summary.fact('where')).toContainText(areaName);
    await expect(purchase.summary.fact('where')).toHaveAttribute('href', /^\/areas/);
    // Company: a link to the company page, with Call beside it
    await expect(purchase.summary.fact('company')).toContainText(companyName);
    await expect(purchase.summary.fact('company')).toHaveAttribute(
      'href',
      routeUrl('company', { id: companyId }),
    );
    await expect(purchase.callButton).toBeVisible();
    // Expected cost: a money figure with the grant named as a remark
    await expect(purchase.summary.label('cost')).toHaveText('Expected cost');
    await expect(purchase.summary.fact('cost')).toContainText('€');
    await expect(purchase.summary.fact('cost')).toContainText(grantName);
    // Invoiced: nothing invoiced yet says so
    await expect(purchase.summary.label('invoiced')).toHaveText('Invoiced');
    await expect(purchase.summary.fact('invoiced')).toContainText('None yet');
    // Waits for: the task by name
    await expect(purchase.summary.fact('waitsFor')).toContainText(taskTitle);
  });

  test('Invoiced shows the invoiced amount once a cost line is linked to an invoice', async ({
    page,
    testPrefix,
  }) => {
    const companyId = await makeCompany(page, `${testPrefix} P2 Invoice Co`);
    const id = await makePurchase(page, `${testPrefix} P2 Invoiced`, { vendorId: companyId });
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} P2 Invoice Savings`);
    const invoice = await createInvoice(page, cleanup, companyId, { amount: 500 });
    await createLinkedCostLine(page, invoice.id, {
      kind: 'household_item',
      hostId: id,
      budgetSourceId: sourceId,
      description: `${testPrefix} P2 Invoiced line`,
      plannedAmount: 500,
      includesVat: true,
      itemizedAmount: 300,
    });
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);

    await expect(purchase.summary.fact('invoiced')).toContainText('€');
    await expect(purchase.summary.fact('invoiced')).not.toContainText('None yet');
  });

  test('A purchase that waits for nothing says Nothing', async ({ page, testPrefix }) => {
    const id = await makePurchase(page, `${testPrefix} P2 Alone`);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);

    await expect(purchase.summary.fact('waitsFor')).toHaveText('Nothing');
  });

  test('The Delivery fact says Target once the scheduler computed it and Delivered when it arrived', async ({
    page,
    testPrefix,
  }) => {
    const id = await makePurchase(page, `${testPrefix} P2 Wording`, {
      status: 'purchased',
      orderDate: todayIso(-2),
      earliestDeliveryDate: todayIso(5),
      latestDeliveryDate: todayIso(12),
    });
    await patchPurchase(page, id, { earliestDeliveryDate: todayIso(5) });
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await expect(purchase.summary.fact('delivery')).toContainText('Target');
    await expect(purchase.lateBadge).toHaveCount(0);

    await patchPurchase(page, id, { status: 'arrived', actualDeliveryDate: todayIso(-1) });
    await purchase.goto(id);
    await expect(purchase.summary.fact('delivery')).toContainText('Delivered');
  });

  test('A REAL click on Call follows the tel: link and leaves the page and its tab alone', async ({
    page,
    testPrefix,
  }) => {
    const companyId = await makeCompany(page, `${testPrefix} P2 Plumbing Ltd`, '+49 30 5550199');
    const id = await makePurchase(page, `${testPrefix} P2 Call`, { vendorId: companyId });
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await expect(purchase.callButton).toHaveAttribute('href', 'tel:+49305550199');
    const before = page.url();

    await purchase.callButton.click();

    // The click is the link's own: no navigation to the company, no card in edit mode
    await expect(page).toHaveURL(before);
    await expect(purchase.tabs.tab('overview')).toHaveAttribute('aria-selected', 'true');
    await expect(purchase.detailsCard.form).toHaveCount(0);
    await expect(purchase.heading).toBeVisible();
  });

  test('A company without a phone number has no Call button', async ({ page, testPrefix }) => {
    const companyId = await makeCompany(page, `${testPrefix} P2 No Phone Co`);
    const id = await makePurchase(page, `${testPrefix} P2 No Call`, { vendorId: companyId });
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);

    await expect(purchase.summary.fact('company')).toContainText(`${testPrefix} P2 No Phone Co`);
    await expect(purchase.callButton).toHaveCount(0);
  });

  test('With Paperless configured the strip ends with a Documents fact', async ({
    page,
    testPrefix,
  }) => {
    const id = await makePurchase(page, `${testPrefix} P2 Documents`);
    await mockPaperlessConfigured(page);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);

    await expect(purchase.summary.fact('documents')).toBeVisible();
    expect((await purchase.summary.factIds()).at(-1)).toBe('documents');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P3 (AC6): empty Where / Company open the Details card
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Empty Where and Company (P3, AC6)', { tag: '@responsive' }, () => {
  test('Without an area the Where fact opens the Details card in edit mode with Name focused', async ({
    page,
    testPrefix,
  }) => {
    const id = await makePurchase(page, `${testPrefix} P3 No Area`);
    const purchase = new HouseholdItemDetailPage(page);

    // Start on another tab so the fact has to bring the Overview back
    await purchase.goto(id, { tab: 'timing' });
    await purchase.summary.fact('where').click();

    await expect(purchase.tabs.tab('overview')).toHaveAttribute('aria-selected', 'true');
    await expect(purchase.detailsCard.form).toBeVisible();
    await expect(purchase.nameInput).toBeFocused();
  });

  test('Without a company the Company fact opens the Details card in edit mode', async ({
    page,
    testPrefix,
  }) => {
    const id = await makePurchase(page, `${testPrefix} P3 No Company`);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await purchase.summary.fact('company').click();

    await expect(purchase.detailsCard.form).toBeVisible();
    await expect(purchase.nameInput).toBeFocused();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P4 (AC6): the strip stays short
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Strip height (P4, AC6)', { tag: '@responsive' }, () => {
  test('The fullest strip ends within 450px on a desktop (two rows) and within 844px on a phone (two columns)', async ({
    page,
    testPrefix,
  }) => {
    const companyId = await makeCompany(page, `${testPrefix} P4 Joinery Ltd`, '+49 30 5550142');
    const areaId = await makeArea(page, `${testPrefix} P4 Study`);
    const taskId = await makeTask(page, `${testPrefix} P4 Predecessor`);
    const id = await makePurchase(page, `${testPrefix} P4 Main`, {
      status: 'purchased',
      vendorId: companyId,
      areaId,
      orderDate: todayIso(-8),
      earliestDeliveryDate: todayIso(-5),
      latestDeliveryDate: todayIso(-2),
    });
    // A past latest date makes the purchase Late: the widest Delivery fact
    await patchPurchase(page, id, { latestDeliveryDate: todayIso(-2) });
    const dependency = await page.request.post(`${API.householdItems}/${id}/dependencies`, {
      data: { predecessorType: 'work_item', predecessorId: taskId },
    });
    expect(dependency.ok(), 'POST dependency').toBeTruthy();
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} P4 Savings`);
    await createCostLine(page, {
      kind: 'household_item',
      hostId: id,
      budgetSourceId: sourceId,
      description: `${testPrefix} P4 Line`,
      plannedAmount: 5000,
      includesVat: true,
    });
    const grantId = await createGrant(page, cleanup, {
      name: `${testPrefix} P4 Joinery grant`,
      reductionValue: 10,
      applicationStatus: 'approved',
    });
    await page.request.post(`${API.householdItems}/${id}/subsidies`, {
      data: { subsidyProgramId: grantId },
    });
    await mockPaperlessConfigured(page);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await expect(purchase.summary.fact('documents')).toBeVisible();
    await expect(purchase.lateBadge).toBeVisible();
    await expect(purchase.callButton).toBeVisible();
    // Late + Call + grant + Documents: all seven facts are in
    expect(await purchase.summary.factIds()).toHaveLength(7);

    const box = await purchase.summary.stripBox();
    const width = page.viewportSize()?.width ?? 1280;
    // A desktop strip ends within 450px of the top; below 1024px the facts stack, so the limit
    // is a phone screen's height (844px)
    const limit = width >= 1024 ? 450 : 844;
    expect(box.bottom, `strip bottom at width ${width}`).toBeLessThanOrEqual(limit);
    if (width >= 1024) {
      expect(await purchase.summary.rowCount(), 'desktop strip rows').toBeLessThanOrEqual(2);
    }
    if (width < 600) {
      expect(await purchase.summary.columnCount(), 'phone strip columns').toBe(2);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P5 (AC2): tabs
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tabs and ?tab= (P5, AC2)', { tag: '@responsive' }, () => {
  test('Selecting a tab writes ?tab= and a reload keeps it; Overview has no parameter', async ({
    page,
    testPrefix,
  }) => {
    const id = await makePurchase(page, `${testPrefix} P5 Tabs`);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await expect(purchase.tabs.tab('overview')).toHaveAttribute('aria-selected', 'true');
    expect(new URL(page.url()).searchParams.get('tab')).toBeNull();

    for (const tab of ['timing', 'cost', 'diary', 'history'] as const) {
      await purchase.openTab(tab);
      await expect(page).toHaveURL((url) => url.searchParams.get('tab') === tab);
    }

    await page.reload();
    await expect(purchase.tabs.tab('history')).toHaveAttribute('aria-selected', 'true');
    await expect(purchase.historyCreated).toBeVisible();
    await expect(purchase.historyCreated).toContainText('Created');
    await expect(purchase.historyCreated).toContainText('Last updated');

    await purchase.openTab('overview');
    await expect(page).toHaveURL((url) => url.searchParams.get('tab') === null);
  });

  test('Deep links open their tab and the five tabs are Overview, Timing, Cost, Site diary and History', async ({
    page,
    testPrefix,
  }) => {
    const id = await makePurchase(page, `${testPrefix} P5 Deep Link`);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id, { tab: 'timing' });

    await expect(purchase.tabs.tab('timing')).toHaveAttribute('aria-selected', 'true');
    await expect(purchase.timingPanel).toBeVisible();
    await expect(purchase.tabs.tablist.getByRole('tab')).toHaveCount(5);
    await expect(purchase.tabs.tab('overview')).toContainText('Overview');
    await expect(purchase.tabs.tab('cost')).toContainText('Cost');
    await expect(purchase.tabs.tab('diary')).toContainText('Site diary');
  });

  test('The Cost tab counts the cost lines; the strip Expected cost fact opens that tab', async ({
    page,
    testPrefix,
  }) => {
    const id = await makePurchase(page, `${testPrefix} P5 Counts`);
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} P5 Savings`);
    for (const label of ['One', 'Two']) {
      await createCostLine(page, {
        kind: 'household_item',
        hostId: id,
        budgetSourceId: sourceId,
        description: `${testPrefix} P5 ${label}`,
        plannedAmount: 100,
      });
    }
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await expect(purchase.tabs.tab('cost')).toContainText('2');

    await purchase.summary.fact('cost').click();

    await expect(purchase.tabs.tab('cost')).toHaveAttribute('aria-selected', 'true');
    await expect(purchase.costPanel).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P6 (AC3): the Details card
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Details card (P6, AC3)', { tag: '@responsive' }, () => {
  test('Empty fields are hidden and a muted "Nothing added yet" line shows; Category is always present', async ({
    page,
    testPrefix,
  }) => {
    const id = await makePurchase(page, `${testPrefix} P6 Bare`);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);

    await expect(purchase.detailsCard.heading).toHaveText('Details');
    await expect(purchase.emptyNote).toHaveText('Nothing added yet');
    await expect(purchase.detail('category')).toBeVisible();
    await expect(purchase.detail('category')).not.toHaveText(/^hic-/);
    for (const field of ['description', 'quantity', 'company', 'link', 'area'] as const) {
      await expect(purchase.detail(field)).toHaveCount(0);
    }
  });

  test('Filled fields show as rows (quantity only above 1); Edit lists every field, Save shows the new values', async ({
    page,
    testPrefix,
  }) => {
    const companyName = `${testPrefix} P6 Supplier Co`;
    const areaName = `${testPrefix} P6 Hall`;
    const companyId = await makeCompany(page, companyName);
    await makeArea(page, areaName);
    const name = `${testPrefix} P6 Full`;
    const id = await makePurchase(page, name);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await purchase.detailsCard.startEdit();
    await expect(purchase.nameInput).toBeFocused();
    await expect(purchase.nameInput).toHaveValue(name);
    await expect(purchase.descriptionInput).toBeVisible();
    await expect(purchase.quantityInput).toBeVisible();
    await expect(purchase.urlInput).toBeVisible();
    // The category is preselected (a chip with Clear selection); company and area are empty
    await expect(purchase.categoryPicker.clearButton).toBeVisible();
    await expect(purchase.companyPicker.input).toBeVisible();
    await expect(purchase.areaPicker.input).toBeVisible();

    await purchase.nameInput.fill(`${name} renamed`);
    await purchase.descriptionInput.fill('Oak, matt finish');
    await purchase.quantityInput.fill('3');
    await purchase.urlInput.fill('https://shop.example.com/oak-table');
    await purchase.companyPicker.pick(companyName);
    await expect(purchase.selectedCompany).toContainText(companyName);
    await purchase.areaPicker.pick(areaName);
    await purchase.detailsCard.save();

    await expect(purchase.heading).toHaveText(`${name} renamed`);
    await expect(purchase.emptyNote).toHaveCount(0);
    await expect(purchase.detail('description')).toHaveText('Oak, matt finish');
    await expect(purchase.detail('quantity')).toHaveText('3');
    await expect(purchase.detail('company')).toContainText(companyName);
    await expect(purchase.detail('company').getByRole('link')).toHaveAttribute(
      'href',
      routeUrl('company', { id: companyId }),
    );
    await expect(purchase.detail('area')).toContainText(areaName);
    // The product link shows the host, opens in a new tab and says so
    const link = purchase.detail('link').getByRole('link');
    await expect(link).toHaveText(/shop\.example\.com/);
    await expect(link).toHaveAttribute('href', 'https://shop.example.com/oak-table');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    // Saved: the API agrees, and the strip follows
    const saved = await fetchPurchase(page, id);
    expect(saved.name).toBe(`${name} renamed`);
    expect(saved.quantity).toBe(3);
    await expect(purchase.summary.fact('company')).toContainText(companyName);
    await expect(purchase.summary.fact('where')).toContainText(areaName);
  });

  test('An empty name and a quantity below 1 show field errors and nothing is saved', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} P6 Validation`;
    const id = await makePurchase(page, name);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await purchase.detailsCard.startEdit();
    await purchase.nameInput.fill('');
    await purchase.quantityInput.fill('0');
    await purchase.detailsCard.saveButton.click();

    await expect(purchase.detailsCard.form.getByText('Enter a name.')).toBeVisible();
    await expect(
      purchase.detailsCard.form.getByText('Enter a whole number, 1 or more.'),
    ).toBeVisible();
    await expect(purchase.detailsCard.form).toBeVisible();
    expect((await fetchPurchase(page, id)).name).toBe(name);

    await purchase.detailsCard.cancel();
    // Unsaved edits: Cancel asks "Discard changes?"
    await purchase.detailsCard.discardConfirm.confirm();
    await expect(purchase.detailsCard.form).toBeHidden();
    await expect(purchase.heading).toHaveText(name);
  });

  test('The e key opens the Details card in edit mode', async ({ page, testPrefix }) => {
    const id = await makePurchase(page, `${testPrefix} P6 Shortcut`);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await expect(purchase.detail('category')).toBeVisible();
    await page.keyboard.press('e');

    await expect(purchase.detailsCard.form).toBeVisible();
    await expect(purchase.nameInput).toBeFocused();
  });

  test('A product link that is not http(s) is shown as text, never as a link', async ({
    page,
    testPrefix,
  }) => {
    const unsafe = 'javascript:void(0)';
    const id = await makePurchase(page, `${testPrefix} P6 Unsafe Link`, { url: unsafe });
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);

    await expect(purchase.detail('link')).toContainText(unsafe);
    await expect(purchase.detail('link').getByRole('link')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P7 (AC2): the Delivery card
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Delivery card (P7, AC2)', { tag: '@responsive' }, () => {
  test('Edit sets the four dates; Save shows them and the API agrees; target is read-only', async ({
    page,
    testPrefix,
  }) => {
    const id = await makePurchase(page, `${testPrefix} P7 Dates`);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id, { tab: 'timing' });
    await expect(purchase.deliveryCard.heading).toHaveText('Delivery');
    await expect(purchase.deliveryCard.root).toContainText('Target delivery');

    await purchase.editDelivery({
      ordered: todayIso(-3),
      earliest: todayIso(2),
      latest: todayIso(10),
    });

    await expect(purchase.delivery('ordered')).not.toBeEmpty();
    await expect(purchase.delivery('earliest')).not.toBeEmpty();
    await expect(purchase.delivery('latest')).not.toBeEmpty();
    await expect
      .poll(async () => (await fetchPurchase(page, id)).earliestDeliveryDate)
      .toBe(todayIso(2));
    const saved = await fetchPurchase(page, id);
    expect(saved.orderDate).toBe(todayIso(-3));
    expect(saved.latestDeliveryDate).toBe(todayIso(10));
    // Target delivery is computed: no input for it
    await purchase.deliveryCard.startEdit();
    await expect(page.getByTestId('purchase-ordered-input')).toBeVisible();
    await expect(page.getByTestId('purchase-target-input')).toHaveCount(0);
  });

  test('A latest date before the earliest and a delivery before the order date show field errors', async ({
    page,
    testPrefix,
  }) => {
    const id = await makePurchase(page, `${testPrefix} P7 Validation`);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id, { tab: 'timing' });
    await purchase.deliveryCard.startEdit();
    await page.getByTestId('purchase-ordered-input').fill(todayIso(-1));
    await page.getByTestId('purchase-earliest-input').fill(todayIso(9));
    await page.getByTestId('purchase-latest-input').fill(todayIso(3));
    await page.getByTestId('purchase-delivered-input').fill(todayIso(-5));
    await purchase.deliveryCard.saveButton.click();

    await expect(
      purchase.deliveryCard.form.getByText("Latest delivery can't be before earliest delivery."),
    ).toBeVisible();
    await expect(
      purchase.deliveryCard.form.getByText("The delivery date can't be before the order date."),
    ).toBeVisible();
    await expect(purchase.deliveryCard.form).toBeVisible();
    expect((await fetchPurchase(page, id)).latestDeliveryDate).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P8 (AC2 / D3): Late
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Late (P8, AC2)', { tag: '@responsive' }, () => {
  test('A passed latest date shows the Late badge in the strip and names that date on the Delivery card', async ({
    page,
    testPrefix,
  }) => {
    const id = await makePurchase(page, `${testPrefix} P8 Late Latest`, {
      status: 'purchased',
      orderDate: todayIso(-9),
      latestDeliveryDate: todayIso(-4),
    });
    await patchPurchase(page, id, { latestDeliveryDate: todayIso(-4) });
    await expect.poll(async () => (await fetchPurchase(page, id)).isLate).toBe(true);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await expect(purchase.lateBadge).toBeVisible();
    await expect(purchase.lateBadge).toContainText('Late');
    // The badge sits in the Delivery fact, which opens Timing
    await expect(purchase.summary.fact('delivery')).toContainText('Late');

    await purchase.summary.fact('delivery').click();

    await expect(purchase.tabs.tab('timing')).toHaveAttribute('aria-selected', 'true');
    await expect(purchase.lateReason).toBeVisible();
    await expect(purchase.lateReason).toContainText('The latest delivery date (');
    await expect(purchase.lateReason).toContainText('has passed and nothing has arrived.');
    // A static row, not a live region
    await expect(purchase.lateReason).not.toHaveAttribute('role', 'status');
  });

  test('A passed earliest date without a latest date gives the generic reason', async ({
    page,
    testPrefix,
  }) => {
    const id = await makePurchase(page, `${testPrefix} P8 Late Generic`, {
      status: 'purchased',
      orderDate: todayIso(-9),
      earliestDeliveryDate: todayIso(-3),
    });
    await patchPurchase(page, id, { earliestDeliveryDate: todayIso(-3) });
    await expect.poll(async () => (await fetchPurchase(page, id)).isLate).toBe(true);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id, { tab: 'timing' });

    await expect(purchase.lateReason).toContainText(
      'Late: the delivery is now expected after its planned window.',
    );
  });

  test('A delivered purchase shows no Late badge and no reason', async ({ page, testPrefix }) => {
    const id = await makePurchase(page, `${testPrefix} P8 Not Late`, {
      status: 'purchased',
      orderDate: todayIso(-9),
      latestDeliveryDate: todayIso(-4),
    });
    await patchPurchase(page, id, { latestDeliveryDate: todayIso(-4) });
    await patchPurchase(page, id, { status: 'arrived', actualDeliveryDate: todayIso(-1) });
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await expect(purchase.summary.fact('delivery')).toContainText('Delivered');
    await expect(purchase.lateBadge).toHaveCount(0);

    await purchase.openTab('timing');
    await expect(purchase.deliveryCard.root).toBeVisible();
    await expect(purchase.lateReason).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P9 (AC7): Waits for
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Waits for (P9, AC7)', { tag: '@responsive' }, () => {
  test('Add a task and a milestone from one list, then Remove with Undo', async ({
    page,
    testPrefix,
  }) => {
    const taskTitle = `${testPrefix} P9 Plaster task`;
    const milestoneTitle = `${testPrefix} P9 Shell milestone`;
    const taskId = await makeTask(page, taskTitle);
    const milestoneId = await makeMilestone(page, milestoneTitle);
    const id = await makePurchase(page, `${testPrefix} P9 Waits`);
    const taskKey = `work_item:${taskId}`;
    const milestoneKey = `milestone:${milestoneId}`;
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id, { tab: 'timing' });
    await expect(
      purchase.waitsFor.emptyMessage("This purchase doesn't wait for a task or milestone."),
    ).toBeVisible();

    // First Add from the empty list: a task
    await purchase.addAction(purchase.waitsFor).click();
    await purchase.waitsForPicker.pick(taskTitle);
    await expect(purchase.waitsFor.row(taskKey)).toContainText(taskTitle);
    await expect(purchase.waitsFor.row(taskKey)).toContainText('Task');
    await expect(purchase.waitsFor.link(taskKey)).toHaveAttribute(
      'href',
      routeUrl('workItem', { id: taskId }),
    );

    // Second Add: a milestone from the same list
    await purchase.addAction(purchase.waitsFor).click();
    await purchase.waitsForPicker.pick(milestoneTitle);
    await expect(purchase.waitsFor.row(milestoneKey)).toContainText(milestoneTitle);
    await expect(purchase.waitsFor.row(milestoneKey)).toContainText('Milestone');
    await expect(purchase.waitsFor.link(milestoneKey)).toHaveAttribute(
      'href',
      routeUrl('milestone', { id: milestoneId }),
    );
    expect(await fetchWaitsForKeys(page, id)).toEqual([milestoneKey, taskKey].sort());
    await expect(purchase.summary.fact('waitsFor')).toContainText(/P9/);

    // Remove acts at once; Undo brings the row back
    await purchase.waitsFor.remove(milestoneKey);
    await expect(purchase.waitsFor.row(milestoneKey)).toHaveCount(0);
    expect(await fetchWaitsForKeys(page, id)).toEqual([taskKey]);

    await purchase.toasts.undoViaButton();

    await expect(purchase.waitsFor.row(milestoneKey)).toBeVisible();
    expect(await fetchWaitsForKeys(page, id)).toEqual([milestoneKey, taskKey].sort());
  });

  test('Already chosen tasks are not offered again', async ({ page, testPrefix }) => {
    const taskTitle = `${testPrefix} P9 Once task`;
    const taskId = await makeTask(page, taskTitle);
    const id = await makePurchase(page, `${testPrefix} P9 Once`);
    const dependency = await page.request.post(`${API.householdItems}/${id}/dependencies`, {
      data: { predecessorType: 'work_item', predecessorId: taskId },
    });
    expect(dependency.ok(), 'POST dependency').toBeTruthy();
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id, { tab: 'timing' });
    await expect(purchase.waitsFor.row(`work_item:${taskId}`)).toBeVisible();
    await purchase.addAction(purchase.waitsFor).click();
    await purchase.waitsForPicker.type(taskTitle);

    await expect(purchase.waitsForPicker.option(taskTitle)).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P10 (AC2): Cost
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Cost tab (P10, AC2)', { tag: '@responsive' }, () => {
  test('Cost lines live on the Cost tab and Add cost line is offered', async ({
    page,
    testPrefix,
  }) => {
    const id = await makePurchase(page, `${testPrefix} P10 Lines`);
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} P10 Savings`);
    await createCostLine(page, {
      kind: 'household_item',
      hostId: id,
      budgetSourceId: sourceId,
      description: `${testPrefix} P10 Oak line`,
      plannedAmount: 750,
    });
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    // Panels mount lazily: no cost lines on the Overview
    await expect(purchase.costPanel).toHaveCount(0);

    await purchase.openTab('cost');
    await purchase.costLines.waitForLoaded();

    await expect(purchase.costLines.row(`${testPrefix} P10 Oak line`)).toBeVisible();
    await expect(purchase.costLines.addButton).toBeVisible();
  });

  test('Grants: add one, it is listed and linked; Remove + Undo', async ({ page, testPrefix }) => {
    const grantName = `${testPrefix} P10 Grant`;
    const grantId = await createGrant(page, cleanup, {
      name: grantName,
      reductionValue: 10,
      applicationStatus: 'approved',
    });
    const id = await makePurchase(page, `${testPrefix} P10 Grants`);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id, { tab: 'cost' });
    await expect(purchase.grants.emptyMessage('No grant covers this purchase.')).toBeVisible();

    await purchase.grants.addAction('Add').click();
    await purchase.grantPicker.pick(grantName);

    const row = purchase.grants.row(grantId);
    await expect(row).toContainText(grantName);
    await expect(purchase.grants.link(grantId)).toHaveAttribute(
      'href',
      routeUrl('grant', { id: grantId }),
    );
    expect(await fetchGrantIds(page, id)).toEqual([grantId]);

    await purchase.grants.remove(grantId);
    await expect(purchase.grants.row(grantId)).toHaveCount(0);
    expect(await fetchGrantIds(page, id)).toEqual([]);

    await purchase.toasts.undoViaButton();

    await expect(purchase.grants.row(grantId)).toBeVisible();
    expect(await fetchGrantIds(page, id)).toEqual([grantId]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P11 (AC2): Site diary
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Site diary tab (P11, AC2)', { tag: '@responsive' }, () => {
  test('The company block lists its entries within the purchase dates; Log for this purchase pre-selects area and company', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedDiaryFeed(page, testPrefix, { photoCount: 2 });
    cleanup.fns.push(seed.cleanup);
    const id = await makePurchase(page, `${testPrefix} P11 Diary Purchase`, {
      status: 'purchased',
      orderDate: todayIso(-10),
      latestDeliveryDate: todayIso(3),
      areaId: seed.areaId,
      vendorId: seed.companyId,
    });
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id, { tab: 'diary' });

    // The entries that name the purchase's company within its dates
    await expect(purchase.diaryCompanyBlock).toBeVisible();
    await expect(purchase.diaryCompanyBlock).toContainText(seed.dailyLogTitle);
    await expect(purchase.diaryCompanyBlock).toContainText(seed.singleWorkerLogTitle);
    await expect(purchase.diaryCompanyBlock).not.toContainText(seed.photoNoteTitle);

    // Log for this purchase: the capture screen opens with the area and the company chosen
    await purchase.diaryLog.click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('diaryEntryNew') &&
        url.searchParams.get('areaId') === seed.areaId &&
        url.searchParams.get('companyId') === seed.companyId,
    );
    const capture = new DiaryCapturePage(page);
    await capture.waitForForm();
    await expect(capture.companyChip(seed.companyName)).toHaveAttribute('aria-pressed', 'true');
  });

  test('A purchase without a company, an area or dates shows the empty state with Log for this purchase', async ({
    page,
    testPrefix,
  }) => {
    const id = await makePurchase(page, `${testPrefix} P11 Empty`);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id, { tab: 'diary' });

    await expect(page.getByText('No entries for this purchase yet.')).toBeVisible();
    await expect(purchase.diaryLog).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P12 (AC4): the edit URLs
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Edit URLs (P12, AC4)', { tag: '@responsive' }, () => {
  for (const [label, path] of [
    ['/project/household-items/:id/edit', (id: string) => routeUrl('householdItemEdit', { id })],
    ['legacy /household-items/:id/edit', (id: string) => `/household-items/${id}/edit`],
    ['?edit=overview', (id: string) => routeUrl('householdItem', { id }, { edit: 'overview' })],
  ] as const) {
    test(`${label} lands on the purchase page with Details in edit mode, Name focused, no edit parameter`, async ({
      page,
      testPrefix,
    }) => {
      const name = `${testPrefix} P12 Edit URL`;
      const id = await makePurchase(page, name);
      const purchase = new HouseholdItemDetailPage(page);

      await page.goto(path(id));

      await expect(page).toHaveURL(
        (url) =>
          url.pathname === routeUrl('householdItem', { id }) &&
          !url.searchParams.has('edit') &&
          !url.searchParams.has('tab'),
      );
      await expect(purchase.heading).toHaveText(name);
      await expect(purchase.detailsCard.form).toBeVisible();
      await expect(purchase.nameInput).toBeFocused();
      await expect(purchase.nameInput).toHaveValue(name);
    });
  }

  test('The edit URL keeps the rest of the query', async ({ page, testPrefix }) => {
    const id = await makePurchase(page, `${testPrefix} P12 Query`);
    const purchase = new HouseholdItemDetailPage(page);

    await page.goto(`${routeUrl('householdItemEdit', { id })}?q=walk`);

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('householdItem', { id }) &&
        url.searchParams.get('q') === 'walk' &&
        !url.searchParams.has('edit'),
    );
    await expect(purchase.detailsCard.form).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P13 (AC5): Delete
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Delete (P13, AC5)', { tag: '@responsive' }, () => {
  test('Delete is in the ⋯ menu; Cancel keeps the purchase, Delete removes it and lands on the list', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} P13 Delete Purchase`;
    const id = await createHouseholdItemViaApi(page, { name });
    cleanup.fns.push(() => deleteHouseholdItemViaApi(page, id));
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id);
    await purchase.openDeleteModal();
    await expect(purchase.deleteModal).toContainText(name);
    await purchase.deleteDialog.cancel();
    await expect(purchase.heading).toHaveText(name);
    expect((await page.request.get(`${API.householdItems}/${id}`)).status()).toBe(200);

    await purchase.openDeleteModal();
    await purchase.confirmDelete();

    await expect(page).toHaveURL((url) => url.pathname === routeUrl('householdItems'));
    expect((await page.request.get(`${API.householdItems}/${id}`)).status()).toBe(404);
    // Back must not land on the deleted purchase
    await page.goBack();
    await expect(page).not.toHaveURL(new RegExp(escapeRegExp(id)));
  });
});
