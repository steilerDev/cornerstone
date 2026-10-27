/**
 * E2E tests for document linking in the Documents panel (Paperless-ngx integration) — EPIC-08,
 * reworked for #2233 (P4.1): the panel replaces the LinkedDocumentsSection.
 *
 * Flow under test: "Documents (n)" button -> panel (side sheet / full screen) -> Link document
 * -> picker view (Paperless document browser inside the same sheet) -> select -> the sheet is
 * back in the list view with the new card, focus on its ⋯ menu. Unlink has NO confirmation: the
 * card leaves at once and an Undo toast restores it.
 *
 * Mocked-Paperless scenarios use route-level mocks (document metadata); the Unlink/Undo round
 * trip scenarios use REAL document links created through the API (POST /api/document-links
 * accepts any positive Paperless document id; only the entity must exist) and the real server's
 * delete + undo endpoints.
 *
 * Scenarios covered:
 * 1.  Link a document to a work item: picker -> select -> card appears, focus on its ⋯ menu
 * 2.  Link a document to an invoice (same flow on the invoice detail page)
 * 3.  Linked card shows title, correspondent, date; Open in Paperless; Details preview
 * 5.  Duplicate link shows error banner
 * 6.  The "Documents (n)" count follows linking
 * 7a. System-wide linked IDs hide filtered document when toggle checked
 * 7b. Toggle checked by default hides already-linked docs; unchecking shows all
 * 8.  Link a document that only exists in the second infinite-scroll batch (#2101)
 *
 * Unlink with Undo (replaces the confirmation dialog of #1680):
 * 4a. Mocked: Unlink removes the card at once, no confirmation dialog, Undo restores it
 * 4b. Real server: Unlink -> Undo toast -> Undo -> the row is back, also after a reload
 * 4c. Real server: Unlink without Undo -> a reload shows it gone
 * 4d. Real server, invoice: the document type chosen on a row persists after a reload
 */

import type { Page, Route } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
import { mockPaginatedPaperless } from '../../fixtures/paperlessPaginatedMock.js';
import { mockPaperlessConfigured } from '../../fixtures/paperlessMocks.js';
import { DocumentsPanel } from '../../pages/DocumentsPanel.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { ToastRegion } from '../../pages/components/ToastRegion.js';
import { API } from '../../fixtures/testData.js';

// ─── Mock data ──────────────────────────────────────────────────────────────

const MOCK_STATUS_CONFIGURED = {
  configured: true,
  reachable: true,
  error: null,
  paperlessUrl: 'http://paperless.local:8000',
  filterTag: null,
};

const MOCK_TAGS = { tags: [] };

const MOCK_DOCUMENT = {
  id: 42,
  title: 'E2E Test Invoice 2025-001',
  content: 'Invoice for construction materials',
  tags: [{ id: 1, name: 'Invoice', color: '#ff0000', documentCount: 5 }],
  created: '2025-06-15',
  added: '2025-06-15T10:00:00Z',
  modified: '2025-06-15T10:00:00Z',
  correspondent: 'BuildSupply Inc.',
  documentType: 'Invoice',
  archiveSerialNumber: 142,
  originalFileName: 'invoice-2025-001.pdf',
  pageCount: 2,
  searchHit: null,
};

const MOCK_DOCUMENTS_RESPONSE = {
  documents: [MOCK_DOCUMENT],
  pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
};

// Track document links created during the test
let linkedDocumentIds: number[] = [];

/**
 * Set up mocks for the full linking flow: Paperless configured, documents
 * available, and document-links API intercepted to track link state.
 */
