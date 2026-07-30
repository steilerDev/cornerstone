/**
 * E2E tests for the Bank Report Wizard (Story #1879 — `/budget/reports`).
 *
 * Covers:
 * - Scenario 1: Full "claim" walk (desktop) — seed, exclude, preview toggles, download,
 *   mark-claimed confirm/success, and the resulting invoice statuses on /budget/invoices.
 * - Scenario 2: Budget-overview report smoke (quotation invoices included).
 * - Scenario 3: Proof-of-funds report smoke (claimed invoices only).
 * - Scenario 4: Empty state (zero-match use case/source combo).
 * - Scenario 5: Upload to Paperless (configured + reachable, mocked).
 * - Scenario 6: Upload hidden when Paperless unconfigured.
 * - Scenario 7: `?sourceId=` prefill.
 * - Scenario 8: Route smoke — heading + stepper render across viewports (@responsive).
 * - Scenario 9: Forward-lock — unreached steps are non-interactive.
 * - Scenario 10: Mobile stepper layout.
 * - Scenario 11: Cross-story integration — a refund entry (Issue #1876) surfaces as a
 *   negative line in a generated claim report.
 *
 * NOTE ON CURRENT IMPLEMENTATION STATE: as of this story, `ReportWizardPage.tsx` calls
 * `setBudgetSources(sources)` with the raw `fetchBudgetSources()` response
 * (`{ budgetSources: BudgetSource[] }`), not the `BudgetSource[]` array the rest of the
 * component expects — every `budgetSources.map/.find/.sort` call (starting with the very
 * first use-case selection in `handleUseCaseChange`) throws `TypeError: budgetSources.map is
 * not a function` at runtime, which prevents the wizard from ever reaching a working Step 2.
 * This is filed as a Blocker bug (see PR/issue) and is expected to make every scenario below
 * that progresses past Step 1 fail until fixed — the tests assert the SPEC-CONFORMANT
 * behavior per the test-failure-debugging protocol (correct tests are not weakened to
 * accommodate buggy code) and will pass once the fix lands.
 *
 * PDF generation (pdfmake + pdf-lib via dynamic `import()`) can be slow, especially on a
 * cold chunk load — every scenario that reaches Step 4 uses `test.slow()`.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { ReportWizardPage } from '../../pages/ReportWizardPage.js';
import { InvoicesPage, INVOICES_ROUTE } from '../../pages/InvoicesPage.js';
import { API } from '../../fixtures/testData.js';
import {
  createVendorViaApi,
  deleteVendorViaApi,
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
  createWorkItemViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers (local — mirrors the pattern used by invoices.spec.ts /
// invoice-deposits.spec.ts / invoice-budget-line-area-breadcrumb.spec.ts; these
// endpoints don't have shared fixtures/apiHelpers.ts entries yet)
// ─────────────────────────────────────────────────────────────────────────────

interface InvoiceApiResponse {
  id: string;
  invoiceNumber: string | null;
  amount: number;
  status: string;
  vendorId: string;
}

async function createInvoiceViaApi(
  page: Page,
  vendorId: string,
  data: {
    invoiceNumber?: string;
    amount: number;
    date: string;
    status?: 'pending' | 'paid' | 'claimed' | 'quotation';
  },
): Promise<InvoiceApiResponse> {
  const response = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', ...data },
  });
  expect(response.ok(), `POST invoice failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { invoice: InvoiceApiResponse };
  return body.invoice;
}

async function createWorkItemBudgetViaApi(
  page: Page,
  workItemId: string,
  data: { plannedAmount: number; budgetSourceId: string; description?: string },
): Promise<string> {
  const response = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
    data: { confidence: 'own_estimate', ...data },
  });
  expect(response.ok(), `POST work item budget for ${workItemId}`).toBeTruthy();
  const body = (await response.json()) as { budget: { id: string } };
  return body.budget.id;
}

async function linkInvoiceToBudgetLineViaApi(
  page: Page,
  invoiceId: string,
  data: { workItemBudgetId: string; itemizedAmount: number },
): Promise<void> {
  const response = await page.request.post(`/api/invoices/${invoiceId}/budget-lines`, {
    data,
  });
  expect(response.ok(), `POST invoice budget line for ${invoiceId}`).toBeTruthy();
}

/** Creates an invoice fully allocated (single line, no split) to `sourceId` via `workItemId`. */
async function seedAllocatedInvoice(
  page: Page,
  workItemId: string,
  vendorId: string,
  sourceId: string,
  data: {
    invoiceNumber: string;
    amount: number;
    date: string;
    status: 'pending' | 'paid' | 'claimed' | 'quotation';
  },
): Promise<InvoiceApiResponse> {
  const invoice = await createInvoiceViaApi(page, vendorId, data);
  const budgetId = await createWorkItemBudgetViaApi(page, workItemId, {
    plannedAmount: data.amount,
    budgetSourceId: sourceId,
  });
  await linkInvoiceToBudgetLineViaApi(page, invoice.id, {
    workItemBudgetId: budgetId,
    itemizedAmount: data.amount,
  });
  return invoice;
}

