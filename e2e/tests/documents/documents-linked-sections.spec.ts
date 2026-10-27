/**
 * E2E tests for the Documents panel on its five hosts — EPIC-08 (Stories 8.4, 8.5, 8.7),
 * Story #1744 and #2233 (P4.1 detail template; the panel replaces LinkedDocumentsSection).
 *
 * The Documents panel ("Documents (n)" trigger + side sheet / full-screen sheet) is hosted by:
 *   - Task detail page (/project/work-items/:id)             trigger documents-panel-button
 *   - Purchase detail page (/project/household-items/:id)    trigger documents-panel-button
 *   - Invoice detail page (/budget/invoices/:id)             trigger summary-fact-documents (strip fact, value = count)
 *   - Funding source row (/budget/sources)                   trigger source-docs-<id>
 *   - Grant row (/budget/subsidies)                          trigger program-docs-<id>
 *
 * In the E2E environment Paperless is NOT configured (#2217), so tests use route mocks:
 * - Paperless off + no links: no trigger, no panel, no "not configured" text, no env names
 * - Paperless off + kept links: trigger "Documents (n)", read-only panel with one notice and
 *   (admin only) an Integrations link; no Link document, no menus
 * - Paperless mocked as configured: trigger, panel, Link document
 *
 * Scenarios covered:
 * 1.  (per host) Paperless off, no links: no Documents trigger
 * 2.  (per host) Paperless off, kept links: trigger with count, read-only panel with the notice
 * 3.  (per host) Paperless on: trigger "Documents (0)", panel opens with empty state + Link document
 * 4.  Kept link singular notice + Integrations link opens the Paperless card
 * 5.  Layout: side sheet (right aligned, ~480 px) from 768 px, full screen below; focus on the
 *     title on open; Escape closes; focus returns to the trigger
 * 6.  Picker: Link document opens the picker view; Escape returns to the list (sheet stays open,
 *     Link document focused); a second Escape closes the sheet
 * 7.  Browse all is absent (the Documents page route is not served yet)
 * 8.  Phone viewport + dark mode: no horizontal overflow
 *
 * Attachment-type tagging (Story #1877, Scenarios 9+) mock a "configured" Paperless via
 * page.route() to exercise the real tagging UI inside the panel:
 * 9.  Invoice: selecting "Quotation" on an untagged link shows the Quotation badge
 * 10. Invoice: retagging an already-tagged link updates the badge
 * 11. Invoice: untagging ("No tag") removes the badge entirely
 * 12. Invoice: the type select is disabled while the PATCH is in flight
 * 13. Invoice: choosing a type in the picker before selecting a document tags the new link
 * 14. Invoice: the picker type field resets to "No tag" when the picker is reopened
 * 15. Task: no attachment-type selector or badge (non-invoice entity)
 * 16. Phone/tablet: the type select meets the 44 px touch target
 * 17. Dark mode: all three attachment-type badge variants render
 * 18. Paperless-first invoice creation flow: no type picker; resulting invoice shows the badge
 */

import type { Page, Route } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';
import { BudgetSourcesPage } from '../../pages/BudgetSourcesPage.js';
import { SubsidyProgramsPage } from '../../pages/SubsidyProgramsPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { PaperlessInvoiceReviewPage } from '../../pages/PaperlessInvoiceReviewPage.js';
import { DocumentsPanel } from '../../pages/DocumentsPanel.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
  createSubsidyProgramViaApi,
  deleteSubsidyProgramViaApi,
} from '../../fixtures/apiHelpers.js';
import { API, ROUTES } from '../../fixtures/testData.js';
import { mockPaginatedPaperless } from '../../fixtures/paperlessPaginatedMock.js';
import {
  expectNoDocumentsButton,
  mockKeptDocumentLinks,
  mockPaperlessConfigured,
  settleDocumentsHost,
} from '../../fixtures/paperlessMocks.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create a vendor + invoice via API and return IDs
// ─────────────────────────────────────────────────────────────────────────────

interface InvoiceIds {
  vendorId: string;
  invoiceId: string;
}

async function createVendorAndInvoiceViaApi(page: Page, prefix: string): Promise<InvoiceIds> {
  // Create vendor
  const vendorResp = await page.request.post(API.vendors, {
    data: { name: `${prefix} Docs Test Vendor` },
  });
  expect(vendorResp.ok()).toBeTruthy();
  const vendor = (await vendorResp.json()) as { vendor: { id: string } };
  const vendorId = vendor.vendor.id;

  // Create invoice under the vendor
  const invoiceResp = await page.request.post(API.vendors + `/${vendorId}/invoices`, {
    data: {
      invoiceNumber: `${prefix}-INV-DOC`,
      amount: 100,
      date: '2025-01-15',
      status: 'pending',
    },
  });
  expect(invoiceResp.ok()).toBeTruthy();
  const invoice = (await invoiceResp.json()) as { invoice: { id: string } };

  return { vendorId, invoiceId: invoice.invoice.id };
}