async function mockPaperlessForLinking(page: Page, entityType: string, entityId: string) {
  linkedDocumentIds = [];

  await page.route('**/api/paperless/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STATUS_CONFIGURED),
    });
  });

  await page.route('**/api/paperless/documents**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DOCUMENTS_RESPONSE),
    });
  });

  await page.route('**/api/paperless/tags', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TAGS),
    });
  });

  await page.route('**/api/paperless/documents/*/thumb', async (route: Route) => {
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    await route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
  });

  // Document links GET — return linked docs from our tracked state
  await page.route('**/api/document-links?*', async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const links = linkedDocumentIds.map((docId, i) => ({
      id: `mock-link-${i}`,
      entityType,
      entityId,
      paperlessDocumentId: docId,
      createdBy: { id: 'user-1', displayName: 'E2E Admin' },
      createdAt: new Date().toISOString(),
      document: { ...MOCK_DOCUMENT, id: docId },
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documentLinks: links }),
    });
  });

  // Document links POST — add to tracked state and return the new link
  await page.route('**/api/document-links', async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const body = JSON.parse(route.request().postData() || '{}');
    const docId = body.paperlessDocumentId;

    // Check for duplicate
    if (linkedDocumentIds.includes(docId)) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'DUPLICATE_DOCUMENT_LINK', message: 'Document already linked' },
        }),
      });
      return;
    }

    linkedDocumentIds.push(docId);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        documentLink: {
          id: `mock-link-${linkedDocumentIds.length - 1}`,
          entityType: body.entityType,
          entityId: body.entityId,
          paperlessDocumentId: docId,
          createdBy: { id: 'user-1', displayName: 'E2E Admin' },
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });
}

