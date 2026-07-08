/**
 * E2E tests for document linking flow (Paperless-ngx integration) — EPIC-08
 *
 * Tests the full "Add Document" → select from browser → linked card appears
 * flow using route-level mocking for Paperless-ngx APIs.
 *
 * Also tests the unlink confirmation flow and linked document card rendering.
 *
 * Scenarios covered:
 * 1.  Link a document to a work item: picker → select → card appears
 * 2.  Link a document to an invoice: same flow on invoice detail page
 * 3.  Linked document card shows title, correspondent, date
 * 4.  Unlink confirmation modal appears and removes the linked card
 * 5.  Duplicate link shows error banner
 * 6.  Linked documents count badge updates after linking
 * 7a. System-wide linked IDs hide filtered document when toggle checked
 * 7b. Toggle checked by default hides already-linked docs; unchecking shows all
 *
 * Scenario 4 (overlay button, fix/1680-unlink-document-overlay):
 * 4a. Desktop: hover reveals the overlay unlink button; confirm removes the card
 * 4b. Desktop: cancel in the unlink modal keeps the card visible
 * 4c. Mobile: overlay unlink button is always visible without hover
 */

import type { Page, Route } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';

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
// Scenario 1: Link a document to a work item
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

      await page.goto(`/project/work-items/${createdId}`);
      await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

      // Documents section should be visible with no linked docs
      const documentsHeading = page.getByRole('heading', {
        level: 2,
        name: 'Documents',
        exact: true,
      });
      await expect(documentsHeading).toBeVisible();

      // Click "+ Add Document"
      const addDocButton = page.getByRole('button', { name: '+ Add Document', exact: true });
      await expect(addDocButton).toBeEnabled({ timeout: 10000 });
      await addDocButton.click();

      // Picker modal opens
      const pickerModal = page.getByRole('dialog', { name: 'Add Document' });
      await expect(pickerModal).toBeVisible();

      // Wait for documents to load in the picker
      const documentGrid = pickerModal.getByRole('list', { name: 'Documents' });
      await expect(documentGrid).toBeVisible();
      await expect(documentGrid.getByRole('listitem')).toHaveCount(1);

      // Click the document card to select it
      await documentGrid.getByRole('listitem').first().click();

      // Picker modal should close after selection
      await expect(pickerModal).toBeHidden({ timeout: 10000 });

      // The linked document card should now appear in the Documents section
      // After linking, the component refetches links — the mock returns our linked doc.
      // Wait for the linked documents list to appear
      const linkedList = page.getByRole('list', { name: 'Linked documents' });
      await expect(linkedList).toBeVisible({ timeout: 10000 });

      // Card should show the document title
      await expect(linkedList).toContainText(MOCK_DOCUMENT.title);

      // Count badge should show "1"
      const countBadge = page.locator('[aria-label="1 documents linked"]');
      await expect(countBadge).toBeVisible();
    } finally {
      await cleanupMocks(page);
      if (createdId) await deleteWorkItemViaApi(page, createdId);
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

      await page.goto(`/project/work-items/${createdId}`);
      await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

      // First link — should succeed
      const addDocButton = page.getByRole('button', { name: '+ Add Document', exact: true });
      await expect(addDocButton).toBeEnabled({ timeout: 10000 });
      await addDocButton.click();

      let pickerModal = page.getByRole('dialog', { name: 'Add Document' });
      await expect(pickerModal).toBeVisible();
      const documentGrid = pickerModal.getByRole('list', { name: 'Documents' });
      await expect(documentGrid.getByRole('listitem')).toHaveCount(1, { timeout: 10000 });
      await documentGrid.getByRole('listitem').first().click();
      await expect(pickerModal).toBeHidden({ timeout: 10000 });

      // Wait for linked doc to appear
      await expect(page.getByRole('list', { name: 'Linked documents' })).toBeVisible({
        timeout: 10000,
      });

      // Second link — same document, should show duplicate error
      await addDocButton.click();
      pickerModal = page.getByRole('dialog', { name: 'Add Document' });
      await expect(pickerModal).toBeVisible();

      // After fix #1369, "Hide already-linked documents" defaults to unchecked — linked docs visible.
      // Label changed from the old "Hide linked" wording; uncheck() is a no-op but kept for clarity.
      const hideLinkedCheckbox = pickerModal.getByRole('checkbox', {
        name: /hide already-linked documents/i,
      });
      await expect(hideLinkedCheckbox).toBeVisible({ timeout: 5000 });
      await hideLinkedCheckbox.uncheck();

      await expect(
        pickerModal.getByRole('list', { name: 'Documents' }).getByRole('listitem'),
      ).toHaveCount(1, { timeout: 10000 });
      await pickerModal
        .getByRole('list', { name: 'Documents' })
        .getByRole('listitem')
        .first()
        .click();
      await expect(pickerModal).toBeHidden({ timeout: 10000 });

      // Error banner should appear with "already linked" message
      const errorBanner = page.locator('[role="alert"]').filter({ hasText: /already linked/ });
      await expect(errorBanner).toBeVisible({ timeout: 10000 });
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

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Document Linking — System-wide Hide
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Document Linking — System-wide Hide (Scenario 7)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  // ---------------------------------------------------------------------------
  // Scenario 7a: System-wide IDs are used for filtering
  //
  // Opens the picker on workItemA; doc #42 is linked system-wide (to workItemB).
  // The toggle defaults ON (defaultHideLinked=true in LinkedDocumentsSection), so
  // doc #42 is hidden on open. Unchecking reveals both; re-checking hides #42 again.
  // ---------------------------------------------------------------------------
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

      // Paperless: two documents available
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

      // workItemA has no entity-level links
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

      // System-wide: doc #42 is already linked (to workItemB)
      await mockSystemLinkedIds(page, [42]);

      await page.goto(`/project/work-items/${workItemAId}`);
      await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

      // Open the picker
      const addDocButton = page.getByRole('button', { name: '+ Add Document', exact: true });
      await expect(addDocButton).toBeEnabled({ timeout: 10000 });
      await addDocButton.click();

      const pickerModal = page.getByRole('dialog', { name: 'Add Document' });
      await expect(pickerModal).toBeVisible();

      // Toggle must be visible because systemLinkedIds.ids = [42] (length > 0)
      const hideToggle = pickerModal.getByRole('checkbox', {
        name: /hide already-linked documents/i,
      });
      await expect(hideToggle).toBeVisible({ timeout: 5000 });

      // Toggle defaults ON (defaultHideLinked=true in LinkedDocumentsSection)
      await expect(hideToggle).toBeChecked();

      // With toggle checked: only doc #55 visible; doc #42 is hidden (system-wide linked)
      const documentGrid = pickerModal.getByRole('list', { name: 'Documents' });
      await expect(documentGrid).toBeVisible({ timeout: 10000 });
      await expect(documentGrid.getByRole('listitem')).toHaveCount(1, { timeout: 10000 });
      await expect(documentGrid).toContainText(MOCK_DOCUMENT_55.title);
      await expect(documentGrid).not.toContainText(MOCK_DOCUMENT.title);

      // Uncheck toggle — both docs visible
      await hideToggle.uncheck();
      await expect(hideToggle).not.toBeChecked();
      await expect(documentGrid.getByRole('listitem')).toHaveCount(2, { timeout: 10000 });
      await expect(documentGrid).toContainText(MOCK_DOCUMENT.title);
      await expect(documentGrid).toContainText(MOCK_DOCUMENT_55.title);

      // Re-check toggle — doc #42 hidden again
      await hideToggle.check();
      await expect(hideToggle).toBeChecked();
      await expect(documentGrid.getByRole('listitem')).toHaveCount(1, { timeout: 10000 });
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

  // ---------------------------------------------------------------------------
  // Scenario 7b: Toggle checked by default hides already-linked documents
  //
  // Verifies that the toggle is visible (system IDs > 0) and CHECKED by default
  // (defaultHideLinked=true in LinkedDocumentsSection), so doc #42 is hidden on
  // open. Unchecking the toggle reveals all documents.
  // ---------------------------------------------------------------------------
  test('Toggle is checked by default and hides already-linked documents', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} SysHide Toggle Default`,
      });

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

      // System-wide: doc #42 is linked to some other entity
      await mockSystemLinkedIds(page, [42]);

      await page.goto(`/project/work-items/${createdId}`);
      await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

      // Open the picker
      const addDocButton = page.getByRole('button', { name: '+ Add Document', exact: true });
      await expect(addDocButton).toBeEnabled({ timeout: 10000 });
      await addDocButton.click();

      const pickerModal = page.getByRole('dialog', { name: 'Add Document' });
      await expect(pickerModal).toBeVisible();

      // Toggle is visible (systemLinkedIds has 1 entry) and CHECKED by default
      // (LinkedDocumentsSection passes defaultHideLinked={true} to DocumentBrowser)
      const hideToggle = pickerModal.getByRole('checkbox', {
        name: /hide already-linked documents/i,
      });
      await expect(hideToggle).toBeVisible({ timeout: 5000 });
      await expect(hideToggle).toBeChecked();

      // With toggle checked by default, doc #42 is hidden; only doc #55 is shown
      const documentGrid = pickerModal.getByRole('list', { name: 'Documents' });
      await expect(documentGrid).toBeVisible({ timeout: 10000 });
      await expect(documentGrid.getByRole('listitem')).toHaveCount(1, { timeout: 10000 });
      await expect(documentGrid).not.toContainText(MOCK_DOCUMENT.title);
      await expect(documentGrid).toContainText(MOCK_DOCUMENT_55.title);

      // Unchecking the toggle reveals both documents
      await hideToggle.uncheck();
      await expect(hideToggle).not.toBeChecked();
      await expect(documentGrid.getByRole('listitem')).toHaveCount(2, { timeout: 10000 });
      await expect(documentGrid).toContainText(MOCK_DOCUMENT.title);
      await expect(documentGrid).toContainText(MOCK_DOCUMENT_55.title);
    } finally {
      await cleanupMocks(page);
      await page.unroute('**/api/document-links/linked-ids');
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Document Linking — Unlink via Overlay Button (fix/1680)
//
// The ✕ unlink button moved from the card footer to a top-right thumbnail
// overlay. On pointer devices it is hidden (opacity:0) until .card:hover;
// on touch/coarse-pointer devices (mobile/tablet) it is always visible.
//
// These tests verify:
//   4a. Desktop: hover reveals overlay button → confirm removes the card
//   4b. Desktop: cancel in the unlink modal keeps the card visible
//   4c. Mobile:  overlay button is always visible without hover (coarse-pointer)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a DELETE mock for /api/document-links/:id.
 *
 * When called, removes the link from `linkedDocumentIds` so the subsequent
 * GET refetch returns an empty list. Returns a cleanup fn that unroutes it.
 */
async function mockDocumentLinkDelete(page: Page): Promise<() => Promise<void>> {
  await page.route('**/api/document-links/*', async (route: Route) => {
    if (route.request().method() !== 'DELETE') {
      await route.continue();
      return;
    }
    // Empty the shared state so the GET mock returns no links after unlink
    linkedDocumentIds = [];
    await route.fulfill({ status: 204, body: '' });
  });

  return async () => {
    await page.unroute('**/api/document-links/*');
  };
}

test.describe('Document Linking — Unlink via Overlay Button (Scenario 4)', () => {
  test.describe.configure({ timeout: 60_000 });

  // ---------------------------------------------------------------------------
  // Scenario 4a: Desktop — hover reveals overlay button; confirm removes card
  // ---------------------------------------------------------------------------
  test('Overlay unlink button appears on hover and confirm removes the linked card', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    let cleanupDelete: (() => Promise<void>) | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Overlay Unlink Confirm`,
      });

      // Pre-seed one linked document via mock state
      await mockPaperlessForLinking(page, 'work_item', createdId);
      linkedDocumentIds = [MOCK_DOCUMENT.id];

      // Register DELETE mock (must be before navigation so it is ready)
      cleanupDelete = await mockDocumentLinkDelete(page);

      await page.goto(`/project/work-items/${createdId}`);
      await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

      // The linked document card must be visible
      const linkedList = page.getByRole('list', { name: 'Linked documents' });
      await expect(linkedList).toBeVisible({ timeout: 10000 });

      // Locate the card and the overlay unlink button inside it
      const card = linkedList.getByRole('listitem').first();
      const unlinkOverlayButton = card.getByRole('button', { name: /Unlink document:/i });

      // Before hover: button exists in DOM but is not visible (opacity:0 on pointer devices)
      await expect(unlinkOverlayButton).toBeAttached();

      // Hover the card to reveal the overlay button
      await card.hover();

      // After hover: button must be visible
      await expect(unlinkOverlayButton).toBeVisible();

      // Click the overlay unlink button — this opens the confirmation modal.
      // force:true bypasses Playwright's pointer-events/opacity actionability check;
      // the button is revealed by CSS :hover but the actionability check can race on CI
      // Linux runners where the hover state is checked at the moment of mouse movement.
      // We already confirmed visibility above, so force is safe here.
      await unlinkOverlayButton.click({ force: true });

      // Unlink confirmation dialog appears
      const unlinkModal = page.getByRole('dialog', { name: 'Unlink Document?' });
      await expect(unlinkModal).toBeVisible();

      // Confirm by clicking the "Unlink" button inside the dialog
      const confirmButton = unlinkModal.getByRole('button', { name: /^Unlink$/i });
      await confirmButton.click();

      // Modal closes after confirmation
      await expect(unlinkModal).toBeHidden({ timeout: 10000 });

      // The linked documents list and card are removed (no links remain)
      await expect(linkedList).toBeHidden({ timeout: 10000 });
    } finally {
      if (cleanupDelete) await cleanupDelete();
      await cleanupMocks(page);
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  // ---------------------------------------------------------------------------
  // Scenario 4b: Desktop — cancel in the unlink modal keeps the card
  // ---------------------------------------------------------------------------
  test('Cancelling the unlink modal keeps the linked card visible', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    let cleanupDelete: (() => Promise<void>) | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Overlay Unlink Cancel`,
      });

      // Pre-seed one linked document
      await mockPaperlessForLinking(page, 'work_item', createdId);
      linkedDocumentIds = [MOCK_DOCUMENT.id];

      // DELETE mock registered but should NOT be triggered in this test
      cleanupDelete = await mockDocumentLinkDelete(page);

      await page.goto(`/project/work-items/${createdId}`);
      await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

      const linkedList = page.getByRole('list', { name: 'Linked documents' });
      await expect(linkedList).toBeVisible({ timeout: 10000 });

      const card = linkedList.getByRole('listitem').first();
      const unlinkOverlayButton = card.getByRole('button', { name: /Unlink document:/i });

      // Hover to reveal, then click overlay unlink button.
      // force:true bypasses Playwright's pointer-events/opacity actionability check;
      // the button is revealed by CSS :hover but the actionability check can race on CI
      // Linux runners where the hover state is checked at the moment of mouse movement.
      // We already confirmed visibility above, so force is safe here.
      await card.hover();
      await expect(unlinkOverlayButton).toBeVisible();
      await unlinkOverlayButton.click({ force: true });

      // Confirmation modal opens
      const unlinkModal = page.getByRole('dialog', { name: 'Unlink Document?' });
      await expect(unlinkModal).toBeVisible();

      // Dismiss via Cancel button. Use Escape key — the component's keydown handler
      // calls setUnlinkTarget(null) on Escape when unlinkTarget is set and !isUnlinking.
      // This is more reliable than a pointer click on the custom modal on CI Linux runners,
      // where the modalBackdrop (position:absolute;inset:0) can block pointer events.
      await page.keyboard.press('Escape');

      // Modal closes
      await expect(unlinkModal).toBeHidden({ timeout: 10000 });

      // The linked document card is still visible — nothing was deleted
      await expect(linkedList).toBeVisible();
      await expect(linkedList).toContainText(MOCK_DOCUMENT.title);
    } finally {
      if (cleanupDelete) await cleanupDelete();
      await cleanupMocks(page);
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  // ---------------------------------------------------------------------------
  // Scenario 4c: Mobile — overlay button always visible (coarse-pointer/touch)
  //
  // On touch/coarse-pointer devices the CSS rule
  //   @media (hover: none), (pointer: coarse) { .unlinkOverlayButton { opacity:1; } }
  // makes the button always visible without hover.
  // ---------------------------------------------------------------------------
  test(
    'Overlay unlink button is always visible on mobile without hover',
    { tag: '@responsive' },
    async ({ page, testPrefix }) => {
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Overlay Mobile Visible`,
        });

        // Pre-seed one linked document
        await mockPaperlessForLinking(page, 'work_item', createdId);
        linkedDocumentIds = [MOCK_DOCUMENT.id];

        await page.goto(`/project/work-items/${createdId}`);
        await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

        const linkedList = page.getByRole('list', { name: 'Linked documents' });
        await expect(linkedList).toBeVisible({ timeout: 10000 });

        const card = linkedList.getByRole('listitem').first();
        const unlinkOverlayButton = card.getByRole('button', { name: /Unlink document:/i });

        // On mobile (coarse-pointer / hover:none) the overlay button must be
        // visible WITHOUT any hover action — the CSS media query ensures opacity:1.
        await expect(unlinkOverlayButton).toBeVisible({ timeout: 7000 });
      } finally {
        await cleanupMocks(page);
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    },
  );
});
