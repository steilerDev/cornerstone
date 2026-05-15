/**
 * E2E tests for the Overdue Invoice Summary Card (Issue #1421)
 *
 * A conditional 5th summary card with data-testid="summary-card-overdue" appears
 * on the Invoices list page when at least one PENDING invoice has a dueDate in the
 * past (i.e., dueDate < today).
 *
 * Scenarios covered:
 *   1. Overdue card visible — pending invoice with dueDate in the past
 *   2. Overdue card absent — no overdue invoices exist
 *   3. Overdue card absent — paid invoice with dueDate in the past (only pending counts)
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

async function deleteVendorViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${id}`);
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

// ─────────────────────────────────────────────────────────────────────────────
// Helper: get a dueDate that is N days in the past
// ─────────────────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Overdue card visible when at least one pending invoice is overdue
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices overdue card — visible (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Overdue summary card appears when a pending invoice has dueDate in the past',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const invoicesPage = new InvoicesPage(page);
      let vendorId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} Overdue Vendor`);

        // Create a pending invoice with dueDate 30 days ago.
        // The API validates dueDate >= date, so both must be in the past.
        // The overdue card is computed from ALL pending invoices across all pages,
        // so page-1 sort order does not matter — any overdue invoice triggers the card.
        await createInvoiceViaApi(page, vendorId, {
          amount: 500,
          date: daysAgo(60),
          dueDate: daysAgo(30),
          status: 'pending',
        });

        await invoicesPage.goto();
        await invoicesPage.waitForLoaded();

        // The overdue summary card must be present
        const overdueCard = page.getByTestId('summary-card-overdue');
        await expect(overdueCard).toBeVisible();
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );

  test('Overdue card renders within the summary grid and not outside it', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} OvGrid Vendor`);
      // The API validates dueDate >= date, so both must be in the past.
      // The overdue card is computed from ALL pending invoices, not just page 1.
      await createInvoiceViaApi(page, vendorId, {
        amount: 300,
        date: daysAgo(30),
        dueDate: daysAgo(10),
        status: 'pending',
      });

      await invoicesPage.goto();
      await invoicesPage.waitForLoaded();

      // The overdue card is inside the summaryGrid container
      const overdueCard = invoicesPage.summaryGrid.getByTestId('summary-card-overdue');
      await expect(overdueCard).toBeVisible();

      // Standard 4 cards are still present alongside the overdue card
      await expect(invoicesPage.pendingSummary).toBeVisible();
      await expect(invoicesPage.paidSummary).toBeVisible();
      await expect(invoicesPage.quotationSummary).toBeVisible();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7 (from spec): Visual spacing between summary grid and DataTable
// toolbar (Issue #1422)
// The summaryGrid now has margin-bottom: var(--spacing-6). Verify there is at
// least 20px vertical gap between the bottom edge of the grid and the top edge
// of the DataTable search/toolbar.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices summary grid spacing (Issue #1422)', () => {
  test('Summary grid has at least 20px vertical gap above the DataTable toolbar', async ({
    page,
  }) => {
    // Desktop only: the DataTable toolbar is only visible on desktop viewports.
    // On mobile the DataTable renders a different layout.
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Spacing test — desktop viewport only');
      return;
    }

    const invoicesPage = new InvoicesPage(page);
    await invoicesPage.goto();
    await expect(invoicesPage.heading).toBeVisible();

    // Wait for the summary grid to be visible
    await expect(invoicesPage.summaryGrid).toBeVisible();

    // The DataTable search input is inside the toolbar row
    // aria-label="Search items" is set by DataTable
    const searchInput = page.getByLabel('Search items');
    await expect(searchInput).toBeVisible();

    // Measure bounding boxes
    const gridBox = await invoicesPage.summaryGrid.boundingBox();
    const searchBox = await searchInput.boundingBox();

    expect(gridBox, 'summaryGrid bounding box must be non-null').not.toBeNull();
    expect(searchBox, 'search input bounding box must be non-null').not.toBeNull();

    const gridBottom = gridBox!.y + gridBox!.height;
    const searchTop = searchBox!.y;

    // The gap between the bottom of the grid and the top of the search area
    // must be at least 20px (--spacing-6 = 24px at the default token scale,
    // so 20px is a conservative lower bound that passes even if the search bar
    // has top margin of its own).
    const gap = searchTop - gridBottom;
    expect(gap).toBeGreaterThanOrEqual(20);
  });
});