async function cleanupMocks(page: Page) {
  await page.unroute('**/api/paperless/**');
  await page.unroute('**/api/document-links**');
  await page.unroute('**/api/document-links?*');
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 1, 3, 6: Link a document to a work item
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Document Linking — Work Item (Scenarios 1, 3, 6)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  test('Selecting a document in the picker links it and shows the card', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} DocLink Work Item Test`,
      });

      await mockPaperlessForLinking(page, 'work_item', createdId);

      await new WorkItemDetailPage(page).goto(createdId);
      const panel = new DocumentsPanel(page);

      // Paperless on, nothing linked yet
      await expect(panel.button()).toHaveText('Documents (0)');
      await panel.open();
      await expect(panel.title).toHaveText('Documents (0)');

      // Link document -> picker view in the same sheet
      await panel.openPicker();
      await expect(panel.title).toHaveText('Link document');
      await panel.picker.waitForDocumentsLoaded();
      await expect(panel.picker.documentItems).toHaveCount(1);

      // Select the document: the sheet returns to the list view with the new card
      await panel.picker.documentItems.first().click();

      await expect(panel.title).toHaveText('Documents (1)');
      await expect(panel.list).toBeVisible();
      await expect(panel.rows).toHaveCount(1);
      await expect(panel.row(MOCK_DOCUMENT.title)).toBeVisible();

      // Focus lands on the new card's ⋯ menu
      await expect(panel.rowMenuTrigger(MOCK_DOCUMENT.title)).toBeFocused();

      // The trigger behind the sheet shows the new count
      await expect(panel.button()).toHaveText('Documents (1)');
    } finally {
      await cleanupMocks(page);
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('A linked card shows title, correspondent and date, Open in Paperless and a Details preview', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} DocLink Card Test`,
      });
      await mockPaperlessForLinking(page, 'work_item', createdId);
      linkedDocumentIds = [MOCK_DOCUMENT.id];

      await new WorkItemDetailPage(page).goto(createdId);
      const panel = new DocumentsPanel(page);
      await panel.open();

      // Title, correspondent
      const card = panel.row(MOCK_DOCUMENT.title);
      await expect(card).toBeVisible();
      await expect(card).toContainText(MOCK_DOCUMENT.correspondent);

      // Open in Paperless: a new-tab link to the Paperless details page
      await panel.rowMenuTrigger(MOCK_DOCUMENT.title).click();
      const openLink = page.getByTestId('document-open-mock-link-0');
      await expect(openLink).toHaveAttribute(
        'href',
        `${MOCK_STATUS_CONFIGURED.paperlessUrl}/documents/${MOCK_DOCUMENT.id}/details`,
      );
      await expect(openLink).toHaveAttribute('target', '_blank');
      await page.getByTestId('document-unlink-mock-link-0').waitFor({ state: 'visible' });
      await panel.title.click();
      await expect(openLink).toHaveCount(0);

      // Details toggles the inline preview
      const details = panel.dialog.getByTestId('document-details-mock-link-0');
      await expect(details).toHaveAttribute('aria-expanded', 'false');
      await details.click();
      await expect(details).toHaveAttribute('aria-expanded', 'true');
      await expect(card.getByText('Content Preview')).toBeVisible();
    } finally {
      await cleanupMocks(page);
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  // Escape belongs to the innermost layer: an open ⋯ menu closes first, the sheet stays open.
  test('Escape in an open ⋯ menu closes only the menu, not the panel', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} DocLink Menu Escape`,
      });
      await mockPaperlessForLinking(page, 'work_item', createdId);
      linkedDocumentIds = [MOCK_DOCUMENT.id];

      await new WorkItemDetailPage(page).goto(createdId);
      const panel = new DocumentsPanel(page);
      await panel.open();
      await panel.rowMenuTrigger(MOCK_DOCUMENT.title).click();
      await expect(panel.menuItem('Unlink')).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(panel.menuItem('Unlink')).toHaveCount(0);
      await expect(panel.dialog).toBeVisible();
      await expect(panel.rowMenuTrigger(MOCK_DOCUMENT.title)).toBeFocused();
    } finally {
      await cleanupMocks(page);
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Link a document to an invoice
// ─────────────────────────────────────────────────────────────────────────────

async function createVendorAndInvoice(
  page: Page,
  prefix: string,
): Promise<{ vendorId: string; invoiceId: string }> {
  const vendorResp = await page.request.post(API.vendors, {
    data: { name: `${prefix} DocLink Vendor` },
  });
  expect(vendorResp.ok()).toBeTruthy();
  const vendorId = ((await vendorResp.json()) as { vendor: { id: string } }).vendor.id;
  const invoiceResp = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { invoiceNumber: `${prefix}-DL-INV`, amount: 100, date: '2025-01-15', status: 'pending' },
  });
  expect(invoiceResp.ok()).toBeTruthy();
  const invoiceId = ((await invoiceResp.json()) as { invoice: { id: string } }).invoice.id;
  return { vendorId, invoiceId };
}

test.describe('Document Linking — Invoice (Scenario 2)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  test('Selecting a document in the picker links it on the invoice page', async ({
    page,
    testPrefix,
  }) => {
    let vendorId: string | null = null;
    try {
      const ids = await createVendorAndInvoice(page, testPrefix);
      vendorId = ids.vendorId;
      await mockPaperlessForLinking(page, 'invoice', ids.invoiceId);

      await new InvoiceDetailPage(page).goto(ids.invoiceId);
      const panel = new DocumentsPanel(page);
      await panel.open('summary-fact-documents');
      await panel.openPicker();
      await panel.picker.waitForDocumentsLoaded();
      await panel.picker.documentItems.first().click();

      await expect(panel.title).toHaveText('Documents (1)');
      await expect(panel.row(MOCK_DOCUMENT.title)).toBeVisible();
    } finally {
      await cleanupMocks(page);
      if (vendorId) await page.request.delete(`${API.vendors}/${vendorId}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Duplicate link shows error banner
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Document Linking — Duplicate (Scenario 5)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  test('Linking the same document twice shows a duplicate error banner', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} DocLink Duplicate Test`,
      });

      await mockPaperlessForLinking(page, 'work_item', createdId);

      await new WorkItemDetailPage(page).goto(createdId);
      const panel = new DocumentsPanel(page);
      await panel.open();

      // First link — should succeed
      await panel.openPicker();
      await panel.picker.waitForDocumentsLoaded();
      await expect(panel.picker.documentItems).toHaveCount(1);
      await panel.picker.documentItems.first().click();
      await expect(panel.rows).toHaveCount(1);

      // Second link — same document, should show duplicate error. The picker hides
      // already-linked documents by default; show them again to pick the same one.
      await panel.openPicker();
      const hideLinkedCheckbox = panel.dialog.getByRole('checkbox', {
        name: /hide already-linked documents/i,
      });
      await expect(hideLinkedCheckbox).toBeVisible();
      await hideLinkedCheckbox.uncheck();

      await expect(panel.picker.documentItems).toHaveCount(1);
      await panel.picker.documentItems.first().click();

      // Back in the list view with the "already linked" banner
      const errorBanner = panel.dialog.getByRole('alert').filter({ hasText: /already linked/ });
      await expect(errorBanner).toBeVisible();
      await expect(panel.rows).toHaveCount(1);
    } finally {
      await cleanupMocks(page);
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─── Scenario 7 helpers ───────────────────────────────────────────────────────

// A second document used in Scenario 7 tests to verify filtering behaviour.
const MOCK_DOCUMENT_55 = {
  id: 55,
  title: 'E2E Unlinked Receipt 2025-002',
  content: 'Receipt for flooring materials',
  tags: [],
  created: '2025-07-01',
  added: '2025-07-01T09:00:00Z',
  modified: '2025-07-01T09:00:00Z',
  correspondent: 'FloorWorld GmbH',
  documentType: 'Receipt',
  archiveSerialNumber: 255,
  originalFileName: 'receipt-2025-002.pdf',
  pageCount: 1,
  searchHit: null,
};

// Two-document Paperless response used in Scenario 7.
const MOCK_TWO_DOCUMENTS_RESPONSE = {
  documents: [MOCK_DOCUMENT, MOCK_DOCUMENT_55],
  pagination: { page: 1, pageSize: 25, totalItems: 2, totalPages: 1 },
};

/**
 * Intercepts GET /api/document-links/linked-ids and returns the given IDs as the
 * system-wide set of already-linked Paperless document IDs.
 */
async function mockSystemLinkedIds(page: Page, ids: number[]) {
  await page.route('**/api/document-links/linked-ids', async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ paperlessDocumentIds: ids }),
    });
  });
}

/** Paperless with two documents, an entity without links, and doc #42 linked system-wide. */
async function mockTwoDocumentsOneLinkedElsewhere(page: Page) {
  await page.route('**/api/paperless/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STATUS_CONFIGURED),
    });
  });
  await page.route('**/api/paperless/documents**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TWO_DOCUMENTS_RESPONSE),
    });
  });
  await page.route('**/api/paperless/tags', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TAGS),
    });
  });
  await page.route('**/api/paperless/documents/*/thumb', async (route: Route) => {
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    await route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
  });
  await page.route('**/api/document-links?*', async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documentLinks: [] }),
    });
  });
  await mockSystemLinkedIds(page, [42]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Document Linking — System-wide Hide
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Document Linking — System-wide Hide (Scenario 7)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  // Scenario 7a: system-wide IDs are used for filtering. Doc #42 is linked system-wide (to
  // another record); the toggle defaults ON, so #42 is hidden on open. Unchecking reveals both;
  // re-checking hides #42 again.
  test('System-wide linked IDs filter the picker — toggle defaults ON and hides linked doc', async ({
    page,
    testPrefix,
  }, testInfo) => {
    let workItemAId: string | null = null;
    let workItemBId: string | null = null;
    try {
      // Create two work items: A (the picker host), B (would own doc #42 system-wide)
      workItemAId = await createWorkItemViaApi(page, {
        title: `${testPrefix} SysHide Work Item A`,
      });
      workItemBId = await createWorkItemViaApi(page, {
        title: `${testPrefix} SysHide Work Item B`,
      });
      await mockTwoDocumentsOneLinkedElsewhere(page);

      await new WorkItemDetailPage(page).goto(workItemAId);
      const panel = new DocumentsPanel(page);
      await panel.open();
      await panel.openPicker();

      // Toggle must be visible because systemLinkedIds.ids = [42] (length > 0)
      const hideToggle = panel.dialog.getByRole('checkbox', {
        name: /hide already-linked documents/i,
      });
      await expect(hideToggle).toBeVisible();

      // Toggle defaults ON
      await expect(hideToggle).toBeChecked();

      // With toggle checked: only doc #55 visible; doc #42 is hidden (system-wide linked)
      const documentGrid = panel.dialog.getByRole('list', { name: 'Documents' });
      await expect(documentGrid).toBeVisible();
      await expect(documentGrid.getByRole('listitem')).toHaveCount(1);
      await expect(documentGrid).toContainText(MOCK_DOCUMENT_55.title);
      await expect(documentGrid).not.toContainText(MOCK_DOCUMENT.title);

      // Uncheck toggle — both docs visible
      await hideToggle.uncheck();
      await expect(hideToggle).not.toBeChecked();
      await expect(documentGrid.getByRole('listitem')).toHaveCount(2);
      await expect(documentGrid).toContainText(MOCK_DOCUMENT.title);
      await expect(documentGrid).toContainText(MOCK_DOCUMENT_55.title);

      // Re-check toggle — doc #42 hidden again
      await hideToggle.check();
      await expect(hideToggle).toBeChecked();
      await expect(documentGrid.getByRole('listitem')).toHaveCount(1);
      await expect(documentGrid).not.toContainText(MOCK_DOCUMENT.title);
    } finally {
      // Guarantee cleanup gets its own dedicated time budget on top of whatever
      // remains of the describe-level 60s timeout (bug #1829: don't let a slow
      // test body starve teardown of its own two API deletes).
      testInfo.setTimeout(testInfo.timeout + 10_000);
      await cleanupMocks(page);
      await page.unroute('**/api/document-links/linked-ids');
      try {
        if (workItemAId) await deleteWorkItemViaApi(page, workItemAId);
        if (workItemBId) await deleteWorkItemViaApi(page, workItemBId);
      } catch (error) {
        console.warn('[document-linking] cleanup failed for scenario 7a work items:', error);
      }
    }
  });

  // Scenario 7b: the toggle is checked by default and hides already-linked documents; unchecking
  // reveals them all.
  test('Toggle is checked by default and hides already-linked documents', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} SysHide Toggle Default`,
      });
      await mockTwoDocumentsOneLinkedElsewhere(page);

      await new WorkItemDetailPage(page).goto(createdId);
      const panel = new DocumentsPanel(page);
      await panel.open();
      await panel.openPicker();

      const hideToggle = panel.dialog.getByRole('checkbox', {
        name: /hide already-linked documents/i,
      });
      await expect(hideToggle).toBeVisible();
      await expect(hideToggle).toBeChecked();

      // With toggle checked by default, doc #42 is hidden; only doc #55 is shown
      const documentGrid = panel.dialog.getByRole('list', { name: 'Documents' });
      await expect(documentGrid).toBeVisible();
      await expect(documentGrid.getByRole('listitem')).toHaveCount(1);
      await expect(documentGrid).not.toContainText(MOCK_DOCUMENT.title);
      await expect(documentGrid).toContainText(MOCK_DOCUMENT_55.title);

      // Unchecking the toggle reveals both documents
      await hideToggle.uncheck();
      await expect(hideToggle).not.toBeChecked();
      await expect(documentGrid.getByRole('listitem')).toHaveCount(2);
    } finally {
      await cleanupMocks(page);
      await page.unroute('**/api/document-links/linked-ids');
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4a: Unlink removes the card at once; no confirmation; Undo restores it (mocked)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mocks DELETE /api/document-links/:id (empties the tracked state, returns an Undo token) and
 * POST /api/undo/:token (restores the tracked state), so the GET mock reflects both.
 */
async function mockDocumentLinkDeleteAndUndo(page: Page): Promise<void> {
  let removed: number[] = [];
  await page.route('**/api/document-links/*', async (route: Route) => {
    if (route.request().method() !== 'DELETE') {
      await route.continue();
      return;
    }
    removed = linkedDocumentIds;
    linkedDocumentIds = [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        undo: { token: 'mock-undo-token', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      }),
    });
  });
  await page.route('**/api/undo/*', async (route: Route) => {
    linkedDocumentIds = removed;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ restored: [], retractedEventIds: [] }),
    });
  });
}

