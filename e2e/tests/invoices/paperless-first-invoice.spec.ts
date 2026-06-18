/**
 * E2E tests for the Paperless-first invoice creation flow (Stories #1679, #1703, #1704).
 *
 * Feature:
 *   When Paperless is configured+reachable AND autoItemizeEnabled=true, clicking
 *   "New Invoice" on the Invoices list page opens an InvoicePaperlessPickerModal
 *   instead of the manual create modal. The user selects a document, which
 *   triggers extraction on PaperlessInvoiceReviewPage (/budget/invoices/new/paperless),
 *   then confirms to create the invoice and its budget lines atomically.
 *
 *   Story #1703/#1704: PaperlessInvoiceReviewPage refactored to a two-column layout
 *   (formColumn + previewColumn with PDF iframe). The Save button is NO LONGER disabled
 *   when vendor is empty — clicking triggers an inline vendor FormError instead of
 *   silently doing nothing.
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
 *   10. PDF iframe present in preview column after extraction complete
 *   11. Silent-failure fix: clicking Create without vendor shows inline vendor error, no navigation
 *   12. Page-level error banner on commit 500 (page stays in ready state)
 *   13. Two-column layout at desktop viewport (formColumn + previewColumn side by side)
 *   14. @responsive Stacked layout at mobile viewport (previewColumn after formColumn)
 *   15. Hide-linked filter actually hides documents whose IDs are returned by linked-ids API
 *   16. @smoke "Create New Budget Line" closes picker and shows inline BudgetLineForm on card (Story #1764)
 *   17. Fill inline form and save creates budget line + invoice (Story #1764)
 *   18. Inline form validation: invalid amount shows inlineDraftInvalid error (Story #1764)
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
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
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
    {
      id: 2,
      name: 'Tile World GmbH',
      documentCount: 5,
      slug: 'tile-world-gmbh',
      lastCorrespondence: null,
    },
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
async function _mockPaperlessNotConfigured(page: Page): Promise<void> {
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

/**
 * Intercept GET /api/document-links/linked-ids.
 * InvoicePaperlessPickerModal fetches this endpoint on mount via useAllLinkedDocumentIds
 * to populate the linkedDocumentIds prop on DocumentBrowser so already-linked documents
 * can be filtered when the hide-linked toggle is ON.
 * Must be registered BEFORE clickNewInvoice() to avoid an unmocked request firing on mount.
 */
