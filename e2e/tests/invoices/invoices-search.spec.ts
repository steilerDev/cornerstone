/**
 * E2E tests for list search behaviour (Story #2197, ACs 1 + 2).
 *
 * Scenarios:
 *   1. Invoices list: the search box keeps focus and value while typing into a no-result
 *      state; the URL `?q=` commits after the 300 ms pause; clearing with the keyboard
 *      brings rows back with focus kept.
 *   2. Vendors list: the same focus / value / URL / empty-state assertion.
 *   3. Invoice search matches the company name.
 *   4. Invoice search matches the invoice number.
 *   5. Invoice search matches the invoice description (notes).
 *
 * All names and numbers are synthetic. Data is seeded via the REST API and removed in finally.
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { VendorsPage } from '../../pages/VendorsPage.js';
import { API } from '../../fixtures/testData.js';
import type { Page } from '@playwright/test';

async function createVendor(page: Page, name: string): Promise<string> {
  const resp = await page.request.post(API.vendors, { data: { name } });
  expect(resp.ok(), `POST vendor "${name}" failed: ${resp.status()}`).toBeTruthy();
  return ((await resp.json()) as { vendor: { id: string } }).vendor.id;
}

async function createInvoice(
  page: Page,
  vendorId: string,
  data: { invoiceNumber: string; notes?: string },
): Promise<string> {
  const resp = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { amount: 1000, date: '2026-06-01', status: 'pending', ...data },
  });
  expect(resp.ok(), `POST invoice failed: ${resp.status()}`).toBeTruthy();
  return ((await resp.json()) as { invoice: { id: string } }).invoice.id;
}

async function cleanup(
  page: Page,
  vendors: Array<{ id: string; invoiceIds: string[] }>,
): Promise<void> {
  for (const v of vendors) {
    for (const invoiceId of v.invoiceIds) {
      await page.request.delete(`${API.vendors}/${v.id}/invoices/${invoiceId}`);
    }
    await page.request.delete(`${API.vendors}/${v.id}`);
  }
}

test.describe('Scenario 1 — Invoices search keeps focus and value', { tag: '@responsive' }, () => {
  test('typing past a no-result state keeps focus, value, URL and empty state; clearing restores rows', async ({
    page,
    testPrefix,
  }) => {
    const seeded: Array<{ id: string; invoiceIds: string[] }> = [];
    try {
      const vendorId = await createVendor(page, `${testPrefix} Test Roofing Co`);
      const invoiceId = await createInvoice(page, vendorId, {
        invoiceNumber: `${testPrefix}-INV-TEST-0001`,
      });
      seeded.push({ id: vendorId, invoiceIds: [invoiceId] });

      const invoicesPage = new InvoicesPage(page);
      await invoicesPage.goto();
      await invoicesPage.waitForLoaded();

      await invoicesPage.typeSearch('zzz-no-match');
      await expect(invoicesPage.emptyState).toBeVisible();

      // Keep typing while the list is in the empty state.
      await invoicesPage.searchInput.pressSequentially('-more');

      await expect(invoicesPage.searchInput).toBeFocused();
      await expect(invoicesPage.searchInput).toHaveValue('zzz-no-match-more');
      await expect(page).toHaveURL(/[?&]q=zzz-no-match-more(&|$)/);
      await expect(invoicesPage.emptyState).toBeVisible();
      // The toolbar was not remounted: still focused after the debounce settled.
      await expect(invoicesPage.searchInput).toBeFocused();

      await invoicesPage.clearSearchWithKeys();

      await expect(invoicesPage.searchInput).toHaveValue('');
      await expect(invoicesPage.searchInput).toBeFocused();
      await expect(invoicesPage.emptyState).toBeHidden();
      await expect(page).not.toHaveURL(/[?&]q=/);
      // Rows are back (the seeded invoice may be on a later page in a busy shared DB).
      await invoicesPage.waitForLoaded();
      expect((await invoicesPage.getInvoiceNumbers()).length).toBeGreaterThan(0);
    } finally {
      await cleanup(page, seeded);
    }
  });
});

test.describe('Scenario 2 — Vendors search keeps focus and value', { tag: '@responsive' }, () => {
  test('typing past a no-result state keeps focus, value, URL and empty state', async ({
    page,
    testPrefix,
  }) => {
    const seeded: Array<{ id: string; invoiceIds: string[] }> = [];
    try {
      const vendorId = await createVendor(page, `${testPrefix} Test Roofing Co`);
      seeded.push({ id: vendorId, invoiceIds: [] });

      const vendorsPage = new VendorsPage(page);
      await vendorsPage.goto();

      await vendorsPage.searchInput.click();
      await vendorsPage.searchInput.pressSequentially('zzz-no-match');
      await expect(vendorsPage.emptyState).toBeVisible();

      await vendorsPage.searchInput.pressSequentially('-more');

      await expect(vendorsPage.searchInput).toBeFocused();
      await expect(vendorsPage.searchInput).toHaveValue('zzz-no-match-more');
      await expect(page).toHaveURL(/[?&]q=zzz-no-match-more(&|$)/);
      await expect(vendorsPage.emptyState).toBeVisible();
      await expect(vendorsPage.searchInput).toBeFocused();

      await vendorsPage.searchInput.press('ControlOrMeta+a');
      await vendorsPage.searchInput.press('Backspace');

      await expect(vendorsPage.searchInput).toHaveValue('');
      await expect(vendorsPage.searchInput).toBeFocused();
      await expect(vendorsPage.emptyState).toBeHidden();
    } finally {
      await cleanup(page, seeded);
    }
  });
});

test.describe('Scenarios 3-5 — Invoice search matches company, number and description', () => {
  test('finds invoices by company name, invoice number and description', async ({
    page,
    testPrefix,
  }) => {
    const seeded: Array<{ id: string; invoiceIds: string[] }> = [];
    try {
      const drywallName = `${testPrefix} Sample Drywall Ltd`;
      const roofingName = `${testPrefix} Test Roofing Co`;
      const number1 = `${testPrefix}-INV-TEST-0001`;
      const number2 = `${testPrefix}-INV-TEST-0002`;
      const noteToken = `${testPrefix}-scaffold-rental`;

      const drywallId = await createVendor(page, drywallName);
      const roofingId = await createVendor(page, roofingName);
      const inv1 = await createInvoice(page, drywallId, { invoiceNumber: number1 });
      const inv2 = await createInvoice(page, roofingId, {
        invoiceNumber: number2,
        notes: `Includes ${noteToken} for two weeks`,
      });
      seeded.push({ id: drywallId, invoiceIds: [inv1] }, { id: roofingId, invoiceIds: [inv2] });

      const invoicesPage = new InvoicesPage(page);
      await invoicesPage.goto();
      await invoicesPage.waitForLoaded();

      // Company: search by (part of) the vendor name, prefix keeps it unique per worker.
      await invoicesPage.typeSearch(`${testPrefix} Sample Drywall`);
      await expect.poll(() => invoicesPage.getInvoiceNumbers()).toEqual([number1]);

      // Invoice number
      await invoicesPage.clearSearchWithKeys();
      await invoicesPage.typeSearch(number2);
      await expect.poll(() => invoicesPage.getInvoiceNumbers()).toEqual([number2]);

      // Description (notes)
      await invoicesPage.clearSearchWithKeys();
      await invoicesPage.typeSearch(noteToken);
      await expect.poll(() => invoicesPage.getInvoiceNumbers()).toEqual([number2]);
    } finally {
      await cleanup(page, seeded);
    }
  });
});
