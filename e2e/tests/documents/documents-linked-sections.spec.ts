/**
 * E2E tests for the LinkedDocumentsSection component — EPIC-08 (Stories 8.4, 8.5, 8.7)
 * and Story #1744 (budget sources + subsidy programs document attachment).
 *
 * The LinkedDocumentsSection is embedded on:
 *   - Work Item detail page (/project/work-items/:id) — Story 8.4
 *   - Invoice detail page (/budget/invoices/:id) — Story 8.5
 *   - Budget Sources page (/budget/sources) — Story #1744 (via docs toggle panel)
 *   - Subsidy Programs page (/budget/subsidies) — Story #1744 (via docs toggle panel)
 *
 * In the E2E environment, Paperless-ngx is NOT configured, so tests verify:
 * - The "Documents" section heading is present
 * - The "+ Add Document" button is DISABLED (not configured)
 * - The "not configured" banner is shown with guidance text
 * - Responsive layout: no horizontal scroll
 * - Dark mode: section renders correctly
 *
 * Scenarios covered:
 * 1.  Work item detail page: "Documents" section heading is visible
 * 2.  Work item detail page: "+ Add Document" button is disabled (not configured)
 * 3.  Work item detail page: "not configured" banner shows setup guidance
 * 4.  Work item detail page: section has accessible aria-labelledby heading
 * 5.  Work item detail page: section renders without horizontal scroll (responsive)
 * 6.  Work item detail page: section renders in dark mode
 * 7.  Invoice detail page: "Documents" section heading is visible
 * 8.  Invoice detail page: "+ Add Document" button is disabled (not configured)
 * 9.  Invoice detail page: "not configured" banner shows setup guidance
 * 10. Invoice detail page: section renders without horizontal scroll (responsive)
 * 11. Budget source: "Documents" section heading visible after toggle expand
 * 12. Budget source: "+ Add Document" button disabled (not configured)
 * 13. Budget source: section heading is accessible (aria-labelledby)
 * 14. Subsidy program: "Documents" section heading visible after toggle expand
 * 15. Subsidy program: "+ Add Document" button disabled (not configured)
 * 16. Subsidy program: section heading is accessible (aria-labelledby)
 *
 * Attachment-type tagging (Story #1877, Scenarios 17+) — since Paperless is not
 * configured in the E2E environment (no testcontainer yet, see EPIC-08 notes), these
 * scenarios mock a "configured" Paperless via page.route() (same pattern as
 * e2e/tests/documents/document-linking.spec.ts) to exercise the real tagging UI:
 * 17. Invoice detail: selecting "Quotation" on an untagged link shows the Quotation badge
 * 18. Invoice detail: retagging an already-tagged link updates the badge
 * 19. Invoice detail: untagging ("No tag") removes the badge entirely
 * 20. Invoice detail: "Add Document" picker — choosing a type before selecting a document
 *     tags the new link accordingly
 * 21. Paperless-first invoice creation flow — resulting invoice's auto-linked document
 *     shows the "Invoice" badge; no attachment-type picker appears anywhere in that flow
 *     (regression guard per dev-team-lead ambiguity resolution #1)
 * 22. Work item documents section: no attachment-type selector or badge (non-invoice entity)
 * 23. Responsive: attachment-type select meets the 44px touch target on mobile/tablet
 * 24. Dark mode: all three attachment-type badge variants render with visible labels
 */

