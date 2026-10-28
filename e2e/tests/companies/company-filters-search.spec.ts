/**
 * E2E tests for the company filters of the Tasks, Purchases and Invoices lists (in-session
 * fix under EPIC-21). The filters are single-select entity pickers in the Filters panel (Purchases:
 * #2246), searching the server, so a company past the first page can be filtered by.
 *
 * F1  Tasks    Filters panel › Who (an EntityPicker), param `assignedVendorId`
 * F2  Purchases Filters panel › Company (an EntityPicker), param `vendorId`
 * F3  Invoices Filters panel › Company (an EntityPicker), param `vendorId`; a deep link shows the name
 *
 * Each scenario: choose a company (the list narrows, the URL carries the param), reopen (the name
 * shows), clear (the param is gone). The Filters panel is a sheet on phones, so all viewports run.
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
import { HouseholdItemsPage } from '../../pages/HouseholdItemsPage.js';
import { INVOICES_ROUTE, InvoicesPage } from '../../pages/InvoicesPage.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';

// ─────────────────────────────────────────────────────────────────────────────
// F1 - Tasks
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company filter - Tasks (F1)', { tag: '@responsive' }, () => {
  test('F1: filter tasks by company in Filters > Who, reopen, clear', async ({
    page,
    testPrefix,
  }) => {
    const nameA = `${testPrefix} Filter Task Co A`;
    const nameB = `${testPrefix} Filter Task Co B`;
    const titleA = `${testPrefix} Filter Task A`;
    const titleB = `${testPrefix} Filter Task B`;
    const idA = await createVendorViaApi(page, { name: nameA });
    const idB = await createVendorViaApi(page, { name: nameB });
    const taskA = await createWorkItemViaApi(page, { title: titleA, assignedVendorId: idA });
    const taskB = await createWorkItemViaApi(page, { title: titleB, assignedVendorId: idB });
    const vendorIdParam = () => new URL(page.url()).searchParams.get('assignedVendorId');
    try {
      const list = new WorkItemsPage(page);
      await list.openSearch(`${testPrefix} Filter Task`);

      // Choose: the URL carries the param and the list narrows to that company
      await list.pickCompanyFilter(nameA);
      await expect.poll(vendorIdParam).toBe(idA);
      await expect(list.workItemRow(titleA)).toBeVisible();
      await expect(list.workItemRow(titleB)).toHaveCount(0);

      // Reopen: the selected name shows
      await list.closeFilters();
      await list.openFilters();
      await expect(list.filtersSelected.first()).toContainText(nameA);

      // Clear: the param is gone, the input is back, and another company can be chosen
      await list.companyFilter.clearButton.click();
      await expect.poll(vendorIdParam).toBeNull();
      await expect(list.companyFilter.input).toBeVisible();
      await list.companyFilter.pick(nameB);
      await expect.poll(vendorIdParam).toBe(idB);
      await expect(list.workItemRow(titleB)).toBeVisible();
      await expect(list.workItemRow(titleA)).toHaveCount(0);
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
      const vendorIdParam = () => new URL(page.url()).searchParams.get('vendorId');
      await list.search(`${testPrefix} Filter Purchase`);

      // Choose: the URL carries the param and the list narrows to that company
      await list.pickCompanyFilter(nameA);
      await expect.poll(vendorIdParam).toBe(idA);
      await expect.poll(() => list.getItemNames()).toContain(itemA);
      await expect.poll(() => list.getItemNames()).not.toContain(itemB);

      // Reopen: the selected name shows
      await list.closeFilters();
      await list.openFilters();
      await expect(list.filtersSelected.first()).toContainText(nameA);

      // Clear: the param is gone, the input is back, and another company can be chosen
      await list.companyFilter.clearButton.click();
      await expect.poll(vendorIdParam).toBeNull();
      await expect(list.companyFilter.input).toBeVisible();
      await list.companyFilter.pick(nameB);
      await expect.poll(vendorIdParam).toBe(idB);
      await expect.poll(() => list.getItemNames()).toContain(itemB);
      await expect.poll(() => list.getItemNames()).not.toContain(itemA);
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

  test('F3: filter invoices by company in the Filters panel, reopen, clear', async ({
    page,
    testPrefix,
  }) => {
    const nameA = `${testPrefix} Filter Invoice Co A`;
    const nameB = `${testPrefix} Filter Invoice Co B`;
    const numberA = `${testPrefix}-FIA`;
    const numberB = `${testPrefix}-FIB`;
    const idA = await createVendorViaApi(page, { name: nameA });
    const idB = await createVendorViaApi(page, { name: nameB });
    const invoiceA = await createInvoice(page, idA, numberA);
    const invoiceB = await createInvoice(page, idB, numberB);
    const vendorIdParam = () => new URL(page.url()).searchParams.get('vendorId');
    try {
      const list = new InvoicesPage(page);
      await list.goto();
      await list.waitForLoaded();

      // Choose: the URL carries the param and the list narrows to that company
      await list.pickCompanyFilter(nameA);
      await expect.poll(vendorIdParam).toBe(idA);
      await expect.poll(() => list.getInvoiceNumbers()).toEqual([numberA]);

      // Reopen: the selected name shows
      await list.closeFilters();
      await list.openFilters();
      await expect(list.companyFilterSelected).toContainText(nameA);

      // Clear: the param is gone, the input is back, and another company can be chosen
      await list.companyFilter.clearButton.click();
      await expect.poll(vendorIdParam).toBeNull();
      await expect(list.companyFilter.input).toBeVisible();
      await list.companyFilter.pick(nameB);
      await expect.poll(vendorIdParam).toBe(idB);
      await expect.poll(() => list.getInvoiceNumbers()).toEqual([numberB]);
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

      await list.openFilters();
      await expect(list.companyFilterSelected).toContainText(name);
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
    const name = `${testPrefix} Filter Focus Co`;
    const id = await createVendorViaApi(page, { name });
    try {
      const list = new HouseholdItemsPage(page);
      const vendorIdParam = () => new URL(page.url()).searchParams.get('vendorId');
      await list.goto();
      await list.waitForLoaded();
      const inFilters = () =>
        page.evaluate(() => {
          const active = document.activeElement;
          return (
            !!active &&
            active !== document.body &&
            !!active.closest('[data-testid^="purchases-filters-"]')
          );
        });

      await list.pickCompanyFilter(name);
      await expect.poll(vendorIdParam).toBe(id);
      await expect.poll(inFilters).toBe(true);

      await list.companyFilter.clearButton.click();
      await expect.poll(vendorIdParam).toBeNull();
      await expect.poll(inFilters).toBe(true);
    } finally {
      await deleteVendorViaApi(page, id);
    }
  });
});
