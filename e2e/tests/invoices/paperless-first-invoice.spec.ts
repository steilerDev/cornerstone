/**
 * E2E tests for the Paperless-first invoice creation flow (Story #1679).
 *
 * Feature:
 *   When Paperless is configured+reachable AND autoItemizeEnabled=true, clicking
 *   "New Invoice" on the Invoices list page opens an InvoicePaperlessPickerModal
 *   instead of the manual create modal. The user selects a document, which
 *   triggers extraction on PaperlessInvoiceReviewPage (/budget/invoices/new/paperless),
 *   then confirms to create the invoice and its budget lines atomically.
 *
 * Scenarios covered:
 *   1.  @smoke Picker opens with correct default state (Paperless+LLM configured)
 *   2.  Correspondent filter: select → list refreshes; clear → full list returns
 *   3.  Document selection triggers extraction spinner + navigation to review page
 *   4.  @smoke Review screen: extraction complete → vendor pre-fill + SuggestionBadge
 *   5.  Hide-linked toggle defaults ON in picker modal
 *   6.  "Open in Paperless" anchor has correct href and target
 *   7.  @smoke Full confirm flow: vendor + lines → confirm → navigate to invoice detail
 *   8.  Responsive picker: on mobile (375px) picker modal is full-screen
 *   9.  Hide-linked default in LinkedDocumentsSection on invoice detail page
 *
 * Mocking strategy:
 *   - GET /api/paperless/status → configured+reachable (mocked)
 *   - GET /api/config → autoItemizeEnabled:true (mocked, preserves other fields)
 *   - GET /paperless/correspondents → list of correspondents (mocked)
 *   - GET /paperless/documents → document list (mocked)
 *   - GET /paperless/documents/:id → single doc detail (mocked)
 *   - POST /api/invoices/auto-itemize/preview → extraction result (mocked)
 *   - POST /api/invoices/auto-itemize/commit → created invoice response (mocked)
 *
 * NO Paperless testcontainer is required — all Paperless calls are intercepted via
 * page.route(). This matches the established pattern in document-linking.spec.ts and
 * invoice-auto-itemize-page.spec.ts. The commit endpoint creates a real invoice in
 * the test database — cleanup happens in the finally block.
 *
 * All tests use the authenticated `page` fixture and `testPrefix` from auth.ts.
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { PaperlessInvoiceReviewPage } from '../../pages/PaperlessInvoiceReviewPage.js';
import { API } from '../../fixtures/testData.js';
import type { Page, Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Mock constants
// ─────────────────────────────────────────────────────────────────────────────

const PAPERLESS_BASE_URL = 'http://paperless.local:8000';

const MOCK_STATUS_CONFIGURED = {
  configured: true,
  reachable: true,
  error: null,
  paperlessUrl: PAPERLESS_BASE_URL,
  filterTag: null,
};

const MOCK_STATUS_NOT_CONFIGURED = {
  configured: false,
  reachable: false,
  error: null,
  paperlessUrl: null,
  filterTag: null,
};

const MOCK_CORRESPONDENTS = {
  correspondents: [
    { id: 1, name: 'Builder Co', documentCount: 12, slug: 'builder-co', lastCorrespondence: null },
    { id: 2, name: 'Tile World GmbH', documentCount: 5, slug: 'tile-world-gmbh', lastCorrespondence: null },
  ],
};

const MOCK_DOC_1 = {
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

const MOCK_DOC_2 = {
  id: 9002,
  title: 'Invoice #2026-002 – Tile World GmbH',
  content: 'Tile purchase',
  tags: [],
  created: '2026-02-01',
  added: '2026-02-01T10:00:00Z',
  modified: '2026-02-01T10:00:00Z',
  correspondent: 'Tile World GmbH',
  documentType: 'Invoice',
  archiveSerialNumber: 9002,
  originalFileName: 'invoice-2026-002.pdf',
  pageCount: 1,
  searchHit: null,
};

const MOCK_DOCUMENTS_ALL = {
  documents: [MOCK_DOC_1, MOCK_DOC_2],
  pagination: { page: 1, pageSize: 25, totalItems: 2, totalPages: 1 },
};

const MOCK_DOCUMENTS_FILTERED = {
  documents: [MOCK_DOC_1],
  pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
};

const MOCK_EXTRACTED_LINES = [
  {
    description: 'Bathroom tiles (600x600mm)',
    quantity: 20,
    unit: 'm²',
    unitPrice: 45.0,
    totalAmount: 900.0,
    includesVat: false,
    vatRate: 0.19,
    vendorName: 'Builder Co',
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

// ─────────────────────────────────────────────────────────────────────────────
// Route-intercept helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Intercept GET /api/paperless/status to return configured+reachable. */
async function mockPaperlessConfigured(page: Page): Promise<void> {
  await page.route('**/api/paperless/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STATUS_CONFIGURED),
    });
  });
}

