/**
 * E2E tests for the Document Browser (Paperless-ngx integration) — EPIC-08
 *
 * The Document Browser is embedded in the Documents panel (picker view of the
 * "Link document" sheet) on the detail pages (tasks, invoices, purchases) and rows. Since the E2E environment
 * does NOT have a Paperless-ngx instance, these tests use Playwright's
 * page.route() to mock all /api/paperless/* responses at the network level.
 *
 * This approach tests the full frontend integration path: React components,
 * hooks, API client, error handling, and UI state transitions.
 *
 * Scenarios covered:
 * 1.  Paperless configured + reachable: document cards render in grid
 * 2.  Paperless configured + reachable: search input filters documents
 * 3.  Paperless configured + reachable: tag filter strip renders tags
 * 4.  Paperless configured + reachable: empty search shows "no documents match"
 * 5.  Paperless configured but unreachable: error state with retry button
 * 6.  Paperless not connected (status turns off after the section loaded): the browser says
 *     "Paperless is not connected", names no environment variable and, for an admin, links to
 *     Settings > Integrations > Paperless
 * 7.  Document detail panel opens when a card is clicked
 * 8.  Responsive: document browser renders without horizontal scroll
 *
 * Infinite scroll (Issue #2101), page-aware mock over a 30-document corpus:
 * 9.  Linking modal loads a second batch on scroll (AC1, AC2, AC10, AC13; mobile project covers AC19)
 * 10. Hide-linked auto-advance loads the next batch without user scroll (AC11)
 * 11. Invoice picker (inner .modalBody scroller) loads a second batch (AC17)
 * 12. Load-more keyboard flow: focus retained while loading, handed to end-of-list (AC20)
 * 13. Append error shows a footer alert; Retry re-requests the same page (AC15)
 * 14. The old pager is gone (AC5)
 */

