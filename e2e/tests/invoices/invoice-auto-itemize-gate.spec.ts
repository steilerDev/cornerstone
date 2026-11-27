/**
 * E2E tests for the Split with AI gate (#2262).
 *
 * `/budget/invoices/:id/auto-itemize/:documentId` needs Paperless configured and AI on
 * (`llmEnabled`). When either is off, the router redirects to the invoice's Cost tab
 * (`?tab=cost`); the page's own API error state is unreachable through the router.
 *
 * The E2E container sets neither PAPERLESS_* nor LLM_*, so both states are mocked:
 *   - GET /api/paperless/status: configured true or false
 *   - GET /api/config: real body spread, `llmEnabled` overridden
 *   - GET /paperless/documents/:id and POST /api/invoices/:id/auto-itemize: only for the open
 *     gate (state c), where the page really renders
 *
 * Mocks are registered before `page.goto`. All data is synthetic and named with `testPrefix`.
 */

import { test, expect } from '../../fixtures/auth.js';
import { AutoItemizePage } from '../../pages/AutoItemizePage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import type { Page, Route } from '@playwright/test';
import { API } from '../../fixtures/testData.js';
import { mockAiConfig } from '../../fixtures/autoItemizeGate.js';
import { mockPaperlessConfigured } from '../../fixtures/paperlessMocks.js';

const DOC_ID = 9301;

async function createVendorViaApi(page: Page, name: string): Promise<string> {
  const resp = await page.request.post(API.vendors, { data: { name } });
  expect(resp.ok(), `POST vendor "${name}" failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { vendor: { id: string } };
  return body.vendor.id;
}

async function createInvoiceViaApi(
  page: Page,
  vendorId: string,
  invoiceNumber: string,
): Promise<string> {
  const resp = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', amount: 100, date: '2026-01-15', invoiceNumber },
  });
  expect(resp.ok(), `POST invoice failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { invoice: { id: string } };
  return body.invoice.id;
}

async function cleanup(page: Page, vendorId: string, invoiceId: string): Promise<void> {
  if (invoiceId) await page.request.delete(`${API.vendors}/${vendorId}/invoices/${invoiceId}`);
  if (vendorId) await page.request.delete(`${API.vendors}/${vendorId}`);
}

/** Paperless is reachable on the server side but not configured. */
async function mockPaperlessNotConfigured(page: Page): Promise<void> {
  await page.route('**/api/paperless/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: false,
        reachable: false,
        error: null,
        paperlessUrl: null,
        filterTag: null,
      }),
    });
  });
}

/** Paperless document detail and the dry-run, so the open gate renders the page. */
async function mockSplitPage(page: Page, invoiceId: string, title: string): Promise<void> {
  await page.route(`**/paperless/documents/${DOC_ID}`, async (route: Route) => {
    const url = route.request().url();
    if (route.request().method() !== 'GET' || url.includes('/thumb') || url.includes('/preview')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        document: {
          id: DOC_ID,
          title,
          content: 'Synthetic OCR content',
          tags: [],
          created: '2026-01-01',
          added: '2026-01-01T00:00:00.000Z',
          modified: '2026-01-01T00:00:00.000Z',
          correspondent: 'Synthetic Correspondent',
          documentType: null,
          archiveSerialNumber: null,
          originalFileName: `invoice-${DOC_ID}.pdf`,
        },
      }),
    });
  });
  await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        lines: [
          {
            description: 'Synthetic line',
            quantity: 1,
            unit: null,
            unitPrice: 100,
            totalAmount: 100,
            includesVat: false,
            vatRate: 0.19,
            vendorName: null,
            confidence: 0.9,
          },
        ],
        warnings: [],
      }),
    });
  });
}

/** Wait for the redirect to the invoice page with the Cost tab in the query. */
async function expectRedirectedToCostTab(page: Page, invoiceId: string): Promise<void> {
  await page.waitForURL((url) => {
    return (
      url.pathname === `/budget/invoices/${invoiceId}` && url.searchParams.get('tab') === 'cost'
    );
  });
  expect(page.url()).not.toContain('auto-itemize');
  const detailPage = new InvoiceDetailPage(page);
  await expect(detailPage.tabs.tab('cost')).toHaveAttribute('aria-selected', 'true');
}

test.describe('Split with AI gate (#2262)', { tag: '@smoke' }, () => {
  test('Paperless not configured: opening the page lands on the invoice Cost tab', async ({
    page,
    testPrefix,
  }) => {
    let vendorId = '';
    let invoiceId = '';
    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Gate Vendor A`);
      invoiceId = await createInvoiceViaApi(page, vendorId, `${testPrefix}-GA`);
      await mockPaperlessNotConfigured(page);
      await mockAiConfig(page, { autoItemizeEnabled: true, llmEnabled: true });

      await page.goto(`/budget/invoices/${invoiceId}/auto-itemize/${DOC_ID}`);

      await expectRedirectedToCostTab(page, invoiceId);
    } finally {
      await cleanup(page, vendorId, invoiceId);
    }
  });

  test('AI off: opening the page lands on the invoice Cost tab', async ({ page, testPrefix }) => {
    let vendorId = '';
    let invoiceId = '';
    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Gate Vendor B`);
      invoiceId = await createInvoiceViaApi(page, vendorId, `${testPrefix}-GB`);
      await mockPaperlessConfigured(page);
      await mockAiConfig(page, { autoItemizeEnabled: true, llmEnabled: false });

      await page.goto(`/budget/invoices/${invoiceId}/auto-itemize/${DOC_ID}`);

      await expectRedirectedToCostTab(page, invoiceId);
    } finally {
      await cleanup(page, vendorId, invoiceId);
    }
  });

  test('Paperless configured and AI on: the Split with AI page opens in place', async ({
    page,
    testPrefix,
  }) => {
    const autoItemizePage = new AutoItemizePage(page);
    let vendorId = '';
    let invoiceId = '';
    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Gate Vendor C`);
      invoiceId = await createInvoiceViaApi(page, vendorId, `${testPrefix}-GC`);
      await mockPaperlessConfigured(page);
      await mockAiConfig(page, { autoItemizeEnabled: true, llmEnabled: true });
      await mockSplitPage(page, invoiceId, `${testPrefix} Gate Doc`);

      await autoItemizePage.goto(invoiceId, DOC_ID);

      await expect(autoItemizePage.pageTitle).toHaveText('Split with AI');
      expect(new URL(page.url()).pathname).toBe(
        `/budget/invoices/${invoiceId}/auto-itemize/${DOC_ID}`,
      );
      expect(new URL(page.url()).searchParams.get('tab')).toBeNull();
    } finally {
      await cleanup(page, vendorId, invoiceId);
    }
  });
});