/** Intercept GET /api/paperless/status to return not-configured. */
async function mockPaperlessNotConfigured(page: Page): Promise<void> {
  await page.route('**/api/paperless/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STATUS_NOT_CONFIGURED),
    });
  });
}

/** Intercept GET /api/config to inject autoItemizeEnabled. Preserves other fields. */
async function mockConfig(page: Page, autoItemizeEnabled: boolean): Promise<void> {
  await page.route('**/api/config', async (route: Route) => {
    try {
      const realResp = await route.fetch();
      const realBody = (await realResp.json()) as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...realBody, autoItemizeEnabled }),
      });
    } catch {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'EUR', autoItemizeEnabled }),
      });
    }
  });
}

/** Intercept GET /paperless/correspondents. */
async function mockCorrespondents(page: Page): Promise<void> {
  await page.route('**/paperless/correspondents', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CORRESPONDENTS),
    });
  });
}

/**
 * Intercept GET /api/paperless/tags.
 * usePaperless Phase 2 fetches documents AND tags in a Promise.all().
 * Without this mock, the tags request goes to the real server (which has no
 * Paperless configured), the Promise.all rejects, usePaperless enters error state,
 * and DocumentBrowser renders a role="alert" error div instead of the grid.
 * Must be registered before the picker modal is opened.
 */
async function mockTags(page: Page): Promise<void> {
  await page.route('**/api/paperless/tags', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tags: [] }),
    });
  });
}

/** Intercept GET /paperless/documents (with optional correspondentId filter). */
async function mockDocuments(
  page: Page,
  opts: { filteredByCorrespondentId?: number } = {},
): Promise<void> {
  await page.route('**/paperless/documents**', async (route: Route) => {
    const url = new URL(route.request().url());
    // The client sends ?correspondent=<id> (integer param name, per paperlessApi.ts)
    const corrParam = url.searchParams.get('correspondent');
    if (opts.filteredByCorrespondentId !== undefined && corrParam !== null) {
      // Return filtered list when correspondent param is provided
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_DOCUMENTS_FILTERED),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_DOCUMENTS_ALL),
      });
    }
  });
}

/** Intercept GET /paperless/documents/:id for a single document detail. */
async function mockDocumentDetail(page: Page, docId: number): Promise<void> {
  await page.route(`**/paperless/documents/${docId}`, async (route: Route) => {
    if (
      route.request().method() !== 'GET' ||
      route.request().url().includes('/thumb') ||
      route.request().url().includes('/preview')
    ) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ document: MOCK_DOC_1 }),
    });
  });
}

/**
 * Intercept POST /api/invoices/auto-itemize/preview.
 * Returns extracted lines + optional suggestedVendorId + extracted metadata.
 */
async function mockPreview(
  page: Page,
  opts: {
    lines?: object[];
    suggestedVendorId?: string | null;
    extractedTotal?: number;
    delayMs?: number;
    errorStatus?: number;
  } = {},
): Promise<void> {
  const lines = opts.lines ?? MOCK_EXTRACTED_LINES;
  const delayMs = opts.delayMs ?? 0;

  await page.route('**/api/invoices/auto-itemize/preview', async (route: Route) => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (opts.errorStatus !== undefined) {
      await route.fulfill({
        status: opts.errorStatus,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'LLM_EXTRACTION_FAILED', message: 'Extraction failed', details: {} },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        lines,
        warnings: [],
        suggestedVendorId: opts.suggestedVendorId ?? null,
        extractedTotal: opts.extractedTotal ?? 1580,
        extractedInvoiceDate: '2026-01-15',
        extractedInvoiceNumber: 'INV-2026-001',
        extractedNotes: null,
        extractedDueDate: null,
      }),
    });
  });
}

/**
 * Intercept POST /api/invoices/auto-itemize/commit.
 * Returns a mocked created invoice response or an error.
 */
