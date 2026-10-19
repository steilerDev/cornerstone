/**
 * E2E tests for the company column filters of the Tasks, Purchases and Invoices lists (in-session
 * fix under EPIC-21). The filters are single-select entity filters: the header button opens a
 * popover with a server-searching picker, so a company past the first page can be filtered by.
 *
 * F1  Tasks    "Filter by Vendor" (hidden-by-default column, enabled first), param `assignedVendorId`
 * F2  Purchases "Filter by Vendor", param `vendorId`
 * F3  Invoices "Filter by Vendor", param `vendorId`; a deep link `?vendorId=` shows the name
 *
 * Each scenario: choose a company (the list narrows, the URL carries the param), reopen (the name
 * shows), clear (the param is gone), Escape returns focus to the header button. Table headers are
 * not shown on phone cards, so the scenarios are skipped below 768px (the existing filter specs do
 * the same).
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/isolatedUser.js';
import {
  createHouseholdItemViaApi,
  createVendorViaApi,
  createWorkItemViaApi,
  deleteHouseholdItemViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import type { CompanyFilterControl } from '../../pages/components/CompanyFilterControl.js';
import { HouseholdItemsPage } from '../../pages/HouseholdItemsPage.js';
import { INVOICES_ROUTE, InvoicesPage } from '../../pages/InvoicesPage.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';

function skipOnPhone(page: Page): void {
  const viewport = page.viewportSize();
  test.skip(
    !!viewport && viewport.width < 768,
    'Table header filters are not shown on phone cards',
  );
}

/** The contract every company filter shares, after the list is on screen. */
async function exerciseFilter(
  page: Page,
  filter: CompanyFilterControl,
  company: string,
  companyId: string,
): Promise<void> {
  // Choose: the URL carries the param
  await filter.choose(company);
  await filter.expectParam(companyId);

  // Reopen: the selected name shows
  await filter.closeWithEscape();
  await filter.open();
  await expect(filter.selectedChip).toContainText(company);

  // Clear: the param is gone
  await filter.clearButton.click();
  await filter.expectNoParam();
  await expect(filter.input).toBeVisible();

  // Escape closes the popover and focuses the "Filter by ..." button (focus starts in the input)
  await filter.input.click();
  await filter.closeWithEscape();
  await expect(filter.button).toBeFocused();
}