async function deleteVendorViaApi(page: Page, vendorId: string): Promise<void> {
  await page.request.delete(API.vendors + `/${vendorId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// The five hosts of the Documents panel
// ─────────────────────────────────────────────────────────────────────────────

interface Host {
  readonly label: string;
  readonly entityType: string;
  /** Test id of the "Documents (n)" trigger for the created record. */
  readonly triggerTestId: (id: string) => string;
  /** Pattern for "no trigger of this host" assertions. */
  readonly triggerPattern: RegExp;
  /** What the trigger shows for `count` links (the invoice strip fact shows the bare count). */
  readonly triggerText: (count: number) => string;
  /** Creates the record; returns its id and a cleanup. */
  readonly create: (
    page: Page,
    prefix: string,
  ) => Promise<{ id: string; cleanup: () => Promise<void> }>;
  /** Navigates to the page showing the record. */
  readonly open: (page: Page, id: string) => Promise<void>;
}

const HOSTS: readonly Host[] = [
  {
    label: 'Task',
    entityType: 'work_item',
    triggerTestId: () => 'documents-panel-button',
    triggerPattern: /^documents-panel-button$/,
    triggerText: (count) => `Documents (${count})`,
    create: async (page, prefix) => {
      const id = await createWorkItemViaApi(page, { title: `${prefix} Docs Host Task` });
      return { id, cleanup: () => deleteWorkItemViaApi(page, id) };
    },
    open: async (page, id) => {
      await new WorkItemDetailPage(page).goto(id);
    },
  },
  {
    label: 'Purchase',
    entityType: 'household_item',
    triggerTestId: () => 'documents-panel-button',
    triggerPattern: /^documents-panel-button$/,
    triggerText: (count) => `Documents (${count})`,
    create: async (page, prefix) => {
      const id = await createHouseholdItemViaApi(page, { name: `${prefix} Docs Host Purchase` });
      return { id, cleanup: () => deleteHouseholdItemViaApi(page, id) };
    },
    open: async (page, id) => {
      await new HouseholdItemDetailPage(page).goto(id);
    },
  },
  {
    label: 'Invoice',
    entityType: 'invoice',
    triggerTestId: () => 'summary-fact-documents',
    triggerPattern: /^summary-fact-documents$/,
    triggerText: (count) => `${count}`,
    create: async (page, prefix) => {
      const ids = await createVendorAndInvoiceViaApi(page, prefix);
      return { id: ids.invoiceId, cleanup: () => deleteVendorViaApi(page, ids.vendorId) };
    },
    open: async (page, id) => {
      await page.goto(`/budget/invoices/${id}`);
    },
  },
  {
    label: 'Funding source',
    entityType: 'budget_source',
    triggerTestId: (id) => `source-docs-${id}`,
    triggerPattern: /^source-docs-/,
    triggerText: (count) => `Documents (${count})`,
    create: async (page, prefix) => {
      const id = await createBudgetSourceViaApi(page, {
        name: `${prefix} Docs Host Source`,
        totalAmount: 10000,
      });
      return { id, cleanup: () => deleteBudgetSourceViaApi(page, id) };
    },
    open: async (page) => {
      const sourcesPage = new BudgetSourcesPage(page);
      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();
    },
  },
  {
    label: 'Grant',
    entityType: 'subsidy_program',
    triggerTestId: (id) => `program-docs-${id}`,
    triggerPattern: /^program-docs-/,
    triggerText: (count) => `Documents (${count})`,
    create: async (page, prefix) => {
      const id = await createSubsidyProgramViaApi(page, {
        name: `${prefix} Docs Host Grant`,
        reductionValue: 10,
      });
      return { id, cleanup: () => deleteSubsidyProgramViaApi(page, id) };
    },
    open: async (page) => {
      const subsidyPage = new SubsidyProgramsPage(page);
      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 1–3 (per host): Paperless off without links, off with kept links, on
// ─────────────────────────────────────────────────────────────────────────────

for (const host of HOSTS) {
  test.describe(`Documents panel — ${host.label} (Scenarios 1–3)`, { tag: '@responsive' }, () => {
    test('Paperless off, no links: there is no Documents trigger', async ({ page, testPrefix }) => {
      const { id, cleanup } = await host.create(page, testPrefix);
      try {
        await settleDocumentsHost(page, id, () => host.open(page, id));

        await expect(new DocumentsPanel(page).button(host.triggerTestId(id))).toHaveCount(0);
        if (host.triggerPattern.source === '^documents-panel-button$') {
          await expectNoDocumentsButton(page, host.triggerPattern);
        }
        await expect(page.getByText(/not configured/i)).toHaveCount(0);
      } finally {
        await cleanup();
      }
    });

    test('Paperless off, kept links: trigger with count and a read-only panel with the notice', async ({
      page,
      testPrefix,
    }) => {
      const { id, cleanup } = await host.create(page, testPrefix);
      try {
        await mockKeptDocumentLinks(page, host.entityType, id, 2);
        await host.open(page, id);
        const panel = new DocumentsPanel(page);

        const trigger = panel.button(host.triggerTestId(id));
        await expect(trigger).toBeVisible();
        await expect(trigger).toContainText(host.triggerText(2));
        await panel.open(host.triggerTestId(id));

        await expect(panel.title).toHaveText('Documents (2)');
        await expect(panel.notice).toContainText('Paperless is not connected. 2 links are kept.');
        await expect(panel.integrationsLink).toHaveAttribute(
          'href',
          `${ROUTES.integrations}#paperless`,
        );
        await expect(panel.rows).toHaveCount(2);
        // Read-only: no Link document, no card menus, no Details toggles
        await expect(panel.linkDocumentButton).toHaveCount(0);
        await expect(panel.dialog.getByRole('button', { name: /^Actions for/ })).toHaveCount(0);
        await expect(panel.dialog.getByRole('button', { name: 'Details' })).toHaveCount(0);
        await expect(panel.dialog.getByText(/PAPERLESS_URL|PAPERLESS_API_TOKEN/)).toHaveCount(0);
      } finally {
        await cleanup();
      }
    });

    test('Paperless on: trigger "Documents (0)" opens the panel with the empty state and Link document', async ({
      page,
      testPrefix,
    }) => {
      const { id, cleanup } = await host.create(page, testPrefix);
      try {
        await mockPaperlessConfigured(page);
        await host.open(page, id);
        const panel = new DocumentsPanel(page);

        const trigger = panel.button(host.triggerTestId(id));
        await expect(trigger).toBeVisible();
        await expect(trigger).toHaveText(host.triggerText(0));
        await panel.open(host.triggerTestId(id));

        await expect(panel.title).toHaveText('Documents (0)');
        await expect(panel.dialog.getByText('No documents linked yet.')).toBeVisible();
        await expect(panel.linkDocumentButton).toBeEnabled();
        await expect(panel.notice).toHaveCount(0);
        await expect(panel.dialog.getByText(/not configured/i)).toHaveCount(0);
      } finally {
        await cleanup();
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 4–8: Task host details (singular notice, layout and focus, picker view, a11y)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Documents panel — behaviour on the Task page (Scenarios 4–8)', () => {
  test('Kept link: the singular notice, and the Integrations link opens the Paperless card', async ({
    page,
    testPrefix,
  }) => {
    const id = await createWorkItemViaApi(page, { title: `${testPrefix} Doc Panel Kept One` });
    try {
      await mockKeptDocumentLinks(page, 'work_item', id, 1);
      await new WorkItemDetailPage(page).goto(id);
      const panel = new DocumentsPanel(page);
      await panel.open();

      await expect(panel.title).toHaveText('Documents (1)');
      await expect(panel.notice).toContainText('Paperless is not connected. 1 link is kept.');

      await panel.integrationsLink.click();

      await expect(page).toHaveURL(`${ROUTES.integrations}#paperless`);
      await expect(page.locator('#paperless-heading')).toBeFocused();
    } finally {
      await deleteWorkItemViaApi(page, id);
    }
  });

  test(
    'Layout and focus: side sheet from 768 px, full screen below; title focused; Escape returns focus to the trigger',
    { tag: '@responsive' },
    async ({ page, testPrefix }) => {
      const id = await createWorkItemViaApi(page, { title: `${testPrefix} Doc Panel Layout` });
      try {
        await mockPaperlessConfigured(page);
        await new WorkItemDetailPage(page).goto(id);
        const panel = new DocumentsPanel(page);
        await panel.open();

        await expect(panel.title).toBeFocused();

        const viewportWidth = page.viewportSize()?.width ?? 0;
        // The sheet slides in: poll its box until the transition has settled
        if (viewportWidth >= 768) {
          // Side sheet: right aligned, width = --side-sheet-width (30rem = 480 px)
          await expect
            .poll(async () => {
              const box = await panel.dialog.boundingBox();
              return box ? Math.abs(box.x + box.width - viewportWidth) <= 2 : false;
            })
            .toBe(true);
          const box = await panel.dialog.boundingBox();
          expect(box?.width ?? 0).toBeGreaterThanOrEqual(470);
          expect(box?.width ?? 0).toBeLessThanOrEqual(490);
        } else {
          // Phone: full screen
          await expect
            .poll(async () => {
              const box = await panel.dialog.boundingBox();
              return box ? [Math.round(box.x), Math.round(box.width)] : null;
            })
            .toEqual([0, viewportWidth]);
        }

        await page.keyboard.press('Escape');

        await expect(panel.dialog).toHaveCount(0);
        await expect(panel.button()).toBeFocused();
      } finally {
        await deleteWorkItemViaApi(page, id);
      }
    },
  );

  test(
    'Picker: Link document shows the picker view; Escape returns to the list; a second Escape closes',
    { tag: '@responsive' },
    async ({ page, testPrefix }) => {
      const id = await createWorkItemViaApi(page, { title: `${testPrefix} Doc Panel Picker` });
      try {
        await mockPaginatedPaperless(page, { total: 3 });
        await new WorkItemDetailPage(page).goto(id);
        const panel = new DocumentsPanel(page);
        await panel.open();

        await panel.openPicker();
        await expect(panel.title).toHaveText('Link document');
        await panel.picker.waitForDocumentsLoaded();
        await expect(panel.picker.documentItems).toHaveCount(3);

        await page.keyboard.press('Escape');

        // Sheet still open, back in the list view, focus on Link document
        await expect(panel.dialog).toBeVisible();
        await expect(panel.title).toHaveText('Documents (0)');
        await expect(panel.linkDocumentButton).toBeFocused();

        await page.keyboard.press('Escape');

        await expect(panel.dialog).toHaveCount(0);
        await expect(panel.button()).toBeFocused();
      } finally {
        await deleteWorkItemViaApi(page, id);
      }
    },
  );

  test('The Back button of the picker view also returns to the list', async ({
    page,
    testPrefix,
  }) => {
    const id = await createWorkItemViaApi(page, { title: `${testPrefix} Doc Panel Back` });
    try {
      await mockPaginatedPaperless(page, { total: 2 });
      await new WorkItemDetailPage(page).goto(id);
      const panel = new DocumentsPanel(page);
      await panel.open();
      await panel.openPicker();

      await panel.backToList();

      await expect(panel.title).toHaveText('Documents (0)');
      await expect(panel.linkDocumentButton).toBeFocused();
    } finally {
      await deleteWorkItemViaApi(page, id);
    }
  });

  test('Browse all is absent while the Documents page route is not served', async ({
    page,
    testPrefix,
  }) => {
    const id = await createWorkItemViaApi(page, { title: `${testPrefix} Doc Panel Browse All` });
    try {
      await mockPaperlessConfigured(page);
      await new WorkItemDetailPage(page).goto(id);
      const panel = new DocumentsPanel(page);
      await panel.open();

      await expect(panel.linkDocumentButton).toBeVisible();
      await expect(panel.browseAll).toHaveCount(0);
    } finally {
      await deleteWorkItemViaApi(page, id);
    }
  });

  test(
    'The open panel does not overflow the page horizontally, in light and dark mode',
    { tag: '@responsive' },
    async ({ page, testPrefix }) => {
      const id = await createWorkItemViaApi(page, { title: `${testPrefix} Doc Panel Overflow` });
      try {
        await mockKeptDocumentLinks(page, 'work_item', id, 2);
        await new WorkItemDetailPage(page).goto(id);
        const panel = new DocumentsPanel(page);
        await panel.open();
        await expect(panel.notice).toBeVisible();
        expect(await panel.hasHorizontalOverflow()).toBe(false);

        await page.evaluate(() => {
          document.documentElement.setAttribute('data-theme', 'dark');
        });

        await expect(panel.notice).toBeVisible();
        await expect(panel.rows).toHaveCount(2);
        expect(await panel.hasHorizontalOverflow()).toBe(false);
      } finally {
        await deleteWorkItemViaApi(page, id);
      }
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// Attachment-type tagging (Story #1877, Scenarios 17–24)
//
// Paperless-ngx has no testcontainer yet (EPIC-08) — these scenarios mock a
// "configured" Paperless via page.route(), following the exact pattern established
// in e2e/tests/documents/document-linking.spec.ts. This exercises the REAL tagging
// UI (select + PATCH /api/document-links/:id + optimistic local update), not just
// the "not configured" banner state covered above.
// ═════════════════════════════════════════════════════════════════════════════

const ATTACHMENT_MOCK_STATUS_CONFIGURED = {
  configured: true,
  reachable: true,
  error: null,
  paperlessUrl: 'http://paperless.local:8000',
  filterTag: null,
};

function makeAttachmentMockDocument(id: number, title: string) {
  return {
    id,
    title,
    content: 'Attachment-type test document',
    tags: [],
    created: '2026-01-15',
    added: '2026-01-15T10:00:00Z',
    modified: '2026-01-15T10:00:00Z',
    correspondent: 'Attachment Test Vendor',
    documentType: 'Invoice',
    archiveSerialNumber: id,
    originalFileName: `attach-${id}.pdf`,
    pageCount: 1,
    searchHit: null,
  };
}

type AttachmentType = 'quotation' | 'deposit' | 'invoice';

interface AttachmentMockLink {
  id: string;
  entityType: string;
  entityId: string;
  paperlessDocumentId: number;
  attachmentType: AttachmentType | null;
}

let attachmentMockLinks: AttachmentMockLink[] = [];
let attachmentMockNextDocId = 601;

/**
 * Mocks a "configured" Paperless-ngx for the attachment-type tagging scenarios.
 * Optionally pre-seeds document links with the given attachmentTypes (one per entry).
 * A single additional UNLINKED document is always available in the browser/picker —
 * used by the "Link document" picker scenario. Returns the paperlessDocumentIds
 * allocated to each seeded link, in order.
 *
 * All three of GET (list), POST (create), and PATCH (retag/untag) are backed by the
 * same in-memory `attachmentMockLinks` array so the UI's optimistic local update
 * (useDocumentLinks.updateAttachmentType does NOT refetch) can be verified against a
 * server-consistent PATCH response.
 */
async function mockPaperlessForAttachmentTyping(
  page: Page,
  entityType: string,
  entityId: string,
  seedAttachmentTypes: Array<AttachmentType | null> = [],
): Promise<number[]> {
  attachmentMockLinks = [];
  const seededDocIds: number[] = [];

  for (const attachmentType of seedAttachmentTypes) {
    const docId = attachmentMockNextDocId++;
    seededDocIds.push(docId);
    attachmentMockLinks.push({
      id: `mock-attach-link-${docId}`,
      entityType,
      entityId,
      paperlessDocumentId: docId,
      attachmentType,
    });
  }

  const unlinkedDocId = attachmentMockNextDocId++;
  const unlinkedDoc = makeAttachmentMockDocument(unlinkedDocId, 'E2E Unlinked Attachment Doc');

  await page.route('**/api/paperless/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ATTACHMENT_MOCK_STATUS_CONFIGURED),
    });
  });

  await page.route('**/api/paperless/documents**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        documents: [unlinkedDoc],
        pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      }),
    });
  });

  await page.route('**/api/paperless/tags', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tags: [] }),
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
    const links = attachmentMockLinks.map((link) => ({
      id: link.id,
      entityType: link.entityType,
      entityId: link.entityId,
      paperlessDocumentId: link.paperlessDocumentId,
      attachmentType: link.attachmentType,
      createdBy: { id: 'user-1', displayName: 'E2E Admin' },
      createdAt: '2026-01-15T10:00:00.000Z',
      document: makeAttachmentMockDocument(
        link.paperlessDocumentId,
        `E2E Attachment Doc ${link.paperlessDocumentId}`,
      ),
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documentLinks: links }),
    });
  });

  await page.route('**/api/document-links', async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const body = JSON.parse(route.request().postData() || '{}') as {
      entityType: string;
      entityId: string;
      paperlessDocumentId: number;
      attachmentType?: AttachmentType | null;
    };
    // Mirrors server-side normalization: attachmentType is only meaningful for
    // entityType='invoice'; non-invoice entities are always stored as null.
    const resolvedType = body.entityType === 'invoice' ? (body.attachmentType ?? null) : null;
    const newLink: AttachmentMockLink = {
      id: `mock-attach-link-${body.paperlessDocumentId}`,
      entityType: body.entityType,
      entityId: body.entityId,
      paperlessDocumentId: body.paperlessDocumentId,
      attachmentType: resolvedType,
    };
    attachmentMockLinks.push(newLink);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        documentLink: {
          id: newLink.id,
          entityType: newLink.entityType,
          entityId: newLink.entityId,
          paperlessDocumentId: newLink.paperlessDocumentId,
          attachmentType: newLink.attachmentType,
          createdBy: { id: 'user-1', displayName: 'E2E Admin' },
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });

  // Single handler covers both PATCH /api/document-links/:id (retag/untag) and
  // GET /api/document-links/linked-ids (system-wide filter fetched when the picker
  // opens) — both match the same '**/api/document-links/*' glob, and Playwright's
  // last-registered-runs-first routing plus this handler's unconditional
  // route.continue() for "other" methods would otherwise silently swallow whichever
  // of the two routes was registered second. Branching on the path segment inside
  // one handler sidesteps the ordering hazard entirely.
  await page.route('**/api/document-links/*', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const lastSegment = url.pathname.split('/').pop();

    if (lastSegment === 'linked-ids' && req.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ paperlessDocumentIds: [] }),
      });
      return;
    }

    if (req.method() !== 'PATCH') {
      await route.continue();
      return;
    }

    const link = attachmentMockLinks.find((l) => l.id === lastSegment);
    if (!link) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'NOT_FOUND', message: 'Document link not found' },
        }),
      });
      return;
    }
    const body = JSON.parse(req.postData() || '{}') as { attachmentType: AttachmentType | null };
    link.attachmentType = link.entityType === 'invoice' ? body.attachmentType : null;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        documentLink: {
          id: link.id,
          entityType: link.entityType,
          entityId: link.entityId,
          paperlessDocumentId: link.paperlessDocumentId,
          attachmentType: link.attachmentType,
          createdBy: { id: 'user-1', displayName: 'E2E Admin' },
          createdAt: '2026-01-15T10:00:00.000Z',
        },
      }),
    });
  });

  return seededDocIds;
}