import type { Page, Route } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { BudgetSourcesPage } from '../../pages/BudgetSourcesPage.js';
import { SubsidyProgramsPage } from '../../pages/SubsidyProgramsPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { PaperlessInvoiceReviewPage } from '../../pages/PaperlessInvoiceReviewPage.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
  createSubsidyProgramViaApi,
  deleteSubsidyProgramViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';

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
// Scenarios 1–6: Work Item detail page — LinkedDocumentsSection
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'LinkedDocumentsSection on Work Item detail (Scenarios 1–6)',
  { tag: '@responsive' },
  () => {
    test('Documents section heading "Documents" is visible on work item detail page', async ({
      page,
      testPrefix,
    }) => {
      // Given: A work item exists
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Doc Section Heading Test`,
        });

        // When: Navigating to the work item detail page
        const detailPage = new WorkItemDetailPage(page);
        await detailPage.goto(createdId);

        // Then: The "Documents" section heading should be visible
        // The section uses aria-labelledby="documents-section-title"
        const documentsSection = page.getByRole('region', {
          name: 'Documents',
          exact: true,
        });
        // Fallback: the h2 heading directly
        const documentsHeading = page.getByRole('heading', {
          level: 2,
          name: 'Documents',
          exact: true,
        });
        await expect(documentsHeading).toBeVisible();
        // The section should be present (linked via aria-labelledby)
        await expect(documentsSection).toBeVisible();
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('"+ Add Document" button is disabled when Paperless is not configured', async ({
      page,
      testPrefix,
    }) => {
      // Given: Paperless is NOT configured and a work item exists
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Add Doc Button Test`,
        });

        // When: Navigating to the work item detail page
        const detailPage = new WorkItemDetailPage(page);
        await detailPage.goto(createdId);

        // Then: The "+ Add Document" button should be disabled
        const addDocButton = page.getByRole('button', { name: '+ Add Document', exact: true });
        await expect(addDocButton).toBeVisible();
        await expect(addDocButton).toBeDisabled();
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('"Not configured" banner is shown in the Documents section on work item detail', async ({
      page,
      testPrefix,
    }) => {
      // Given: Paperless is NOT configured and a work item exists
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Not Configured Banner Test`,
        });

        // When: Navigating to the work item detail page
        const detailPage = new WorkItemDetailPage(page);
        await detailPage.goto(createdId);

        // Then: The "not configured" banner should appear in the Documents section
        // LinkedDocumentsSection renders: "Paperless-ngx is not configured"
        const notConfiguredText = page.getByText('Paperless-ngx is not configured');
        await expect(notConfiguredText).toBeVisible();
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('"Not configured" banner contains PAPERLESS_URL setup instructions', async ({
      page,
      testPrefix,
    }) => {
      // Given: Paperless is NOT configured and a work item exists
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Not Configured Instructions Test`,
        });

        // When: Navigating to the work item detail page
        const detailPage = new WorkItemDetailPage(page);
        await detailPage.goto(createdId);

        // Then: The setup instructions should mention the env var names
        const pageContent = await page.content();
        expect(pageContent).toContain('PAPERLESS_URL');
        expect(pageContent).toContain('PAPERLESS_API_TOKEN');
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('Documents section has accessible aria-labelledby heading on work item detail', async ({
      page,
      testPrefix,
    }) => {
      // Given: A work item exists
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Doc Section A11y Test`,
        });

        // When: Navigating to the work item detail page
        const detailPage = new WorkItemDetailPage(page);
        await detailPage.goto(createdId);

        // Then: The section has an ARIA label via its h2#documents-section-title
        // The h2 should have the correct id for aria-labelledby
        const sectionTitle = page.locator('#documents-section-title');
        await expect(sectionTitle).toBeVisible();
        await expect(sectionTitle).toHaveText(/Documents/);
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('Documents section renders without horizontal scroll on work item detail (responsive)', async ({
      page,
      testPrefix,
    }) => {
      // Given: A work item exists
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Doc Section Responsive Test`,
        });

        // When: Navigating to the work item detail page
        const detailPage = new WorkItemDetailPage(page);
        await detailPage.goto(createdId);

        // Scroll to the Documents section
        const documentsHeading = page.getByRole('heading', {
          level: 2,
          name: 'Documents',
          exact: true,
        });
        await documentsHeading.scrollIntoViewIfNeeded();

        // Then: No horizontal scrollbar
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(hasHorizontalScroll).toBe(false);
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('Documents section renders correctly in dark mode on work item detail', async ({
      page,
      testPrefix,
    }) => {
      // Given: A work item exists
      let createdId: string | null = null;
      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Doc Section Dark Mode Test`,
        });

        await page.goto(`/project/work-items/${createdId}`);
        // Enable dark mode
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-theme', 'dark');
        });

        const detailPage = new WorkItemDetailPage(page);
        await detailPage.heading.waitFor({ state: 'visible' });

        // Then: Documents section heading and add button visible in dark mode
        const documentsHeading = page.getByRole('heading', {
          level: 2,
          name: 'Documents',
          exact: true,
        });
        await expect(documentsHeading).toBeVisible();

        const addDocButton = page.getByRole('button', { name: '+ Add Document', exact: true });
        await expect(addDocButton).toBeVisible();
        await expect(addDocButton).toBeDisabled();
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 7–10: Invoice detail page — LinkedDocumentsSection
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'LinkedDocumentsSection on Invoice detail (Scenarios 7–10)',
  { tag: '@responsive' },
  () => {
    test('Documents section heading "Documents" is visible on invoice detail page', async ({
      page,
      testPrefix,
    }) => {
      // Given: A vendor and invoice exist
      let ids: InvoiceIds | null = null;
      try {
        ids = await createVendorAndInvoiceViaApi(page, testPrefix);

        // When: Navigating to the invoice detail page
        // Invoice detail route: /budget/invoices/:id
        await page.goto(`/budget/invoices/${ids.invoiceId}`);

        // Then: The "Documents" section heading should be visible
        const documentsHeading = page.getByRole('heading', {
          level: 2,
          name: 'Documents',
          exact: true,
        });
        await expect(documentsHeading).toBeVisible();
      } finally {
        if (ids) await deleteVendorViaApi(page, ids.vendorId);
      }
    });

    test('"+ Add Document" button is disabled when Paperless is not configured (invoice)', async ({
      page,
      testPrefix,
    }) => {
      // Given: Paperless is NOT configured and an invoice exists
      let ids: InvoiceIds | null = null;
      try {
        ids = await createVendorAndInvoiceViaApi(page, testPrefix);

        // When: Navigating to the invoice detail page
        await page.goto(`/budget/invoices/${ids.invoiceId}`);
        await page
          .getByRole('heading', { level: 2, name: 'Documents', exact: true })
          .waitFor({ state: 'visible' });

        // Then: The "+ Add Document" button should be disabled
        const addDocButton = page.getByRole('button', { name: '+ Add Document', exact: true });
        await expect(addDocButton).toBeVisible();
        await expect(addDocButton).toBeDisabled();
      } finally {
        if (ids) await deleteVendorViaApi(page, ids.vendorId);
      }
    });

    test('"Not configured" banner is shown in the Documents section on invoice detail', async ({
      page,
      testPrefix,
    }) => {
      // Given: Paperless is NOT configured and an invoice exists
      let ids: InvoiceIds | null = null;
      try {
        ids = await createVendorAndInvoiceViaApi(page, testPrefix);

        // When: Navigating to the invoice detail page
        await page.goto(`/budget/invoices/${ids.invoiceId}`);
        await page
          .getByRole('heading', { level: 2, name: 'Documents', exact: true })
          .waitFor({ state: 'visible' });

        // Then: The "not configured" message should appear
        const notConfiguredText = page.getByText('Paperless-ngx is not configured');
        await expect(notConfiguredText).toBeVisible();
      } finally {
        if (ids) await deleteVendorViaApi(page, ids.vendorId);
      }
    });

    test('Invoice detail page Documents section renders without horizontal scroll (responsive)', async ({
      page,
      testPrefix,
    }) => {
      // Given: An invoice exists
      let ids: InvoiceIds | null = null;
      try {
        ids = await createVendorAndInvoiceViaApi(page, testPrefix);

        // When: Navigating to the invoice detail page
        await page.goto(`/budget/invoices/${ids.invoiceId}`);
        const documentsHeading = page.getByRole('heading', {
          level: 2,
          name: 'Documents',
          exact: true,
        });
        await documentsHeading.waitFor({ state: 'visible' });

        // Scroll to the Documents section
        await documentsHeading.scrollIntoViewIfNeeded();

        // Then: No horizontal scrollbar
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(hasHorizontalScroll).toBe(false);
      } finally {
        if (ids) await deleteVendorViaApi(page, ids.vendorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 11–13: Budget Source — LinkedDocumentsSection (Story #1744)
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'LinkedDocumentsSection on Budget Source (Scenarios 11–13, Story #1744)',
  { tag: '@responsive' },
  () => {
    test('"Documents" section heading is visible after expanding source docs panel', async ({
      page,
      testPrefix,
    }) => {
      const sourcesPage = new BudgetSourcesPage(page);
      const sourceName = `${testPrefix} LinkedDocs Budget Source`;
      let createdId: string | null = null;

      try {
        createdId = await createBudgetSourceViaApi(page, {
          name: sourceName,
          totalAmount: 10000,
        });

        // When: Navigate to budget sources and expand the docs panel
        await sourcesPage.goto();
        await sourcesPage.waitForSourcesLoaded();
        await sourcesPage.expandSourceDocs(sourceName);

        // Then: The "Documents" section heading is visible inside the panel
        const panel = sourcesPage.getDocsPanelById(createdId);
        await expect(panel).toBeVisible();

        const docsHeading = panel.getByRole('heading', { name: 'Documents', exact: true });
        await expect(docsHeading).toBeVisible();
      } finally {
        if (createdId) await deleteBudgetSourceViaApi(page, createdId);
      }
    });

    test('"+ Add Document" button is disabled when Paperless is not configured (budget source)', async ({
      page,
      testPrefix,
    }) => {
      const sourcesPage = new BudgetSourcesPage(page);
      const sourceName = `${testPrefix} LinkedDocs AddBtn Source`;
      let createdId: string | null = null;

      try {
        createdId = await createBudgetSourceViaApi(page, {
          name: sourceName,
          totalAmount: 20000,
        });

        await sourcesPage.goto();
        await sourcesPage.waitForSourcesLoaded();
        await sourcesPage.expandSourceDocs(sourceName);

        const panel = sourcesPage.getDocsPanelById(createdId);
        await expect(panel).toBeVisible();

        // "+ Add Document" button is present but disabled (Paperless not configured)
        const addDocButton = panel.getByRole('button', { name: '+ Add Document', exact: true });
        await expect(addDocButton).toBeVisible();
        await expect(addDocButton).toBeDisabled();
      } finally {
        if (createdId) await deleteBudgetSourceViaApi(page, createdId);
      }
    });

    test('Documents section heading has accessible id="documents-section-title" on budget source', async ({
      page,
      testPrefix,
    }) => {
      const sourcesPage = new BudgetSourcesPage(page);
      const sourceName = `${testPrefix} LinkedDocs A11y Source`;
      let createdId: string | null = null;

      try {
        createdId = await createBudgetSourceViaApi(page, {
          name: sourceName,
          totalAmount: 30000,
        });

        await sourcesPage.goto();
        await sourcesPage.waitForSourcesLoaded();
        await sourcesPage.expandSourceDocs(sourceName);

        const panel = sourcesPage.getDocsPanelById(createdId);
        await expect(panel).toBeVisible();

        // The h2 inside LinkedDocumentsSection has id="documents-section-title"
        const sectionTitle = panel.locator('#documents-section-title');
        await expect(sectionTitle).toBeVisible();
        await expect(sectionTitle).toHaveText(/Documents/);
      } finally {
        if (createdId) await deleteBudgetSourceViaApi(page, createdId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 14–16: Subsidy Program — LinkedDocumentsSection (Story #1744)
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'LinkedDocumentsSection on Subsidy Program (Scenarios 14–16, Story #1744)',
  { tag: '@responsive' },
  () => {
    test('"Documents" section heading is visible after expanding program docs panel', async ({
      page,
      testPrefix,
    }) => {
      const subsidyPage = new SubsidyProgramsPage(page);
      const programName = `${testPrefix} LinkedDocs Subsidy Program`;
      let createdId: string | null = null;

      try {
        createdId = await createSubsidyProgramViaApi(page, {
          name: programName,
          reductionValue: 10,
        });

        // When: Navigate to subsidy programs and expand the docs panel
        await subsidyPage.goto();
        await subsidyPage.waitForProgramsLoaded();
        await subsidyPage.expandProgramDocs(programName);

        // Then: The "Documents" section heading is visible inside the panel
        const panel = subsidyPage.getDocsPanelById(createdId);
        await expect(panel).toBeVisible();

        const docsHeading = panel.getByRole('heading', { name: 'Documents', exact: true });
        await expect(docsHeading).toBeVisible();
      } finally {
        if (createdId) await deleteSubsidyProgramViaApi(page, createdId);
      }
    });

    test('"+ Add Document" button is disabled when Paperless is not configured (subsidy program)', async ({
      page,
      testPrefix,
    }) => {
      const subsidyPage = new SubsidyProgramsPage(page);
      const programName = `${testPrefix} LinkedDocs AddBtn Program`;
      let createdId: string | null = null;

      try {
        createdId = await createSubsidyProgramViaApi(page, {
          name: programName,
          reductionValue: 15,
        });

        await subsidyPage.goto();
        await subsidyPage.waitForProgramsLoaded();
        await subsidyPage.expandProgramDocs(programName);

        const panel = subsidyPage.getDocsPanelById(createdId);
        await expect(panel).toBeVisible();

        // "+ Add Document" button is present but disabled (Paperless not configured)
        const addDocButton = panel.getByRole('button', { name: '+ Add Document', exact: true });
        await expect(addDocButton).toBeVisible();
        await expect(addDocButton).toBeDisabled();
      } finally {
        if (createdId) await deleteSubsidyProgramViaApi(page, createdId);
      }
    });

    test('Documents section heading has accessible id="documents-section-title" on subsidy program', async ({
      page,
      testPrefix,
    }) => {
      const subsidyPage = new SubsidyProgramsPage(page);
      const programName = `${testPrefix} LinkedDocs A11y Program`;
      let createdId: string | null = null;

      try {
        createdId = await createSubsidyProgramViaApi(page, {
          name: programName,
          reductionValue: 20,
        });

        await subsidyPage.goto();
        await subsidyPage.waitForProgramsLoaded();
        await subsidyPage.expandProgramDocs(programName);

        const panel = subsidyPage.getDocsPanelById(createdId);
        await expect(panel).toBeVisible();

        // The h2 inside LinkedDocumentsSection has id="documents-section-title"
        const sectionTitle = panel.locator('#documents-section-title');
        await expect(sectionTitle).toBeVisible();
        await expect(sectionTitle).toHaveText(/Documents/);
      } finally {
        if (createdId) await deleteSubsidyProgramViaApi(page, createdId);
      }
    });
  },
);

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
 * used by the "Add Document" picker scenario. Returns the paperlessDocumentIds
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
// Scenario 20: "Add Document" picker — choose type before selecting a document
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Attachment-type tagging — Add Document picker (Scenario 20)', () => {
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

      const addDocButton = page.getByRole('button', { name: '+ Add Document', exact: true });
      await expect(addDocButton).toBeEnabled({ timeout: 10000 });
      await addDocButton.click();

      const pickerModal = page.getByRole('dialog', { name: 'Add Document' });
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

      await expect(pickerModal).toBeHidden({ timeout: 10000 });

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

      const addDocButton = page.getByRole('button', { name: '+ Add Document', exact: true });
      await expect(addDocButton).toBeEnabled({ timeout: 10000 });
      await addDocButton.click();

      const pickerModal = page.getByRole('dialog', { name: 'Add Document' });
      await expect(pickerModal).toBeVisible();

      const pickerTypeSelect = invoiceDetailPage.getPickerAttachmentTypeSelect();
      await pickerTypeSelect.selectOption('quotation');
      await expect(pickerTypeSelect).toHaveValue('quotation');

      // Close without selecting a document
      const closeButton = pickerModal.getByRole('button', {
        name: 'Close document picker',
      });
      await closeButton.click();
      await expect(pickerModal).toBeHidden();

      // Reopen — the field must be back to "No tag"
      await addDocButton.click();
      await expect(pickerModal).toBeVisible();
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

      const linkedList = page.getByRole('list', { name: 'Linked documents' });
      await expect(linkedList).toBeVisible({ timeout: 10000 });

      const card = linkedList.getByRole('listitem').first();
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

        const select = invoiceDetailPage.getAttachmentTypeSelect(linkId);
        await expect(select).toBeVisible();

        const box = await select.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.height).toBeGreaterThanOrEqual(44);
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

    let vendorId = '';
    try {
      const vendorResp = await page.request.post(API.vendors, {
        data: { name: `${testPrefix} PF Attach Vendor` },
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
              vendor: { id: vendorId, name: `${testPrefix} PF Attach Vendor` },
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
              vendorName: `${testPrefix} PF Attach Vendor`,
              vendor: { id: vendorId, name: `${testPrefix} PF Attach Vendor` },
              deposits: [],
              finalPaymentAmount: 500,
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
      await page.waitForURL('**/budget/invoices/new/paperless');

      const reviewPage = new PaperlessInvoiceReviewPage(page);
      await reviewPage.waitForExtractionComplete();

      // Regression guard: no attachment-type field anywhere on the review page either
      await expect(page.locator('#picker-attachment-type')).toHaveCount(0);
      await expect(page.locator('select[id^="attachment-type-"]')).toHaveCount(0);

      await reviewPage.setVendor(`${testPrefix} PF Attach Vendor`);

      const commitResponsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/auto-itemize/commit') && resp.request().method() === 'POST',
      );
      await reviewPage.confirm();
      await commitResponsePromise;

      await page.waitForURL(`**/budget/invoices/${mockInvoiceId}`);
      await expect(page.getByRole('heading', { level: 1, name: '#PF-ATTACH-001' })).toBeVisible();

      // The auto-linked document shows the "Invoice" badge — and the select still
      // renders on invoice detail cards generally (entityType='invoice'); only the
      // CREATE-flow picker itself is exempt from the manual tagging UI.
      const invoiceDetailPage = new InvoiceDetailPage(page);
      const badge = invoiceDetailPage.getAttachmentTypeBadge(pfLinkId);
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText('Invoice');
      await expect(invoiceDetailPage.getAttachmentTypeSelect(pfLinkId)).toHaveValue('invoice');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});