async function mockLinkedIds(page: Page, ids: number[]): Promise<void> {
  await page.route('**/api/document-links/linked-ids', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ paperlessDocumentIds: ids }),
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
    test('With Paperless+LLM configured, New Invoice opens picker modal with hide-linked checked and no pre-selected correspondent', async ({
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

      // Modal title is visible
      await expect(pickerModal.modal).toBeVisible();

      // Hide-linked toggle defaults to checked (defaultHideLinked=true in InvoicePaperlessPickerModal)
      await expect(pickerModal.hideLinkedToggle).toBeChecked();

      // No correspondent pre-selected — input is empty
      await expect(pickerModal.correspondentInput).toHaveValue('');
    });
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
    await pickerModal.correspondentPortalDropdown
      .getByRole('option', { name: 'Builder Co' })
      .click();

    // Wait for grid to finish re-fetching with the correspondent filter applied
    await pickerModal.waitForDocumentsLoaded();

    // After correspondent selection, the filtered list shows only doc 1
    await expect(pickerModal.getDocumentCard(MOCK_DOC_1.title)).toBeVisible();
    // Doc 2 should no longer be visible
    await expect(pickerModal.getDocumentCard(MOCK_DOC_2.title)).not.toBeVisible();

    // Clear the correspondent — input resets and full list is restored
    await pickerModal.clearCorrespondent();
    // Wait for grid to finish re-fetching the full unfiltered list
    await pickerModal.waitForDocumentsLoaded();
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
    test('After extraction, vendor SearchPicker shows LLM-suggested vendor with SuggestionBadge', async ({
      page,
      testPrefix,
    }) => {
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
    });
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
    // InvoicePaperlessPickerModal now fetches linked-ids on mount (Issue #1739 fix).
    // Register before clickNewInvoice() to prevent an unmocked request causing a console error.
    await mockLinkedIds(page, []);

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
  test('Complete Paperless-first flow: picker → select doc → review → set vendor → confirm → invoice detail', async ({
    page,
    testPrefix,
  }) => {
    // Mark slow: this test traverses picker → review → commit → detail page load across
    // multiple mocked API requests. On heavily-loaded CI shards it can exceed the default
    // timeout. Tripling the timeout prevents flaky timeouts without weakening the assertion.
    test.slow();

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

      // Mock the invoice detail page load for the created invoice.
      // The Invoice type requires: vendorName, deposits (array), finalPaymentAmount, createdBy.
      // Missing these fields causes React to crash when InvoiceDetailPage renders
      // (invoice.deposits is accessed as an array — undefined → runtime error → error state, no h1).
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
              vendorName: `${testPrefix} PF Builder Co`,
              vendor: { id: vendorId, name: `${testPrefix} PF Builder Co` },
              deposits: [],
              finalPaymentAmount: 1580,
              createdBy: null,
              createdAt: '2026-06-15T00:00:00.000Z',
              updatedAt: '2026-06-15T00:00:00.000Z',
            },
          }),
        });
      });

      // Mock sub-section endpoints so their background fetches don't race the page render.
      // InvoiceBudgetLinesSection fetches budget lines on mount; without a mock this request
      // goes to the real server with a non-existent invoice ID, introducing extra latency.
      await page.route(`**/api/invoices/${mockInvoiceId}/budget-lines`, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ budgetLines: [], remainingAmount: 1580 }),
        });
      });

      // LinkedDocumentsSection fetches document-links on mount.
      await page.route(
        (url) =>
          url.pathname === '/api/document-links' &&
          url.searchParams.get('entityType') === 'invoice' &&
          url.searchParams.get('entityId') === mockInvoiceId,
        async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ documentLinks: [] }),
          });
        },
      );

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
        (resp) => resp.url().includes('/auto-itemize/commit') && resp.request().method() === 'POST',
      );
      await reviewPage.confirm();
      await commitResponsePromise;

      // Step 6: Should navigate to the created invoice detail page.
      await page.waitForURL(`**/budget/invoices/${mockInvoiceId}`);

      // Assert on the invoice number shown in the h1 — this text only renders once the
      // GET /api/invoices/:id mock has responded and React has set state (isLoading=false).
      // Waiting for the number text is more stable than the bare heading role check because
      // it requires the API response data to be present in the DOM, not just the element to
      // exist. The test also verifies the correct invoice landed on screen.
      await expect(page.getByRole('heading', { level: 1, name: '#INV-2026-001' })).toBeVisible();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
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
// Shared helper: navigate through the full picker flow to the review page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Navigate from the invoices list page through the picker to the review page.
 * Returns a PaperlessInvoiceReviewPage instance once extraction is complete.
 * All Paperless mocks (status, config, correspondents, documents, tags, detail, preview)
 * must be registered BEFORE calling this helper.
 */