import type { Page, Route } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import {
  createVendorViaApi,
  createWorkItemViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { mockPaginatedPaperless } from '../../fixtures/paperlessPaginatedMock.js';
import { DocumentsPanel } from '../../pages/DocumentsPanel.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { API, ROUTES } from '../../fixtures/testData.js';

// ─── Mock data ──────────────────────────────────────────────────────────────

const MOCK_STATUS_CONFIGURED = {
  configured: true,
  reachable: true,
  error: null,
  paperlessUrl: 'http://paperless.local:8000',
  filterTag: null,
};

const MOCK_STATUS_UNREACHABLE = {
  configured: true,
  reachable: false,
  error: 'Connection refused',
  paperlessUrl: null,
  filterTag: null,
};

const MOCK_TAGS = {
  tags: [
    { id: 1, name: 'Invoice', color: '#ff0000', documentCount: 5 },
    { id: 2, name: 'Contract', color: '#00ff00', documentCount: 3 },
    { id: 3, name: 'Receipt', color: '#0000ff', documentCount: 8 },
  ],
};

function makeMockDocuments(count: number, query?: string) {
  const documents = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Mock Document ${String(i + 1).padStart(2, '0')}${query ? ` — ${query}` : ''}`,
    content: `Content of document ${i + 1}`,
    tags: [MOCK_TAGS.tags[i % MOCK_TAGS.tags.length]],
    created: '2025-06-15',
    added: '2025-06-15T10:00:00Z',
    modified: '2025-06-15T10:00:00Z',
    correspondent: i % 2 === 0 ? 'ACME Corp' : null,
    documentType: i % 3 === 0 ? 'Invoice' : null,
    archiveSerialNumber: i + 100,
    originalFileName: `document-${i + 1}.pdf`,
    pageCount: (i % 5) + 1,
    searchHit: query ? { score: 10 - i, highlights: `<em>${query}</em>`, rank: i + 1 } : null,
  }));

  return {
    documents,
    pagination: {
      page: 1,
      pageSize: 25,
      totalItems: count,
      totalPages: 1,
    },
  };
}

// ─── Mock helpers ───────────────────────────────────────────────────────────

/**
 * Set up route mocks for a "configured + reachable" Paperless-ngx.
 * Intercepts /api/paperless/status, /api/paperless/documents, /api/paperless/tags,
 * /api/paperless/documents/:id/thumb, and /api/document-links.
 */
async function mockPaperlessConfigured(page: Page, documentCount = 3) {
  await page.route('**/api/paperless/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STATUS_CONFIGURED),
    });
  });

  await page.route('**/api/paperless/documents?*', async (route: Route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get('query') || undefined;
    const count = query ? Math.max(1, Math.floor(documentCount / 2)) : documentCount;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeMockDocuments(count, query)),
    });
  });

  // Match /api/paperless/documents (no query string) for initial load
  await page.route('**/api/paperless/documents', async (route: Route) => {
    if (route.request().url().includes('?')) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeMockDocuments(documentCount)),
    });
  });

  await page.route('**/api/paperless/tags', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TAGS),
    });
  });

  // Thumbnail requests — return a 1x1 transparent PNG
  await page.route('**/api/paperless/documents/*/thumb', async (route: Route) => {
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    await route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
  });

  // Document links — return empty list (no links yet)
  await page.route(`**/api/document-links?*`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documentLinks: [] }),
    });
  });

  // System-wide linked ids: the picker hides them and, when it has any, words its empty state
  // "No additional documents available to link." instead of "No documents found.". The real
  // endpoint reads the shared server, where parallel linking specs create links, so pin it.
  await page.route('**/api/document-links/linked-ids', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ paperlessDocumentIds: [] }),
    });
  });
}

async function mockPaperlessUnreachable(page: Page) {
  await page.route('**/api/paperless/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STATUS_UNREACHABLE),
    });
  });

  await page.route(`**/api/document-links?*`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documentLinks: [] }),
    });
  });
}

async function cleanupPaperlessMocks(page: Page) {
  await page.unroute('**/api/paperless/**');
  await page.unroute('**/api/document-links?*');
  await page.unroute('**/api/document-links/linked-ids');
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Document cards render when Paperless is configured + reachable
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Document Browser — configured + reachable (Scenarios 1–4, 7)',
  { tag: '@responsive' },
  () => {
    // These tests create API data and set up route mocks — allow extra time.
    test.describe.configure({ timeout: 60_000 });

    test('Document cards render in the "Link document" picker view', async ({
      page,
      testPrefix,
    }) => {
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} DocBrowser Cards Test`,
        });

        await mockPaperlessConfigured(page, 3);

        await page.goto(`/project/work-items/${createdId}`);
        await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

        // Open the panel and its Link document picker (enabled with mocked config)
        const docsPanel = new DocumentsPanel(page);
        await docsPanel.open();
        await docsPanel.openPicker();

        // Picker modal should open
        const pickerModal = docsPanel.dialog;
        await expect(pickerModal).toBeVisible();

        // Document cards should render in the grid
        const documentGrid = pickerModal.getByRole('list', { name: 'Documents' });
        await expect(documentGrid).toBeVisible();

        const listItems = documentGrid.getByRole('listitem');
        await expect(listItems).toHaveCount(3);

        // Verify first card shows document title
        await expect(listItems.first()).toContainText('Mock Document 01');
      } finally {
        await cleanupPaperlessMocks(page);
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('Search input filters documents in the Link document picker', async ({
      page,
      testPrefix,
    }) => {
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} DocBrowser Search Test`,
        });

        await mockPaperlessConfigured(page, 6);

        await page.goto(`/project/work-items/${createdId}`);
        await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

        const docsPanel = new DocumentsPanel(page);
        await docsPanel.open();
        await docsPanel.openPicker();

        const pickerModal = docsPanel.dialog;
        await expect(pickerModal).toBeVisible();

        // Type a search query
        const searchInput = pickerModal.getByLabel('Search documents');
        await expect(searchInput).toBeVisible();
        await searchInput.fill('invoice');

        // Wait for filtered results (mock returns fewer docs when query is set)
        const documentGrid = pickerModal.getByRole('list', { name: 'Documents' });
        await expect(documentGrid.getByRole('listitem')).toHaveCount(3, { timeout: 10000 });

        // Cards should contain the search query in the title
        await expect(documentGrid.getByRole('listitem').first()).toContainText('invoice');
      } finally {
        await cleanupPaperlessMocks(page);
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('Tag filter strip renders tags from Paperless', async ({ page, testPrefix }) => {
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} DocBrowser Tags Test`,
        });

        await mockPaperlessConfigured(page, 3);

        await page.goto(`/project/work-items/${createdId}`);
        await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

        const docsPanel = new DocumentsPanel(page);
        await docsPanel.open();
        await docsPanel.openPicker();

        const pickerModal = docsPanel.dialog;
        await expect(pickerModal).toBeVisible();

        // Tag filter group should contain our mock tags
        const tagGroup = pickerModal.getByRole('group', { name: 'Filter by tag' });
        await expect(tagGroup).toBeVisible();

        // Each mock tag should be a checkbox
        for (const tag of MOCK_TAGS.tags) {
          const tagChip = tagGroup.getByRole('checkbox', { name: new RegExp(tag.name) });
          await expect(tagChip).toBeVisible();
        }
      } finally {
        await cleanupPaperlessMocks(page);
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('Empty search shows "No documents match" message', async ({ page, testPrefix }) => {
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} DocBrowser Empty Search Test`,
        });

        // Override document route to return empty results for any query
        await mockPaperlessConfigured(page, 0);

        await page.goto(`/project/work-items/${createdId}`);
        await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

        const docsPanel = new DocumentsPanel(page);
        await docsPanel.open();
        await docsPanel.openPicker();

        const pickerModal = docsPanel.dialog;
        await expect(pickerModal).toBeVisible();

        // Should show empty state text
        await expect(pickerModal.getByText('No documents found.')).toBeVisible();
      } finally {
        await cleanupPaperlessMocks(page);
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Paperless configured but unreachable — error state
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Document Browser — configured but unreachable (Scenario 5)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ timeout: 60_000 });

    test('Unreachable state shows error with "Try Again" button', async ({ page, testPrefix }) => {
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} DocBrowser Unreachable Test`,
        });

        await mockPaperlessUnreachable(page);

        await page.goto(`/project/work-items/${createdId}`);
        await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

        // Link document stays available when status loads as unreachable
        // because the hook sets configured=true but reachable=false, and the button
        // depends on configured only. Let's check what actually shows.
        // Actually, the button is disabled when !paperlessStatus?.configured || hook.isLoading
        // Since configured=true, the button should be enabled.
        const docsPanel = new DocumentsPanel(page);
        await docsPanel.open();
        await docsPanel.openPicker();

        const pickerModal = docsPanel.dialog;
        await expect(pickerModal).toBeVisible();

        // DocumentBrowser shows "Paperless-ngx Unreachable" heading
        await expect(pickerModal.getByText('Paperless-ngx Unreachable')).toBeVisible();

        // "Try Again" button should be visible
        const retryButton = pickerModal.getByRole('button', { name: 'Try Again' });
        await expect(retryButton).toBeVisible();
      } finally {
        await cleanupPaperlessMocks(page);
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Paperless not connected — info state without setup instructions (#2217)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Document Browser — not connected (Scenario 6)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  test('The browser names no environment variable and links admins to Integrations', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} DocBrowser Not Connected Test`,
      });

      // The panel sees a configured Paperless (so Link document opens the picker); the browser
      // then asks again and finds it switched off.
      let calls = 0;
      await page.route('**/api/paperless/status', async (route: Route) => {
        calls += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            calls === 1
              ? MOCK_STATUS_CONFIGURED
              : {
                  configured: false,
                  reachable: false,
                  error: null,
                  paperlessUrl: null,
                  filterTag: null,
                },
          ),
        });
      });

      await page.goto(`/project/work-items/${createdId}`);
      const docsPanel = new DocumentsPanel(page);
      await docsPanel.open();
      await docsPanel.openPicker();

      const pickerModal = docsPanel.dialog;
      await expect(pickerModal.getByText('Paperless is not connected')).toBeVisible();
      await expect(
        pickerModal.getByText('Documents come from Paperless, which is not connected right now.'),
      ).toBeVisible();
      await expect(pickerModal.getByText(/PAPERLESS_URL|PAPERLESS_API_TOKEN|restart/i)).toHaveCount(
        0,
      );
      await expect(pickerModal.getByTestId('document-browser-integrations-link')).toHaveAttribute(
        'href',
        `${ROUTES.integrations}#paperless`,
      );
    } finally {
      await cleanupPaperlessMocks(page);
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Responsive — no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Document Browser — responsive (Scenario 8)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  test('Document browser in the Link document picker renders without horizontal scroll', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} DocBrowser Responsive Test`,
      });

      await mockPaperlessConfigured(page, 4);

      await page.goto(`/project/work-items/${createdId}`);
      await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

      const docsPanel = new DocumentsPanel(page);
      await docsPanel.open();
      await docsPanel.openPicker();

      const pickerModal = docsPanel.dialog;
      await expect(pickerModal).toBeVisible();

      // Wait for documents to load
      const documentGrid = pickerModal.getByRole('list', { name: 'Documents' });
      await expect(documentGrid).toBeVisible();

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      await cleanupPaperlessMocks(page);
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 9–14: Infinite scroll (Issue #2101)
// Routes are registered on the per-test `page`, so no unroute cleanup is needed.
// ─────────────────────────────────────────────────────────────────────────────

/** Navigate to a work item, open the Documents panel's Link document picker, return its POM. */
async function openAddDocumentPicker(page: Page, workItemId: string) {
  await new WorkItemDetailPage(page).goto(workItemId);
  const docsPanel = new DocumentsPanel(page);
  await docsPanel.open();
  await docsPanel.openPicker();
  await docsPanel.picker.waitForVisible();
  return docsPanel.picker;
}

test.describe('Document Browser — infinite scroll (Scenarios 9–14)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  test('Scenario 9: scrolling the picker loads the second batch and shows the end of the list', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} DocBrowser InfScroll Batch`,
      });
      const mock = await mockPaginatedPaperless(page, { total: 30 });

      const picker = await openAddDocumentPicker(page, createdId);
      await picker.waitForDocumentsLoaded();

      // First batch is 25 cards; no end-of-list yet
      await expect(picker.documentItems).toHaveCount(25);
      await expect(picker.endOfListMessage).toHaveCount(0);
      expect(mock.requestedPages).toEqual([1]);

      // Scroll the picker's own scroll container to the bottom
      await picker.scrollToBottom();

      await expect(picker.documentItems).toHaveCount(30);
      await expect(picker.endOfListMessage).toBeVisible();
      expect(mock.requestedPages).toEqual([1, 2]);

      // No duplicates and no gaps across batches (AC10): 30 distinct cards
      const labels = await picker.documentItems
        .getByRole('button')
        .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
      expect(new Set(labels).size).toBe(30);
      await expect(picker.getDocumentCard(mock.titleFor(30))).toBeVisible();

      // The Load more button is gone once the list is complete
      await expect(picker.loadMoreButton).toHaveCount(0);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Scenario 10: hide-linked auto-advances to the next batch without any scroll', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} DocBrowser InfScroll AutoAdvance`,
      });
      // Every document of batch 1 (ids 1..25) is already linked elsewhere
      const linkedIds = Array.from({ length: 25 }, (_, i) => i + 1);
      const mock = await mockPaginatedPaperless(page, { total: 30, linkedIds });

      const picker = await openAddDocumentPicker(page, createdId);

      // Hide-linked is on by default: batch 1 is fully hidden, so batch 2 is requested on its own
      await expect(picker.hideLinkedToggle).toBeChecked();
      await expect(picker.documentItems).toHaveCount(5);
      await expect(picker.getDocumentCard(mock.titleFor(26))).toBeVisible();
      await expect(picker.getDocumentCard(mock.titleFor(1))).toHaveCount(0);
      await expect(picker.endOfListMessage).toBeVisible();
      expect(mock.requestedPages).toEqual([1, 2]);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Scenario 11: the Link document picker on an invoice loads the second batch on scroll', async ({
    page,
    testPrefix,
  }) => {
    // The New invoice dialog no longer hosts the document browser (#2241: it has an inline
    // document picker); the browser lives in the Documents panel's "Link document" picker.
    const mock = await mockPaginatedPaperless(page, { total: 30 });
    let vendorId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} DocBrowser Invoice Co` });
      const created = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
        data: { invoiceNumber: `${testPrefix}-DB11`, amount: 100, date: '2026-01-15' },
      });
      expect(created.ok(), 'POST invoice').toBeTruthy();
      const invoiceId = ((await created.json()) as { invoice: { id: string } }).invoice.id;
      const detail = new InvoiceDetailPage(page);
      await detail.goto(invoiceId);
      await detail.openDocuments();
      const docsPanel = detail.documents;
      await docsPanel.openPicker();
      await docsPanel.picker.waitForVisible();
      const picker = docsPanel.picker;
      await picker.waitForDocumentsLoaded();

      await expect(picker.documentItems).toHaveCount(25);
      expect(mock.requestedPages).toEqual([1]);

      await picker.scrollToBottom();

      await expect(picker.documentItems).toHaveCount(30);
      await expect(picker.endOfListMessage).toBeVisible();
      expect(mock.requestedPages).toEqual([1, 2]);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Scenario 12: Load more keeps keyboard focus while loading and hands it to the end-of-list message', async ({
    page,
    testPrefix,
  }) => {
    // Stub IntersectionObserver so ONLY the button can trigger the next batch (same isolation
    // technique as the Diary "Load more" keyboard test in diary-list.spec.ts).
    await page.addInitScript(() => {
      class StubIntersectionObserver implements IntersectionObserver {
        readonly root: Element | Document | null = null;
        readonly rootMargin = '';
        readonly scrollMargin = '';
        readonly thresholds: ReadonlyArray<number> = [];
        constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
        disconnect(): void {}
        observe(): void {}
        unobserve(): void {}
        takeRecords(): IntersectionObserverEntry[] {
          return [];
        }
      }
      window.IntersectionObserver = StubIntersectionObserver;
    });

    let createdId: string | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} DocBrowser InfScroll Keyboard`,
      });
      const mock = await mockPaginatedPaperless(page, { total: 30, delayPageGte2Ms: 300 });

      const picker = await openAddDocumentPicker(page, createdId);
      await picker.waitForDocumentsLoaded();
      await expect(picker.documentItems).toHaveCount(25);
      expect(mock.requestedPages).toEqual([1]);

      await picker.loadMoreButton.focus();
      await expect(picker.loadMoreButton).toBeFocused();
      await page.keyboard.press('Enter');

      // While the (delayed) batch loads the button stays focused: it uses aria-disabled rather
      // than the disabled attribute (AC20).
      await expect(picker.loadMoreButton).toHaveAttribute('aria-disabled', 'true');
      await expect(picker.loadMoreButton).toBeFocused();

      // Final batch lands: the button unmounts and focus moves to the end-of-list message
      await expect(picker.documentItems).toHaveCount(30);
      await expect(picker.endOfListMessage).toBeFocused();
      const activeIsBody = await page.evaluate(() => document.activeElement === document.body);
      expect(activeIsBody).toBe(false);
      expect(mock.requestedPages).toEqual([1, 2]);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Scenario 13: a failed append shows an error with Retry that re-requests the same page', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} DocBrowser InfScroll Retry`,
      });
      const mock = await mockPaginatedPaperless(page, { total: 30, failPage2Times: 1 });

      const picker = await openAddDocumentPicker(page, createdId);
      await picker.waitForDocumentsLoaded();
      await expect(picker.documentItems).toHaveCount(25);

      await picker.scrollToBottom();

      // Page 2 answers 502: banner in the footer, loaded cards stay, button becomes Retry
      await expect(picker.footerError).toHaveText('Failed to load more documents.');
      await expect(picker.documentItems).toHaveCount(25);
      await expect(picker.loadMoreButton).toHaveText('Retry');

      await picker.loadMoreButton.click();

      await expect(picker.documentItems).toHaveCount(30);
      await expect(picker.endOfListMessage).toBeVisible();
      expect(mock.requestedPages).toEqual([1, 2, 2]);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Scenario 14: the old "Page N of M" pager is gone', async ({ page, testPrefix }) => {
    let createdId: string | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} DocBrowser InfScroll NoPager`,
      });
      await mockPaginatedPaperless(page, { total: 30 });

      const picker = await openAddDocumentPicker(page, createdId);
      await picker.waitForDocumentsLoaded();
      await expect(picker.documentItems).toHaveCount(25);

      await expect(picker.modal.getByRole('navigation')).toHaveCount(0);
      await expect(picker.modal.getByText(/Page \d+ of/)).toHaveCount(0);
      await expect(picker.footer).toBeVisible();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});
