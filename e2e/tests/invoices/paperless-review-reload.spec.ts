/**
 * E2E tests for the Paperless invoice review page surviving reloads and direct links
 * (Story #2197, AC3).
 *
 * The chosen Paperless document id now lives in the URL (`?documentId=`), not only in
 * router history state, so a reload, a bookmark or a login redirect keeps working.
 *
 * Scenarios:
 *   1. Pick a document -> URL carries ?documentId; `page.goto(page.url())` (fresh
 *      navigation, no history state) shows the review again and re-fetches the same
 *      document; `page.reload()` does too.
 *   2. Opening the page without an id keeps the h1 "New invoice", shows an explanation and a
 *      "Back to Invoices" button that returns to the list; no "Error loading" text.
 *
 * Paperless, config and extraction are mocked with page.route (same approach as
 * paperless-first-invoice.spec.ts); mocks survive reloads within the page.
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { PaperlessInvoiceReviewPage } from '../../pages/PaperlessInvoiceReviewPage.js';
import type { Page, Route } from '@playwright/test';

const DOC_ID = 9001;

const MOCK_STATUS_CONFIGURED = {
  configured: true,
  reachable: true,
  error: null,
  paperlessUrl: 'http://paperless.local:8000',
  filterTag: null,
};

const MOCK_DOC = {
  id: DOC_ID,
  title: 'Invoice #2026-001 – Builder Co',
  content: 'Materials for bathroom renovation',
  tags: [],
  created: '2026-01-15',
  added: '2026-01-15T10:00:00Z',
  modified: '2026-01-15T10:00:00Z',
  correspondent: 'Builder Co',
  documentType: 'Invoice',
  archiveSerialNumber: DOC_ID,
  originalFileName: 'invoice-2026-001.pdf',
  pageCount: 2,
  searchHit: null,
};

const MOCK_DOCUMENTS = {
  documents: [MOCK_DOC],
  pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
};

const MOCK_LINE = {
  description: 'Bathroom tiles (600x600mm)',
  quantity: 20,
  unit: 'm²',
  unitPrice: 45.0,
  totalAmount: 900.0,
  includesVat: false,
  vatRate: 0.19,
  vendorName: 'Builder Co',
  confidence: 0.95,
};

function json(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function mockPaperlessConfigured(page: Page): Promise<void> {
  await page.route('**/api/paperless/status', (route) => json(route, MOCK_STATUS_CONFIGURED));
}

async function mockConfig(page: Page, autoItemizeEnabled: boolean): Promise<void> {
  await page.route('**/api/config', async (route: Route) => {
    try {
      const realResp = await route.fetch();
      const realBody = (await realResp.json()) as Record<string, unknown>;
      await json(route, { ...realBody, autoItemizeEnabled });
    } catch {
      await json(route, { currency: 'EUR', autoItemizeEnabled });
    }
  });
}

async function mockPickerSupport(page: Page): Promise<void> {
  await page.route('**/paperless/correspondents', (route) => json(route, { correspondents: [] }));
  await page.route('**/api/paperless/tags', (route) => json(route, { tags: [] }));
  await page.route('**/api/document-links/linked-ids', (route) =>
    json(route, { paperlessDocumentIds: [] }),
  );
  await page.route('**/paperless/documents**', (route) => json(route, MOCK_DOCUMENTS));
}

/** Document detail mock; counts GET detail hits so tests can prove the id was re-fetched. */
async function mockDocumentDetail(page: Page): Promise<{ hits: () => number }> {
  let hits = 0;
  await page.route(`**/paperless/documents/${DOC_ID}`, async (route: Route) => {
    const url = route.request().url();
    if (route.request().method() !== 'GET' || url.includes('/thumb') || url.includes('/preview')) {
      await route.continue();
      return;
    }
    hits += 1;
    await json(route, { document: MOCK_DOC });
  });
  return { hits: () => hits };
}

async function mockPreview(page: Page): Promise<void> {
  await page.route('**/api/invoices/auto-itemize/preview', (route) =>
    json(route, {
      lines: [MOCK_LINE],
      warnings: [],
      suggestedVendorId: null,
      extractedTotal: 900,
      extractedInvoiceDate: '2026-01-15',
      extractedInvoiceNumber: 'INV-2026-001',
      extractedNotes: null,
      extractedDueDate: null,
    }),
  );
}

test.describe('Paperless review page — reload and direct link', () => {
  test('D-12: picking a document puts its id in the URL and the review survives goto and reload', async ({
    page,
  }) => {
    await mockPaperlessConfigured(page);
    await mockConfig(page, true);
    await mockPickerSupport(page);
    const detail = await mockDocumentDetail(page);
    await mockPreview(page);

    const invoicesPage = new InvoicesPage(page);
    await invoicesPage.goto();
    await invoicesPage.waitForLoaded();
    await invoicesPage.clickNewInvoice();
    const picker = await invoicesPage.waitForPickerModal();
    await picker.selectDocument(MOCK_DOC.title);

    await page.waitForURL(/\/budget\/invoices\/new\/paperless\?documentId=\d+$/);
    expect(new URL(page.url()).searchParams.get('documentId')).toBe(String(DOC_ID));

    const reviewPage = new PaperlessInvoiceReviewPage(page);
    await reviewPage.waitForExtractionComplete();
    await expect(reviewPage.heading).toHaveText('New invoice');
    await expect(reviewPage.statusLine).toContainText('Extraction complete');
    const hitsAfterPick = detail.hits();
    expect(hitsAfterPick).toBeGreaterThan(0);

    // Fresh navigation to the same URL: no history state, like a bookmark or login redirect.
    await page.goto(page.url());
    await reviewPage.waitForExtractionComplete();
    await expect(reviewPage.heading).toHaveText('New invoice');
    await expect(reviewPage.statusLine).toContainText('Extraction complete');
    expect(new URL(page.url()).searchParams.get('documentId')).toBe(String(DOC_ID));
    expect(detail.hits()).toBeGreaterThan(hitsAfterPick);

    // Plain reload.
    const hitsAfterGoto = detail.hits();
    await page.reload();
    await reviewPage.waitForExtractionComplete();
    await expect(reviewPage.heading).toHaveText('New invoice');
    await expect(reviewPage.statusLine).toContainText('Extraction complete');
    expect(detail.hits()).toBeGreaterThan(hitsAfterGoto);
  });

  test('opening the page without a document id explains what to do and leads back to Invoices', async ({
    page,
  }) => {
    await mockPaperlessConfigured(page);
    await mockConfig(page, true);

    const reviewPage = new PaperlessInvoiceReviewPage(page);
    await reviewPage.goto();

    await expect(reviewPage.heading).toHaveText('New invoice');
    await expect(
      page.getByText('Go back to Invoices and choose a document to start a new invoice from it.'),
    ).toBeVisible();
    await expect(page.getByText('Error loading')).toHaveCount(0);

    await page.getByRole('button', { name: 'Back to Invoices' }).click();
    await page.waitForURL('**/budget/invoices');
    expect(new URL(page.url()).pathname).toBe('/budget/invoices');
  });
});