async function cleanupAttachmentMocks(page: Page): Promise<void> {
  await page.unroute('**/api/paperless/**');
  await page.unroute('**/api/document-links?*');
  await page.unroute('**/api/document-links');
  await page.unroute('**/api/document-links/*');
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 17–19: Invoice detail — tag / retag / untag
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Attachment-type tagging — invoice detail (Scenarios 17–19)', () => {
  test('Selecting "Quotation" on an untagged link shows the Quotation badge', async ({
    page,
    testPrefix,
  }) => {
    let ids: InvoiceIds | null = null;
    try {
      ids = await createVendorAndInvoiceViaApi(page, testPrefix);
      const [docId] = await mockPaperlessForAttachmentTyping(page, 'invoice', ids.invoiceId, [
        null,
      ]);
      const linkId = `mock-attach-link-${docId}`;

      const invoiceDetailPage = new InvoiceDetailPage(page);
      await invoiceDetailPage.goto(ids.invoiceId);
      await invoiceDetailPage.openDocuments();

      const select = invoiceDetailPage.getAttachmentTypeSelect(linkId);
      await expect(select).toBeVisible();
      await expect(select).toHaveValue('');

      // No badge is rendered while untagged
      const badge = invoiceDetailPage.getAttachmentTypeBadge(linkId);
      await expect(badge).toHaveCount(0);

      const patchResponse = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/document-links/${linkId}`) &&
          resp.request().method() === 'PATCH',
      );
      await select.selectOption('quotation');
      await patchResponse;

      const updatedBadge = invoiceDetailPage.getAttachmentTypeBadge(linkId);
      await expect(updatedBadge).toBeVisible();
      await expect(updatedBadge).toHaveText('Quotation');
      await expect(select).toHaveValue('quotation');
    } finally {
      await cleanupAttachmentMocks(page);
      if (ids) await deleteVendorViaApi(page, ids.vendorId);
    }
  });

  test('Retagging an already-tagged link updates the badge', async ({ page, testPrefix }) => {
    let ids: InvoiceIds | null = null;
    try {
      ids = await createVendorAndInvoiceViaApi(page, testPrefix);
      const [docId] = await mockPaperlessForAttachmentTyping(page, 'invoice', ids.invoiceId, [
        'quotation',
      ]);
      const linkId = `mock-attach-link-${docId}`;

      const invoiceDetailPage = new InvoiceDetailPage(page);
      await invoiceDetailPage.goto(ids.invoiceId);
      await invoiceDetailPage.openDocuments();

      const badge = invoiceDetailPage.getAttachmentTypeBadge(linkId);
      await expect(badge).toHaveText('Quotation');

      const select = invoiceDetailPage.getAttachmentTypeSelect(linkId);
      await expect(select).toHaveValue('quotation');

      const patchResponse = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/document-links/${linkId}`) &&
          resp.request().method() === 'PATCH',
      );
      await select.selectOption('deposit');
      await patchResponse;

      await expect(badge).toHaveText('Deposit');
      await expect(select).toHaveValue('deposit');
    } finally {
      await cleanupAttachmentMocks(page);
      if (ids) await deleteVendorViaApi(page, ids.vendorId);
    }
  });

  test('Untagging ("No tag") removes the badge entirely', async ({ page, testPrefix }) => {
    let ids: InvoiceIds | null = null;
    try {
      ids = await createVendorAndInvoiceViaApi(page, testPrefix);
      const [docId] = await mockPaperlessForAttachmentTyping(page, 'invoice', ids.invoiceId, [
        'deposit',
      ]);
      const linkId = `mock-attach-link-${docId}`;

      const invoiceDetailPage = new InvoiceDetailPage(page);
      await invoiceDetailPage.goto(ids.invoiceId);
      await invoiceDetailPage.openDocuments();

      const badge = invoiceDetailPage.getAttachmentTypeBadge(linkId);
      await expect(badge).toHaveText('Deposit');

      const select = invoiceDetailPage.getAttachmentTypeSelect(linkId);
      const patchResponse = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/document-links/${linkId}`) &&
          resp.request().method() === 'PATCH',
      );
      await select.selectOption('');
      await patchResponse;

      // Badge disappears entirely — untagged is visually blank, not a "No tag" chip
      await expect(badge).toHaveCount(0);
      await expect(select).toHaveValue('');
    } finally {
      await cleanupAttachmentMocks(page);
      if (ids) await deleteVendorViaApi(page, ids.vendorId);
    }
  });

  test('Select is disabled while the PATCH is in flight', async ({ page, testPrefix }) => {
    let ids: InvoiceIds | null = null;
    let linkId: string | null = null;
    try {
      ids = await createVendorAndInvoiceViaApi(page, testPrefix);
      const [docId] = await mockPaperlessForAttachmentTyping(page, 'invoice', ids.invoiceId, [
        null,
      ]);
      linkId = `mock-attach-link-${docId}`;

      // Delay the PATCH response so the disabled state is observable
      await page.route(`**/api/document-links/${linkId}`, async (route: Route) => {
        if (route.request().method() !== 'PATCH') {
          await route.continue();
          return;
        }
        const link = attachmentMockLinks.find((l) => l.id === linkId);
        const body = JSON.parse(route.request().postData() || '{}') as {
          attachmentType: AttachmentType | null;
        };
        if (link) link.attachmentType = body.attachmentType;
        await new Promise((resolve) => setTimeout(resolve, 300));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            documentLink: { ...link, createdBy: { id: 'user-1', displayName: 'E2E Admin' } },
          }),
        });
      });

      const invoiceDetailPage = new InvoiceDetailPage(page);
      await invoiceDetailPage.goto(ids.invoiceId);
      await invoiceDetailPage.openDocuments();

      const select = invoiceDetailPage.getAttachmentTypeSelect(linkId);
      await select.selectOption('invoice');

      // While the PATCH is in flight, the select must be disabled
      await expect(select).toBeDisabled();

      // Once resolved, it's re-enabled
      await expect(select).toBeEnabled({ timeout: 5000 });
    } finally {
      if (linkId) await page.unroute(`**/api/document-links/${linkId}`);
      await cleanupAttachmentMocks(page);
      if (ids) await deleteVendorViaApi(page, ids.vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 13-14: Link document picker — choose type before selecting a document
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Attachment-type tagging — Link document picker (Scenarios 13-14)', () => {
  test('Choosing a type in the picker before selecting a document tags the new link', async ({
    page,
    testPrefix,
  }) => {
    let ids: InvoiceIds | null = null;
    try {
      ids = await createVendorAndInvoiceViaApi(page, testPrefix);
      // No seeded links — the mock's single unlinked document is available to pick.
      await mockPaperlessForAttachmentTyping(page, 'invoice', ids.invoiceId, []);

      const invoiceDetailPage = new InvoiceDetailPage(page);
      await invoiceDetailPage.goto(ids.invoiceId);
      await invoiceDetailPage.openDocuments();

      // (the panel was opened above) Link document switches the sheet to the picker view
      await invoiceDetailPage.documents.openPicker();
      const pickerModal = invoiceDetailPage.documents.dialog;
      await expect(pickerModal).toBeVisible();

      // The picker attachment-type field is present (entityType='invoice') with a
      // visible label (not sr-only, unlike the per-card select).
      const pickerTypeSelect = invoiceDetailPage.getPickerAttachmentTypeSelect();
      await expect(pickerTypeSelect).toBeVisible();
      await expect(pickerTypeSelect).toHaveValue(''); // defaults to "No tag"

      // Choose "Deposit" BEFORE selecting the document
      await pickerTypeSelect.selectOption('deposit');

      const documentGrid = pickerModal.getByRole('list', { name: 'Documents' });
      await expect(documentGrid).toBeVisible();
      await expect(documentGrid.getByRole('listitem')).toHaveCount(1);

      const createResponse = page.waitForResponse(
        (resp) =>
          resp.url().endsWith('/api/document-links') &&
          resp.request().method() === 'POST' &&
          resp.status() === 201,
      );
      await documentGrid.getByRole('listitem').first().click();
      const createResp = await createResponse;
      const createBody = (await createResp.json()) as {
        documentLink: { id: string; attachmentType: string | null };
      };
      expect(createBody.documentLink.attachmentType).toBe('deposit');

      // The sheet goes back to the list view (the panel stays open)
      await expect(invoiceDetailPage.documents.linkDocumentButton).toBeVisible();

      // The new card shows the "Deposit" badge
      const badge = invoiceDetailPage.getAttachmentTypeBadge(createBody.documentLink.id);
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText('Deposit');
    } finally {
      await cleanupAttachmentMocks(page);
      if (ids) await deleteVendorViaApi(page, ids.vendorId);
    }
  });

  test('Picker attachment-type field resets to "No tag" when reopened', async ({
    page,
    testPrefix,
  }) => {
    let ids: InvoiceIds | null = null;
    try {
      ids = await createVendorAndInvoiceViaApi(page, testPrefix);
      await mockPaperlessForAttachmentTyping(page, 'invoice', ids.invoiceId, []);

      const invoiceDetailPage = new InvoiceDetailPage(page);
      await invoiceDetailPage.goto(ids.invoiceId);
      await invoiceDetailPage.openDocuments();

      await invoiceDetailPage.documents.openPicker();

      const pickerTypeSelect = invoiceDetailPage.getPickerAttachmentTypeSelect();
      await pickerTypeSelect.selectOption('quotation');
      await expect(pickerTypeSelect).toHaveValue('quotation');

      // Back to the list without selecting a document
      await invoiceDetailPage.documents.backToList();

      // Reopen the picker — the field must be back to "No tag"
      await invoiceDetailPage.documents.openPicker();
      await expect(invoiceDetailPage.getPickerAttachmentTypeSelect()).toHaveValue('');
    } finally {
      await cleanupAttachmentMocks(page);
      if (ids) await deleteVendorViaApi(page, ids.vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 22: Work item documents section — no selector/badge on non-invoice entity
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Attachment-type tagging — non-invoice entities (Scenario 22)', () => {
  test('Work item documents section shows no attachment-type selector or badge', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} No Attachment Type WI`,
      });
      // A configured Paperless with one pre-seeded link. attachmentType is normalized
      // to null server-side for non-invoice entities regardless of what's requested.
      await mockPaperlessForAttachmentTyping(page, 'work_item', createdId, [null]);

      const detailPage = new WorkItemDetailPage(page);
      await detailPage.goto(createdId);
      const panel = new DocumentsPanel(page);
      await panel.open();

      await expect(panel.list).toBeVisible();

      const card = panel.rows.first();
      // No attachment-type <select> (id starts with "attachment-type-") anywhere on the card
      await expect(card.locator('select[id^="attachment-type-"]')).toHaveCount(0);
      // No attachment-type Badge (testid starts with "attachment-type-badge-")
      await expect(card.locator('[data-testid^="attachment-type-badge-"]')).toHaveCount(0);
    } finally {
      await cleanupAttachmentMocks(page);
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 23: Responsive — attachment-type select meets the 44px touch target
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Attachment-type tagging — responsive touch target (Scenario 23)',
  { tag: '@responsive' },
  () => {
    test('Select meets the 44px minimum touch target on mobile/tablet viewports', async ({
      page,
      testPrefix,
    }) => {
      // The 44px min-height rule only applies inside the @media (max-width: 1023px)
      // block in LinkedDocumentCard.module.css — meaningless above that width.
      const viewportWidth = page.viewportSize()?.width ?? 1280;
      if (viewportWidth >= 1024) {
        test.skip();
        return;
      }

      let ids: InvoiceIds | null = null;
      try {
        ids = await createVendorAndInvoiceViaApi(page, testPrefix);
        const [docId] = await mockPaperlessForAttachmentTyping(page, 'invoice', ids.invoiceId, [
          'invoice',
        ]);
        const linkId = `mock-attach-link-${docId}`;

        const invoiceDetailPage = new InvoiceDetailPage(page);
        await invoiceDetailPage.goto(ids.invoiceId);
        await invoiceDetailPage.openDocuments();

        const select = invoiceDetailPage.getAttachmentTypeSelect(linkId);
        await expect(select).toBeVisible();

        const box = await select.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          // 2.75rem can lay out as 43.99998px: allow subpixel rounding
          expect(box.height).toBeGreaterThanOrEqual(43.99);
        }
      } finally {
        await cleanupAttachmentMocks(page);
        if (ids) await deleteVendorViaApi(page, ids.vendorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 24: Dark mode — all three badge variants render with visible labels
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Attachment-type tagging — dark mode (Scenario 24)', () => {
  test('Quotation, Deposit, and Invoice badges all render visibly in dark mode', async ({
    page,
    testPrefix,
  }) => {
    let ids: InvoiceIds | null = null;
    try {
      ids = await createVendorAndInvoiceViaApi(page, testPrefix);
      const docIds = await mockPaperlessForAttachmentTyping(page, 'invoice', ids.invoiceId, [
        'quotation',
        'deposit',
        'invoice',
      ]);

      await page.goto(`/budget/invoices/${ids.invoiceId}`);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      const invoiceDetailPage = new InvoiceDetailPage(page);
      await invoiceDetailPage.heading.waitFor({ state: 'visible' });
      await invoiceDetailPage.openDocuments();

      const expectedLabels: Record<number, string> = {
        [docIds[0]!]: 'Quotation',
        [docIds[1]!]: 'Deposit',
        [docIds[2]!]: 'Invoice',
      };

      for (const [docId, label] of Object.entries(expectedLabels)) {
        const linkId = `mock-attach-link-${docId}`;
        const badge = invoiceDetailPage.getAttachmentTypeBadge(linkId);
        await expect(badge).toBeVisible();
        await expect(badge).toHaveText(label);
      }

      // No horizontal scroll introduced by the badge row in dark mode
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      await cleanupAttachmentMocks(page);
      if (ids) await deleteVendorViaApi(page, ids.vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 21: Paperless-first invoice creation flow — regression guard
//
// Per the dev-team-lead's ambiguity resolution #1 on issue #1877: the picker used
// while CREATING a new invoice (InvoicePaperlessPickerModal, InvoicesPage → "New
// Invoice") does NOT get an attachment-type field — the picked document IS the
// invoice's own source document, so the server hardcodes attachmentType:'invoice'
// in commitAutoItemizeCreate's own document_links insert. This test verifies BOTH
// halves of that contract from the browser: no attachment-type picker/select ever
// renders anywhere in the picker→review→confirm flow, and the resulting invoice's
// auto-linked document shows the "Invoice" badge once landed on its detail page.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Attachment-type tagging — Paperless-first invoice flow (Scenario 21)', () => {
  test('No attachment-type picker appears in the flow; resulting invoice shows the "Invoice" badge', async ({
    page,
    testPrefix,
  }) => {
    test.slow();

    const PF_STATUS_CONFIGURED = {
      configured: true,
      reachable: true,
      error: null,
      paperlessUrl: 'http://paperless.local:8000',
      filterTag: null,
    };
    const PF_DOC = {
      id: 8001,
      title: `${testPrefix} PF Regression Doc`,
      content: 'Materials invoice',
      tags: [],
      created: '2026-01-15',
      added: '2026-01-15T10:00:00Z',
      modified: '2026-01-15T10:00:00Z',
      correspondent: 'PF Regression Vendor',
      documentType: 'Invoice',
      archiveSerialNumber: 8001,
      originalFileName: 'pf-regression.pdf',
      pageCount: 1,
      searchHit: null,
    };
    const mockInvoiceId = `mock-pf-attach-${testPrefix}`;
    // The review page's vendor picker filters only the FIRST 100 companies by name (it loads
    // `GET /api/vendors?pageSize=100` once and has no server-side search), so on a shared server
    // that has accumulated more than 100 companies a vendor named "E2E-..." is not offered at
    // all. A leading "!" sorts this vendor first, so it is always inside that window.
    const vendorName = `!${testPrefix} PF Attach Vendor`;

    let vendorId = '';
    try {
      const vendorResp = await page.request.post(API.vendors, {
        data: { name: vendorName },
      });
      expect(vendorResp.ok()).toBeTruthy();
      vendorId = ((await vendorResp.json()) as { vendor: { id: string } }).vendor.id;

      // Fetch a real budget category so the extracted line passes handleSave's category check.
      const catResp = await page.request.get(API.budgetCategories);
      expect(catResp.ok()).toBeTruthy();
      const catBody = (await catResp.json()) as { categories: Array<{ id: string }> };
      const firstCatId = catBody.categories[0]?.id ?? null;
      expect(firstCatId, 'Expected at least one budget category to exist').not.toBeNull();

      await page.route('**/api/paperless/status', async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(PF_STATUS_CONFIGURED),
        });
      });
      await page.route('**/api/config', async (route: Route) => {
        try {
          const real = await route.fetch();
          const realBody = (await real.json()) as Record<string, unknown>;
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
      await page.route('**/paperless/correspondents', async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ correspondents: [] }),
        });
      });
      await page.route('**/api/paperless/tags', async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tags: [] }),
        });
      });
      await page.route('**/paperless/documents**', async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            documents: [PF_DOC],
            pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
          }),
        });
      });
      await page.route(`**/paperless/documents/${PF_DOC.id}`, async (route: Route) => {
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
          body: JSON.stringify({ document: PF_DOC }),
        });
      });
      await page.route('**/api/document-links/linked-ids', async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ paperlessDocumentIds: [] }),
        });
      });
      await page.route('**/api/invoices/auto-itemize/preview', async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            lines: [
              {
                description: 'PF regression materials',
                quantity: 1,
                unit: 'ea',
                unitPrice: 500,
                totalAmount: 500,
                includesVat: false,
                vatRate: 0.19,
                vendorName: null,
                confidence: 0.9,
                budgetCategoryId: firstCatId,
              },
            ],
            warnings: [],
            suggestedVendorId: null,
            extractedTotal: 500,
            extractedInvoiceDate: '2026-01-15',
            extractedInvoiceNumber: 'PF-ATTACH-001',
            extractedNotes: null,
            extractedDueDate: null,
          }),
        });
      });
      await page.route('**/api/invoices/auto-itemize/commit', async (route: Route) => {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            invoice: {
              id: mockInvoiceId,
              invoiceNumber: 'PF-ATTACH-001',
              amount: 500,
              date: '2026-01-15',
              dueDate: null,
              status: 'pending',
              notes: null,
              vendorId,
              vendor: { id: vendorId, name: vendorName },
              createdAt: '2026-06-15T00:00:00.000Z',
              updatedAt: '2026-06-15T00:00:00.000Z',
            },
          }),
        });
      });
      // Invoice detail page mocks — the created invoice's auto-linked document is
      // ALREADY tagged 'invoice' server-side (commitAutoItemizeCreate hardcodes this).
      await page.route(`**/api/invoices/${mockInvoiceId}`, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            invoice: {
              id: mockInvoiceId,
              invoiceNumber: 'PF-ATTACH-001',
              amount: 500,
              date: '2026-01-15',
              dueDate: null,
              status: 'pending',
              notes: null,
              vendorId,
              vendorName: vendorName,
              vendor: { id: vendorId, name: vendorName },
              deposits: [],
              finalPaymentAmount: 500,
              paid: 0,
              openAmount: 500,
              notYetSplit: false,
              createdBy: null,
              createdAt: '2026-06-15T00:00:00.000Z',
              updatedAt: '2026-06-15T00:00:00.000Z',
            },
          }),
        });
      });
      await page.route(`**/api/invoices/${mockInvoiceId}/budget-lines`, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ budgetLines: [], remainingAmount: 500 }),
        });
      });
      const pfLinkId = `mock-pf-attach-link-${testPrefix}`;
      await page.route(
        (url) =>
          url.pathname === '/api/document-links' &&
          url.searchParams.get('entityType') === 'invoice' &&
          url.searchParams.get('entityId') === mockInvoiceId,
        async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              documentLinks: [
                {
                  id: pfLinkId,
                  entityType: 'invoice',
                  entityId: mockInvoiceId,
                  paperlessDocumentId: PF_DOC.id,
                  attachmentType: 'invoice',
                  createdBy: null,
                  createdAt: '2026-01-15T00:00:00.000Z',
                  document: PF_DOC,
                },
              ],
            }),
          });
        },
      );

      const invoicesPage = new InvoicesPage(page);
      await invoicesPage.goto();
      await invoicesPage.waitForLoaded();

      await invoicesPage.clickNewInvoice();
      const pickerModal = await invoicesPage.waitForPickerModal();
      await expect(pickerModal.modal).toBeVisible();

      // Regression guard: no attachment-type field anywhere in the create-invoice picker
      await expect(page.locator('#picker-attachment-type')).toHaveCount(0);
      await expect(page.locator('select[id^="attachment-type-"]')).toHaveCount(0);

      await pickerModal.selectDocument(PF_DOC.title);
      await page.waitForURL(/\/budget\/invoices\/new\/paperless\?documentId=\d+$/);

      const reviewPage = new PaperlessInvoiceReviewPage(page);
      await reviewPage.waitForExtractionComplete();

      // Regression guard: no attachment-type field anywhere on the review page either
      await expect(page.locator('#picker-attachment-type')).toHaveCount(0);
      await expect(page.locator('select[id^="attachment-type-"]')).toHaveCount(0);

      await reviewPage.setVendor(vendorName);

      const commitResponsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/auto-itemize/commit') && resp.request().method() === 'POST',
      );
      await reviewPage.confirm();
      await commitResponsePromise;

      await page.waitForURL(`**/budget/invoices/${mockInvoiceId}`);
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: `${vendorName} · PF-ATTACH-001`,
        }),
      ).toBeVisible();

      // The auto-linked document shows the "Invoice" badge — and the select still
      // renders on invoice detail cards generally (entityType='invoice'); only the
      // CREATE-flow picker itself is exempt from the manual tagging UI.
      const invoiceDetailPage = new InvoiceDetailPage(page);
      await invoiceDetailPage.openDocuments();
      const badge = invoiceDetailPage.getAttachmentTypeBadge(pfLinkId);
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText('Invoice');
      await expect(invoiceDetailPage.getAttachmentTypeSelect(pfLinkId)).toHaveValue('invoice');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});
