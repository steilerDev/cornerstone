/**
 * E2E tests for Invoice Management
 *
 * UAT Scenarios covered:
 * - Scenario 1: Invoices list page loads and shows summary cards
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
 * - Scenario 13: Status filter changes visible invoices
 * - Responsive layout (@responsive tag)
 * - Dark mode
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { API } from '../../fixtures/testData.js';

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

async function deleteInvoiceViaApi(
  page: Page,
  vendorId: string,
  invoiceId: string,
): Promise<void> {
  await page.request.delete(`${API.vendors}/${vendorId}/invoices/${invoiceId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 & 12: Empty state and list page load
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices list — empty state (Scenario 12)', { tag: '@responsive' }, () => {
  test(
    'Empty state message shown when no invoices exist',
    { tag: '@smoke' },
    async ({ page }) => {
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
            body: JSON.stringify({
              invoices: [],
              pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
              summary: {
                pending: { count: 0, totalAmount: 0 },
                paid: { count: 0, totalAmount: 0 },
                claimed: { count: 0, totalAmount: 0 },
                quotation: { count: 0, totalAmount: 0 },
              },
            }),
          });
        } else {
          await route.continue();
        }
      });

      await invoicesPage.goto();

      // Empty state renders with message
      await expect(invoicesPage.emptyState).toBeVisible();
      await expect(invoicesPage.emptyState).toContainText('No invoices yet');
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: List page load — summary cards and navigation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices list page load (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Invoices list page loads with heading, summary cards, and Add Invoice button',
    { tag: '@smoke' },
    async ({ page }) => {
      const invoicesPage = new InvoicesPage(page);

      await invoicesPage.goto();

      // Page heading
      await expect(invoicesPage.heading).toBeVisible();
      await expect(invoicesPage.heading).toHaveText('Budget');

      // Summary cards render (at least the containers)
      await expect(invoicesPage.summaryGrid).toBeVisible();
      await expect(invoicesPage.pendingSummary).toBeVisible();
      await expect(invoicesPage.paidSummary).toBeVisible();
      await expect(invoicesPage.quotationSummary).toBeVisible();

      // Add Invoice button is visible
      await expect(invoicesPage.newInvoiceButton).toBeVisible();
    },
  );

  test('Budget subnav tabs are visible', async ({ page }) => {
    const invoicesPage = new InvoicesPage(page);
    await invoicesPage.goto();

    // SubNav renders the Budget section tabs
    await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Invoices' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vendors' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sources' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Subsidies' })).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 & 3: Create invoice — happy path
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Create invoice (Scenarios 2 & 3)', { tag: '@responsive' }, () => {
  test(
    'Create invoice with required fields — invoice appears in list',
    async ({ page, testPrefix }) => {
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

        // Fill required fields
        await invoicesPage.createVendorSelect.selectOption({ label: vendorName });
        await invoicesPage.createAmountInput.fill('1500.00');
        await invoicesPage.createDateInput.fill('2026-01-15');

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

        // Verify summary cards update (pending count increased since new invoice is pending by default)
        const pendingCount = await invoicesPage.getSummaryCount('pending');
        expect(pendingCount).toBeGreaterThanOrEqual(1);
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );

  test(
    'Create invoice with all optional fields — invoice number and notes visible in list',
    async ({ page, testPrefix }) => {
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

        await invoicesPage.createVendorSelect.selectOption({ label: vendorName });
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

        // The invoice number should appear in the list
        const numbers = await invoicesPage.getInvoiceNumbers();
        expect(numbers).toContain(invoiceNumber);
      } finally {
        // No separate delete for invoice needed since deleting the vendor cascades
        if (vendorId) await deleteVendorViaApi(page, vendorId);
        void invoiceId; // referenced but cleanup is via vendor delete
      }
    },
  );
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

  test('Create invoice fails — date not filled shows submit disabled', async ({ page, testPrefix }) => {
    const invoicesPage = new InvoicesPage(page);
    const vendorName = `${testPrefix} NoDate Vendor`;
    let vendorId = '';

    try {
      const vendor = await createVendorViaApi(page, vendorName);
      vendorId = vendor.id;

      await invoicesPage.goto();
      await invoicesPage.openCreateModal();

      // Fill vendor and amount but not date
      await invoicesPage.createVendorSelect.selectOption({ label: vendorName });
      await invoicesPage.createAmountInput.fill('200.00');
      // Deliberately omit createDateInput

      // Submit button is disabled when date is empty
      await expect(invoicesPage.createSubmitButton).toBeDisabled();

      await invoicesPage.closeCreateModal();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Create modal can be cancelled without creating an invoice', async ({ page, testPrefix }) => {
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
  test(
    'Clicking an invoice row navigates to the invoice detail page',
    async ({ page, testPrefix }) => {
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

        await invoicesPage.goto();
        await invoicesPage.waitForLoaded();

        // Click the invoice number link — works on both desktop table and mobile cards
        const invoiceLink = page.locator('[class*="invoiceLink"]', {
          hasText: `${testPrefix}-ROW-001`,
        }).first();
        await invoiceLink.click();

        // Should navigate to the detail page
        await page.waitForURL(`**/budget/invoices/${invoice.id}`);
        await expect(detailPage.heading).toBeVisible();
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
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
        await expect(detailPage.statusBadge).toContainText('Pending');

        // Detail fields are populated
        const fields = await detailPage.getDetailFields();
        expect(fields['Invoice #']).toBe(`${testPrefix}-DET-001`);
        expect(fields['Vendor']).toBe(vendorName);
        expect(fields['Status']).toContain('Pending');

        // Edit and Delete buttons visible in the page actions
        await expect(detailPage.editButton).toBeVisible();
        await expect(detailPage.deleteButton).toBeVisible();

        // Back button visible
        await expect(detailPage.backButton).toBeVisible();
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
      await expect(detailPage.backButton).toBeVisible();

      await detailPage.goBackToInvoices();
      // URL should be the invoices list
      expect(page.url()).toContain('/budget/invoices');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Invoice detail page shows "Invoice Details" heading when no invoice number', async ({
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

      // Heading falls back to "Invoice Details"
      await expect(detailPage.heading).toHaveText('Invoice Details');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Invoice detail page shows error state for non-existent invoice ID', async ({ page }) => {
    const detailPage = new InvoiceDetailPage(page);

    await page.goto('/budget/invoices/non-existent-invoice-id-12345');

    // Error state should render
    await expect(detailPage.errorCard).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Edit invoice
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Edit invoice (Scenario 9)', { tag: '@responsive' }, () => {
  test(
    'Edit invoice — change status to paid and add notes',
    async ({ page, testPrefix }) => {
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
    },
  );

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
      await expect(detailPage.statusBadge).toContainText('Pending');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Delete invoice
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Delete invoice (Scenario 10)', { tag: '@responsive' }, () => {
  test(
    'Delete invoice — navigates back to invoices list',
    async ({ page, testPrefix }) => {
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
    },
  );

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

test.describe('Invoice status filter (Scenario 13)', { tag: '@responsive' }, () => {
  test(
    'Filter by status URL param shows only invoices with matching status',
    async ({ page, testPrefix }) => {
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

        // Navigate with status=paid filter via URL
        await page.goto('/budget/invoices?status=paid');
        await invoicesPage.heading.waitFor({ state: 'visible' });
        await invoicesPage.waitForLoaded();

        // Only paid invoice should appear
        const numbers = await invoicesPage.getInvoiceNumbers();
        expect(numbers).toContain(`${testPrefix}-PAID`);
        expect(numbers).not.toContain(`${testPrefix}-PEND`);
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
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
      await expect(invoicesPage.summaryGrid).toBeVisible();

      // No error banners visible
      await expect(invoicesPage.errorBanner).not.toBeVisible();
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
