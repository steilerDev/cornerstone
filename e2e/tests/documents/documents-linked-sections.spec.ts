/**
 * E2E tests for the LinkedDocumentsSection component — EPIC-08 (Stories 8.4, 8.5, 8.7)
 *
 * The LinkedDocumentsSection is embedded on:
 *   - Work Item detail page (/project/work-items/:id) — Story 8.4
 *   - Invoice detail page (/budget/invoices/:id) — Story 8.5
 *
 * In the E2E environment, Paperless-ngx is NOT configured, so tests verify:
 * - The "Documents" section heading is present on both pages
 * - The "+ Add Document" button is DISABLED (not configured)
 * - The "not configured" banner is shown with guidance text
 * - Responsive layout: no horizontal scroll
 * - Dark mode: section renders correctly
 *
 * Scenarios covered:
 * 1.  Work item detail page: "Documents" section heading is visible
 * 2.  Work item detail page: "+ Add Document" button is disabled (not configured)
 * 3.  Work item detail page: "not configured" banner shows setup guidance
 * 4.  Work item detail page: section has accessible aria-labelledby heading
 * 5.  Work item detail page: section renders without horizontal scroll (responsive)
 * 6.  Work item detail page: section renders in dark mode
 * 7.  Invoice detail page: "Documents" section heading is visible
 * 8.  Invoice detail page: "+ Add Document" button is disabled (not configured)
 * 9.  Invoice detail page: "not configured" banner shows setup guidance
 * 10. Invoice detail page: section renders without horizontal scroll (responsive)
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create a vendor + invoice via API and return IDs
// ─────────────────────────────────────────────────────────────────────────────

interface InvoiceIds {
  vendorId: string;
  invoiceId: string;
}

async function createVendorAndInvoiceViaApi(page: Page, prefix: string): Promise<InvoiceIds> {
  // Create vendor
  const vendorResp = await page.request.post(API.vendors, {
    data: { name: `${prefix} Docs Test Vendor` },
  });
  expect(vendorResp.ok()).toBeTruthy();
  const vendor = (await vendorResp.json()) as { vendor: { id: string } };
  const vendorId = vendor.vendor.id;

  // Create invoice under the vendor
  const invoiceResp = await page.request.post(API.vendors + `/${vendorId}/invoices`, {
    data: {
      invoiceNumber: `${prefix}-INV-DOC`,
      amount: 100,
      date: '2025-01-15',
      status: 'pending',
    },
  });
  expect(invoiceResp.ok()).toBeTruthy();
  const invoice = (await invoiceResp.json()) as { invoice: { id: string } };

  return { vendorId, invoiceId: invoice.invoice.id };
}

async function deleteVendorViaApi(page: Page, vendorId: string): Promise<void> {
  await page.request.delete(API.vendors + `/${vendorId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 1–6: Work Item detail page — LinkedDocumentsSection
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'LinkedDocumentsSection on Work Item detail (Scenarios 1–6)',
  { tag: '@responsive' },
  () => {
    test('Documents section heading "Documents" is visible on work item detail page', async ({
      page,
      testPrefix,
    }) => {
      // Given: A work item exists
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Doc Section Heading Test`,
        });

        // When: Navigating to the work item detail page
        const detailPage = new WorkItemDetailPage(page);
        await detailPage.goto(createdId);

        // Then: The "Documents" section heading should be visible
        // The section uses aria-labelledby="documents-section-title"
        const documentsSection = page.getByRole('region', {
          name: 'Documents',
          exact: true,
        });
        // Fallback: the h2 heading directly
        const documentsHeading = page.getByRole('heading', {
          level: 2,
          name: 'Documents',
          exact: true,
        });
        await expect(documentsHeading).toBeVisible();
        // The section should be present (linked via aria-labelledby)
        await expect(documentsSection).toBeVisible();
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('"+ Add Document" button is disabled when Paperless is not configured', async ({
      page,
      testPrefix,
    }) => {
      // Given: Paperless is NOT configured and a work item exists
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Add Doc Button Test`,
        });

        // When: Navigating to the work item detail page
        const detailPage = new WorkItemDetailPage(page);
        await detailPage.goto(createdId);

        // Then: The "+ Add Document" button should be disabled
        const addDocButton = page.getByRole('button', { name: '+ Add Document', exact: true });
        await expect(addDocButton).toBeVisible();
        await expect(addDocButton).toBeDisabled();
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('"Not configured" banner is shown in the Documents section on work item detail', async ({
      page,
      testPrefix,
    }) => {
      // Given: Paperless is NOT configured and a work item exists
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Not Configured Banner Test`,
        });

        // When: Navigating to the work item detail page
        const detailPage = new WorkItemDetailPage(page);
        await detailPage.goto(createdId);

        // Then: The "not configured" banner should appear in the Documents section
        // LinkedDocumentsSection renders: "Paperless-ngx is not configured"
        const notConfiguredText = page.getByText('Paperless-ngx is not configured');
        await expect(notConfiguredText).toBeVisible();
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('"Not configured" banner contains PAPERLESS_URL setup instructions', async ({
      page,
      testPrefix,
    }) => {
      // Given: Paperless is NOT configured and a work item exists
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Not Configured Instructions Test`,
        });

        // When: Navigating to the work item detail page
        const detailPage = new WorkItemDetailPage(page);
        await detailPage.goto(createdId);

        // Then: The setup instructions should mention the env var names
        const pageContent = await page.content();
        expect(pageContent).toContain('PAPERLESS_URL');
        expect(pageContent).toContain('PAPERLESS_API_TOKEN');
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('Documents section has accessible aria-labelledby heading on work item detail', async ({
      page,
      testPrefix,
    }) => {
      // Given: A work item exists
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Doc Section A11y Test`,
        });

        // When: Navigating to the work item detail page
        const detailPage = new WorkItemDetailPage(page);
        await detailPage.goto(createdId);

        // Then: The section has an ARIA label via its h2#documents-section-title
        // The h2 should have the correct id for aria-labelledby
        const sectionTitle = page.locator('#documents-section-title');
        await expect(sectionTitle).toBeVisible();
        await expect(sectionTitle).toHaveText(/Documents/);
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('Documents section renders without horizontal scroll on work item detail (responsive)', async ({
      page,
      testPrefix,
    }) => {
      // Given: A work item exists
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Doc Section Responsive Test`,
        });

        // When: Navigating to the work item detail page
        const detailPage = new WorkItemDetailPage(page);
        await detailPage.goto(createdId);

        // Scroll to the Documents section
        const documentsHeading = page.getByRole('heading', {
          level: 2,
          name: 'Documents',
          exact: true,
        });
        await documentsHeading.scrollIntoViewIfNeeded();

        // Then: No horizontal scrollbar
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(hasHorizontalScroll).toBe(false);
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('Documents section renders correctly in dark mode on work item detail', async ({
      page,
      testPrefix,
    }) => {
      // Given: A work item exists
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Doc Section Dark Mode Test`,
        });

        await page.goto(`/project/work-items/${createdId}`);
        // Enable dark mode
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-theme', 'dark');
        });

        const detailPage = new WorkItemDetailPage(page);
        await detailPage.heading.waitFor({ state: 'visible' });

        // Then: Documents section heading and add button visible in dark mode
        const documentsHeading = page.getByRole('heading', {
          level: 2,
          name: 'Documents',
          exact: true,
        });
        await expect(documentsHeading).toBeVisible();

        const addDocButton = page.getByRole('button', { name: '+ Add Document', exact: true });
        await expect(addDocButton).toBeVisible();
        await expect(addDocButton).toBeDisabled();
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 7–10: Invoice detail page — LinkedDocumentsSection
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'LinkedDocumentsSection on Invoice detail (Scenarios 7–10)',
  { tag: '@responsive' },
  () => {
    test('Documents section heading "Documents" is visible on invoice detail page', async ({
      page,
      testPrefix,
    }) => {
      // Given: A vendor and invoice exist
      let ids: InvoiceIds | null = null;
      try {
        ids = await createVendorAndInvoiceViaApi(page, testPrefix);

        // When: Navigating to the invoice detail page
        // Invoice detail route: /budget/invoices/:id
        await page.goto(`/budget/invoices/${ids.invoiceId}`);

        // Then: The "Documents" section heading should be visible
        const documentsHeading = page.getByRole('heading', {
          level: 2,
          name: 'Documents',
          exact: true,
        });
        await expect(documentsHeading).toBeVisible();
      } finally {
        if (ids) await deleteVendorViaApi(page, ids.vendorId);
      }
    });

    test('"+ Add Document" button is disabled when Paperless is not configured (invoice)', async ({
      page,
      testPrefix,
    }) => {
      // Given: Paperless is NOT configured and an invoice exists
      let ids: InvoiceIds | null = null;
      try {
        ids = await createVendorAndInvoiceViaApi(page, testPrefix);

        // When: Navigating to the invoice detail page
        await page.goto(`/budget/invoices/${ids.invoiceId}`);
        await page
          .getByRole('heading', { level: 2, name: 'Documents', exact: true })
          .waitFor({ state: 'visible' });

        // Then: The "+ Add Document" button should be disabled
        const addDocButton = page.getByRole('button', { name: '+ Add Document', exact: true });
        await expect(addDocButton).toBeVisible();
        await expect(addDocButton).toBeDisabled();
      } finally {
        if (ids) await deleteVendorViaApi(page, ids.vendorId);
      }
    });

    test('"Not configured" banner is shown in the Documents section on invoice detail', async ({
      page,
      testPrefix,
    }) => {
      // Given: Paperless is NOT configured and an invoice exists
      let ids: InvoiceIds | null = null;
      try {
        ids = await createVendorAndInvoiceViaApi(page, testPrefix);

        // When: Navigating to the invoice detail page
        await page.goto(`/budget/invoices/${ids.invoiceId}`);
        await page
          .getByRole('heading', { level: 2, name: 'Documents', exact: true })
          .waitFor({ state: 'visible' });

        // Then: The "not configured" message should appear
        const notConfiguredText = page.getByText('Paperless-ngx is not configured');
        await expect(notConfiguredText).toBeVisible();
      } finally {
        if (ids) await deleteVendorViaApi(page, ids.vendorId);
      }
    });

    test('Invoice detail page Documents section renders without horizontal scroll (responsive)', async ({
      page,
      testPrefix,
    }) => {
      // Given: An invoice exists
      let ids: InvoiceIds | null = null;
      try {
        ids = await createVendorAndInvoiceViaApi(page, testPrefix);

        // When: Navigating to the invoice detail page
        await page.goto(`/budget/invoices/${ids.invoiceId}`);
        const documentsHeading = page.getByRole('heading', {
          level: 2,
          name: 'Documents',
          exact: true,
        });
        await documentsHeading.waitFor({ state: 'visible' });

        // Scroll to the Documents section
        await documentsHeading.scrollIntoViewIfNeeded();

        // Then: No horizontal scrollbar
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(hasHorizontalScroll).toBe(false);
      } finally {
        if (ids) await deleteVendorViaApi(page, ids.vendorId);
      }
    });
  },
);
