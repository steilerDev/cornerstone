/**
 * E2E page identity for the Money pages (Story #2203 / EPIC-21)
 *
 * Every Money page states what it is: one h1, a browser-tab title
 * `<page or object> · Money · <house name>`, a breadcrumb trail of parents only, and (where the
 * page was opened from somewhere other than its parent) one origin-aware "Back to <origin>" link
 * that replaces the old "Back to Invoices / Vendors" buttons.
 *
 * Scenarios:
 * - E1  (AC1/AC2/AC6) h1 and exact tab title for every Money route (overview, invoices, invoice,
 *                     offer, 404, funding sources, grants, bank report, New invoice, Split with AI)
 * - E1b               the New invoice h1 is the same while the extraction is loading and after
 *                     (the extraction wording is a status line, not the heading)
 * - E2  (AC3)         breadcrumbs are parents only; the two views have none; the trail links work
 * - E3  (AC4)         an invoice opened from a company page offers "Back to <company>", kept on a
 *                     reload and gone on a fresh visit; Back returns to the company page
 * - E4                no Back from the parent list
 * - E5  (AC5)         filters and tabs replace history; nothing pushes on mount
 * - E6  (MNY-062)     creating an invoice from a document replaces the review page in history
 * - E7  (MNY-068)     Split with AI returns to the invoice without a duplicate history entry
 * - E9  (phone)       one visible element in the breadcrumb row, 44px touch target
 *
 * The German h1/title check (E8) lives in i18n/i18n.spec.ts, which owns a dedicated user: the
 * locale is a server-side preference.
 *
 * Projects: E1-E7 run on desktop; E9 runs on mobile; tablet is skipped (the logic is viewport
 * independent, the responsive part is E9).
 *
 * Data: synthetic company and invoices created through the API, removed in afterAll. The E2E
 * database is shared and settings-manage.spec.ts sets/clears the house name concurrently, so
 * where the exact title matters `GET /api/settings` is mocked with a complete
 * HouseholdSettingsResponse. Paperless, the LLM extraction and the linked document are mocked
 * with complete responses. No users are created (login rate limit).
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page, Route } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { API } from '../../fixtures/testData.js';
import { createVendorViaApi, deleteVendorViaApi } from '../../fixtures/apiHelpers.js';
import { installRouteLog, readRouteLog } from '../../fixtures/routeLog.js';
import {
  MOCK_DOC,
  MOCK_EXTRACTED_LINES,
  mockCommitCapturing,
  mockConfig,
  mockCorrespondents,
  mockDocumentDetail,
  mockDocuments,
  mockLinkedIds,
  mockPaperlessConfigured,
  mockPreview,
  mockTags,
} from '../../fixtures/paperlessInvoiceMocks.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { AutoItemizePage } from '../../pages/AutoItemizePage.js';
import { BreadcrumbsBar } from '../../pages/BreadcrumbsBar.js';
import { BudgetOverviewPage } from '../../pages/BudgetOverviewPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { PaperlessInvoiceReviewPage } from '../../pages/PaperlessInvoiceReviewPage.js';
import { VendorDetailPage } from '../../pages/VendorDetailPage.js';

const HOUSE = 'Synthetic House 2203';

const runId = Date.now().toString(36);
const NAMES = {
  company: `PI2203 Builders ${runId}`,
  invoiceNumber: `PI-${runId}`,
};
/** The invoice page h1: ‹company› · ‹number› */
const INVOICE_H1 = `${NAMES.company} · ${NAMES.invoiceNumber}`;
/** The offer has no number: ‹company› · Offer */
const OFFER_H1 = `${NAMES.company} · Offer`;

const seed = { vendorId: '', invoiceId: '', offerId: '' };

const DOC_TITLE = 'PI2203 Split Doc';
const SPLIT_DOC_ID = 62203;

function onProject(...names: string[]): boolean {
  return names.includes(test.info().project.name);
}

/** Mocks `GET /api/settings` (complete HouseholdSettingsResponse) so the house name is known. */
async function mockHouseName(page: Page): Promise<void> {
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ settings: { householdName: HOUSE, householdAddress: null } }),
    });
  });
}