test.describe(
  'Document Linking — Unlink with Undo, mocked (Scenario 4a)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ timeout: 60_000 });

    test('Unlink removes the card at once without a confirmation dialog, and Undo brings it back', async ({
      page,
      testPrefix,
    }) => {
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Unlink Undo Mocked`,
        });
        await mockPaperlessForLinking(page, 'work_item', createdId);
        linkedDocumentIds = [MOCK_DOCUMENT.id];
        await mockDocumentLinkDeleteAndUndo(page);

        await new WorkItemDetailPage(page).goto(createdId);
        const panel = new DocumentsPanel(page);
        const toast = new ToastRegion(page);
        await panel.open();
        await expect(panel.rows).toHaveCount(1);

        await panel.unlink(MOCK_DOCUMENT.title);

        // No confirmation dialog: the card is gone and an Undo toast is up
        await expect(page.getByRole('alertdialog')).toHaveCount(0);
        await expect(panel.rows).toHaveCount(0);
        await expect(panel.title).toHaveText('Documents (0)');
        await expect(toast.undoToastWith(`Unlinked ${MOCK_DOCUMENT.title}.`)).toBeVisible();

        // With no neighbours, focus lands on Link document
        await expect(panel.linkDocumentButton).toBeFocused();

        await toast.undoViaButton();

        await expect(panel.rows).toHaveCount(1);
        await expect(panel.row(MOCK_DOCUMENT.title)).toBeVisible();
        await expect(panel.title).toHaveText('Documents (1)');
      } finally {
        await page.unroute('**/api/undo/*');
        await cleanupMocks(page);
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 4b-4d: REAL server — unlink + Undo round trip, document type persistence
// ─────────────────────────────────────────────────────────────────────────────

/** A synthetic Paperless document id unlikely to collide between parallel tests. */
function syntheticDocumentId(): number {
  return 7_000_000 + Math.floor(Math.random() * 1_000_000);
}

/** Creates a document link through the real API; returns its id. */
async function createRealLink(
  page: Page,
  entityType: string,
  entityId: string,
  paperlessDocumentId: number,
): Promise<string> {
  const resp = await page.request.post('/api/document-links', {
    data: { entityType, entityId, paperlessDocumentId },
  });
  expect(resp.ok(), await resp.text()).toBeTruthy();
  return ((await resp.json()) as { documentLink: { id: string } }).documentLink.id;
}

test.describe(
  'Document Linking — real server Unlink and Undo (Scenarios 4b-4d)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ timeout: 60_000 });

    test('Unlink shows an Undo toast; Undo restores the link, also after a reload', async ({
      page,
      testPrefix,
    }) => {
      const workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Real Unlink Undo`,
      });
      try {
        const docId = syntheticDocumentId();
        const linkId = await createRealLink(page, 'work_item', workItemId, docId);
        await mockPaperlessConfigured(page);

        await new WorkItemDetailPage(page).goto(workItemId);
        const panel = new DocumentsPanel(page);
        const toast = new ToastRegion(page);
        await panel.open();
        await expect(panel.rows).toHaveCount(1);
        const title = `Document #${docId}`;

        await panel.unlink(title);

        await expect(page.getByRole('alertdialog')).toHaveCount(0);
        await expect(panel.rows).toHaveCount(0);
        await expect(toast.undoToastWith(`Unlinked ${title}.`)).toBeVisible();

        await toast.undoViaButton();

        await expect(panel.row(title)).toBeVisible();
        await expect(panel.title).toHaveText('Documents (1)');

        // Server truth: the restored link survives a reload
        await page.reload();
        await expect(panel.button()).toHaveText('Documents (1)');
        await panel.open();
        await expect(panel.row(title)).toBeVisible();
        await expect(panel.dialog.getByTestId(`linked-document-${linkId}`)).toBeVisible();
      } finally {
        await deleteWorkItemViaApi(page, workItemId);
      }
    });

    test('Unlink without Undo: the link stays gone after a reload', async ({
      page,
      testPrefix,
    }) => {
      const workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Real Unlink Gone`,
      });
      try {
        const docId = syntheticDocumentId();
        await createRealLink(page, 'work_item', workItemId, docId);
        await mockPaperlessConfigured(page);

        await new WorkItemDetailPage(page).goto(workItemId);
        const panel = new DocumentsPanel(page);
        await panel.open();
        await expect(panel.rows).toHaveCount(1);

        await panel.unlink(`Document #${docId}`);
        await expect(panel.rows).toHaveCount(0);
        await expect(panel.title).toHaveText('Documents (0)');

        await page.reload();

        await expect(panel.button()).toHaveText('Documents (0)');
        await panel.open();
        await expect(panel.rows).toHaveCount(0);
        await expect(panel.dialog.getByText('No documents linked yet.')).toBeVisible();
      } finally {
        await deleteWorkItemViaApi(page, workItemId);
      }
    });

    test('Invoice: the document type chosen on a row persists after a reload', async ({
      page,
      testPrefix,
    }) => {
      const ids = await createVendorAndInvoice(page, testPrefix);
      try {
        const docId = syntheticDocumentId();
        const linkId = await createRealLink(page, 'invoice', ids.invoiceId, docId);
        await mockPaperlessConfigured(page);

        const invoicePage = new InvoiceDetailPage(page);
        await invoicePage.goto(ids.invoiceId);
        await invoicePage.openDocuments();
        const select = invoicePage.getAttachmentTypeSelect(linkId);
        await expect(select).toHaveValue('');

        await select.selectOption('quotation');

        await expect(invoicePage.getAttachmentTypeBadge(linkId)).toHaveText('Quotation');

        await page.reload();
        await invoicePage.openDocuments();

        await expect(invoicePage.getAttachmentTypeSelect(linkId)).toHaveValue('quotation');
        await expect(invoicePage.getAttachmentTypeBadge(linkId)).toHaveText('Quotation');
      } finally {
        await page.request.delete(`${API.vendors}/${ids.vendorId}`);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Link a document that only exists in the second scrolled batch
// (Issue #2101, AC18/AC25)
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Document Linking — after infinite scroll (Scenario 8)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ timeout: 60_000 });

    test('Selecting a document from the second batch links it by its Paperless id', async ({
      page,
      testPrefix,
    }) => {
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} DocLink Second Batch`,
        });

        // Linking mock first (document-links GET/POST tracking), then the page-aware documents mock:
        // the most recently registered route wins, so it overrides the fixed one-document response.
        await mockPaperlessForLinking(page, 'work_item', createdId);
        const mock = await mockPaginatedPaperless(page, { total: 30 });

        await new WorkItemDetailPage(page).goto(createdId);
        const panel = new DocumentsPanel(page);
        await panel.open();
        await panel.openPicker();

        const picker = panel.picker;
        await picker.waitForVisible();
        await picker.waitForDocumentsLoaded();
        await expect(picker.documentItems).toHaveCount(25);

        // Document 28 only exists in batch 2
        await picker.scrollToBottom();
        await expect(picker.documentItems).toHaveCount(30);
        expect(mock.requestedPages).toEqual([1, 2]);

        const linkRequestPromise = page.waitForRequest(
          (req) => req.method() === 'POST' && new URL(req.url()).pathname === '/api/document-links',
        );
        await picker.getDocumentCard(mock.titleFor(28)).click();
        const linkRequest = await linkRequestPromise;
        expect(JSON.parse(linkRequest.postData() ?? '{}')).toMatchObject({
          paperlessDocumentId: 28,
          entityType: 'work_item',
          entityId: createdId,
        });

        // The sheet returns to the list view with the linked card
        await expect(panel.pickerBack).toHaveCount(0);
        await expect(panel.rows).toHaveCount(1);
      } finally {
        await cleanupMocks(page);
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });
  },
);
