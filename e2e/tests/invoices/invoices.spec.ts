/**
 * E2E tests for Invoice Management
 *
 * UAT Scenarios covered:
 * - Scenario 1: Invoices list page loads and shows the status chips
 * - Scenario 2: Create invoice — happy path (all required fields)
 * - Scenario 3: Create invoice with optional fields (invoice number, due date, notes)
 * - Scenario 4: Create invoice fails — missing required vendor
 * - Scenario 5: Create invoice fails — missing required amount
 * - Scenario 6: Create invoice fails — missing required date
 * - Scenario 7: Invoice row click navigates to detail page
 * - Scenario 8: Invoice detail page shows all fields
 * - Scenario 9: Edit invoice — change status and notes (happy path)
 * - Scenario 10: Delete invoice — happy path
 * - Scenario 11: Invoice detail page back button navigates to list
 * - Scenario 12: Empty state shown when no invoices exist
 * - Scenario 13: Status chip / URL param changes visible invoices
 * - Responsive layout (@responsive tag)
 * - Dark mode
 */

import { test, expect } from '../../fixtures/isolatedUser.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import type { Page } from '@playwright/test';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { API } from '../../fixtures/testData.js';
import { emptyInvoiceListResponse } from '../../fixtures/invoiceListMocks.js';
import { parseMoney } from '../../fixtures/figureSurfaces.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
} from '../../fixtures/apiHelpers.js';