async function createInvoiceViaApi(
  page: Page,
  vendorId: string,
  data: { amount: number; date: string; status: string; invoiceNumber?: string },
): Promise<string> {
  const resp = await page.request.post(`${API.vendors}/${vendorId}/invoices`, { data });
  expect(resp.ok(), `POST invoice failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { invoice: { id: string } };
  return body.invoice.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paperless / Split with AI mocks (complete responses)
// ─────────────────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

/** Linked-document list of one invoice, as returned by GET /api/document-links. */
async function mockInvoiceDocumentLink(page: Page, invoiceId: string): Promise<void> {
  await page.route(
    (url) =>
      url.pathname.endsWith('/api/document-links') &&
      url.searchParams.get('entityType') === 'invoice' &&
      url.searchParams.get('entityId') === invoiceId,
    (route: Route) =>
      route.fulfill(
        json({
          documentLinks: [
            {
              id: 'dl-pi2203',
              entityType: 'invoice',
              entityId: invoiceId,
              paperlessDocumentId: SPLIT_DOC_ID,
              createdBy: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              document: {
                id: SPLIT_DOC_ID,
                title: DOC_TITLE,
                content: null,
                tags: [],
                created: '2026-01-01',
                added: '2026-01-01T00:00:00.000Z',
                modified: '2026-01-01T00:00:00.000Z',
                correspondent: 'Synthetic Correspondent',
                documentType: null,
                archiveSerialNumber: null,
                originalFileName: `invoice-${SPLIT_DOC_ID}.pdf`,
              },
            },
          ],
        }),
      ),
  );
}

/** Paperless document detail plus the auto-itemize dry-run for the Split with AI page. */
async function mockSplitWithAi(page: Page, invoiceId: string): Promise<void> {
  await page.route(`**/paperless/documents/${SPLIT_DOC_ID}`, async (route: Route) => {
    const url = route.request().url();
    if (route.request().method() !== 'GET' || url.includes('/thumb') || url.includes('/preview')) {
      await route.fallback();
      return;
    }
    await route.fulfill(
      json({
        document: {
          id: SPLIT_DOC_ID,
          title: DOC_TITLE,
          content: 'Synthetic OCR content',
          tags: [],
          created: '2026-01-01',
          added: '2026-01-01T00:00:00.000Z',
          modified: '2026-01-01T00:00:00.000Z',
          correspondent: 'Synthetic Correspondent',
          documentType: null,
          archiveSerialNumber: null,
          originalFileName: `invoice-${SPLIT_DOC_ID}.pdf`,
        },
      }),
    );
  });
  await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill(json({ lines: MOCK_EXTRACTED_LINES, warnings: [] }));
  });
}

/** Mocks for the Paperless-first review page; `lines` carry a real budget category. */
async function mockReviewFlow(
  page: Page,
  opts: { suggestedVendorId?: string | null; commitInvoiceId?: string } = {},
) {
  const catResp = await page.request.get(API.budgetCategories);
  expect(catResp.ok(), `GET budget-categories failed: ${catResp.status()}`).toBeTruthy();
  const cats = (await catResp.json()) as { categories: Array<{ id: string }> };
  const categoryId = cats.categories[0]?.id;
  expect(categoryId, 'Expected at least one budget category').toBeTruthy();
  const lines = MOCK_EXTRACTED_LINES.map((l) => ({ ...l, budgetCategoryId: categoryId }));

  await mockPaperlessConfigured(page);
  await mockConfig(page, true);
  await mockCorrespondents(page);
  await mockDocuments(page);
  await mockTags(page);
  await mockLinkedIds(page);
  await mockDocumentDetail(page);
  await mockPreview(page, { suggestedVendorId: opts.suggestedVendorId ?? null, lines });
  return mockCommitCapturing(page, opts.commitInvoiceId);
}

test.describe('Page identity: Money (#2203)', () => {
  test.beforeAll(async ({ browser }) => {
    if (!onProject('desktop', 'mobile')) return;
    const context = await browser.newContext({ storageState: 'test-results/.auth/admin.json' });
    const page = await context.newPage();
    try {
      seed.vendorId = await createVendorViaApi(page, { name: NAMES.company });
      seed.invoiceId = await createInvoiceViaApi(page, seed.vendorId, {
        amount: 1200,
        date: '2026-03-01',
        status: 'pending',
        invoiceNumber: NAMES.invoiceNumber,
      });
      seed.offerId = await createInvoiceViaApi(page, seed.vendorId, {
        amount: 800,
        date: '2026-03-02',
        status: 'quotation',
      });
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!onProject('desktop', 'mobile')) return;
    const context = await browser.newContext({ storageState: 'test-results/.auth/admin.json' });
    const page = await context.newPage();
    try {
      for (const id of [seed.invoiceId, seed.offerId]) {
        if (id && seed.vendorId) {
          await page.request.delete(`${API.vendors}/${seed.vendorId}/invoices/${id}`);
        }
      }
      if (seed.vendorId) await deleteVendorViaApi(page, seed.vendorId);
    } finally {
      await context.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Desktop: E1-E7
  // ───────────────────────────────────────────────────────────────────────────

  test.describe('desktop', () => {
    test.beforeEach(() => {
      test.skip(!onProject('desktop'), 'logic is viewport independent; E9 covers the phone');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E1 — h1 and tab title for every Money route
    // ─────────────────────────────────────────────────────────────────────────

    interface IdentityCase {
      name: string;
      path: () => string;
      h1: (() => string) | string;
      title: (() => string) | string;
    }

    const CASES: IdentityCase[] = [
      {
        // /budget redirects to /budget/overview; the h1 is "Money", never "Budget" (AC6)
        name: 'Budget root (redirects to the overview)',
        path: () => '/budget',
        h1: 'Money',
        title: `Money · ${HOUSE}`,
      },
      {
        name: 'Money overview',
        path: () => routeUrl('budgetOverview'),
        h1: 'Money',
        title: `Money · ${HOUSE}`,
      },
      {
        name: 'Invoices list',
        path: () => routeUrl('invoices'),
        h1: 'Invoices',
        title: `Invoices · Money · ${HOUSE}`,
      },
      {
        name: 'Invoice page',
        path: () => routeUrl('invoice', { id: seed.invoiceId }),
        h1: () => INVOICE_H1,
        title: () => `${INVOICE_H1} · Money · ${HOUSE}`,
      },
      {
        name: 'Offer page (no number)',
        path: () => routeUrl('invoice', { id: seed.offerId }),
        h1: () => OFFER_H1,
        title: () => `${OFFER_H1} · Money · ${HOUSE}`,
      },
      {
        name: 'Funding sources',
        path: () => routeUrl('budgetSources'),
        h1: 'Funding sources',
        title: `Funding sources · Money · ${HOUSE}`,
      },
      {
        name: 'Grants',
        path: () => routeUrl('budgetSubsidies'),
        h1: 'Grants',
        title: `Grants · Money · ${HOUSE}`,
      },
      {
        name: 'Bank report',
        path: () => routeUrl('bankReport'),
        h1: 'Bank report',
        title: `Bank report · Money · ${HOUSE}`,
      },
    ];

    for (const c of CASES) {
      test(`E1: ${c.name} has the right h1 and tab title`, async ({ page }) => {
        await mockHouseName(page);
        await page.goto(c.path());

        const h1 = typeof c.h1 === 'function' ? c.h1() : c.h1;
        const title = typeof c.title === 'function' ? c.title() : c.title;

        const headings = page.getByRole('heading', { level: 1 });
        await expect(headings).toHaveCount(1);
        await expect(headings).toHaveText(h1);
        await expect(page).toHaveTitle(title);
      });
    }

    test('E1: /budget lands on the overview and never shows "Budget" as the h1', async ({
      page,
    }) => {
      await page.goto('/budget');
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('budgetOverview'));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Money');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Budget', exact: true }),
      ).toHaveCount(0);
    });

    test('E1: an unknown invoice keeps the typed 404 h1 and a section title', async ({ page }) => {
      await mockHouseName(page);
      await page.goto(routeUrl('invoice', { id: 'pi-missing-invoice' }));

      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Invoice not found');
      await expect(page).toHaveTitle(`Invoice not found · Money · ${HOUSE}`);
    });

    test('E1: the New invoice page has the h1 "New invoice" once the review is loaded', async ({
      page,
    }) => {
      await mockHouseName(page);
      await mockReviewFlow(page);
      const reviewPage = new PaperlessInvoiceReviewPage(page);

      await reviewPage.goto(MOCK_DOC.id);
      await reviewPage.waitForExtractionComplete();

      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(reviewPage.heading).toHaveText('New invoice');
      await expect(page).toHaveTitle(`New invoice · Money · ${HOUSE}`);
    });

    test('E1: Split with AI has the h1 "Split with AI" once the invoice is loaded', async ({
      page,
    }) => {
      await mockHouseName(page);
      await mockConfig(page, true);
      await mockSplitWithAi(page, seed.invoiceId);
      const splitPage = new AutoItemizePage(page);

      await splitPage.goto(seed.invoiceId, SPLIT_DOC_ID);
      await splitPage.waitForAnalyzingDone();

      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(splitPage.pageTitle).toHaveText('Split with AI');
      await expect(page).toHaveTitle(`Split with AI · Money · ${HOUSE}`);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E1b — the h1 does not change while the extraction runs
    // ─────────────────────────────────────────────────────────────────────────

    test('E1b: New invoice keeps its h1 while the extraction loads; the wording is a status line', async ({
      page,
    }) => {
      await mockHouseName(page);
      await mockReviewFlow(page);

      // Gate the extraction so the transient loading state can be asserted deterministically.
      // Registered after mockReviewFlow, so it runs first and hands over to the complete mock.
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/api/invoices/auto-itemize/preview', async (route: Route) => {
        await gate;
        await route.fallback();
      });

      const reviewPage = new PaperlessInvoiceReviewPage(page);
      try {
        await reviewPage.goto(MOCK_DOC.id);

        // Loading: same h1 and title as the loaded page, the wording is a status line
        await expect(reviewPage.heading).toHaveText('New invoice');
        await expect(reviewPage.spinner).toHaveText('Analyzing document with AI…');
        await expect(reviewPage.formColumn).toBeHidden();
        await expect(page).toHaveTitle(`New invoice · Money · ${HOUSE}`);
      } finally {
        release();
      }

      // Loaded: the h1 is unchanged, the status line now reports the result
      await reviewPage.waitForExtractionComplete();
      await expect(reviewPage.heading).toHaveText('New invoice');
      await expect(reviewPage.statusLine).toContainText('Extraction complete');
      await expect(reviewPage.spinner).toHaveCount(0);
    });

    test('E1b: New invoice without a document id keeps the h1 and explains what to do', async ({
      page,
    }) => {
      await mockHouseName(page);
      await mockPaperlessConfigured(page);
      await mockConfig(page, true);
      const reviewPage = new PaperlessInvoiceReviewPage(page);

      await reviewPage.goto();

      await expect(reviewPage.heading).toHaveText('New invoice');
      await expect(page).toHaveTitle(`New invoice · Money · ${HOUSE}`);
      await expect(
        page.getByText('Go back to Invoices and choose a document to start a new invoice from it.'),
      ).toBeVisible();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E2 — breadcrumbs: parents only
    // ─────────────────────────────────────────────────────────────────────────

    test('E2: the invoice page shows "Money › Invoices" and never its own name', async ({
      page,
    }) => {
      const detail = new InvoiceDetailPage(page);
      await detail.goto(seed.invoiceId);

      await expect(detail.heading).toHaveText(INVOICE_H1);
      await detail.breadcrumbs.expectTrail(['Money', 'Invoices']);
      await detail.breadcrumbs.expectNoBack();
    });

    test('E2: Split with AI shows "Money › Invoices › <invoice>" once the invoice has loaded', async ({
      page,
    }) => {
      await mockConfig(page, true);
      await mockSplitWithAi(page, seed.invoiceId);
      const splitPage = new AutoItemizePage(page);

      await splitPage.goto(seed.invoiceId, SPLIT_DOC_ID);
      await splitPage.waitForAnalyzingDone();

      await splitPage.breadcrumbs.expectTrail(['Money', 'Invoices', INVOICE_H1]);
      await splitPage.breadcrumbs.expectNoBack();
    });

    test('E2: the New invoice page shows "Money › Invoices"', async ({ page }) => {
      await mockReviewFlow(page);
      const reviewPage = new PaperlessInvoiceReviewPage(page);
      const bc = new BreadcrumbsBar(page);

      await reviewPage.goto(MOCK_DOC.id);
      await reviewPage.waitForExtractionComplete();

      await bc.expectTrail(['Money', 'Invoices']);
    });

    for (const [label, route] of [
      ['Funding sources', () => routeUrl('budgetSources')],
      ['Grants', () => routeUrl('budgetSubsidies')],
      ['Bank report', () => routeUrl('bankReport')],
    ] as Array<[string, () => string]>) {
      test(`E2: ${label} shows the single parent "Money"`, async ({ page }) => {
        const bc = new BreadcrumbsBar(page);
        await page.goto(route());
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);

        await bc.expectTrail(['Money']);
        await bc.expectNoBack();
      });
    }

    test('E2: the Money overview and the Invoices list are views and show no breadcrumbs', async ({
      page,
    }) => {
      const bc = new BreadcrumbsBar(page);

      await page.goto(routeUrl('budgetOverview'));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Money');
      await expect(bc.row).toHaveCount(0);
      await bc.expectNoTrail();
      await bc.expectNoBack();

      await page.goto(routeUrl('invoices'));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Invoices');
      await expect(bc.row).toHaveCount(0);
      await bc.expectNoTrail();
    });

    test('E2: the "Invoices" trail link of an invoice leads to the Invoices list', async ({
      page,
    }) => {
      const detail = new InvoiceDetailPage(page);
      await detail.goto(seed.invoiceId);

      await detail.breadcrumbs.trailLink('Invoices').click();

      await expect(page).toHaveURL((url) => url.pathname === routeUrl('invoices'));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Invoices');
    });

    test('E2: the "Money" trail link of Funding sources leads to the Money overview', async ({
      page,
    }) => {
      const bc = new BreadcrumbsBar(page);
      await page.goto(routeUrl('budgetSources'));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Funding sources');

      await bc.trailLink('Money').click();

      await expect(page).toHaveURL((url) => url.pathname === routeUrl('budgetOverview'));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Money');
    });

    test('E2: the company page shows the trail "Companies" and no "Back to Vendors" button', async ({
      page,
    }) => {
      const vendorPage = new VendorDetailPage(page);
      await vendorPage.goto(seed.vendorId);
      await expect(vendorPage.pageTitle).toHaveText(NAMES.company);

      await vendorPage.breadcrumbs.expectTrail(['Companies']);
      await expect(page.getByRole('button', { name: /back to vendors/i })).toHaveCount(0);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E3 — AC4: an invoice opened from a company page
    // ─────────────────────────────────────────────────────────────────────────

    test('E3: an invoice opened from its company page offers "Back to <company>", kept on reload and gone on a fresh visit', async ({
      page,
    }) => {
      const vendorPage = new VendorDetailPage(page);
      const detail = new InvoiceDetailPage(page);
      const openInvoice = page.getByRole('button', {
        name: `Edit invoice ${NAMES.invoiceNumber}`,
      });

      await vendorPage.goto(seed.vendorId);
      await expect(vendorPage.pageTitle).toHaveText(NAMES.company);
      await vendorPage.breadcrumbs.expectTrail(['Companies']);

      await openInvoice.click();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('invoice', { id: seed.invoiceId }),
      );
      await expect(detail.heading).toHaveText(INVOICE_H1);
      await detail.breadcrumbs.expectBack(NAMES.company);
      await detail.breadcrumbs.expectTrail(['Money', 'Invoices']);

      // History state survives a reload ...
      await page.reload();
      await expect(detail.heading).toHaveText(INVOICE_H1);
      await detail.breadcrumbs.expectBack(NAMES.company);

      // ... a fresh navigation (a copied link, opened in a new tab) has no origin. A same-URL
      // page.goto() would keep the entry's history state, so it is not a fresh visit.
      const freshPage = await page.context().newPage();
      try {
        const freshBc = new BreadcrumbsBar(freshPage);
        await freshPage.goto(page.url());
        await expect(freshPage.getByRole('heading', { level: 1 })).toHaveText(INVOICE_H1);
        await freshBc.expectNoBack();
        await freshBc.expectTrail(['Money', 'Invoices']);
      } finally {
        await freshPage.close();
      }

      // Back returns to the company page
      await detail.breadcrumbs.backLink.click();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('vendor', { id: seed.vendorId }),
      );
      await expect(vendorPage.pageTitle).toHaveText(NAMES.company);
    });

    test('E3: the company link on an invoice page opens the company with "Back to <invoice>"', async ({
      page,
    }) => {
      // Invoice page -> company link: the company page gets the invoice as its origin
      const detail = new InvoiceDetailPage(page);
      const vendorPage = new VendorDetailPage(page);
      await detail.goto(seed.invoiceId);

      await page.getByRole('link', { name: NAMES.company, exact: true }).first().click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('vendor', { id: seed.vendorId }),
      );
      await expect(vendorPage.pageTitle).toHaveText(NAMES.company);
      await vendorPage.breadcrumbs.expectBack(INVOICE_H1);
      await vendorPage.breadcrumbs.expectTrail(['Companies']);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E4 — no Back from the parent list
    // ─────────────────────────────────────────────────────────────────────────

    test('E4: an invoice opened from the Invoices list has no Back, only the trail', async ({
      page,
    }) => {
      const invoicesPage = new InvoicesPage(page);
      const detail = new InvoiceDetailPage(page);

      await invoicesPage.search(NAMES.invoiceNumber);
      await invoicesPage.tableBody.getByRole('link', { name: NAMES.invoiceNumber }).click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('invoice', { id: seed.invoiceId }),
      );
      await expect(detail.heading).toHaveText(INVOICE_H1);
      await detail.breadcrumbs.expectNoBack();
      await detail.breadcrumbs.expectTrail(['Money', 'Invoices']);
    });

    test('E4: the company link in an Invoices row opens only the company, with "Back to Invoices"', async ({
      page,
    }) => {
      const invoicesPage = new InvoicesPage(page);
      const vendorPage = new VendorDetailPage(page);

      await invoicesPage.search(NAMES.invoiceNumber);
      const row = invoicesPage.tableBody.getByRole('row').filter({ hasText: NAMES.invoiceNumber });
      // Scoped to the row: the link is resolved relative to it
      await row.getByRole('link', { name: NAMES.company, exact: true }).click();

      await expect(page).toHaveURL(new RegExp(`/settings/vendors/${seed.vendorId}$`));
      await expect(vendorPage.pageTitle).toHaveText(NAMES.company);
      await vendorPage.breadcrumbs.expectBack('Invoices');

      // No extra invoice entry was pushed by the row click
      await page.goBack();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('invoices'));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E5 — history: filters and tabs replace, nothing pushes on mount
    // ─────────────────────────────────────────────────────────────────────────

    test('E5: Invoices list filters replace the URL and never push', async ({ page }) => {
      const invoicesPage = new InvoicesPage(page);
      await installRouteLog(page);

      await invoicesPage.goto();
      await invoicesPage.waitForLoaded();
      await invoicesPage.setOpenItemsOnly(true);
      await expect(page).toHaveURL(/openOnly=true/);
      await invoicesPage.typeSearch(NAMES.invoiceNumber);
      await expect(page).toHaveURL(/q=/);

      const log = await readRouteLog(page);
      expect(log.filter((entry) => entry.kind === 'pushState')).toEqual([]);
      expect(log.filter((entry) => entry.kind === 'replaceState').length).toBeGreaterThan(0);
    });

    test('E5: changing the cost basis on the Money overview replaces and sets paymentStatus', async ({
      page,
    }) => {
      const overviewPage = new BudgetOverviewPage(page);
      await installRouteLog(page);

      await overviewPage.goto();
      await overviewPage.waitForLoaded();
      await overviewPage.costBasisSelect.selectOption('paid');
      await expect(page).toHaveURL(/paymentStatus=paid/);

      const log = await readRouteLog(page);
      expect(log.filter((entry) => entry.kind === 'pushState')).toEqual([]);
      const replaced = log.filter((entry) => entry.kind === 'replaceState');
      expect(replaced.some((entry) => entry.url.includes('paymentStatus=paid'))).toBe(true);
    });

    test('E5: switching the Money view replaces, so Back leaves the Money pages entirely', async ({
      page,
    }) => {
      const overviewPage = new BudgetOverviewPage(page);
      const appShell = new AppShellPage(page);
      await installRouteLog(page);

      await page.goto(routeUrl('workItems'));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tasks');

      await page.goto(routeUrl('budgetOverview'));
      await expect(overviewPage.heading).toBeVisible();
      await appShell.openView('invoices');
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('invoices'));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Invoices');

      // Switching views inside the section replaces (ADR-038 rule 8): nothing is pushed
      const log = await readRouteLog(page);
      expect(log.filter((entry) => entry.kind === 'pushState')).toEqual([]);
      expect(
        log.some(
          (entry) =>
            entry.kind === 'replaceState' && new URL(entry.url).pathname === routeUrl('invoices'),
        ),
      ).toBe(true);

      await page.goBack();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('workItems'));
    });

    const MOUNT_CASES: Array<[string, () => string]> = [
      ['the Money overview', () => routeUrl('budgetOverview')],
      ['the Invoices list', () => routeUrl('invoices')],
      ['an invoice page', () => routeUrl('invoice', { id: seed.invoiceId })],
      ['Funding sources', () => routeUrl('budgetSources')],
      ['Grants', () => routeUrl('budgetSubsidies')],
      ['the Bank report', () => routeUrl('bankReport')],
      ['a company page', () => routeUrl('vendor', { id: seed.vendorId })],
    ];
    for (const [label, route] of MOUNT_CASES) {
      test(`E5: opening ${label} pushes nothing after load`, async ({ page }) => {
        await installRouteLog(page);
        await page.goto(route());
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.waitForLoadState('networkidle');

        const log = await readRouteLog(page);
        expect(log.filter((entry) => entry.kind === 'pushState')).toEqual([]);
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // E6 — creating an invoice from a document replaces the review page
    // ─────────────────────────────────────────────────────────────────────────

    test('E6: after Create the review page is replaced, so Back never re-runs the extraction', async ({
      page,
    }) => {
      // The commit mock answers with the seeded invoice, so the invoice page loads for real.
      const commits = await mockReviewFlow(page, {
        suggestedVendorId: seed.vendorId,
        commitInvoiceId: seed.invoiceId,
      });
      const invoicesPage = new InvoicesPage(page);
      const reviewPage = new PaperlessInvoiceReviewPage(page);
      const detail = new InvoiceDetailPage(page);

      await invoicesPage.goto();
      await invoicesPage.waitForLoaded();
      await invoicesPage.clickNewInvoice();
      const picker = await invoicesPage.waitForPickerModal();
      await picker.selectDocument(MOCK_DOC.title);
      await page.waitForURL(/\/budget\/invoices\/new\/paperless\?documentId=\d+$/);
      await reviewPage.waitForExtractionComplete();

      await reviewPage.confirm();
      await expect.poll(() => commits.bodies.length).toBe(1);

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('invoice', { id: seed.invoiceId }),
      );
      await expect(detail.heading).toHaveText(INVOICE_H1);
      // The Invoices list was the origin and is also the parent: no extra Back link
      await detail.breadcrumbs.expectNoBack();

      await page.goBack();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('invoices'));
      await expect(invoicesPage.heading).toBeVisible();
    });

    test('E6: Cancel on the review page replaces it and returns to the Invoices list', async ({
      page,
    }) => {
      await mockReviewFlow(page);
      const invoicesPage = new InvoicesPage(page);
      const reviewPage = new PaperlessInvoiceReviewPage(page);

      await invoicesPage.goto();
      await invoicesPage.waitForLoaded();
      await invoicesPage.clickNewInvoice();
      const picker = await invoicesPage.waitForPickerModal();
      await picker.selectDocument(MOCK_DOC.title);
      await page.waitForURL(/\/budget\/invoices\/new\/paperless\?documentId=\d+$/);
      await reviewPage.waitForExtractionComplete();

      await reviewPage.cancelButton.click();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('invoices'));
      await expect(invoicesPage.heading).toBeVisible();

      // The review page is gone from history: Back does not return to it
      await page.goBack();
      await expect(page).not.toHaveURL(/\/budget\/invoices\/new\/paperless/);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E7 — Split with AI returns to the invoice without a duplicate entry
    // ─────────────────────────────────────────────────────────────────────────

    test('E7: Cancel on Split with AI returns to the invoice and leaves no duplicate history entry', async ({
      page,
    }) => {
      await mockConfig(page, true);
      await mockInvoiceDocumentLink(page, seed.invoiceId);
      await mockSplitWithAi(page, seed.invoiceId);
      const invoicesPage = new InvoicesPage(page);
      const detail = new InvoiceDetailPage(page);
      const splitPage = new AutoItemizePage(page);
      const invoiceUrl = routeUrl('invoice', { id: seed.invoiceId });

      // list -> invoice -> Split with AI
      await invoicesPage.search(NAMES.invoiceNumber);
      await invoicesPage.tableBody.getByRole('link', { name: NAMES.invoiceNumber }).click();
      await expect(page).toHaveURL((url) => url.pathname === invoiceUrl);
      await expect(detail.heading).toHaveText(INVOICE_H1);

      await detail.itemizeButton(DOC_TITLE).click();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname ===
          routeUrl('invoiceAutoItemize', {
            id: seed.invoiceId,
            documentId: SPLIT_DOC_ID,
          }),
      );
      await splitPage.waitForAnalyzingDone();
      await expect(splitPage.pageTitle).toHaveText('Split with AI');
      await splitPage.breadcrumbs.expectTrail(['Money', 'Invoices', INVOICE_H1]);
      await splitPage.breadcrumbs.expectNoBack();

      // Clean Cancel: one step back to the invoice (no new entry on top of it)
      await splitPage.cancelButton.click();
      await expect(page).toHaveURL((url) => url.pathname === invoiceUrl);
      await expect(detail.heading).toHaveText(INVOICE_H1);

      // One more Back leaves the invoice, so the invoice is not in history twice
      await page.goBack();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('invoices'));
    });

    test('E7: Split with AI opened by URL replaces itself with the invoice on Cancel', async ({
      page,
    }) => {
      await mockConfig(page, true);
      await mockSplitWithAi(page, seed.invoiceId);
      const detail = new InvoiceDetailPage(page);
      const splitPage = new AutoItemizePage(page);

      // Direct visit: no origin, so Cancel replaces the page by the invoice
      await page.goto(routeUrl('invoices'));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Invoices');
      await splitPage.goto(seed.invoiceId, SPLIT_DOC_ID);
      await splitPage.waitForAnalyzingDone();

      await splitPage.cancelButton.click();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('invoice', { id: seed.invoiceId }),
      );
      await expect(detail.heading).toHaveText(INVOICE_H1);

      await page.goBack();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('invoices'));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Phone: E9
  // ───────────────────────────────────────────────────────────────────────────

  test.describe('phone', () => {
    test.beforeEach(() => {
      test.skip(!onProject('mobile'), 'phone rules only apply to the mobile project');
    });

    test('E9: an invoice opened from its company page shows one element: "Back to <company>", 44px tall', async ({
      page,
    }) => {
      const vendorPage = new VendorDetailPage(page);
      const detail = new InvoiceDetailPage(page);

      await vendorPage.goto(seed.vendorId);
      await expect(vendorPage.pageTitle).toHaveText(NAMES.company);
      await page.getByRole('button', { name: `Edit invoice ${NAMES.invoiceNumber}` }).click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('invoice', { id: seed.invoiceId }),
      );
      await expect(detail.heading).toHaveText(INVOICE_H1);
      await detail.breadcrumbs.expectBack(NAMES.company);
      // The trail is not shown next to Back on a phone
      await expect(detail.breadcrumbs.nav).toBeHidden();
      await expect(detail.breadcrumbs.row.getByRole('link')).toHaveCount(1);

      const box = await detail.breadcrumbs.backLink.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    });

    test('E9: an invoice opened from the list shows one element: "‹ Invoices", 44px tall', async ({
      page,
    }) => {
      const invoicesPage = new InvoicesPage(page);
      const detail = new InvoiceDetailPage(page);

      await invoicesPage.search(NAMES.invoiceNumber);
      await page
        .getByRole('main')
        .getByRole('link', { name: NAMES.invoiceNumber, exact: true })
        .click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('invoice', { id: seed.invoiceId }),
      );
      await expect(detail.heading).toHaveText(INVOICE_H1);
      await detail.breadcrumbs.expectNoBack();
      await expect(detail.breadcrumbs.row.getByRole('link')).toHaveCount(1);
      const link = detail.breadcrumbs.trailLink('Invoices');
      await expect(link).toBeVisible();
      await expect(link).toHaveText('‹Invoices');

      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    });

    test('E9: a two-level trail shows only the nearest parent on a phone', async ({ page }) => {
      const bc = new BreadcrumbsBar(page);
      await page.goto(routeUrl('invoice', { id: seed.invoiceId }));

      await bc.expectTrail(['Money', 'Invoices']);
      await expect(bc.trailLink('Invoices')).toBeVisible();
      await expect(bc.row.getByRole('link')).toHaveCount(1);
    });

    test('E9: Funding sources shows the single parent "‹ Money" on a phone', async ({ page }) => {
      const bc = new BreadcrumbsBar(page);
      await page.goto(routeUrl('budgetSources'));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Funding sources');

      await bc.expectTrail(['Money']);
      await expect(bc.row.getByRole('link')).toHaveCount(1);
    });
  });
});