async function navigateToReviewPage(page: Page): Promise<PaperlessInvoiceReviewPage> {
  const invoicesPage = new InvoicesPage(page);
  await invoicesPage.goto();
  await invoicesPage.waitForLoaded();

  await invoicesPage.clickNewInvoice();
  const pickerModal = await invoicesPage.waitForPickerModal();
  await pickerModal.selectDocument(MOCK_DOC_1.title);
  await page.waitForURL('**/budget/invoices/new/paperless');

  const reviewPage = new PaperlessInvoiceReviewPage(page);
  await reviewPage.waitForExtractionComplete();
  return reviewPage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9 — Hide-linked default in LinkedDocumentsSection on invoice detail
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 9 — Hide-linked default in invoice detail LinkedDocumentsSection', () => {
  test('On invoice detail page with linked docs, "Add Document" picker toggle is ON by default', async ({
    page,
    testPrefix,
  }) => {
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
      const addDocButton = page
        .getByRole('button', { name: /Add Document|Link Document/i })
        .first();
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
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10 — PDF iframe present in preview column after extraction complete
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 10 — PDF iframe in preview column (Story #1704)', () => {
  test('After extraction completes, PDF iframe is visible inside the preview column', async ({
    page,
  }) => {
    await mockPaperlessConfigured(page);
    await mockConfig(page, true);
    await mockCorrespondents(page);
    await mockDocuments(page);
    await mockTags(page);
    await mockDocumentDetail(page, MOCK_DOC_1.id);
    await mockPreview(page);

    const reviewPage = await navigateToReviewPage(page);

    // The two-column layout should be visible
    await expect(reviewPage.formColumn).toBeVisible();
    await expect(reviewPage.previewColumn).toBeVisible();

    // PDF iframe should be present and inside the preview column
    await expect(reviewPage.pdfIframe).toBeVisible();
    // Verify it is structurally inside the preview column (not just anywhere on the page)
    const iframeInPreview = reviewPage.previewColumn.locator('iframe[title="Invoice PDF preview"]');
    await expect(iframeInPreview).toBeAttached();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11 — Silent-failure fix: vendor error visible on submit without vendor
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 11 — Silent-failure fix: vendor error on submit without vendor (Story #1703)', () => {
  test('Clicking Create Invoice & Itemize with no vendor shows inline vendor error and keeps URL unchanged', async ({
    page,
    testPrefix,
  }) => {
    let vendorId = '';

    try {
      // Create a vendor so a pre-fill can be cleared (we need to clear it)
      vendorId = await createVendorViaApi(page, `${testPrefix} SFF Vendor`);

      await mockPaperlessConfigured(page);
      await mockConfig(page, true);
      await mockCorrespondents(page);
      await mockDocuments(page);
      await mockTags(page);
      await mockDocumentDetail(page, MOCK_DOC_1.id);
      // No suggestedVendorId so the vendor input is empty (search/input mode)
      await mockPreview(page, { suggestedVendorId: null });

      const reviewPage = await navigateToReviewPage(page);

      // Confirm button should NOT be disabled when vendor is empty
      // (behavior change in Story #1703 — old code had disabled={!vendorId || saving})
      await expect(reviewPage.confirmButton).not.toBeDisabled();

      // Click "Create Invoice & Itemize" without setting a vendor
      await reviewPage.confirmButton.click();

      // A visible vendor FormError should appear
      await expect(reviewPage.vendorError).toBeVisible();

      // URL must still be the review page — no navigation occurred
      expect(page.url()).toContain('/budget/invoices/new/paperless');

      // The confirm button must still be visible (page stayed in ready state, not navigated)
      await expect(reviewPage.confirmButton).toBeVisible();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12 — Page-level error banner on commit failure (500)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 12 — Page-level error banner on commit 500 (Story #1703)', () => {
  test('When commit endpoint returns 500, a page-level error banner appears inside the form column without navigating', async ({
    page,
    testPrefix,
  }) => {
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Commit500 Vendor`);

      // Fetch a real budget category so all lines pass category validation
      const catResp = await page.request.get(API.budgetCategories);
      expect(catResp.ok(), `GET /api/budget-categories failed: ${catResp.status()}`).toBeTruthy();
      const catBody = (await catResp.json()) as { categories: Array<{ id: string }> };
      const firstCatId = catBody.categories[0]?.id ?? null;
      expect(
        firstCatId,
        'Expected at least one budget category to exist on the server',
      ).not.toBeNull();

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

      // Mock commit to return 500
      await page.route('**/api/invoices/auto-itemize/commit', async (route: Route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: {} },
          }),
        });
      });

      const reviewPage = await navigateToReviewPage(page);

      // Set a vendor so vendor validation passes
      await reviewPage.setVendor(`${testPrefix} Commit500 Vendor`);

      // Click Create — commit will fail with 500
      const commitResponse = page.waitForResponse(
        (resp) => resp.url().includes('/auto-itemize/commit') && resp.request().method() === 'POST',
      );
      await reviewPage.confirmButton.click();
      await commitResponse;

      // Page-level error banner should appear inside formColumn (NOT the fatal error layout)
      // The formColumn must still be visible — page stays in ready state
      await expect(reviewPage.formColumn).toBeVisible();
      await expect(reviewPage.pageErrorBanner).toBeVisible();

      // URL must not have changed — no navigation to an invoice detail page
      expect(page.url()).toContain('/budget/invoices/new/paperless');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13 — Two-column layout at desktop viewport
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 13 — Two-column layout at desktop viewport (Story #1704)', () => {
  test('At desktop viewport (≥1024px), review page shows formColumn and previewColumn side by side with PDF iframe visible', async ({
    page,
  }) => {
    // This scenario is meaningful only at desktop widths (above the 860px breakpoint)
    const viewportWidth = page.viewportSize()?.width ?? 1280;
    if (viewportWidth < 860) {
      test.skip();
      return;
    }

    await mockPaperlessConfigured(page);
    await mockConfig(page, true);
    await mockCorrespondents(page);
    await mockDocuments(page);
    await mockTags(page);
    await mockDocumentDetail(page, MOCK_DOC_1.id);
    await mockPreview(page);

    const reviewPage = await navigateToReviewPage(page);

    // Both columns should be visible
    await expect(reviewPage.formColumn).toBeVisible();
    await expect(reviewPage.previewColumn).toBeVisible();

    // PDF iframe should be visible in the preview column
    await expect(reviewPage.pdfIframe).toBeVisible();

    // Verify the columns are side by side: formColumn should be to the left of previewColumn.
    // At desktop (grid-template-columns: 1fr 1fr), formColumn.right <= previewColumn.left.
    const formBox = await reviewPage.formColumn.boundingBox();
    const previewBox = await reviewPage.previewColumn.boundingBox();
    expect(formBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    if (formBox && previewBox) {
      // formColumn right edge should be at or before previewColumn left edge
      expect(formBox.x + formBox.width).toBeLessThanOrEqual(previewBox.x + 2); // +2px tolerance
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 14 — Stacked layout at mobile viewport
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Scenario 14 — Stacked layout at mobile viewport (Story #1704)',
  { tag: '@responsive' },
  () => {
    test('At mobile viewport (≤860px), review page stacks columns with formColumn above previewColumn', async ({
      page,
    }) => {
      // This scenario is meaningful only at mobile/narrow viewports (below the 860px breakpoint)
      const viewportWidth = page.viewportSize()?.width ?? 1280;
      if (viewportWidth > 860) {
        test.skip();
        return;
      }

      await mockPaperlessConfigured(page);
      await mockConfig(page, true);
      await mockCorrespondents(page);
      await mockDocuments(page);
      await mockTags(page);
      await mockDocumentDetail(page, MOCK_DOC_1.id);
      await mockPreview(page);

      const reviewPage = await navigateToReviewPage(page);

      // Both columns should be in the DOM
      await expect(reviewPage.formColumn).toBeVisible();
      await expect(reviewPage.previewColumn).toBeVisible();

      // The PDF iframe should be visible even on mobile
      await expect(reviewPage.pdfIframe).toBeVisible();

      // At mobile viewport, the layout stacks: formColumn has order:1, previewColumn has order:2.
      // The formColumn should appear above the previewColumn in the rendered layout.
      // We verify this by checking vertical positions: formColumn.top < previewColumn.top.
      const formBox = await reviewPage.formColumn.boundingBox();
      const previewBox = await reviewPage.previewColumn.boundingBox();
      expect(formBox).not.toBeNull();
      expect(previewBox).not.toBeNull();
      if (formBox && previewBox) {
        // formColumn starts above previewColumn
        expect(formBox.y).toBeLessThan(previewBox.y);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 15 — Hide-linked filter hides documents returned by linked-ids API
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 15 — Hide-linked filter uses linked-ids API (Issue #1739)', () => {
  test('When hide-linked is ON and linked-ids API returns IDs, those documents are hidden; disabling the toggle reveals them', async ({
    page,
  }) => {
    // Register standard Paperless mocks — all must be in place before clickNewInvoice()
    await mockPaperlessConfigured(page);
    await mockConfig(page, true);
    await mockCorrespondents(page);
    await mockTags(page);

    // MOCK_DOC_1 is already linked system-wide; MOCK_DOC_2 is not.
    // Register BEFORE clickNewInvoice() so the on-mount fetch is intercepted.
    await mockLinkedIds(page, [MOCK_DOC_1.id]);

    // Both documents are returned by the Paperless documents endpoint
    await page.route('**/paperless/documents**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_DOCUMENTS_ALL),
      });
    });

    const invoicesPage = new InvoicesPage(page);
    await invoicesPage.goto();
    await invoicesPage.waitForLoaded();

    await invoicesPage.clickNewInvoice();
    const pickerModal = await invoicesPage.waitForPickerModal();

    // Wait for the document grid to finish both async loading stages
    await pickerModal.waitForDocumentsLoaded();

    // The hide-linked toggle is ON by default (defaultHideLinked=true in InvoicePaperlessPickerModal)
    await expect(pickerModal.hideLinkedToggle).toBeChecked();

    // MOCK_DOC_1 is in the linked-ids list → hidden when toggle is ON
    await expect(pickerModal.getDocumentCard(MOCK_DOC_1.title)).not.toBeVisible();

    // MOCK_DOC_2 is not linked → visible
    await expect(pickerModal.getDocumentCard(MOCK_DOC_2.title)).toBeVisible();

    // Disable the hide-linked toggle
    await pickerModal.hideLinkedToggle.click();
    await expect(pickerModal.hideLinkedToggle).not.toBeChecked();

    // After disabling, MOCK_DOC_1 should now be visible
    await expect(pickerModal.getDocumentCard(MOCK_DOC_1.title)).toBeVisible();
    // MOCK_DOC_2 remains visible
    await expect(pickerModal.getDocumentCard(MOCK_DOC_2.title)).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 16 — @smoke "Create New Budget Line" closes picker + shows inline form
//
// Story #1764: PaperlessInvoiceReviewPage now uses the same queued-on-save
// "Create Budget Line" flow as AutoItemizePage. Clicking "Create Budget Line"
// in step 2 of the picker modal:
//   - Immediately CLOSES the picker modal (no in-modal form)
//   - Shows the amber "Creating New" badge on the extraction line card
//   - Shows the inline BudgetLineForm (class*="inlineFormWrapper") on the card
//   - Shows a "Discard" button to abandon the queued draft
//   - Does NOT call any budget-line API until "Create Invoice & Itemize" is clicked
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Scenario 16 — "Create New Budget Line" closes picker and shows inline form on card (Story #1764)',
  { tag: '@smoke' },
  () => {
    test('"Create Budget Line" in step 2 closes picker immediately and shows amber badge + inline BudgetLineForm on the extraction line card', async ({
      page,
      testPrefix,
    }) => {
      const vw = page.viewportSize()?.width ?? 1440;
      if (vw < 600) {
        test.skip(true, 'Functional test — desktop/tablet only (≥600px)');
        return;
      }

      let workItemId = '';

      try {
        workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} PF-S16 WI` });

        await mockPaperlessConfigured(page);
        await mockConfig(page, true);
        await mockCorrespondents(page);
        await mockDocuments(page);
        await mockTags(page);
        await mockDocumentDetail(page, MOCK_DOC_1.id);
        // No suggestedVendorId — vendor picker stays in input mode
        await mockPreview(page, { suggestedVendorId: null });

        const reviewPage = await navigateToReviewPage(page);

        // ── Initial state: "Assign…" button visible, no badge ────────────────
        await expect(reviewPage.lineAssignButton(0)).toBeVisible();
        await expect(reviewPage.getCreatingNewBadge(0)).not.toBeVisible();

        // ── Queue the create-new operation ─────────────────────────────────────
        // This opens step-1 → selects work item → step-2 → clicks "Create Budget Line"
        await reviewPage.queueCreateNewBudgetLine(`${testPrefix} PF-S16 WI`);

        // ── Assert: picker modal is CLOSED immediately ─────────────────────────
        await expect(reviewPage.pickerModal).not.toBeVisible();

        // ── Assert: amber "Creating New" badge visible on card 0 ──────────────
        await expect(reviewPage.getCreatingNewBadge(0)).toBeVisible();

        // ── Assert: inline BudgetLineForm wrapper visible ──────────────────────
        await expect(reviewPage.getInlineFormWrapper(0)).toBeVisible();

        // ── Assert: "Discard" button visible (allows abandoning the queued draft)
        await expect(reviewPage.getInlineDraftDiscardButton(0)).toBeVisible();

        // ── Assert: "Assign…" button is replaced by badge + form ──────────────
        await expect(reviewPage.lineAssignButton(0)).not.toBeVisible();

        // ── Assert: page is still at the review route (no navigation) ─────────
        expect(page.url()).toContain('/budget/invoices/new/paperless');
      } finally {
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 17 — Fill inline form and save creates budget line + invoice
//
// After queuing a "Create Budget Line" draft, the user fills in the inline
// BudgetLineForm description, sets a vendor on the page, and clicks
// "Create Invoice & Itemize". This triggers:
//   1. POST /api/work-items/:id/budgets — creates the WI budget line
//   2. POST /api/invoices/auto-itemize/commit — creates the invoice
//   3. Navigation to the invoice detail page
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 17 — Fill inline form and save creates budget line + invoice (Story #1764)', () => {
  test('Queued inline draft: editing description and clicking Save creates WI budget line then invoice', async ({
    page,
    testPrefix,
  }) => {
    const vw = page.viewportSize()?.width ?? 1440;
    if (vw < 600) {
      test.skip(true, 'Functional test — desktop/tablet only (≥600px)');
      return;
    }

    test.setTimeout(60_000);

    let vendorId = '';
    let workItemId = '';
    const mockInvoiceId = `mock-inv-pf-s17-${testPrefix}`;
    const editedDescription = `${testPrefix} PF-S17 Budget Line`;

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} PF-S17 Vendor`);
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} PF-S17 WI` });

      await mockPaperlessConfigured(page);
      await mockConfig(page, true);
      await mockCorrespondents(page);
      await mockDocuments(page);
      await mockTags(page);
      await mockDocumentDetail(page, MOCK_DOC_1.id);
      // Use a single extracted line with quantity+unitPrice so the inline form opens in
      // unit-pricing mode (pricingMode='unit'). The description textbox is always visible.
      await mockPreview(page, {
        suggestedVendorId: null,
        lines: [MOCK_EXTRACTED_LINES[0]],
      });

      // Mock commit: returns a fake invoice — prevents real server from needing document link
      await mockCommit(page, { invoiceId: mockInvoiceId });

      // Mock invoice detail page load so the navigation target renders
      await page.route(`**/api/invoices/${mockInvoiceId}`, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            invoice: {
              id: mockInvoiceId,
              invoiceNumber: 'INV-2026-S17',
              amount: 900,
              date: '2026-01-15',
              dueDate: null,
              status: 'pending',
              notes: null,
              vendorId,
              vendorName: `${testPrefix} PF-S17 Vendor`,
              vendor: { id: vendorId, name: `${testPrefix} PF-S17 Vendor` },
              deposits: [],
              finalPaymentAmount: 900,
              createdBy: null,
              createdAt: '2026-06-18T00:00:00.000Z',
              updatedAt: '2026-06-18T00:00:00.000Z',
            },
          }),
        });
      });
      await page.route(`**/api/invoices/${mockInvoiceId}/budget-lines`, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ budgetLines: [], remainingAmount: 900 }),
        });
      });
      await page.route(
        (url) =>
          url.pathname === '/api/document-links' &&
          url.searchParams.get('entityType') === 'invoice' &&
          url.searchParams.get('entityId') === mockInvoiceId,
        async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ documentLinks: [] }),
          });
        },
      );

      // Mock the WI budget creation so no real DB writes are needed.
      // The inline create step calls POST /api/work-items/:id/budgets.
      let capturedWIBudgetPayload: Record<string, unknown> | null = null;
      const wiCreatePromise = page.waitForResponse(async (resp) => {
        if (
          resp.url().includes(`/api/work-items/${workItemId}/budgets`) &&
          resp.request().method() === 'POST'
        ) {
          capturedWIBudgetPayload = (await resp.request().postDataJSON()) as Record<
            string,
            unknown
          >;
          return true;
        }
        return false;
      });

      // Register commit response listener BEFORE navigation to catch it
      const commitPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/invoices/auto-itemize/commit') &&
          resp.request().method() === 'POST',
        { timeout: 30000 },
      );

      const reviewPage = await navigateToReviewPage(page);

      // ── Queue create-new on first extraction line ──────────────────────────
      await reviewPage.queueCreateNewBudgetLine(`${testPrefix} PF-S17 WI`);
      await expect(reviewPage.getCreatingNewBadge(0)).toBeVisible();

      // ── Edit the description in the inline form ─────────────────────────────
      const descInput = reviewPage.getInlineDraftDescriptionInput(0);
      await expect(descInput).toBeVisible();
      await descInput.fill(editedDescription);

      // ── Set vendor on the page ──────────────────────────────────────────────
      await reviewPage.setVendor(`${testPrefix} PF-S17 Vendor`);

      // ── Click "Create Invoice & Itemize" ────────────────────────────────────
      await reviewPage.confirmButton.click();

      // ── Wait for WI budget creation and commit (parallel) ───────────────────
      const [, commitResp] = await Promise.all([wiCreatePromise, commitPromise]);

      // Commit must succeed (mocked to 201)
      if (!commitResp.ok()) {
        const bodyText = await commitResp.text().catch(() => '<no body>');
        throw new Error(`auto-itemize/commit returned ${commitResp.status()}: ${bodyText}`);
      }

      // ── Assert WI budget payload ────────────────────────────────────────────
      // totalAmount from MOCK_EXTRACTED_LINES[0] = 900, includesVat=false
      expect(capturedWIBudgetPayload, 'Expected WI budget POST to have been called').not.toBeNull();
      // The description is from the edited inline form
      expect(capturedWIBudgetPayload!.description).toBe(editedDescription);

      // ── Assert: navigate to invoice detail ─────────────────────────────────
      await page.waitForURL(`**/budget/invoices/${mockInvoiceId}`);
      await expect(page.getByRole('heading', { level: 1, name: /#INV-2026-S17/i })).toBeVisible();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 18 — Inline form validation: invalid amount shows inlineDraftInvalid error
//
// When the inline BudgetLineForm contains an invalid/empty amount and the user
// clicks "Create Invoice & Itemize", handleSave should:
//   - Show the t('autoItemize.inlineDraftInvalid') page-level error banner
//   - Stay on the review page (no navigation)
//   - NOT call any API (WI budget or commit)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 18 — Inline form validation: invalid amount shows error, no navigation (Story #1764)', () => {
  test('Queued draft with invalid amount causes inlineDraftInvalid error on Save; no API calls fired', async ({
    page,
    testPrefix,
  }) => {
    const vw = page.viewportSize()?.width ?? 1440;
    if (vw < 600) {
      test.skip(true, 'Functional test — desktop/tablet only (≥600px)');
      return;
    }

    let vendorId = '';
    let workItemId = '';

    // Track whether any budget-line or commit API calls were fired
    let wiBudgetCallCount = 0;
    let commitCallCount = 0;

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} PF-S18 Vendor`);
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} PF-S18 WI` });

      await mockPaperlessConfigured(page);
      await mockConfig(page, true);
      await mockCorrespondents(page);
      await mockDocuments(page);
      await mockTags(page);
      await mockDocumentDetail(page, MOCK_DOC_1.id);

      // Use a single line with quantity+unitPrice to force unit-pricing mode.
      // We will clear the unitPrice field to trigger the invalid-amount path.
      await mockPreview(page, {
        suggestedVendorId: null,
        lines: [MOCK_EXTRACTED_LINES[0]],
      });

      // Monitor API calls that should NOT happen
      page.on('request', (req) => {
        if (req.url().includes('/api/work-items/') && req.method() === 'POST') {
          wiBudgetCallCount++;
        }
        if (req.url().includes('/api/invoices/auto-itemize/commit') && req.method() === 'POST') {
          commitCallCount++;
        }
      });

      const reviewPage = await navigateToReviewPage(page);

      // ── Queue create-new on first line ─────────────────────────────────────
      await reviewPage.queueCreateNewBudgetLine(`${testPrefix} PF-S18 WI`);
      await expect(reviewPage.getCreatingNewBadge(0)).toBeVisible();
      await expect(reviewPage.getInlineFormWrapper(0)).toBeVisible();

      // ── Find the unitPrice input inside the inline form and clear it ────────
      // BudgetLineForm in unit mode renders a number input for the price.
      // The label text is t('budgetLineForm.priceLabel') = "Price *" (NOT "Unit Price").
      // Use the stable id*="budget-unit-price" selector to avoid depending on the label text,
      // and scope it to the inline form wrapper to avoid matching other price inputs on the page.
      const unitPriceInput = reviewPage
        .getInlineFormWrapper(0)
        .locator('[id*="budget-unit-price"]');
      await unitPriceInput.fill('');

      // ── Set vendor so vendor validation passes ──────────────────────────────
      await reviewPage.setVendor(`${testPrefix} PF-S18 Vendor`);

      // ── Click "Create Invoice & Itemize" ────────────────────────────────────
      await reviewPage.confirmButton.click();

      // ── Assert: page-level inlineDraftInvalid error banner visible ──────────
      // The error text is: t('autoItemize.inlineDraftInvalid') =
      //   "Invalid amount in queued budget line. Please fix before saving."
      await expect(reviewPage.pageErrorBanner).toBeVisible();
      await expect(reviewPage.pageErrorBanner).toContainText(
        'Invalid amount in queued budget line',
      );

      // ── Assert: URL unchanged — page did not navigate ───────────────────────
      expect(page.url()).toContain('/budget/invoices/new/paperless');

      // ── Assert: confirm button still visible (page stays in ready state) ─────
      await expect(reviewPage.confirmButton).toBeVisible();

      // ── Assert: no API calls were fired ─────────────────────────────────────
      expect(
        wiBudgetCallCount,
        `Expected no WI budget POST — got ${wiBudgetCallCount} call(s)`,
      ).toBe(0);
      expect(
        commitCallCount,
        `Expected no auto-itemize/commit POST — got ${commitCallCount} call(s)`,
      ).toBe(0);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});