// Issue #1876 (reshaped by #2238): the hidden-by-default columns of the Invoices table are
// "Split" (the itemized share of the amount) and "Notes", toggled in ⋯ › Columns…; "Still to pay"
// is a default column and shows the deposit/refund-aware open amount that replaced the retired
// "Effective Amount" / "Remaining Amount" pair.
// Note: this file already has its own "Scenario 7" (row click navigation, above) —
// this addition is labeled by Issue number to avoid colliding with that numbering.

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
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
    dueDate?: string;
    status?: string;
    notes?: string;
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

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 & 12: Empty state and list page load
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices list — empty state (Scenario 12)', { tag: '@responsive' }, () => {
  test('Empty state message shown when no invoices exist', { tag: '@smoke' }, async ({ page }) => {
    const invoicesPage = new InvoicesPage(page);

    // Intercept the invoices API to return an empty list
    await page.route(`${API.vendors}/*/invoices*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ invoices: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('/api/invoices*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(emptyInvoiceListResponse()),
        });
      } else {
        await route.continue();
      }
    });

    // To pay is the default chip: nothing to pay, said positively, with no "add" call to action
    await invoicesPage.goto();
    await invoicesPage.waitForLoaded();

    await expect(invoicesPage.emptyState).toBeVisible();
    await expect(invoicesPage.emptyState).toContainText('Nothing to pay right now');
  });

  test('Empty state on the All chip says "No invoices match." with Clear filters', async ({
    page,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    await page.route('/api/invoices*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(emptyInvoiceListResponse()),
        });
      } else {
        await route.continue();
      }
    });
    await invoicesPage.gotoChip('all');
    await expect(invoicesPage.emptyState).toContainText('No invoices match.');
    await expect(
      invoicesPage.emptyState.getByRole('button', { name: /clear filters/i }),
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: List page load — summary cards and navigation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices list page load (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Invoices list page loads with heading, status chips, and the New invoice button',
    { tag: '@smoke' },
    async ({ page }) => {
      const invoicesPage = new InvoicesPage(page);

      await invoicesPage.goto();

      // Page heading
      await expect(invoicesPage.heading).toBeVisible();
      await expect(invoicesPage.heading).toContainText('Invoices');

      // The status chips render; To pay is pressed by default (#2238)
      for (const chip of ['pending', 'quotation', 'paid', 'claimed', 'all'] as const) {
        await expect(invoicesPage.chip(chip)).toBeVisible();
      }
      await expect(invoicesPage.chip('pending')).toHaveAttribute('aria-pressed', 'true');

      // The New invoice button is visible
      await expect(invoicesPage.newInvoiceButton).toBeVisible();
      await expect(invoicesPage.newInvoiceButton).toHaveText('New invoice');
    },
  );

  test('Money views are listed in the sidebar with Invoices highlighted', async ({ page }) => {
    const invoicesPage = new InvoicesPage(page);
    const appShell = new AppShellPage(page);
    await invoicesPage.goto();

    // #2205: the Money views live in the sidebar, not in an in-page tab row
    // Below 1024px the views live in the title menu (open it; the current row carries a check mark)
    await appShell.revealViews();
    await expect(appShell.viewLinks).toContainText([
      'Invoices',
      'Funding sources',
      'Grants',
      'Bank report',
    ]);
    await expect(appShell.viewLink('invoices')).toHaveAttribute('aria-current', 'page');
    await expect(appShell.activeEntries).toHaveCount(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 & 3: Create invoice — happy path
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Create invoice (Scenarios 2 & 3)', { tag: '@responsive' }, () => {
  test('Create invoice with required fields — invoice appears in list', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    const vendorName = `${testPrefix} Invoice Vendor`;
    let vendorId = '';

    try {
      // Create a vendor via API for this test
      const vendor = await createVendorViaApi(page, vendorName);
      vendorId = vendor.id;

      await invoicesPage.goto();

      // Open the create modal
      await invoicesPage.openCreateModal();
      await expect(invoicesPage.createModal).toBeVisible();

      // Fill required fields. Default status on the form is 'pending' (To pay, #2194); it is
      // still set explicitly so this test does not depend on the form default.
      await invoicesPage.selectCreateVendor(vendorName);
      await invoicesPage.createAmountInput.fill('1500.00');
      await invoicesPage.createDateInput.fill('2026-01-15');
      await invoicesPage.createStatusSelect.selectOption('pending');

      // Register response listener BEFORE submit
      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/invoices') &&
          resp.request().method() === 'POST' &&
          resp.status() === 201,
      );
      await invoicesPage.createSubmitButton.click();
      await responsePromise;
      await invoicesPage.createModal.waitFor({ state: 'hidden' });

      // Wait for list to reload and show data
      await invoicesPage.waitForLoaded();

      // The To pay chip counts the new pending invoice. The counts and the rows share one API
      // response, but the list can show the previous batch during the re-fetch; poll the count.
      await expect
        .poll(() => invoicesPage.chipCount('pending'), {
          message: 'To pay chip count did not update after invoice creation',
          timeout: 10_000,
        })
        .toBeGreaterThanOrEqual(1);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Create invoice with all optional fields — invoice number and notes visible in list', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    const vendorName = `${testPrefix} Opt Vendor`;
    const invoiceNumber = `${testPrefix}-INV-001`;
    let vendorId = '';
    let invoiceId = '';

    try {
      const vendor = await createVendorViaApi(page, vendorName);
      vendorId = vendor.id;

      await invoicesPage.goto();
      await invoicesPage.openCreateModal();
      await expect(invoicesPage.createModal).toBeVisible();

      await invoicesPage.selectCreateVendor(vendorName);
      await invoicesPage.createNumberInput.fill(invoiceNumber);
      await invoicesPage.createAmountInput.fill('750.50');
      await invoicesPage.createDateInput.fill('2026-02-01');
      await invoicesPage.createDueDateInput.fill('2026-03-01');
      await invoicesPage.createStatusSelect.selectOption('quotation');
      await invoicesPage.createNotesInput.fill(`Notes for ${testPrefix}`);

      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/invoices') &&
          resp.request().method() === 'POST' &&
          resp.status() === 201,
        { timeout: 15000 },
      );
      await invoicesPage.createSubmitButton.click();
      const response = await responsePromise;
      const body = (await response.json()) as { invoice: InvoiceApiResponse };
      invoiceId = body.invoice.id;
      await invoicesPage.createModal.waitFor({ state: 'hidden' });

      await invoicesPage.waitForLoaded();

      // The invoice number should appear in the list. Search for it first: the shared database
      // holds more invoices than one page, so an unfiltered first page may not show it.
      await invoicesPage.typeSearch(invoiceNumber);
      await expect.poll(() => invoicesPage.getInvoiceNumbers()).toContain(invoiceNumber);
    } finally {
      // No separate delete for invoice needed since deleting the vendor cascades
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      void invoiceId; // referenced but cleanup is via vendor delete
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 4–6: Create invoice — validation errors
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Create invoice validation (Scenarios 4–6)', { tag: '@responsive' }, () => {
  test('Create invoice fails — vendor not selected shows validation error', async ({ page }) => {
    const invoicesPage = new InvoicesPage(page);

    await invoicesPage.goto();
    await invoicesPage.openCreateModal();

    // Fill amount and date but no vendor
    await invoicesPage.createAmountInput.fill('500.00');
    await invoicesPage.createDateInput.fill('2026-01-15');

    // The submit button is disabled when no vendor is selected
    await expect(invoicesPage.createSubmitButton).toBeDisabled();

    // Close modal
    await invoicesPage.closeCreateModal();
  });

  test('Create invoice fails — amount not filled shows submit disabled', async ({ page }) => {
    const invoicesPage = new InvoicesPage(page);

    await invoicesPage.goto();
    await invoicesPage.openCreateModal();

    // Fill date only (no vendor, no amount)
    await invoicesPage.createDateInput.fill('2026-01-15');

    // Submit button disabled: requires vendorId, amount, AND date
    await expect(invoicesPage.createSubmitButton).toBeDisabled();

    await invoicesPage.closeCreateModal();
  });

  test('Create invoice fails — date not filled shows submit disabled', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    const vendorName = `${testPrefix} NoDate Vendor`;
    let vendorId = '';

    try {
      const vendor = await createVendorViaApi(page, vendorName);
      vendorId = vendor.id;

      await invoicesPage.goto();
      await invoicesPage.openCreateModal();

      // Fill vendor and amount but not date
      await invoicesPage.selectCreateVendor(vendorName);
      await invoicesPage.createAmountInput.fill('200.00');
      // Deliberately omit createDateInput

      // Submit button is disabled when date is empty
      await expect(invoicesPage.createSubmitButton).toBeDisabled();

      await invoicesPage.closeCreateModal();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Create modal can be cancelled without creating an invoice', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    const vendorName = `${testPrefix} Cancel Vendor`;
    let vendorId = '';

    try {
      const vendor = await createVendorViaApi(page, vendorName);
      vendorId = vendor.id;

      await invoicesPage.goto();
      await invoicesPage.openCreateModal();
      await expect(invoicesPage.createModal).toBeVisible();

      // Start filling form then cancel
      await invoicesPage.createAmountInput.fill('999.99');
      await invoicesPage.closeCreateModal();

      await expect(invoicesPage.createModal).not.toBeVisible();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Row click navigation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice row click navigation (Scenario 7)', { tag: '@responsive' }, () => {
  test('Clicking an invoice row navigates to the invoice detail page', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    const detailPage = new InvoiceDetailPage(page);
    const vendorName = `${testPrefix} Nav Vendor`;
    let vendorId = '';

    try {
      const vendor = await createVendorViaApi(page, vendorName);
      vendorId = vendor.id;
      const invoice = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-ROW-001`,
        amount: 2000,
        date: '2026-01-10',
      });

      // Search by this test's own unique invoice number: the shared database holds more
      // invoices than the first batch, and a search covers every status.
      await invoicesPage.search(`${testPrefix}-ROW-001`);

      // The title link navigates in place on both surfaces (table and cards)
      await invoicesPage.title(invoice.id).click();

      // Should navigate to the detail page
      await page.waitForURL(`**/budget/invoices/${invoice.id}`);
      await expect(detailPage.heading).toBeVisible();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Invoice detail page — view all fields
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice detail page (Scenario 8)', { tag: '@responsive' }, () => {
  test(
    'Invoice detail page shows all fields correctly',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      const vendorName = `${testPrefix} Detail Vendor`;
      let vendorId = '';

      try {
        const vendor = await createVendorViaApi(page, vendorName);
        vendorId = vendor.id;
        const invoice = await createInvoiceViaApi(page, vendorId, {
          invoiceNumber: `${testPrefix}-DET-001`,
          amount: 3500,
          date: '2026-01-20',
          dueDate: '2026-02-20',
          status: 'pending',
          notes: `Test notes for ${testPrefix}`,
        });

        await detailPage.goto(invoice.id);

        // Heading shows the invoice number
        await expect(detailPage.heading).toContainText(`${testPrefix}-DET-001`);

        // Status badge is visible
        await expect(detailPage.statusBadge).toBeVisible();
        await expect(detailPage.statusBadge).toContainText('To pay');

        // Detail fields are populated
        const fields = await detailPage.getDetailFields();
        expect(fields['Invoice #']).toBe(`${testPrefix}-DET-001`);
        expect(fields['Vendor']).toBe(vendorName);
        expect(fields['Status']).toContain('To pay');

        // Edit and Delete buttons visible in the page actions
        await expect(detailPage.editButton).toBeVisible();
        await expect(detailPage.deleteButton).toBeVisible();

        // Breadcrumb trail "Money › Invoices" (the old Back button is retired)
        await detailPage.breadcrumbs.expectTrail(['Money', 'Invoices']);
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );

  test('Invoice detail page back button returns to invoices list', async ({ page, testPrefix }) => {
    const detailPage = new InvoiceDetailPage(page);
    const vendorName = `${testPrefix} Back Vendor`;
    let vendorId = '';

    try {
      const vendor = await createVendorViaApi(page, vendorName);
      vendorId = vendor.id;
      const invoice = await createInvoiceViaApi(page, vendorId, {
        amount: 100,
        date: '2026-01-01',
      });

      await detailPage.goto(invoice.id);
      await expect(detailPage.breadcrumbs.trailLink('Invoices')).toBeVisible();

      await detailPage.goBackToInvoices();
      // URL should be the invoices list
      expect(page.url()).toContain('/budget/invoices');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Invoice detail page heading is "‹company› · Invoice" when there is no invoice number', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new InvoiceDetailPage(page);
    const vendorName = `${testPrefix} NoNum Vendor`;
    let vendorId = '';

    try {
      const vendor = await createVendorViaApi(page, vendorName);
      vendorId = vendor.id;
      // No invoiceNumber provided
      const invoice = await createInvoiceViaApi(page, vendorId, {
        amount: 500,
        date: '2026-01-05',
      });

      await detailPage.goto(invoice.id);

      // Heading falls back to "‹company› · Invoice" (#2203)
      await expect(detailPage.heading).toHaveText(`${vendorName} · Invoice`);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Invoice detail page shows error state for non-existent invoice ID', async ({ page }) => {
    const detailPage = new InvoiceDetailPage(page);

    await page.goto('/budget/invoices/non-existent-invoice-id-12345');

    // Error state should render; the 404 h1 is "Invoice not found" (#2203)
    await expect(detailPage.errorCard).toBeVisible();
    await expect(detailPage.heading).toHaveText('Invoice not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Edit invoice
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Edit invoice (Scenario 9)', { tag: '@responsive' }, () => {
  test('Edit invoice — change status to paid and add notes', async ({ page, testPrefix }) => {
    const detailPage = new InvoiceDetailPage(page);
    const vendorName = `${testPrefix} Edit Vendor`;
    let vendorId = '';

    try {
      const vendor = await createVendorViaApi(page, vendorName);
      vendorId = vendor.id;
      const invoice = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-EDT-001`,
        amount: 1000,
        date: '2026-01-15',
        status: 'pending',
      });

      await detailPage.goto(invoice.id);
      await detailPage.openEditModal();
      await expect(detailPage.editModal).toBeVisible();

      // Change status to paid
      await detailPage.fillEditForm({
        status: 'paid',
        notes: `Updated by ${testPrefix}`,
      });

      await detailPage.saveEdit();

      // After save the modal closes and page shows updated status
      await expect(detailPage.editModal).not.toBeVisible();
      await expect(detailPage.statusBadge).toContainText('Paid');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Edit invoice modal can be cancelled without saving', async ({ page, testPrefix }) => {
    const detailPage = new InvoiceDetailPage(page);
    const vendorName = `${testPrefix} EditCancel Vendor`;
    let vendorId = '';

    try {
      const vendor = await createVendorViaApi(page, vendorName);
      vendorId = vendor.id;
      const invoice = await createInvoiceViaApi(page, vendorId, {
        amount: 800,
        date: '2026-01-20',
        status: 'pending',
      });

      await detailPage.goto(invoice.id);
      await detailPage.openEditModal();
      await expect(detailPage.editModal).toBeVisible();

      // Change something then cancel
      await detailPage.fillEditForm({ status: 'paid' });
      await detailPage.closeEditModal();

      // Modal closes; status still pending
      await expect(detailPage.editModal).not.toBeVisible();
      await expect(detailPage.statusBadge).toContainText('To pay');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  // Issues #2108/#2109/#2113: lowering the amount below the itemized total is rejected
  // with ITEMIZED_SUM_EXCEEDS_INVOICE; the translated message carries the itemized total.
  test('Edit invoice — lowering amount below itemized total shows error and keeps modal open', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let workItemId = '';
    let budgetSourceId = '';

    try {
      const vendor = await createVendorViaApi(page, `${testPrefix} EditItemized Vendor`);
      vendorId = vendor.id;
      const invoice = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-EDT-ITM`,
        amount: 1000,
        date: '2026-01-15',
        status: 'pending',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} EditItemized WI` });
      budgetSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} EditItemized Source`,
        totalAmount: 5000,
      });
      const budgetResp = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
        data: {
          plannedAmount: 600,
          budgetSourceId,
          confidence: 'own_estimate',
          description: `${testPrefix} EditItemized line`,
        },
      });
      expect(budgetResp.ok(), `POST work item budget failed: ${budgetResp.status()}`).toBeTruthy();
      const budgetBody = (await budgetResp.json()) as { budget: { id: string } };
      const linkResp = await page.request.post(`/api/invoices/${invoice.id}/budget-lines`, {
        data: { workItemBudgetId: budgetBody.budget.id, itemizedAmount: 600 },
      });
      expect(linkResp.ok(), `POST invoice budget-line failed: ${linkResp.status()}`).toBeTruthy();

      await detailPage.goto(invoice.id);
      await detailPage.openEditModal();
      await detailPage.fillEditForm({ amount: '500' });

      const errorResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/invoices/${invoice.id}`) &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 400,
      );
      await detailPage.editSaveButton.click();
      await errorResponsePromise;

      // Error banner shows the itemized total (600, formatting-agnostic) and the modal stays open
      await expect(detailPage.editErrorBanner).toBeVisible();
      await expect(detailPage.editErrorBanner).toContainText('600');
      await expect(detailPage.editModal).toBeVisible();

      // Cancel — the invoice amount is unchanged
      await detailPage.closeEditModal();
      await expect(detailPage.editModal).not.toBeVisible();
      await expect(detailPage.infoList).toContainText(/1[.,\s\u00a0\u202f]?000/);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Delete invoice
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Delete invoice (Scenario 10)', { tag: '@responsive' }, () => {
  test('Delete invoice — navigates back to invoices list', async ({ page, testPrefix }) => {
    const detailPage = new InvoiceDetailPage(page);
    const vendorName = `${testPrefix} Del Vendor`;
    let vendorId = '';

    try {
      const vendor = await createVendorViaApi(page, vendorName);
      vendorId = vendor.id;
      const invoice = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-DEL-001`,
        amount: 200,
        date: '2026-01-01',
      });

      await detailPage.goto(invoice.id);
      await detailPage.openDeleteModal();
      await expect(detailPage.deleteModal).toBeVisible();

      await detailPage.confirmDelete();

      // After deletion, page navigates to /budget/invoices
      await page.waitForURL('**/budget/invoices');
      expect(page.url()).toContain('/budget/invoices');
    } finally {
      // Vendor cleanup — invoice already deleted
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Delete invoice modal can be cancelled', async ({ page, testPrefix }) => {
    const detailPage = new InvoiceDetailPage(page);
    const vendorName = `${testPrefix} DelCancel Vendor`;
    let vendorId = '';

    try {
      const vendor = await createVendorViaApi(page, vendorName);
      vendorId = vendor.id;
      const invoice = await createInvoiceViaApi(page, vendorId, {
        amount: 100,
        date: '2026-01-01',
      });

      await detailPage.goto(invoice.id);
      await detailPage.openDeleteModal();
      await expect(detailPage.deleteModal).toBeVisible();

      await detailPage.closeDeleteModal();

      // Modal closes; page still on detail
      await expect(detailPage.deleteModal).not.toBeVisible();
      await expect(detailPage.heading).toBeVisible();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13: Status filter
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice status chips (Scenario 13)', { tag: '@responsive' }, () => {
  test('The status URL param presses its chip and shows only invoices with matching status', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    const vendorName = `${testPrefix} Filter Vendor`;
    let vendorId = '';

    try {
      const vendor = await createVendorViaApi(page, vendorName);
      vendorId = vendor.id;

      // Create one pending and one paid invoice
      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-PEND`,
        amount: 100,
        date: '2026-01-01',
        status: 'pending',
      });
      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-PAID`,
        amount: 200,
        date: '2026-01-02',
        status: 'paid',
      });

      // Navigate with the Paid chip via URL, scoped to this test's company
      await invoicesPage.gotoChip('paid', `vendorId=${vendorId}`);
      await expect(invoicesPage.chip('paid')).toHaveAttribute('aria-pressed', 'true');

      // Only paid invoice should appear
      const numbers = await invoicesPage.getInvoiceNumbers();
      expect(numbers).toContain(`${testPrefix}-PAID`);
      expect(numbers).not.toContain(`${testPrefix}-PEND`);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Responsive layout
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Responsive layout', { tag: '@responsive' }, () => {
  test('Invoices list page renders without horizontal overflow', async ({ page }) => {
    const invoicesPage = new InvoicesPage(page);

    await invoicesPage.goto();
    await expect(invoicesPage.heading).toBeVisible();

    // Verify the page does not have horizontal overflow
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(overflow).toBe(false);
  });

  test('Invoice detail page renders without horizontal overflow', async ({ page, testPrefix }) => {
    const detailPage = new InvoiceDetailPage(page);
    const vendorName = `${testPrefix} Resp Vendor`;
    let vendorId = '';

    try {
      const vendor = await createVendorViaApi(page, vendorName);
      vendorId = vendor.id;
      const invoice = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-RESP`,
        amount: 500,
        date: '2026-01-15',
      });

      await detailPage.goto(invoice.id);
      await expect(detailPage.heading).toBeVisible();

      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(overflow).toBe(false);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dark mode', () => {
  test('Invoices list page renders in dark mode without visible errors', async ({ browser }) => {
    const context = await browser.newContext({
      colorScheme: 'dark',
      storageState: 'test-results/.auth/admin.json',
    });
    const page = await context.newPage();
    const invoicesPage = new InvoicesPage(page);

    try {
      await invoicesPage.goto();

      await expect(invoicesPage.heading).toBeVisible();
      await expect(invoicesPage.newInvoiceButton).toBeVisible();
      await expect(invoicesPage.chip('pending')).toBeVisible();

      // No error banners visible
      await expect(invoicesPage.retryButton).not.toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('Invoice detail page renders in dark mode', async ({ browser, page: p }) => {
    // Create a vendor and invoice first with the authenticated page
    const vendorName = `DM-${Date.now()} Vendor`;
    let vendorId = '';

    try {
      const vendor = await createVendorViaApi(p, vendorName);
      vendorId = vendor.id;
      const invoice = await createInvoiceViaApi(p, vendorId, {
        amount: 300,
        date: '2026-01-10',
      });

      const context = await browser.newContext({
        colorScheme: 'dark',
        storageState: 'test-results/.auth/admin.json',
      });
      const darkPage = await context.newPage();
      const detailPage = new InvoiceDetailPage(darkPage);

      try {
        await detailPage.goto(invoice.id);
        await expect(detailPage.heading).toBeVisible();
        await expect(detailPage.editButton).toBeVisible();
      } finally {
        await context.close();
      }
    } finally {
      if (vendorId) await deleteVendorViaApi(p, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// "Effective Amount" column (Issue #1876)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Split and Still to pay columns (Issue #1876, #2238)', { tag: '@responsive' }, () => {
  // This is the only test in the suite that asserts against `table.invoices.columns`,
  // a per-user singleton preference that `useColumnPreferences` writes (debounced) for
  // every visitor of the invoices table. On the shared admin, any concurrently running
  // test that renders that table could move the column set under this test's feet, and
  // this test's own DELETEs could equally disturb others (Issue #1957). Run it as a
  // dedicated user so the row belongs to nobody else. Per-test rather than per-worker
  // because a worker-scoped option cannot be set inside a describe. Nothing here is
  // admin-gated: the invoices list/detail pages and vendor/invoice/work-item/
  // budget-source creation have no role checks.
  test.use({
    isolatedUserPerTest: { emailPrefix: 'inv-columns', displayName: 'E2E Invoices User' },
  });

  test('The hidden Split column can be shown, and Still to pay is the deposit/refund-aware open amount', async ({
    page,
    testPrefix,
  }) => {
    // Column settings gear is desktop-only (hidden ≤767px) — skip on mobile/tablet.
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Column settings — desktop viewport only');
      return;
    }

    const invoicesPage = new InvoicesPage(page);
    const vendorName = `${testPrefix} EffAmt Vendor`;
    const invoiceNumber = `${testPrefix}-EFFAMT`;
    let vendorId = '';
    let workItemId = '';
    let budgetSourceId = '';

    try {
      const vendor = await createVendorViaApi(page, vendorName);
      vendorId = vendor.id;

      // Invoice total = 1000
      const invoice = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber,
        amount: 1000,
        date: '2026-01-01',
      });

      // Itemize part of the invoice via a budget line — this drives the "Split" column
      // (itemized share of the amount: 300 of 1000 = 30%).
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} EffAmt WI` });
      budgetSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} EffAmt Source`,
        totalAmount: 5000,
      });
      const budgetResp = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
        data: {
          plannedAmount: 300,
          budgetSourceId,
          confidence: 'own_estimate',
          description: `${testPrefix} EffAmt line`,
        },
      });
      expect(budgetResp.ok(), `POST work item budget failed: ${budgetResp.status()}`).toBeTruthy();
      const budgetBody = (await budgetResp.json()) as { budget: { id: string } };
      const linkResp = await page.request.post(`/api/invoices/${invoice.id}/budget-lines`, {
        data: { workItemBudgetId: budgetBody.budget.id, itemizedAmount: 300 },
      });
      expect(linkResp.ok(), `POST invoice budget-line failed: ${linkResp.status()}`).toBeTruthy();

      // Add a refund and mark it paid — this drives the deposit/refund-aware open amount
      const depositResp = await page.request.post(`/api/invoices/${invoice.id}/deposits`, {
        data: { entryType: 'refund', amount: 150, dueDate: '2026-02-01', status: 'pending' },
      });
      expect(depositResp.ok(), `POST deposit failed: ${depositResp.status()}`).toBeTruthy();
      const depositBody = (await depositResp.json()) as { deposit: { id: string } };
      const today = new Date().toISOString().slice(0, 10);
      const paidResp = await page.request.patch(
        `/api/invoices/${invoice.id}/deposits/${depositBody.deposit.id}`,
        { data: { status: 'paid', paidDate: today } },
      );
      expect(paidResp.ok(), `PATCH deposit pending→paid failed: ${paidResp.status()}`).toBeTruthy();

      // The server's open amount for this record is the truth the Still to pay cell must show
      const listResp = await page.request.get(
        `/api/invoices?q=${encodeURIComponent(invoiceNumber)}&pageSize=10`,
      );
      expect(listResp.ok()).toBeTruthy();
      const listed = (
        (await listResp.json()) as { invoices: Array<{ id: string; openAmount: number }> }
      ).invoices.find((row) => row.id === invoice.id);
      expect(listed, 'the seeded invoice is in the list response').toBeDefined();
      const openCents = Math.round((listed?.openAmount ?? -1) * 100);

      // Reset the "table.invoices.columns" preference before asserting the hidden-by-default
      // baseline. Since this test runs as a freshly created dedicated user (see test.use above),
      // the row cannot pre-exist; kept as an explicit precondition.
      await page.request.delete('/api/users/me/preferences/table.invoices.columns');

      // Search by the number: a search covers every status, so the row is found wherever it is
      await invoicesPage.search(invoiceNumber);

      // Positive control before the not.toBeVisible() checks: the table rendered, with its
      // default Still to pay column and no Split column yet
      await expect(invoicesPage.columnHeader(/^Still to pay/)).toBeVisible();
      await expect(invoicesPage.columnHeader(/^Split/)).toHaveCount(0);
      await expect(invoicesPage.columnHeader(/^Notes/)).toHaveCount(0);

      await invoicesPage.enableColumn('Split');
      await expect(invoicesPage.columnHeader(/^Split/)).toBeVisible();

      // The column choice is a server-saved preference: it survives a reload
      await page.reload();
      await invoicesPage.waitForLoaded();
      await expect(invoicesPage.columnHeader(/^Split/)).toBeVisible();

      expect(await invoicesPage.cellText(invoice.id, 'Split')).toBe('30% split');
      const stillToPay = parseMoney(await invoicesPage.cellText(invoice.id, 'Still to pay'));
      expect(stillToPay).toBe(openCents);
    } finally {
      // Column visibility/order is a per-user server-side SINGLETON preference
      // (`table.invoices.columns`, see useColumnPreferences), not a per-test entity.
      // The dedicated user is deactivated in fixture teardown, so these toggles can no
      // longer leak anywhere; the reset is kept so the intent survives if this describe
      // is ever switched back to a shared account.
      // DELETE 404s if no preference was ever saved — fine either way.
      await page.request.delete('/api/users/me/preferences/table.invoices.columns');
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});
