/**
 * Shared page.route() mocks for the Paperless-first invoice review flow.
 *
 * Scope: only the helpers needed by paperless-invoice-inline-vendor.spec.ts (#2148).
 * Existing specs keep their own local copies; do not refactor them onto this file.
 */

import type { Page, Route } from '@playwright/test';

export const PAPERLESS_BASE_URL = 'http://paperless.local:8000';

export const MOCK_DOC = {
  id: 9001,
  title: 'Invoice #2026-001 – Builder Co',
  content: 'Materials for bathroom renovation',
  tags: [],
  created: '2026-01-15',
  added: '2026-01-15T10:00:00Z',
  modified: '2026-01-15T10:00:00Z',
  correspondent: 'Builder Co',
  documentType: 'Invoice',
  archiveSerialNumber: 9001,
  originalFileName: 'invoice-2026-001.pdf',
  pageCount: 2,
  searchHit: null,
};

const MOCK_DOCUMENTS = {
  documents: [MOCK_DOC],
  pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
};

export const MOCK_EXTRACTED_LINES = [
  {
    description: 'Bathroom tiles (600x600mm)',
    quantity: 20,
    unit: 'm²',
    unitPrice: 45.0,
    totalAmount: 900.0,
    includesVat: false,
    vatRate: 0.19,
    vendorName: null,
    confidence: 0.95,
  },
  {
    description: 'Installation labor',
    quantity: 8,
    unit: 'h',
    unitPrice: 85.0,
    totalAmount: 680.0,
    includesVat: false,
    vatRate: 0.19,
    vendorName: null,
    confidence: 0.88,
  },
];

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

export async function mockPaperlessConfigured(page: Page): Promise<void> {
  await page.route('**/api/paperless/status', (route: Route) =>
    route.fulfill(
      json({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: PAPERLESS_BASE_URL,
        filterTag: null,
      }),
    ),
  );
}

/** Injects autoItemizeEnabled into the real /api/config response. */
export async function mockConfig(page: Page, autoItemizeEnabled: boolean): Promise<void> {
  await page.route('**/api/config', async (route: Route) => {
    try {
      const realResp = await route.fetch();
      const realBody = (await realResp.json()) as Record<string, unknown>;
      await route.fulfill(json({ ...realBody, autoItemizeEnabled }));
    } catch {
      await route.fulfill(json({ currency: 'EUR', autoItemizeEnabled }));
    }
  });
}

export async function mockCorrespondents(page: Page): Promise<void> {
  await page.route('**/paperless/correspondents', (route: Route) =>
    route.fulfill(json({ correspondents: [] })),
  );
}

export async function mockTags(page: Page): Promise<void> {
  await page.route('**/api/paperless/tags', (route: Route) => route.fulfill(json({ tags: [] })));
}

export async function mockLinkedIds(page: Page): Promise<void> {
  await page.route('**/api/document-links/linked-ids', (route: Route) =>
    route.fulfill(json({ paperlessDocumentIds: [] })),
  );
}

export async function mockDocuments(page: Page): Promise<void> {
  await page.route('**/paperless/documents**', (route: Route) =>
    route.fulfill(json(MOCK_DOCUMENTS)),
  );
}

export async function mockDocumentDetail(page: Page, docId: number = MOCK_DOC.id): Promise<void> {
  await page.route(`**/paperless/documents/${docId}`, async (route: Route) => {
    const url = route.request().url();
    if (route.request().method() !== 'GET' || url.includes('/thumb') || url.includes('/preview')) {
      await route.continue();
      return;
    }
    await route.fulfill(json({ document: MOCK_DOC }));
  });
}

export interface MockPreviewHandle {
  /** Number of times POST /api/invoices/auto-itemize/preview was requested. */
  readonly callCount: () => number;
}

/** Mock POST /api/invoices/auto-itemize/preview. */
export async function mockPreview(
  page: Page,
  opts: {
    suggestedVendorId?: string | null;
    extractedVendorName?: string;
    lines?: object[];
  } = {},
): Promise<MockPreviewHandle> {
  let calls = 0;
  await page.route('**/api/invoices/auto-itemize/preview', (route: Route) => {
    calls += 1;
    return route.fulfill(
      json({
        lines: opts.lines ?? MOCK_EXTRACTED_LINES,
        warnings: [],
        suggestedVendorId: opts.suggestedVendorId ?? null,
        ...(opts.extractedVendorName !== undefined
          ? { extractedVendorName: opts.extractedVendorName }
          : {}),
        extractedTotal: 1580,
        extractedInvoiceDate: '2026-01-15',
        extractedInvoiceNumber: 'INV-2026-001',
        extractedNotes: null,
        extractedDueDate: null,
      }),
    );
  });
  return { callCount: () => calls };
}

export interface CapturedCommit {
  /** Parsed JSON bodies of POST /api/invoices/auto-itemize/commit, in order. */
  readonly bodies: Array<Record<string, unknown>>;
}

/** Mock POST /api/invoices/auto-itemize/commit, capturing request bodies. */
export async function mockCommitCapturing(
  page: Page,
  invoiceId = 'mock-invoice-2148',
): Promise<CapturedCommit> {
  const captured: CapturedCommit = { bodies: [] };
  await page.route('**/api/invoices/auto-itemize/commit', (route: Route) => {
    captured.bodies.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill(
      json(
        {
          invoice: {
            id: invoiceId,
            invoiceNumber: 'INV-2026-001',
            amount: 1580,
            date: '2026-01-15',
            dueDate: null,
            status: 'pending',
            notes: null,
            vendorId: 'v-mock',
            vendor: { id: 'v-mock', name: 'Mock' },
            createdAt: '2026-06-15T00:00:00.000Z',
            updatedAt: '2026-06-15T00:00:00.000Z',
          },
        },
        201,
      ),
    );
  });
  return captured;
}
