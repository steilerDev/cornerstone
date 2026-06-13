/**
 * E2E tests for Issue #1547: Auto-itemize invoices from Paperless OCR documents.
 *
 * NOTE: Story #1564 (auto-itemize UX redesign) removed the modal-based flow that
 * many tests in the original version of this file exercised:
 *   - AutoItemizePreviewModal → REMOVED
 *   - DocumentPickerModal → REMOVED
 *   - "Auto-itemize" button in InvoiceBudgetLinesSection → REMOVED
 *
 * The new page-based flow is covered in:
 *   e2e/tests/invoices/invoice-auto-itemize-page.spec.ts
 *
 * Story #1564 is fully merged to main. All legacy-modal tests have been removed.
 * The tests that remain here validate config-based button visibility (or absence)
 * using mocked config and document-link responses.
 *
 * Mocking strategy:
 *   - GET /api/config: intercepted to inject autoItemizeEnabled: true/false while
 *     preserving other fields (currency) from the real server response.
 *   - GET /api/document-links: intercepted to return deterministic linked-document
 *     fixtures so tests do not depend on a running Paperless-ngx container.
 *
 * Setup conventions:
 *   - Vendor + invoice created via REST API helpers.
 *   - All resources cleaned up in finally blocks.
 *   - testPrefix isolates data across parallel workers.
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { API } from '../../fixtures/testData.js';
import type { Page, Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Inline REST helpers
// ─────────────────────────────────────────────────────────────────────────────

async function createVendorViaApi(page: Page, name: string): Promise<string> {
  const resp = await page.request.post(API.vendors, { data: { name } });
  expect(resp.ok(), `POST vendor "${name}" failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { vendor: { id: string } };
  return body.vendor.id;
}

async function deleteVendorViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${id}`);
}

async function createInvoiceViaApi(
  page: Page,
  vendorId: string,
  data: { amount: number; date: string; invoiceNumber?: string },
): Promise<string> {
  const resp = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', ...data },
  });
  expect(resp.ok(), `POST invoice failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { invoice: { id: string } };
  return body.invoice.id;
}

async function deleteInvoiceViaApi(page: Page, vendorId: string, invoiceId: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${vendorId}/invoices/${invoiceId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock fixtures — deterministic document links
// ─────────────────────────────────────────────────────────────────────────────

/** Fake document link metadata returned from GET /api/document-links */
function makeDocLink(opts: { linkId: string; docId: number; title: string }) {
  return {
    id: opts.linkId,
    entityType: 'invoice',
    entityId: 'placeholder',
    paperlessDocumentId: opts.docId,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    document: {
      id: opts.docId,
      title: opts.title,
      content: null,
      tags: [],
      created: '2026-01-01',
      added: '2026-01-01T00:00:00.000Z',
      modified: '2026-01-01T00:00:00.000Z',
      correspondent: 'Test Vendor GmbH',
      documentType: null,
      archiveSerialNumber: null,
      originalFileName: `invoice-${opts.docId}.pdf`,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route-intercept helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Intercept GET /api/config to inject autoItemizeEnabled: true.
 * Preserves currency from the real server response.
 */
async function mockConfigEnabled(page: Page): Promise<void> {
  await page.route('**/api/config', async (route: Route) => {
    try {
      const realResp = await route.fetch();
      const realBody = (await realResp.json()) as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...realBody, autoItemizeEnabled: true }),
      });
    } catch {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'EUR', autoItemizeEnabled: true }),
      });
    }
  });
}

/**
 * Intercept GET /api/config to inject autoItemizeEnabled: false.
 */
async function mockConfigDisabled(page: Page): Promise<void> {
  await page.route('**/api/config', async (route: Route) => {
    try {
      const realResp = await route.fetch();
      const realBody = (await realResp.json()) as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...realBody, autoItemizeEnabled: false }),
      });
    } catch {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'EUR', autoItemizeEnabled: false }),
      });
    }
  });
}

/**
 * Intercept GET /api/document-links to return a deterministic set of document links.
 * Filters to entityType=invoice&entityId=<invoiceId> for precision.
 */
async function mockDocumentLinks(
  page: Page,
  invoiceId: string,
  docs: { linkId: string; docId: number; title: string }[],
): Promise<void> {
  await page.route(
    (url) =>
      url.pathname.endsWith('/api/document-links') &&
      url.searchParams.get('entityType') === 'invoice' &&
      url.searchParams.get('entityId') === invoiceId,
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documentLinks: docs.map((d) => makeDocLink({ ...d, linkId: d.linkId })),
        }),
      });
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Auto-itemize button absence — config and doc-link conditions
//
// NOTE (#1564): The "Auto-itemize" button in the budget lines section header was
// REMOVED in story #1564. These tests verify the button is correctly absent in the
// two conditions where it would have been hidden even before #1564 (no linked docs,
// or autoItemizeEnabled=false). Both now pass trivially since the button is gone.
// The "button is visible" case (Scenario 1a) was deleted — it tested removed UI.
// Replacement coverage for the new entry point (Itemize button on LinkedDocumentCard)
// is in e2e/tests/invoices/invoice-auto-itemize-page.spec.ts (Scenarios 1 & 2).
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Auto-itemize button visibility (Scenario 1)',
  { tag: ['@smoke', '@responsive'] },
  () => {
    test('Auto-itemize button is NOT visible when no document is linked (even if autoItemizeEnabled=true)', async ({
      page,
      testPrefix,
    }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-NoDocs Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1000,
          date: '2026-06-01',
        });

        // Config has autoItemizeEnabled=true but NO document links
        await mockConfigEnabled(page);
        await mockDocumentLinks(page, invoiceId, []); // zero docs

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Wait for the section to render (Add Budget Line button should appear)
        await expect(detailPage.pickerAddBudgetLineButton).toBeVisible();

        // The Auto-itemize button must NOT be rendered
        await expect(detailPage.getAutoItemizeButton()).not.toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });

    test('Auto-itemize button is NOT visible when autoItemizeEnabled=false (even if a doc is linked)', async ({
      page,
      testPrefix,
    }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-Disabled Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 500,
          date: '2026-06-01',
        });

        // Config has autoItemizeEnabled=false but a doc IS linked
        await mockConfigDisabled(page);
        await mockDocumentLinks(page, invoiceId, [
          { linkId: 'dl-e2e-2', docId: 42002, title: 'Invoice Doc 2' },
        ]);

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Wait for the section to render
        await expect(detailPage.pickerAddBudgetLineButton).toBeVisible();

        // The Auto-itemize button must NOT be rendered
        await expect(detailPage.getAutoItemizeButton()).not.toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });
  },
);