async function mockCommit(
  page: Page,
  opts: { invoiceId?: string; errorCode?: string } = {},
): Promise<void> {
  const invoiceId = opts.invoiceId ?? 'mock-invoice-9001';

  await page.route('**/api/invoices/auto-itemize/commit', async (route: Route) => {
    if (opts.errorCode) {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: opts.errorCode, message: 'Commit error', details: {} },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        invoice: {
          id: invoiceId,
          invoiceNumber: 'INV-2026-001',
          amount: 1580,
          date: '2026-01-15',
          dueDate: null,
          status: 'pending',
          notes: null,
          vendorId: 'v-9001',
          vendor: { id: 'v-9001', name: 'Builder Co' },
          createdAt: '2026-06-15T00:00:00.000Z',
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
      }),
    });
  });
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — @smoke: Picker opens with correct default state
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Scenario 1 — Picker opens with correct default state',
  { tag: ['@smoke', '@responsive'] },
  () => {
    test(
      'With Paperless+LLM configured, New Invoice opens picker modal with hide-linked checked and no pre-selected correspondent',
      async ({ page }) => {
        await mockPaperlessConfigured(page);
        await mockConfig(page, true);
        await mockCorrespondents(page);
        await mockDocuments(page);
        await mockTags(page);

        const invoicesPage = new InvoicesPage(page);
        await invoicesPage.goto();
        await invoicesPage.waitForLoaded();

        await invoicesPage.clickNewInvoice();
        const pickerModal = await invoicesPage.waitForPickerModal();

        // Modal title is visible
        await expect(pickerModal.modal).toBeVisible();

        // Hide-linked toggle defaults to checked (defaultHideLinked=true in InvoicePaperlessPickerModal)
        await expect(pickerModal.hideLinkedToggle).toBeChecked();

        // No correspondent pre-selected — input is empty
        await expect(pickerModal.correspondentInput).toHaveValue('');
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — Correspondent filter
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 2 — Correspondent filter', () => {
  test('Selecting correspondent filters document list; clearing restores full list', async ({
    page,
  }) => {
    await mockPaperlessConfigured(page);
    await mockConfig(page, true);
    await mockCorrespondents(page);
    await mockTags(page);

    // Track whether correspondent filter was applied to the documents request
    let lastDocRequestHadCorrespondent = false;
    await page.route('**/paperless/documents**', async (route: Route) => {
      const url = new URL(route.request().url());
      // The client sends ?correspondent=<id> (integer param name, per paperlessApi.ts)
      const corrParam = url.searchParams.get('correspondent');
      lastDocRequestHadCorrespondent = corrParam !== null && corrParam !== '';
      if (lastDocRequestHadCorrespondent) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DOCUMENTS_FILTERED),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DOCUMENTS_ALL),
        });
      }
    });

    const invoicesPage = new InvoicesPage(page);
    await invoicesPage.goto();
    await invoicesPage.waitForLoaded();

    await invoicesPage.clickNewInvoice();
    const pickerModal = await invoicesPage.waitForPickerModal();

    // Wait for the document grid to finish both async loading stages before asserting cards
    await pickerModal.waitForDocumentsLoaded();

    // Initially both documents are visible (all list)
    await expect(pickerModal.getDocumentCard(MOCK_DOC_1.title)).toBeVisible();
    await expect(pickerModal.getDocumentCard(MOCK_DOC_2.title)).toBeVisible();

    // Select "Builder Co" correspondent
    await pickerModal.correspondentInput.fill('Builder');
    await pickerModal.correspondentPortalDropdown.waitFor({ state: 'visible' });
    await pickerModal.correspondentPortalDropdown.getByRole('option', { name: 'Builder Co' }).click();

    // After correspondent selection, the filtered list shows only doc 1
    await expect(pickerModal.getDocumentCard(MOCK_DOC_1.title)).toBeVisible();
    // Doc 2 should no longer be visible
    await expect(pickerModal.getDocumentCard(MOCK_DOC_2.title)).not.toBeVisible();

    // Clear the correspondent — input resets and full list is restored
    await pickerModal.clearCorrespondent();
    await expect(pickerModal.getDocumentCard(MOCK_DOC_2.title)).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — Document selection triggers extraction and navigation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 3 — Document selection triggers extraction', () => {
  test('Clicking a document card closes picker and shows extraction loading on review page', async ({
    page,
  }) => {
    await mockPaperlessConfigured(page);
    await mockConfig(page, true);
    await mockCorrespondents(page);
    await mockDocuments(page);
    await mockTags(page);
    await mockDocumentDetail(page, MOCK_DOC_1.id);
    // Add delay to preview to observe spinner
    await mockPreview(page, { delayMs: 200 });

    const invoicesPage = new InvoicesPage(page);
    await invoicesPage.goto();
    await invoicesPage.waitForLoaded();

    await invoicesPage.clickNewInvoice();
    const pickerModal = await invoicesPage.waitForPickerModal();

    // Select document
    await pickerModal.selectDocument(MOCK_DOC_1.title);

    // Navigation to review page occurs
    await page.waitForURL('**/budget/invoices/new/paperless');

    // Review page shows loading state
    const reviewPage = new PaperlessInvoiceReviewPage(page);
    await reviewPage.waitForLoading();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 — @smoke Review screen: pre-fill + SuggestionBadge
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Scenario 4 — Review screen vendor pre-fill and SuggestionBadge',
  { tag: '@smoke' },
  () => {
    test(
      'After extraction, vendor SearchPicker shows LLM-suggested vendor with SuggestionBadge',
      async ({ page, testPrefix }) => {
        let vendorId = '';

        try {
          // Create a real vendor for the suggestion to resolve
          vendorId = await createVendorViaApi(page, `${testPrefix} Builder Co`);

          await mockPaperlessConfigured(page);
          await mockConfig(page, true);
          await mockCorrespondents(page);
          await mockDocuments(page);
          await mockTags(page);
          await mockDocumentDetail(page, MOCK_DOC_1.id);
          // Return suggestedVendorId matching the real vendor we just created
          await mockPreview(page, { suggestedVendorId: vendorId });

          // Navigate through the full picker flow so React Router location state is set
          const invoicesPage = new InvoicesPage(page);
          await invoicesPage.goto();
          await invoicesPage.waitForLoaded();

          await invoicesPage.clickNewInvoice();
          const pickerModal = await invoicesPage.waitForPickerModal();

          // Select document — this calls navigate('/budget/invoices/new/paperless', { state: {...} })
          await pickerModal.selectDocument(MOCK_DOC_1.title);
          await page.waitForURL('**/budget/invoices/new/paperless');

          const reviewPage = new PaperlessInvoiceReviewPage(page);
          await reviewPage.waitForExtractionComplete();

          // When suggestedVendorId is non-null, SearchPicker renders in DISPLAY mode:
          // initialTitle (vendor name) + value (vendorId) are both set, causing SearchPicker
          // to render a selectedDisplay chip instead of the #vendor-picker input.
          // Assert the display chip is visible and contains the vendor name.
          await expect(reviewPage.vendorSelectedDisplay).toBeVisible();
          await expect(reviewPage.vendorSelectedDisplay).toContainText(testPrefix);

          // SuggestionBadge should appear since suggestedVendorId === vendorId
          await expect(reviewPage.vendorSuggestionBadge).toBeVisible();

          // Line items should be rendered (extracted lines from mock preview)
          const lineCount = await reviewPage.getLineItemCount();
          expect(lineCount).toBeGreaterThan(0);
        } finally {
          if (vendorId) await deleteVendorViaApi(page, vendorId);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 — Hide-linked toggle defaults ON in picker modal
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 5 — Hide-linked toggle defaults ON in picker modal', () => {
  test('DocumentBrowser inside picker modal has hide-linked toggle checked by default', async ({
    page,
  }) => {
    await mockPaperlessConfigured(page);
    await mockConfig(page, true);
    await mockCorrespondents(page);
    await mockDocuments(page);
    await mockTags(page);

    const invoicesPage = new InvoicesPage(page);
    await invoicesPage.goto();
    await invoicesPage.waitForLoaded();

    await invoicesPage.clickNewInvoice();
    const pickerModal = await invoicesPage.waitForPickerModal();

    // defaultHideLinked=true is passed to DocumentBrowser in InvoicePaperlessPickerModal
    await expect(pickerModal.hideLinkedToggle).toBeChecked();

    // Toggle it off
    await pickerModal.hideLinkedToggle.click();
    await expect(pickerModal.hideLinkedToggle).not.toBeChecked();

    // Toggle it back on
    await pickerModal.hideLinkedToggle.click();
    await expect(pickerModal.hideLinkedToggle).toBeChecked();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 — "Open in Paperless" anchor has correct href and target
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 6 — Open in Paperless anchor', () => {
  test('Document card shows Open-in-Paperless link with correct URL and new-tab target', async ({
    page,
  }) => {
    await mockPaperlessConfigured(page);
    await mockConfig(page, true);
    await mockCorrespondents(page);
    await mockDocuments(page);
    await mockTags(page);

    const invoicesPage = new InvoicesPage(page);
    await invoicesPage.goto();
    await invoicesPage.waitForLoaded();

    await invoicesPage.clickNewInvoice();
    const pickerModal = await invoicesPage.waitForPickerModal();

    // Wait for the document grid to finish loading before asserting card and link visibility
    await pickerModal.waitForDocumentsLoaded();

    // The document card is visible
    await expect(pickerModal.getDocumentCard(MOCK_DOC_1.title)).toBeVisible();

    // Get the "Open in Paperless" link for doc 1
    const openLink = pickerModal.getOpenInPaperlessLink(MOCK_DOC_1.title);
    await expect(openLink).toBeVisible();

    // Verify the href points to the correct Paperless document detail URL
    const expectedHref = `${PAPERLESS_BASE_URL}/documents/${MOCK_DOC_1.id}/details`;
    await expect(openLink).toHaveAttribute('href', expectedHref);

    // Verify it opens in a new tab
    await expect(openLink).toHaveAttribute('target', '_blank');
    await expect(openLink).toHaveAttribute('rel', /noopener/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7 — @smoke Full confirm flow: vendor + lines → confirm → navigate
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 7 — Full confirm flow', { tag: '@smoke' }, () => {
  test(
    'Complete Paperless-first flow: picker → select doc → review → set vendor → confirm → invoice detail',
    async ({ page, testPrefix }) => {
      let vendorId = '';
      const mockInvoiceId = `mock-inv-${testPrefix}-9001`;

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} PF Builder Co`);

        // Fetch a real budget category ID from the server so mock preview lines pass
        // the category-required validation in handleSave (requires budgetCategoryId OR
        // assignedBudgetLineId on each included line — MOCK_EXTRACTED_LINES have neither).
        // GET /api/budget-categories returns { categories: [{ id, ... }] }.
        const catResp = await page.request.get(API.budgetCategories);
        expect(catResp.ok(), `GET /api/budget-categories failed: ${catResp.status()}`).toBeTruthy();
        const catBody = (await catResp.json()) as { categories: Array<{ id: string }> };
        const firstCat = catBody.categories[0];
        const firstCatId = firstCat?.id ?? null;
        expect(
          firstCatId,
          'Expected at least one budget category to exist on the server for confirm-flow test',
        ).not.toBeNull();

        // Build mock lines with a valid budgetCategoryId so handleSave can proceed to commit
        const linesWithCategory = MOCK_EXTRACTED_LINES.map((l) => ({
          ...l,
          budgetCategoryId: firstCatId,
        }));

        await mockPaperlessConfigured(page);
        await mockConfig(page, true);
        await mockCorrespondents(page);
        await mockDocuments(page);
        await mockTags(page);
        await mockDocumentDetail(page, MOCK_DOC_1.id);
        await mockPreview(page, { suggestedVendorId: null, lines: linesWithCategory });
        await mockCommit(page, { invoiceId: mockInvoiceId });

        // Also mock the invoice detail page load for the created invoice
        await page.route(`**/api/invoices/${mockInvoiceId}`, async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              invoice: {
                id: mockInvoiceId,
                invoiceNumber: 'INV-2026-001',
                amount: 1580,
                date: '2026-01-15',
                dueDate: null,
                status: 'pending',
                notes: null,
                vendorId,
                vendor: { id: vendorId, name: `${testPrefix} PF Builder Co` },
                createdAt: '2026-06-15T00:00:00.000Z',
                updatedAt: '2026-06-15T00:00:00.000Z',
              },
            }),
          });
        });

        const invoicesPage = new InvoicesPage(page);
        await invoicesPage.goto();
        await invoicesPage.waitForLoaded();

        // Step 1: Click New Invoice → picker opens
        await invoicesPage.clickNewInvoice();
        const pickerModal = await invoicesPage.waitForPickerModal();
        await expect(pickerModal.modal).toBeVisible();

        // Step 2: Select document → navigate to review page
        await pickerModal.selectDocument(MOCK_DOC_1.title);
        await page.waitForURL('**/budget/invoices/new/paperless');

        // Step 3: Wait for extraction complete on review page
        const reviewPage = new PaperlessInvoiceReviewPage(page);
        await reviewPage.waitForExtractionComplete();

        // Step 4: Set vendor manually (no pre-fill since suggestedVendorId=null)
        await reviewPage.setVendor(`${testPrefix} PF Builder Co`);

        // Step 5: Confirm → navigate to invoice detail page
        const commitResponsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/auto-itemize/commit') && resp.request().method() === 'POST',
        );
        await reviewPage.confirm();
        await commitResponsePromise;

        // Step 6: Should navigate to the created invoice detail page
        await page.waitForURL(`**/budget/invoices/${mockInvoiceId}`);
        // Invoice detail page heading should render
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8 — Responsive picker: mobile viewport
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 8 — Responsive picker on mobile viewport', () => {
  test(
    'On 375px viewport, picker modal is full-screen (≥90% of viewport width)',
    { tag: '@responsive' },
    async ({ page }) => {
      // This test is meaningful only on mobile viewport
      const viewportWidth = page.viewportSize()?.width ?? 1280;
      if (viewportWidth >= 1024) {
        test.skip();
        return;
      }

      await mockPaperlessConfigured(page);
      await mockConfig(page, true);
      await mockCorrespondents(page);
      await mockDocuments(page);
      await mockTags(page);

      const invoicesPage = new InvoicesPage(page);
      await invoicesPage.goto();
      await invoicesPage.waitForLoaded();

      await invoicesPage.clickNewInvoice();
      const pickerModal = await invoicesPage.waitForPickerModal();
      await expect(pickerModal.modal).toBeVisible();

      // On mobile, the modal should be full-screen (width ≥ 90% of viewport)
      const modalBox = await pickerModal.modal.boundingBox();
      expect(modalBox).not.toBeNull();
      if (modalBox) {
        expect(modalBox.width).toBeGreaterThanOrEqual(viewportWidth * 0.9);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9 — Hide-linked default in LinkedDocumentsSection on invoice detail
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 9 — Hide-linked default in invoice detail LinkedDocumentsSection', () => {
  test(
    'On invoice detail page with linked docs, "Add Document" picker toggle is ON by default',
    async ({ page, testPrefix }) => {
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} PF HideLinked Vendor`);
        const invoiceResp = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
          data: { status: 'pending', amount: 1000, date: '2026-06-01' },
        });
        expect(invoiceResp.ok(), `POST invoice failed: ${invoiceResp.status()}`).toBeTruthy();
        const invoiceBody = (await invoiceResp.json()) as { invoice: { id: string } };
        invoiceId = invoiceBody.invoice.id;

        // Mock Paperless as configured so the document browser renders
        await mockPaperlessConfigured(page);

        // Mock document-links to return one pre-existing linked doc (so hide-linked has an effect)
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
                documentLinks: [
                  {
                    id: 'dl-e2e-pf-1',
                    entityType: 'invoice',
                    entityId: invoiceId,
                    paperlessDocumentId: MOCK_DOC_1.id,
                    createdBy: null,
                    createdAt: '2026-01-01T00:00:00.000Z',
                    document: MOCK_DOC_1,
                  },
                ],
              }),
            });
          },
        );

        // Mock the system-wide linked IDs endpoint
        await page.route('**/api/document-links/linked-ids', async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ paperlessDocumentIds: [MOCK_DOC_1.id] }),
          });
        });

        // Mock the documents browser to show some documents
        await mockDocuments(page);
        await mockCorrespondents(page);
        await mockTags(page);

        // Navigate to the invoice detail page
        await page.goto(`/budget/invoices/${invoiceId}`);
        await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

        // Open the "Add Document" picker via the LinkedDocumentsSection
        const addDocButton = page.getByRole('button', { name: /Add Document|Link Document/i }).first();
        await addDocButton.waitFor({ state: 'visible' });
        await addDocButton.click();

        // The picker modal (DocumentBrowser) should open
        const docPickerModal = page.getByRole('dialog', { name: /Add Document/i });
        await docPickerModal.waitFor({ state: 'visible' });

        // The hide-linked toggle should be checked by default (feature default)
        const hideLinkedToggle = docPickerModal.getByRole('checkbox', {
          name: /Hide already-linked documents/i,
        });
        await expect(hideLinkedToggle).toBeChecked();
      } finally {
        if (invoiceId && vendorId) {
          await page.request.delete(`${API.vendors}/${vendorId}/invoices/${invoiceId}`);
        }
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});
