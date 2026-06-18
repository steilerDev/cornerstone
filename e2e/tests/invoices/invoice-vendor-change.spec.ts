/**
 * E2E tests for Invoice Vendor Reassignment (Story #1736)
 *
 * Scenarios covered:
 * - Scenario 1: Edit modal pre-populates vendor picker with the current vendor
 * - Scenario 2: Happy-path vendor reassignment — detail page updates + vendor list reflects change
 * - Scenario 3: Other fields preserved when vendor and notes are changed together
 * - Scenario 4: Client-side validation — clearing vendor blocks save and shows error
 * - Scenario 5: Search-as-you-type — typing filters vendor options in the picker
 * - Scenario 6: Responsive — vendor picker is usable on mobile viewport (@responsive)
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Inline API helpers (mirror the pattern used in invoices.spec.ts)
// ─────────────────────────────────────────────────────────────────────────────

interface VendorApiResponse {
  id: string;
  name: string;
}

interface InvoiceApiResponse {
  id: string;
  invoiceNumber: string | null;
  amount: number;
  status: string;
  vendorId: string;
}

async function createVendorViaApi(page: Page, name: string): Promise<VendorApiResponse> {
  const response = await page.request.post(API.vendors, { data: { name } });
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`POST ${API.vendors} returned ${response.status()}: ${body}`);
  }
  const body = (await response.json()) as { vendor: VendorApiResponse };
  return body.vendor;
}

async function deleteVendorViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${id}`);
}

async function createInvoiceViaApi(
  page: Page,
  vendorId: string,
  data: {
    invoiceNumber?: string;
    amount: number;
    date: string;
    notes?: string;
    status?: string;
  },
): Promise<InvoiceApiResponse> {
  const response = await page.request.post(`${API.vendors}/${vendorId}/invoices`, { data });
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`POST invoices returned ${response.status()}: ${body}`);
  }
  const body = (await response.json()) as { invoice: InvoiceApiResponse };
  return body.invoice;
}

async function deleteInvoiceViaApi(page: Page, vendorId: string, invoiceId: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${vendorId}/invoices/${invoiceId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Edit modal pre-populates vendor picker
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Invoice edit modal vendor pre-population (Scenario 1)',
  { tag: '@responsive' },
  () => {
    test('Edit modal vendor picker shows current vendor as selected value', async ({
      page,
      testPrefix,
    }) => {
      const detailPage = new InvoiceDetailPage(page);
      const vendorName = `${testPrefix} Pre-pop Vendor`;
      let vendorId = '';
      let invoiceId = '';

      try {
        const vendor = await createVendorViaApi(page, vendorName);
        vendorId = vendor.id;
        const invoice = await createInvoiceViaApi(page, vendorId, {
          invoiceNumber: `${testPrefix}-PREPOP`,
          amount: 500,
          date: '2026-01-15',
        });
        invoiceId = invoice.id;

        await detailPage.goto(invoiceId);
        await detailPage.openEditModal();

        // The vendor picker should be in selectedDisplay mode (chip) showing the vendor name
        await expect(detailPage.editVendorSelectedDisplay).toBeVisible();
        await expect(detailPage.editVendorSelectedDisplay).toContainText(vendorName);

        // The raw text input should NOT be visible while a vendor is selected
        await expect(detailPage.editVendorInput).not.toBeVisible();

        await detailPage.closeEditModal();
      } finally {
        if (invoiceId && vendorId)
          await deleteInvoiceViaApi(page, vendorId, invoiceId).catch(() => {});
        if (vendorId) await deleteVendorViaApi(page, vendorId).catch(() => {});
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Happy-path vendor reassignment
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Invoice vendor reassignment — happy path (Scenario 2)',
  { tag: '@responsive' },
  () => {
    test('Changing the vendor and saving updates the detail page and vendor list', async ({
      page,
      testPrefix,
    }) => {
      const detailPage = new InvoiceDetailPage(page);
      const invoicesPage = new InvoicesPage(page);

      const originalVendorName = `${testPrefix} Original Vendor`;
      const newVendorName = `${testPrefix} New Vendor`;
      let originalVendorId = '';
      let newVendorId = '';
      // After reassignment, the invoice moves to newVendorId, so track for cleanup
      let invoiceId = '';

      try {
        const originalVendor = await createVendorViaApi(page, originalVendorName);
        originalVendorId = originalVendor.id;
        const newVendor = await createVendorViaApi(page, newVendorName);
        newVendorId = newVendor.id;

        const invoice = await createInvoiceViaApi(page, originalVendorId, {
          invoiceNumber: `${testPrefix}-VCHG-001`,
          amount: 1200,
          date: '2026-02-01',
        });
        invoiceId = invoice.id;

        await detailPage.goto(invoiceId);

        // Verify original vendor is shown on the detail page
        const fieldsBefore = await detailPage.getDetailFields();
        expect(fieldsBefore['Vendor']).toBe(originalVendorName);

        // Open edit modal and reassign vendor
        await detailPage.openEditModal();
        await detailPage.selectVendorInEditModal(newVendorName);

        // Save — PATCH goes to /api/vendors/:originalVendorId/invoices/:invoiceId
        await detailPage.saveEdit();

        // Detail page now shows the new vendor name
        const fieldsAfter = await detailPage.getDetailFields();
        expect(fieldsAfter['Vendor']).toBe(newVendorName);

        // Vendor link in the detail card should point to the new vendor
        const vendorLink = detailPage.infoList.getByRole('link', { name: newVendorName });
        await expect(vendorLink).toBeVisible();
        const href = await vendorLink.getAttribute('href');
        expect(href).toContain(newVendorId);

        // Invoice no longer shows up when filtered to the old vendor on the invoices list
        // (filter by vendorId via the URL query)
        await page.goto(`/budget/invoices?vendorId=${originalVendorId}`);
        await invoicesPage.heading.waitFor({ state: 'visible' });
        // The invoice number should NOT appear under the original vendor.
        // DataTable renders both a desktop <table> and mobile cards container in the DOM
        // simultaneously (one is CSS-hidden per viewport). Scoping to [class*="invoiceLink"]
        // with { hasText } and then filtering to visible ensures strict-mode safety regardless
        // of viewport: when the invoice is absent the locator resolves to 0 visible elements.
        const invoiceNumber = `${testPrefix}-VCHG-001`;
        const visibleInvoiceLink = page
          .locator('[class*="invoiceLink"]', { hasText: invoiceNumber })
          .filter({ visible: true });
        await expect(visibleInvoiceLink).toHaveCount(0);

        // It DOES appear when filtered to the new vendor — exactly 1 visible link.
        await page.goto(`/budget/invoices?vendorId=${newVendorId}`);
        await invoicesPage.heading.waitFor({ state: 'visible' });
        await expect(visibleInvoiceLink).toHaveCount(1);
        await expect(visibleInvoiceLink).toBeVisible();
      } finally {
        // After reassignment, invoice lives under newVendorId
        if (invoiceId && newVendorId)
          await deleteInvoiceViaApi(page, newVendorId, invoiceId).catch(() => {});
        if (originalVendorId) await deleteVendorViaApi(page, originalVendorId).catch(() => {});
        if (newVendorId) await deleteVendorViaApi(page, newVendorId).catch(() => {});
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Other fields preserved when vendor and notes are changed together
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Invoice vendor reassignment — other fields preserved (Scenario 3)',
  { tag: '@responsive' },
  () => {
    test('Changing vendor and notes in one save persists both changes', async ({
      page,
      testPrefix,
    }) => {
      const detailPage = new InvoiceDetailPage(page);

      const vendorA = `${testPrefix} Fields-A Vendor`;
      const vendorB = `${testPrefix} Fields-B Vendor`;
      let vendorAId = '';
      let vendorBId = '';
      let invoiceId = '';

      try {
        const va = await createVendorViaApi(page, vendorA);
        vendorAId = va.id;
        const vb = await createVendorViaApi(page, vendorB);
        vendorBId = vb.id;

        const invoice = await createInvoiceViaApi(page, vendorAId, {
          invoiceNumber: `${testPrefix}-FIELDS`,
          amount: 800,
          date: '2026-03-10',
        });
        invoiceId = invoice.id;

        await detailPage.goto(invoiceId);

        // Open edit modal and change both vendor and notes
        await detailPage.openEditModal();
        await detailPage.selectVendorInEditModal(vendorB);
        await detailPage.fillEditForm({ notes: `${testPrefix} reassigned note` });
        await detailPage.saveEdit();

        // Both vendor and notes are updated on the detail page
        const fields = await detailPage.getDetailFields();
        expect(fields['Vendor']).toBe(vendorB);
        expect(fields['Notes']).toBe(`${testPrefix} reassigned note`);

        // Amount and invoice number are unchanged
        expect(fields['Invoice #']).toBe(`${testPrefix}-FIELDS`);
      } finally {
        // After reassignment invoice lives under vendorB
        if (invoiceId && vendorBId)
          await deleteInvoiceViaApi(page, vendorBId, invoiceId).catch(() => {});
        if (vendorAId) await deleteVendorViaApi(page, vendorAId).catch(() => {});
        if (vendorBId) await deleteVendorViaApi(page, vendorBId).catch(() => {});
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Client-side validation — clearing vendor blocks save
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Invoice edit modal — vendor required validation (Scenario 4)',
  { tag: '@responsive' },
  () => {
    test('Clearing the vendor and submitting shows validation error and keeps modal open', async ({
      page,
      testPrefix,
    }) => {
      const detailPage = new InvoiceDetailPage(page);
      const vendorName = `${testPrefix} Validation Vendor`;
      let vendorId = '';
      let invoiceId = '';

      try {
        const vendor = await createVendorViaApi(page, vendorName);
        vendorId = vendor.id;
        const invoice = await createInvoiceViaApi(page, vendorId, {
          amount: 300,
          date: '2026-04-01',
        });
        invoiceId = invoice.id;

        await detailPage.goto(invoiceId);
        await detailPage.openEditModal();

        // Clear the pre-populated vendor
        await detailPage.clearVendorInEditModal();

        // Attempt to save — the form should block submission
        await detailPage.editSaveButton.click();

        // Modal must remain visible (no navigation)
        await expect(detailPage.editModal).toBeVisible();

        // Vendor validation error message is displayed
        await expect(detailPage.editVendorError).toBeVisible();
        await expect(detailPage.editVendorError).toContainText('Please select a vendor');

        await detailPage.closeEditModal();
      } finally {
        if (invoiceId && vendorId)
          await deleteInvoiceViaApi(page, vendorId, invoiceId).catch(() => {});
        if (vendorId) await deleteVendorViaApi(page, vendorId).catch(() => {});
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Search-as-you-type filters vendor options
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Invoice edit modal — vendor search-as-you-type (Scenario 5)',
  { tag: '@responsive' },
  () => {
    test('Typing in the vendor picker filters the dropdown options', async ({
      page,
      testPrefix,
    }) => {
      const detailPage = new InvoiceDetailPage(page);

      // Create two vendors with distinct names to test filtering
      const vendorMatch = `${testPrefix} SearchMatch Vendor`;
      const vendorNoMatch = `${testPrefix} ZZZNoMatch Vendor`;
      let matchId = '';
      let noMatchId = '';
      let invoiceId = '';

      try {
        const vm = await createVendorViaApi(page, vendorMatch);
        matchId = vm.id;
        const vnm = await createVendorViaApi(page, vendorNoMatch);
        noMatchId = vnm.id;

        const invoice = await createInvoiceViaApi(page, matchId, {
          amount: 150,
          date: '2026-05-01',
        });
        invoiceId = invoice.id;

        await detailPage.goto(invoiceId);
        await detailPage.openEditModal();

        // Clear the pre-populated vendor to enter search mode
        await detailPage.clearVendorInEditModal();

        // Type a partial query that matches only vendorMatch
        await detailPage.editVendorInput.fill('SearchMatch');

        const dropdown = page.locator('[data-search-picker-dropdown]');
        await dropdown.waitFor({ state: 'visible' });

        // The matching vendor should be visible in the dropdown
        await expect(dropdown.getByRole('option', { name: vendorMatch })).toBeVisible();

        // The non-matching vendor should NOT be visible
        await expect(dropdown.getByRole('option', { name: vendorNoMatch })).not.toBeVisible();

        await detailPage.closeEditModal();
      } finally {
        if (invoiceId && matchId)
          await deleteInvoiceViaApi(page, matchId, invoiceId).catch(() => {});
        if (matchId) await deleteVendorViaApi(page, matchId).catch(() => {});
        if (noMatchId) await deleteVendorViaApi(page, noMatchId).catch(() => {});
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Responsive — vendor picker usable on mobile viewport
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Invoice edit modal vendor picker — responsive (Scenario 6)',
  { tag: '@responsive' },
  () => {
    test('Vendor picker in edit modal is usable on mobile viewport', async ({
      page,
      testPrefix,
    }) => {
      const detailPage = new InvoiceDetailPage(page);

      const originalVendor = `${testPrefix} Mobile-Orig Vendor`;
      const newVendor = `${testPrefix} Mobile-New Vendor`;
      let origId = '';
      let newId = '';
      let invoiceId = '';

      try {
        const ov = await createVendorViaApi(page, originalVendor);
        origId = ov.id;
        const nv = await createVendorViaApi(page, newVendor);
        newId = nv.id;

        const invoice = await createInvoiceViaApi(page, origId, {
          amount: 250,
          date: '2026-06-01',
        });
        invoiceId = invoice.id;

        await detailPage.goto(invoiceId);
        await detailPage.openEditModal();

        // Verify the vendor picker is visible and shows the pre-populated vendor
        await expect(detailPage.editVendorSelectedDisplay).toBeVisible();
        await expect(detailPage.editVendorSelectedDisplay).toContainText(originalVendor);

        // Select a new vendor using the helper (works at any viewport)
        await detailPage.selectVendorInEditModal(newVendor);

        // After selection, selectedDisplay should show the new vendor
        await expect(detailPage.editVendorSelectedDisplay).toContainText(newVendor);

        // Save and verify the reassignment persisted
        await detailPage.saveEdit();

        const fields = await detailPage.getDetailFields();
        expect(fields['Vendor']).toBe(newVendor);
      } finally {
        // After reassignment invoice lives under newId
        if (invoiceId && newId) await deleteInvoiceViaApi(page, newId, invoiceId).catch(() => {});
        if (origId) await deleteVendorViaApi(page, origId).catch(() => {});
        if (newId) await deleteVendorViaApi(page, newId).catch(() => {});
      }
    });
  },
);