async function createDepositViaApi(
  page: Page,
  invoiceId: string,
  data: {
    amount: number;
    dueDate: string;
    status?: 'pending' | 'paid' | 'claimed';
    entryType?: 'deposit' | 'refund';
  },
): Promise<{ id: string }> {
  const response = await page.request.post(`/api/invoices/${invoiceId}/deposits`, {
    data: { status: 'pending', ...data },
  });
  expect(response.ok(), `POST deposit failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { deposit: { id: string } };
  return body.deposit;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paperless mocking helpers (established convention — see
// invoices/paperless-first-invoice.spec.ts)
// ─────────────────────────────────────────────────────────────────────────────

const PAPERLESS_BASE_URL = 'http://paperless.local:8000';

async function mockPaperlessConfigured(page: Page): Promise<void> {
  await page.route(`**${API.paperlessStatus}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: PAPERLESS_BASE_URL,
        filterTag: null,
      }),
    });
  });
}

async function mockPaperlessNotConfigured(page: Page): Promise<void> {
  await page.route(`**${API.paperlessStatus}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: false,
        reachable: false,
        error: null,
        paperlessUrl: null,
        filterTag: null,
      }),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Full claim walk (desktop)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard — claim walk (Scenario 1)', () => {
  test('Full claim flow: select, exclude, preview, download, mark claimed', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceAId = '';
    let workItemId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Claim Vendor` });
      sourceAId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Source A`,
        totalAmount: 50000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Claim` });

      const pending1 = await seedAllocatedInvoice(page, workItemId, vendorId, sourceAId, {
        invoiceNumber: `${testPrefix}-CLM-001`,
        amount: 500,
        date: '2026-02-01',
        status: 'pending',
      });
      const pending2 = await seedAllocatedInvoice(page, workItemId, vendorId, sourceAId, {
        invoiceNumber: `${testPrefix}-CLM-002`,
        amount: 700,
        date: '2026-02-02',
        status: 'pending',
      });
      const paid = await seedAllocatedInvoice(page, workItemId, vendorId, sourceAId, {
        invoiceNumber: `${testPrefix}-CLM-003`,
        amount: 1200,
        date: '2026-02-03',
        status: 'paid',
      });
      // Not claimable (irrelevant to the "claim" report — pending+paid only) — proves the
      // report correctly excludes it.
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceAId, {
        invoiceNumber: `${testPrefix}-CLM-004`,
        amount: 900,
        date: '2026-02-04',
        status: 'claimed',
      });

      await wizard.goto();
      await wizard.selectUseCase('claim');
      await wizard.goNextFromStep1();

      await expect(wizard.sourceRadioGroup).toBeVisible();
      await wizard.selectSource(sourceAId);
      await wizard.goNextFromStep2();

      // Step 3: only pending+paid invoices shown, select-all default (all 3 included).
      await expect(
        wizard.regularInvoiceRow(`${testPrefix} Claim Vendor`, pending1.invoiceNumber!),
      ).toBeVisible();
      await expect(
        wizard.regularInvoiceRow(`${testPrefix} Claim Vendor`, pending2.invoiceNumber!),
      ).toBeVisible();
      await expect(
        wizard.regularInvoiceRow(`${testPrefix} Claim Vendor`, paid.invoiceNumber!),
      ).toBeVisible();
      await expect(
        wizard.invoiceRow(`${testPrefix} Claim Vendor`, `${testPrefix}-CLM-004`),
      ).toHaveCount(0);
      for (const row of [pending1, pending2, paid]) {
        await expect(
          wizard.invoiceRowCheckbox(`${testPrefix} Claim Vendor`, row.invoiceNumber!),
        ).toBeChecked();
      }

      // Exclude pending1 — running total should drop from 2400 to 1900 (grouped format).
      await wizard.toggleInvoiceExclusion(`${testPrefix} Claim Vendor`, pending1.invoiceNumber!);
      await expect(
        wizard.invoiceRowCheckbox(`${testPrefix} Claim Vendor`, pending1.invoiceNumber!),
      ).not.toBeChecked();
      await expect(wizard.selectionCountLabel).toContainText('1,900');

      await wizard.goNextFromStep3();

      // Step 4: preview generates on entry.
      await wizard.waitForPreviewReady();

      // Toggle attach documents off then on — each toggle produces a genuinely new preview
      // (proven by the iframe's blob: src changing, not by the loading spinner's transient
      // visibility — see waitForPreviewRegenerated's docstring for why).
      let previousSrc = await wizard.getPreviewSrc();
      await wizard.toggleAttachDocuments();
      await wizard.waitForPreviewRegenerated(previousSrc);

      previousSrc = await wizard.getPreviewSrc();
      await wizard.toggleAttachDocuments();
      await wizard.waitForPreviewRegenerated(previousSrc);

      // Toggle cover letter off then on — same regeneration proof.
      previousSrc = await wizard.getPreviewSrc();
      await wizard.toggleCoverLetter();
      await wizard.waitForPreviewRegenerated(previousSrc);

      previousSrc = await wizard.getPreviewSrc();
      await wizard.toggleCoverLetter();
      await wizard.waitForPreviewRegenerated(previousSrc);

      // Download — filename `claim-<slug>-<date>.pdf`.
      const today = new Date().toISOString().slice(0, 10);
      const slug = `${testPrefix} Source A`
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');
      const download = await wizard.download();
      expect(download.suggestedFilename()).toBe(`claim-${slug}-${today}.pdf`);

      // Mark claimed: modal states pending count (1 pending2 + 1 paid = 2 included, 1 pending).
      await wizard.clickMarkClaimed();
      await expect(wizard.claimConfirmModalBody).toContainText(
        'This will mark 2 invoice(s) as claimed (1 pending)',
      );
      await wizard.confirmClaim();

      // Success banner + link to /budget/invoices (Frontend/E2E spec — see filed bug report
      // if this fails: current implementation hardcodes count:0 and renders no link).
      await expect(wizard.claimSuccessBanner).toBeVisible();
      await expect(wizard.claimSuccessBanner).toContainText('2 invoice(s) marked as claimed');
      await expect(wizard.claimSuccessInvoicesLink).toBeVisible();
      await wizard.claimSuccessInvoicesLink.click();
      await expect(page).toHaveURL(new RegExp(INVOICES_ROUTE));

      // Post-mutation assertion discipline: verify actual statuses via the Invoices page,
      // not just the wizard's own optimistic UI.
      const invoicesPage = new InvoicesPage(page);
      await invoicesPage.goto();
      await invoicesPage.search(pending2.invoiceNumber!);
      await expect(page.getByText(/claimed/i).first()).toBeVisible();
      await invoicesPage.search(pending1.invoiceNumber!);
      await expect(page.getByText(/^pending$/i).first()).toBeVisible();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceAId) await deleteBudgetSourceViaApi(page, sourceAId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Budget overview smoke
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard — budget overview smoke (Scenario 2)', () => {
  test('Quotation invoices appear in step 3 and reach a downloadable step 4', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Overview Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Overview Source`,
        totalAmount: 20000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Overview` });

      const quotation = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-OV-001`,
        amount: 300,
        date: '2026-03-01',
        status: 'quotation',
      });

      await wizard.goto();
      await wizard.selectUseCase('budget-overview');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();

      await expect(
        wizard.regularInvoiceRow(`${testPrefix} Overview Vendor`, quotation.invoiceNumber!),
      ).toBeVisible();

      await wizard.goNextFromStep3();
      await wizard.waitForPreviewReady();
      await expect(wizard.downloadButton).toBeEnabled();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Proof of funds smoke
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard — proof of funds smoke (Scenario 3)', () => {
  test('Only claimed invoices appear in the proof-of-funds report', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} PoF Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} PoF Source`,
        totalAmount: 20000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI PoF` });

      const claimed = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-POF-001`,
        amount: 400,
        date: '2026-03-05',
        status: 'claimed',
      });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-POF-002`,
        amount: 400,
        date: '2026-03-06',
        status: 'pending',
      });

      await wizard.goto();
      await wizard.selectUseCase('proof-of-funds');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();

      await expect(
        wizard.regularInvoiceRow(`${testPrefix} PoF Vendor`, claimed.invoiceNumber!),
      ).toBeVisible();
      await expect(
        wizard.invoiceRow(`${testPrefix} PoF Vendor`, `${testPrefix}-POF-002`),
      ).toHaveCount(0);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Empty state
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard — empty state (Scenario 4)', () => {
  // NOTE: the wizard's <EmptyState> only renders when BOTH this source's allocated invoices
  // AND the *household-wide* unallocated-invoice list are empty (`ReportInvoiceList.tsx`:
  // `allocatedInvoices.length === 0 && unallocatedInvoices.length === 0`) — the unallocated
  // list is a global query with no source scoping at all
  // (`sourceReportService.ts`'s `unallocRows` query has no `budget_source_id` filter). Under
  // full parallel CI (8 workers × 3 viewports, dozens of concurrent spec files creating
  // pending/paid invoices), the household-wide unallocated count is usually non-zero, so the
  // <EmptyState> component itself is NOT reliably reachable in this environment — the only
  // thing deterministic for a freshly created, never-allocated source is that ITS OWN
  // allocated list is empty. Assert that directly, and branch on whichever of the two valid
  // renders actually occurred (EmptyState vs. a zero-row list with a disabled Next) rather
  // than assuming one is always reachable.
  test('A source with zero allocated invoices shows no rows and no crash, regardless of global unallocated noise', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);

    let sourceId = '';
    try {
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Empty Source`,
        totalAmount: 5000,
      });

      await wizard.goto();
      await wizard.selectUseCase('claim');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();

      // Wait for the report to actually finish loading (either terminal render is fine —
      // the Skeleton placeholder renders zero rows too, which would otherwise false-pass the
      // count assertion below before real data arrives).
      await wizard.emptyState.or(wizard.selectAllCheckbox).waitFor({ state: 'visible' });
      await expect(wizard.invoiceRows).toHaveCount(0);

      if (await wizard.emptyState.isVisible()) {
        // No unallocated invoices exist household-wide right now — the EmptyState branch.
        await expect(wizard.emptyState).toBeVisible();
      } else {
        // Other concurrent tests' unallocated invoices keep the list rendered — the
        // zero-allocated-rows branch, proven via the selection bar and disabled Next.
        await expect(wizard.selectionCountLabel).toContainText('0 of 0');
        await expect(wizard.step3NextButton).toBeDisabled();
      }
    } finally {
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 & 6: Paperless upload gating
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard — Paperless upload (Scenarios 5 & 6)', () => {
  test('Upload to Paperless is visible and posts a multipart request when configured+reachable', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';

    try {
      await mockPaperlessConfigured(page);
      let uploadRequestReceived = false;
      await page.route(`**${API.paperlessDocuments}`, async (route) => {
        const request = route.request();
        uploadRequestReceived =
          request.method() === 'POST' &&
          (request.headers()['content-type'] || '').includes('multipart/form-data');
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ taskId: 'task-e2e-1879' }),
        });
      });

      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Upload Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Upload Source`,
        totalAmount: 20000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Upload` });
      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-UP-001`,
        amount: 250,
        date: '2026-03-10',
        status: 'pending',
      });

      await wizard.goto();
      await wizard.selectUseCase('claim');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();
      await expect(
        wizard.regularInvoiceRow(`${testPrefix} Upload Vendor`, invoice.invoiceNumber!),
      ).toBeVisible();
      await wizard.goNextFromStep3();
      await wizard.waitForPreviewReady();

      await expect(wizard.uploadPaperlessButton).toBeVisible();
      await wizard.clickUploadToPaperless();

      await expect(async () => {
        expect(uploadRequestReceived).toBe(true);
      }).toPass({ timeout: 5_000 });
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Upload to Paperless is absent when Paperless is not configured', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';

    try {
      await mockPaperlessNotConfigured(page);

      vendorId = await createVendorViaApi(page, { name: `${testPrefix} NoUpload Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} NoUpload Source`,
        totalAmount: 20000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI NoUpload` });
      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-NU-001`,
        amount: 250,
        date: '2026-03-11',
        status: 'pending',
      });

      await wizard.goto();
      await wizard.selectUseCase('claim');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();
      await expect(
        wizard.regularInvoiceRow(`${testPrefix} NoUpload Vendor`, invoice.invoiceNumber!),
      ).toBeVisible();
      await wizard.goNextFromStep3();
      await wizard.waitForPreviewReady();

      await expect(wizard.uploadPaperlessButton).toHaveCount(0);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: ?sourceId= prefill
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard — sourceId prefill (Scenario 7)', () => {
  test('?sourceId= pre-selects the source once a use case is picked at step 1, and the deep link carries through to a working step 3/4', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Prefill Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Prefill Source`,
        totalAmount: 15000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Prefill` });
      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-PF-001`,
        amount: 350,
        date: '2026-03-12',
        status: 'pending',
      });

      await wizard.goto(sourceId);
      // Still starts on step 1 — user must pick a use case first.
      await expect(wizard.useCaseRadioGroup).toBeVisible();
      await expect(wizard.sourceRadioGroup).toHaveCount(0);

      await wizard.selectUseCase('budget-overview');
      await wizard.goNextFromStep1();

      await expect(wizard.sourceRow(sourceId)).toBeChecked();

      // Picking the use case fires the effect that pre-loads the report for the pre-checked
      // ?sourceId= source — walk the rest of the wizard through to prove the deep link no
      // longer dead-ends: step 3 shows the seeded invoice (report actually loaded, not stuck
      // on the skeleton) and step 4's preview becomes ready.
      await wizard.goNextFromStep2();
      await expect(
        wizard.regularInvoiceRow(`${testPrefix} Prefill Vendor`, invoice.invoiceNumber!),
      ).toBeVisible();

      await wizard.goNextFromStep3();
      await wizard.waitForPreviewReady();
      await expect(wizard.downloadButton).toBeEnabled();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Route smoke across viewports
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard — route smoke (Scenario 8)', { tag: '@responsive' }, () => {
  test('Heading and stepper render', { tag: '@smoke' }, async ({ page }) => {
    const wizard = new ReportWizardPage(page);
    await wizard.goto();
    await expect(wizard.heading).toHaveText('Bank Reports');
    await expect(wizard.useCaseRadioGroup).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Forward-lock
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard — forward-lock (Scenario 9)', () => {
  test('Step 4 is not clickable in the stepper from step 3', async ({ page, testPrefix }) => {
    const wizard = new ReportWizardPage(page);

    let sourceId = '';
    try {
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Lock Source`,
        totalAmount: 10000,
      });

      await wizard.goto();
      await wizard.selectUseCase('claim');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();

      // maxReachedStep is 3 here — step 4's stepper item must render as a non-interactive
      // element (no <button>), not merely a disabled one.
      expect(await wizard.isStepInteractive(4)).toBe(false);
      await expect(wizard.stepItems.nth(3).locator('button')).toHaveCount(0);
    } finally {
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Mobile stepper
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard — mobile stepper (Scenario 10)', { tag: '@responsive' }, () => {
  test('Shows "Step N of 4" + dots instead of the desktop stepper', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'Mobile-only layout check');
    const wizard = new ReportWizardPage(page);
    await wizard.goto();

    await expect(wizard.mobileStepCount).toBeVisible();
    await expect(wizard.mobileStepCount).toContainText('1');
    await expect(wizard.mobileStepCount).toContainText('4');
    await expect(wizard.mobileDots).toHaveCount(4);
    // WizardStepper renders BOTH the desktop <ol class="stepList"> and the mobile
    // stepperMobile tree unconditionally, toggling which is shown purely via a
    // `@media (max-width: 767px)` CSS rule (WizardStepper.module.css) — the desktop tree is
    // still present in the DOM at mobile viewport width, just `display:none`. Assert on
    // visibility, not DOM presence.
    await expect(wizard.stepListDesktop).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: Cross-story integration — refund entry surfaces in a claim report
// ─────────────────────────────────────────────────────────────────────────────
// (Story #1877's contact-field / source-form coverage already lives in
// budget-sources.spec.ts — this scenario intentionally does not duplicate it.)

test.describe('Report wizard — refund cross-story integration (Scenario 11)', () => {
  // NOTE ON SEED SHAPE: the source report contract is documented (wiki/API-Contract.md,
  // `sourceReportService.ts`, confirmed by its unit test "scenario 14") as exactly ONE row per
  // invoice, carrying the NET contribution across the report's status-target set — `lineKind`
  // only flips to 'refund-adjustment' when that net goes negative. A refund against an invoice
  // that's ALSO itself in-scope just reduces that invoice's own row (still `lineKind:
  // 'invoice'`); it does not spawn a second row. To exercise a genuine 'refund-adjustment' row
  // this seeds TWO invoices: one plain in-scope invoice (positive row) and a SEPARATE
  // out-of-scope invoice (`status: 'claimed'`, contributes nothing on its own for a 'claim'
  // report) carrying an in-scope refund (`status: 'paid'`) — its net is therefore purely
  // negative, matching a real "already-claimed invoice, partially refunded during the current
  // claim period" scenario.
  test('A refund against an out-of-scope invoice surfaces as its own negative line and increases the running total when excluded', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Refund Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Refund Source`,
        totalAmount: 10000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Refund` });

      // In-scope invoice: 'pending' is within the 'claim' report's target statuses
      // (pending+paid) — contributes its full amount as a normal, positive 'invoice' row.
      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-RF-001`,
        amount: 1000,
        date: '2026-03-15',
        status: 'pending',
      });

      // Out-of-scope invoice: 'claimed' is OUTSIDE {pending, paid}, so its own residual
      // contributes 0 — but its 'paid' refund IS in scope, so the net for this invoice is
      // purely the (negative) refund contribution.
      const refundedInvoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-RF-002`,
        amount: 1000,
        date: '2026-03-16',
        status: 'claimed',
      });
      await createDepositViaApi(page, refundedInvoice.id, {
        amount: 200,
        dueDate: '2026-03-20',
        status: 'paid',
        entryType: 'refund',
      });

      await wizard.goto();
      await wizard.selectUseCase('claim');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();

      const vendorName = `${testPrefix} Refund Vendor`;
      await expect(wizard.regularInvoiceRow(vendorName, invoice.invoiceNumber!)).toBeVisible();
      const refundRow = wizard.refundRow(vendorName, refundedInvoice.invoiceNumber!);
      await expect(refundRow).toBeVisible();
      await expect(refundRow).toContainText('Refund');
      await expect(refundRow).toContainText('-');

      // Running total: 1000 (in-scope invoice) - 200 (refund-adjustment) = 800.
      await expect(wizard.selectionCountLabel).toContainText('800');

      // Excluding the refund-adjustment row INCREASES the running total (sign behavior).
      await refundRow.locator('input[type="checkbox"]').click();
      await expect(wizard.selectionCountLabel).toContainText('1,000');
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});
