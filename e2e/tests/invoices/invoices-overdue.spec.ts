/**
 * E2E tests for the Overdue flag of the Invoices list (Issue #1421, rebuilt by #2238).
 *
 * The retired conditional "Overdue" summary card is now a flag on the row: a PENDING invoice with
 * a due date in the past carries an "Overdue" badge (`invoices-badge-flag-<id>`), next to its
 * status. "Overdue" is a flag, never a status or a chip. A paid invoice with a past due date is
 * not flagged.
 *
 * Scenarios covered:
 *   1. Overdue flag visible — pending invoice with dueDate in the past
 *   2. Overdue flag absent — paid invoice with dueDate in the past (only pending counts)
 *   3. The Offers summary keeps a clear gap above the list (replaces the old summary-grid gap)
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { API } from '../../fixtures/testData.js';
import type { Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers (mirrors invoices.spec.ts pattern)
// ─────────────────────────────────────────────────────────────────────────────

async function createVendorViaApi(page: Page, name: string): Promise<string> {
  const response = await page.request.post(API.vendors, { data: { name } });
  expect(response.ok(), `POST vendor "${name}" failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { vendor: { id: string } };
  return body.vendor.id;
}

async function deleteVendorWithInvoices(page: Page, vendorId: string): Promise<void> {
  const list = await page.request.get(`${API.vendors}/${vendorId}/invoices`);
  if (list.ok()) {
    const { invoices } = (await list.json()) as { invoices: Array<{ id: string }> };
    for (const invoice of invoices) {
      await page.request.delete(`${API.vendors}/${vendorId}/invoices/${invoice.id}`);
    }
  }
  await page.request.delete(`${API.vendors}/${vendorId}`);
}

async function createInvoiceViaApi(
  page: Page,
  vendorId: string,
  data: {
    amount: number;
    date: string;
    dueDate?: string;
    status?: string;
  },
): Promise<string> {
  const response = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', ...data },
  });
  expect(response.ok(), `POST invoice failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { invoice: { id: string } };
  return body.invoice.id;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 1 and 2: the Overdue flag
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices overdue flag (Scenarios 1 and 2)', { tag: '@responsive' }, () => {
  test(
    'The Overdue flag appears on a pending invoice with a due date in the past, beside its To pay status',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const invoicesPage = new InvoicesPage(page);
      let vendorId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} Overdue Vendor`);

        // The API validates dueDate >= date, so both must be in the past.
        const invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 500,
          date: daysAgo(60),
          dueDate: daysAgo(30),
          status: 'pending',
        });

        await invoicesPage.gotoChip('pending', `vendorId=${vendorId}`);

        await expect(invoicesPage.flagBadge(invoiceId)).toHaveText('Overdue');
        await expect(invoicesPage.statusBadge(invoiceId)).toHaveText('To pay');
      } finally {
        if (vendorId) await deleteVendorWithInvoices(page, vendorId);
      }
    },
  );

  test('A paid invoice with a due date in the past is not flagged', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} OvPaid Vendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 300,
        date: daysAgo(30),
        dueDate: daysAgo(10),
        status: 'paid',
      });

      await invoicesPage.gotoChip('paid', `vendorId=${vendorId}`);

      await expect(invoicesPage.statusBadge(invoiceId)).toHaveText('Paid');
      await expect(invoicesPage.flagBadge(invoiceId)).toHaveCount(0);
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: spacing between the Offers summary and the list (was Issue #1422)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Offers summary spacing (Issue #1422, #2238)', () => {
  test('The Offers summary has at least 12px vertical gap above the list', async ({
    page,
    testPrefix,
  }) => {
    // Desktop only: the table surface is where the gap is measured.
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Spacing test — desktop viewport only');
      return;
    }

    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';
    try {
      // The shared database may hold no offer: seed one so the table (not the empty state) shows
      vendorId = await createVendorViaApi(page, `${testPrefix} Spacing Vendor`);
      await createInvoiceViaApi(page, vendorId, {
        amount: 400,
        date: daysAgo(5),
        status: 'quotation',
      });

      await invoicesPage.gotoChip('quotation', `vendorId=${vendorId}`);
      await expect(invoicesPage.offersSummary).toBeVisible();
      await expect(invoicesPage.tableSurface).toBeVisible();

      const summaryBox = await invoicesPage.offersSummary.boundingBox();
      const tableBox = await invoicesPage.tableSurface.boundingBox();
      expect(summaryBox, 'offers summary bounding box must be non-null').not.toBeNull();
      expect(tableBox, 'table bounding box must be non-null').not.toBeNull();

      const gap = tableBox!.y - (summaryBox!.y + summaryBox!.height);
      expect(gap).toBeGreaterThanOrEqual(12);
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});
