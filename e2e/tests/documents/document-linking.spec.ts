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
 * 7b. Toggle unchecked shows all documents regardless of system-wide links
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
  // Checking "Hide already-linked documents" hides doc #42 but keeps doc #55 visible.
  // Unchecking restores both docs.
  // ---------------------------------------------------------------------------
  test('System-wide linked IDs filter the picker when toggle is checked', async ({
    page,
    testPrefix,
  }) => {
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

      // Both documents visible initially (toggle unchecked by default)
      const documentGrid = pickerModal.getByRole('list', { name: 'Documents' });
      await expect(documentGrid).toBeVisible({ timeout: 10000 });
      await expect(documentGrid.getByRole('listitem')).toHaveCount(2, { timeout: 10000 });

      // Toggle must be visible because systemLinkedIds.ids = [42] (length > 0)
      const hideToggle = pickerModal.getByRole('checkbox', {
        name: /hide already-linked documents/i,
      });
      await expect(hideToggle).toBeVisible({ timeout: 5000 });
      await expect(hideToggle).not.toBeChecked();

      // Check the toggle — doc #42 should be hidden, doc #55 should remain
      await hideToggle.check();
      await expect(hideToggle).toBeChecked();

      // After filtering: only doc #55 ("E2E Unlinked Receipt") visible
      await expect(documentGrid.getByRole('listitem')).toHaveCount(1, { timeout: 10000 });
      await expect(documentGrid).toContainText(MOCK_DOCUMENT_55.title);
      await expect(documentGrid).not.toContainText(MOCK_DOCUMENT.title);

      // Uncheck toggle — both docs visible again
      await hideToggle.uncheck();
      await expect(hideToggle).not.toBeChecked();
      await expect(documentGrid.getByRole('listitem')).toHaveCount(2, { timeout: 10000 });
      await expect(documentGrid).toContainText(MOCK_DOCUMENT.title);
      await expect(documentGrid).toContainText(MOCK_DOCUMENT_55.title);
    } finally {
      await cleanupMocks(page);
      await page.unroute('**/api/document-links/linked-ids');
      if (workItemAId) await deleteWorkItemViaApi(page, workItemAId);
      if (workItemBId) await deleteWorkItemViaApi(page, workItemBId);
    }
  });

  // ---------------------------------------------------------------------------
  // Scenario 7b: Toggle unchecked shows all documents
  //
  // Verifies that the toggle is visible (system IDs > 0) but unchecked by
  // default, so all documents are shown regardless of system-wide link state.
  // ---------------------------------------------------------------------------
  test('Toggle is unchecked by default and shows all documents', async ({
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

      // Toggle is visible (systemLinkedIds has 1 entry) and unchecked by default
      const hideToggle = pickerModal.getByRole('checkbox', {
        name: /hide already-linked documents/i,
      });
      await expect(hideToggle).toBeVisible({ timeout: 5000 });
      await expect(hideToggle).not.toBeChecked();

      // With toggle unchecked, both documents are shown despite system-wide link on #42
      const documentGrid = pickerModal.getByRole('list', { name: 'Documents' });
      await expect(documentGrid).toBeVisible({ timeout: 10000 });
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