// ─────────────────────────────────────────────────────────────────────────────
// F1 - Tasks
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company filter - Tasks (F1)', { tag: '@responsive' }, () => {
  // Enabling the Vendor column writes `table.workItems.columns` on the user's preferences; on the
  // shared admin that row is rewritten by every other spec that toggles a Tasks column.
  test.use({ isolatedUserPerTest: { emailPrefix: 'filter-tasks' } });

  test('F1: filter tasks by company, reopen, clear, Escape', async ({ page, testPrefix }) => {
    skipOnPhone(page);
    const nameA = `${testPrefix} Filter Task Co A`;
    const nameB = `${testPrefix} Filter Task Co B`;
    const titleA = `${testPrefix} Filter Task A`;
    const titleB = `${testPrefix} Filter Task B`;
    const idA = await createVendorViaApi(page, { name: nameA });
    const idB = await createVendorViaApi(page, { name: nameB });
    const taskA = await createWorkItemViaApi(page, { title: titleA, assignedVendorId: idA });
    const taskB = await createWorkItemViaApi(page, { title: titleB, assignedVendorId: idB });
    try {
      const list = new WorkItemsPage(page);
      await list.goto();
      await list.waitForLoaded();
      await list.enableColumn('Vendor');

      await list.companyFilter.choose(nameA);
      await list.companyFilter.expectParam(idA);
      await expect(list.workItemRow(titleA)).toBeVisible();
      await expect(list.workItemRow(titleB)).toHaveCount(0);

      await exerciseFilter(page, list.companyFilter, nameB, idB);
      await expect(list.workItemRow(titleB)).toBeVisible();
    } finally {
      await deleteWorkItemViaApi(page, taskA);
      await deleteWorkItemViaApi(page, taskB);
      await deleteVendorViaApi(page, idA);
      await deleteVendorViaApi(page, idB);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F2 - Purchases
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company filter - Purchases (F2)', { tag: '@responsive' }, () => {
  test('F2: filter purchases by company, reopen, clear, Escape', async ({ page, testPrefix }) => {
    skipOnPhone(page);
    const nameA = `${testPrefix} Filter Purchase Co A`;
    const nameB = `${testPrefix} Filter Purchase Co B`;
    const itemA = `${testPrefix} Filter Purchase A`;
    const itemB = `${testPrefix} Filter Purchase B`;
    const idA = await createVendorViaApi(page, { name: nameA });
    const idB = await createVendorViaApi(page, { name: nameB });
    const purchaseA = await createHouseholdItemViaApi(page, { name: itemA, vendorId: idA });
    const purchaseB = await createHouseholdItemViaApi(page, { name: itemB, vendorId: idB });
    try {
      const list = new HouseholdItemsPage(page);
      await list.goto();
      await list.waitForLoaded();

      await list.companyFilter.choose(nameA);
      await list.companyFilter.expectParam(idA);
      await expect.poll(() => list.getItemNames()).toContain(itemA);
      await expect.poll(() => list.getItemNames()).not.toContain(itemB);

      await exerciseFilter(page, list.companyFilter, nameB, idB);
      await expect.poll(() => list.getItemNames()).toContain(itemB);
    } finally {
      await deleteHouseholdItemViaApi(page, purchaseA);
      await deleteHouseholdItemViaApi(page, purchaseB);
      await deleteVendorViaApi(page, idA);
      await deleteVendorViaApi(page, idB);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F3 - Invoices
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company filter - Invoices (F3)', { tag: '@responsive' }, () => {
  async function createInvoice(
    page: Page,
    vendorId: string,
    invoiceNumber: string,
  ): Promise<string> {
    const response = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
      data: { invoiceNumber, amount: 120, date: '2026-04-01', status: 'pending' },
    });
    expect(response.ok(), `POST invoice ${invoiceNumber}`).toBeTruthy();
    return ((await response.json()) as { invoice: { id: string } }).invoice.id;
  }

  test('F3: filter invoices by company, reopen, clear, Escape', async ({ page, testPrefix }) => {
    skipOnPhone(page);
    const nameA = `${testPrefix} Filter Invoice Co A`;
    const nameB = `${testPrefix} Filter Invoice Co B`;
    const numberA = `${testPrefix}-FIA`;
    const numberB = `${testPrefix}-FIB`;
    const idA = await createVendorViaApi(page, { name: nameA });
    const idB = await createVendorViaApi(page, { name: nameB });
    const invoiceA = await createInvoice(page, idA, numberA);
    const invoiceB = await createInvoice(page, idB, numberB);
    try {
      const list = new InvoicesPage(page);
      await list.goto();
      await list.waitForLoaded();

      await list.companyFilter.choose(nameA);
      await list.companyFilter.expectParam(idA);
      await expect.poll(() => list.getInvoiceNumbers()).toContain(numberA);
      await expect.poll(() => list.getInvoiceNumbers()).not.toContain(numberB);

      await exerciseFilter(page, list.companyFilter, nameB, idB);
      // exerciseFilter ends with the filter cleared; the shared E2E database holds many invoices,
      // so filter again before looking for B (an unfiltered first page may not contain it)
      await list.companyFilter.choose(nameB);
      await list.companyFilter.expectParam(idB);
      await expect.poll(() => list.getInvoiceNumbers()).toContain(numberB);
    } finally {
      await page.request.delete(`${API.vendors}/${idA}/invoices/${invoiceA}`);
      await page.request.delete(`${API.vendors}/${idB}/invoices/${invoiceB}`);
      await deleteVendorViaApi(page, idA);
      await deleteVendorViaApi(page, idB);
    }
  });

  test('F3: a ?vendorId= deep link filters the list and the filter shows the company name', async ({
    page,
    testPrefix,
  }) => {
    skipOnPhone(page);
    const name = `${testPrefix} Filter Deep Co`;
    const number = `${testPrefix}-FID`;
    const id = await createVendorViaApi(page, { name });
    const invoice = await createInvoice(page, id, number);
    try {
      const list = new InvoicesPage(page);
      await page.goto(`${INVOICES_ROUTE}?vendorId=${id}`);
      await list.heading.waitFor({ state: 'visible' });
      await list.waitForLoaded();
      await expect.poll(() => list.getInvoiceNumbers()).toEqual([number]);

      await list.companyFilter.open();
      await expect(list.companyFilter.selectedChip).toContainText(name);
    } finally {
      await page.request.delete(`${API.vendors}/${id}/invoices/${invoice}`);
      await deleteVendorViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F4 - focus never rests on <body> inside a filter popover
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company filter - focus (F4)', { tag: '@responsive' }, () => {
  test('F4: after choosing a company, and after clearing it, focus is on an element in the popover', async ({
    page,
    testPrefix,
  }) => {
    skipOnPhone(page);
    const name = `${testPrefix} Filter Focus Co`;
    const id = await createVendorViaApi(page, { name });
    try {
      const list = new HouseholdItemsPage(page);
      await list.goto();
      await list.waitForLoaded();
      const inPopover = () =>
        page.evaluate(() => {
          const active = document.activeElement;
          return !!active && active !== document.body && !!active.closest('[role="dialog"]');
        });

      await list.companyFilter.choose(name);
      await list.companyFilter.expectParam(id);
      await expect.poll(inPopover).toBe(true);

      await list.companyFilter.clearButton.click();
      await list.companyFilter.expectNoParam();
      await expect.poll(inPopover).toBe(true);
    } finally {
      await deleteVendorViaApi(page, id);
    }
  });
});
