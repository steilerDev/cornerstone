/**
 * E2E tests for the Bank Report Wizard follow-up (Story #1891 — expandable invoice rows,
 * CSP `blob:` frame-src hardening, status-chip sizing fix, deposit→budget-source tagging).
 *
 * Covers:
 * - Scenario 1: CSP headline — the report wizard page's own CSP response header is asserted to
 *   have a `frame-src` directive containing both `'self'` and `blob:` (the deterministic,
 *   headless-safe core of this proof), zero CSP-violation console messages were captured, and
 *   the preview overlay/iframe/src reach their expected settled state (overlay hidden, iframe
 *   visible, src is a `blob:` URL). This does NOT fetch the blob's bytes from within the page:
 *   an in-page `fetch(blobSrc)` is itself governed by the app's CSP `connect-src 'self'` (which
 *   does not, and must not, include `blob:` — the app itself never fetches its own preview
 *   blob, the browser resolves `<iframe src="blob:...">` internally), so that technique is a
 *   dead end and production CSP will not be loosened to accommodate a test. (This also replaced
 *   an earlier `page.frames()` navigation-match technique that turned out to be unverifiable in
 *   CI's headless Chromium shell — see `ReportWizardPage.ts`'s `assertPreviewHardened`
 *   docstring for the full history of both superseded attempts.)
 * - Scenario 2: Status chip width — a short label ("Paid") and a long label ("Quotation")
 *   render at genuinely different widths, proving the chip sizes to its content instead of
 *   stretching to a fixed grid-column width.
 * - Scenario 3: Expand → exclude a budget line → the row's own amount, the
 *   `SelectionActionBar` running total, AND the regenerated PDF preview all reflect the
 *   exclusion.
 * - Scenario 4: Full-exclusion (all lines on an invoice excluded) — the design intent (see
 *   `ReportWizardPage.ts` class docstring, "Design decision" in the story's Frontend Spec) is
 *   that the row clamps to €0.00 (never negative), its TriState checkbox renders unchecked
 *   (not indeterminate), and the invoice remains counted as included for claiming/PDF
 *   purposes. This is a regression-guard for the fixed bug #1892 (see the note below and in
 *   `ReportWizardPage.ts`) — the row now stays visible at €0.00 instead of being filtered out
 *   of the list entirely.
 * - Scenario 5: A deposit tagged directly to a budget source that has ZERO budget lines for
 *   an invoice still surfaces that invoice in the tagged source's report (Rail B), with the
 *   deposit's "Allocated Source" column showing a tagged badge in the expansion panel, and an
 *   empty items sub-table (proving it really is a zero-line source for this invoice).
 * - Scenario 6: The claim-confirmation modal's warning block reports the correct count
 *   ("1 invoice(s) will be claimed in full even though...") when an included invoice has a
 *   partially-excluded line set (TriState indeterminate case).
 * - Scenario 7: Regression sweep — the pre-existing `reportWizard.spec.ts` locators
 *   (`selectAllCheckbox`, `regularInvoiceRow`, `refundRow`, `invoiceRowCheckbox`,
 *   `clearSelectionButton`, `selectionCountLabel`) still resolve correctly against the new
 *   `1.5rem auto 1fr auto auto auto` grid (leading chevron column added by this story).
 *
 * FIXED REGRESSION #1892 (Scenario 4): `applyLineExclusions()`
 * (`client/src/lib/reportExclusions.ts`) clamps a fully-line-excluded invoice's
 * `allocatedAmount` to exactly `0` (never negative). `ReportInvoiceList.tsx`'s
 * `allocatedInvoices` filter now reads
 * `inv.allocatedAmount > 0 || inv.lineKind === 'refund-adjustment' || inv.budgetLines.length > 0
 * || inv.deposits.length > 0` — the added `budgetLines.length`/`deposits.length` clauses keep a
 * net-zero non-refund invoice with budget lines or deposits visible as a `€0.00` row instead of
 * being filtered out, which also preserves the only UI path back to un-excluding those lines
 * (the row's own expand toggle). The PDF export and the actual claim submission were never
 * affected either way — both operate on `excludedInvoiceIds` against the ORIGINAL (unfiltered)
 * report, not the filtered display list — so this was a display-only regression, not a
 * data-integrity one. Scenario 4 below is the regression guard for this fix.
 *
 * PDF generation (pdfmake + pdf-lib via dynamic `import()`) can be slow, especially on a cold
 * chunk load — every scenario that reaches step 5 (the preview) uses `test.slow()`.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { ReportWizardPage } from '../../pages/ReportWizardPage.js';
import {
  createVendorViaApi,
  deleteVendorViaApi,
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
  createWorkItemViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers (local — mirrors the established pattern in reportWizard.spec.ts /
// invoices.spec.ts / invoice-deposits.spec.ts; these endpoints don't have shared
// fixtures/apiHelpers.ts entries yet)
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

/** Creates an invoice fully allocated (single budget line, no split) to `sourceId`. */
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

/**
 * Creates an invoice allocated to `sourceId` via TWO separate budget lines (one per work
 * item, each with its own `description` so the items sub-table has distinguishable rows).
 * Used by scenarios that exercise line-level exclusion (partial or full).
 */
async function seedInvoiceWithTwoLines(
  page: Page,
  vendorId: string,
  sourceId: string,
  workItemAId: string,
  workItemBId: string,
  data: { invoiceNumber: string; date: string; status: 'pending' | 'paid' | 'claimed' },
  lineA: { amount: number; description: string },
  lineB: { amount: number; description: string },
): Promise<InvoiceApiResponse> {
  const invoice = await createInvoiceViaApi(page, vendorId, {
    invoiceNumber: data.invoiceNumber,
    date: data.date,
    status: data.status,
    amount: lineA.amount + lineB.amount,
  });
  const budgetAId = await createWorkItemBudgetViaApi(page, workItemAId, {
    plannedAmount: lineA.amount,
    budgetSourceId: sourceId,
    description: lineA.description,
  });
  await linkInvoiceToBudgetLineViaApi(page, invoice.id, {
    workItemBudgetId: budgetAId,
    itemizedAmount: lineA.amount,
  });
  const budgetBId = await createWorkItemBudgetViaApi(page, workItemBId, {
    plannedAmount: lineB.amount,
    budgetSourceId: sourceId,
    description: lineB.description,
  });
  await linkInvoiceToBudgetLineViaApi(page, invoice.id, {
    workItemBudgetId: budgetBId,
    itemizedAmount: lineB.amount,
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
    budgetSourceId?: string | null;
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
// Scenario 1: CSP headline
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard expansion — CSP frame-src headline (Scenario 1)', () => {
  test('CSP frame-src header allows blob:, zero CSP violations, and the preview settles on a blob: src', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} CSP Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} CSP Source`,
        totalAmount: 10000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI CSP` });
      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-CSP-001`,
        amount: 200,
        date: '2026-04-01',
        status: 'pending',
      });

      await wizard.goto();
      await wizard.selectUseCase('claim');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();
      await expect(
        wizard.regularInvoiceRow(`${testPrefix} CSP Vendor`, invoice.invoiceNumber!),
      ).toBeVisible();
      await wizard.goNextFromStep3();
      // Step 4 (Settings) has no preview — advance to step 5 to reach it (Story #1899).
      await wizard.step4NextButton.click();

      // openPdfPreviewModal() (Story #1900 — replaces the old always-present step-5 iframe with
      // an on-demand "Preview PDF" button + Modal) already runs the hardened CSP-header +
      // zero-CSP-message proof internally (see ReportWizardPage.ts's assertPreviewHardened
      // docstring) — this scenario ALSO re-asserts explicitly per the story's AC, so a future
      // refactor of the POM's internal check can't silently drop this specific proof from
      // coverage.
      await wizard.openPdfPreviewModal();

      // (3) Overlay hidden + iframe visible + src is a blob: URL — already true by construction
      // once openPdfPreviewModal() resolves, re-asserted here per the story's AC.
      const src = await wizard.getPreviewSrc();
      expect(src).toMatch(/^blob:/);

      // (1) Direct CSP header assertion — the deterministic core of this proof. Fetches the
      // report wizard page's own HTTP response and reads its `content-security-policy`
      // header's `frame-src` directive. This fails by construction against a pre-fix
      // `frameSrc: ["'self'"]` helmet config (missing the `blob:` token) and passes against
      // the fixed `["'self'", 'blob:']` config — a server-side contract check, independent of
      // whatever a given browser does when actually asked to navigate an iframe to it.
      const frameSrcValues = await wizard.fetchCspFrameSrcDirective();
      expect(frameSrcValues).toContain("'self'");
      expect(frameSrcValues).toContain('blob:');

      // (2) Zero CSP-violation console messages — defense in depth for real (non-headless-
      // shell) browsers, where a frame-src block always also logs a console error
      // synchronously with the blocked navigation.
      //
      // We deliberately do NOT assert on `page.frames()` matching the iframe's own browsing
      // context, and we deliberately do NOT `fetch()` the blob's bytes from within the page:
      // Playwright's bundled headless Chromium shell has no built-in PDF viewer plugin, so an
      // `<iframe src="blob:...pdf">` aborts/blanks WITHOUT ever completing navigation or firing
      // a CSP violation, REGARDLESS of whether frame-src is correct (confirmed via CI run
      // 30530648400, shard 2) — that frame-navigation technique is unverifiable in this
      // environment. And an in-page `fetch(blobSrc)` is itself governed by the app's CSP
      // `connect-src 'self'` (no `blob:` token, by design — the app never fetches its own
      // preview blob), so it is blocked by the very policy this test verifies (confirmed via CI
      // run 30531695763, shard 2: every scenario failed in ~2s with `page.evaluate: TypeError:
      // Failed to fetch`). See ReportWizardPage.ts's assertPreviewHardened docstring for the
      // full history.
      expect(wizard.getCspViolations()).toEqual([]);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Status chip width
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard expansion — status chip width (Scenario 2)', () => {
  test('A short status label and a long status label render at genuinely different widths', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Chip Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Chip Source`,
        totalAmount: 10000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Chip` });

      // budget-overview includes quotation+pending+paid+claimed — needed to see both a
      // "Paid" (short) and a "Quotation" (long) status chip in the same report.
      const paid = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-CHIP-001`,
        amount: 150,
        date: '2026-04-02',
        status: 'paid',
      });
      const quotation = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-CHIP-002`,
        amount: 150,
        date: '2026-04-03',
        status: 'quotation',
      });

      await wizard.goto();
      await wizard.selectUseCase('budget-overview');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();

      const vendorName = `${testPrefix} Chip Vendor`;
      const paidChip = wizard
        .regularInvoiceRow(vendorName, paid.invoiceNumber!)
        .locator('[class*="statusChip"]');
      const quotationChip = wizard
        .regularInvoiceRow(vendorName, quotation.invoiceNumber!)
        .locator('[class*="statusChip"]');
      await expect(paidChip).toBeVisible();
      await expect(quotationChip).toBeVisible();

      const paidBox = await paidChip.boundingBox();
      const quotationBox = await quotationChip.boundingBox();
      expect(paidBox, 'Paid chip must have a bounding box').not.toBeNull();
      expect(quotationBox, 'Quotation chip must have a bounding box').not.toBeNull();

      // "Quotation" (9 chars) must render measurably wider than "Paid" (4 chars) — proves the
      // chip sizes to its own content (justify-self: start) instead of stretching to fill a
      // fixed grid-column width (which would make both chips identically wide regardless of
      // label length — the pre-fix bug).
      expect(quotationBox!.width - paidBox!.width).toBeGreaterThan(10);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Expand → exclude item → row amount + SelectionActionBar + regenerated PDF
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard expansion — line exclusion updates row, total, and PDF (Scenario 3)', () => {
  test('Excluding one of two budget lines updates the row amount, running total, and regenerates the PDF preview', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemAId = '';
    let workItemBId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Excl Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Excl Source`,
        totalAmount: 10000,
      });
      workItemAId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Excl A` });
      workItemBId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Excl B` });

      const invoice = await seedInvoiceWithTwoLines(
        page,
        vendorId,
        sourceId,
        workItemAId,
        workItemBId,
        { invoiceNumber: `${testPrefix}-EXCL-001`, date: '2026-04-04', status: 'pending' },
        { amount: 300, description: `${testPrefix} Line A` },
        { amount: 200, description: `${testPrefix} Line B` },
      );

      const vendorName = `${testPrefix} Excl Vendor`;
      await wizard.goto();
      await wizard.selectUseCase('claim');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();

      await expect(wizard.regularInvoiceRow(vendorName, invoice.invoiceNumber!)).toBeVisible();
      await expect(wizard.invoiceRowAmount(vendorName, invoice.invoiceNumber!)).toContainText(
        '500',
      );

      // Expand and verify both line rows are present before excluding anything.
      await wizard.invoiceExpandToggle(vendorName, invoice.invoiceNumber!).click();
      await expect(
        wizard.itemsSubTable(vendorName, invoice.invoiceNumber!).locator('tbody tr'),
      ).toHaveCount(2);
      await expect(
        wizard.itemRow(vendorName, invoice.invoiceNumber!, `${testPrefix} Line A`),
      ).toContainText('300');
      await expect(
        wizard.itemRow(vendorName, invoice.invoiceNumber!, `${testPrefix} Line B`),
      ).toContainText('200');

      // Reach step 5 once (via the Settings step, which has no preview — Story #1899) to open
      // the on-demand PDF preview modal once with the pre-exclusion content.
      await wizard.goNextFromStep3();
      await wizard.step4NextButton.click();
      await wizard.openPdfPreviewModal();
      await wizard.closePdfPreviewModal();

      // Back to step 3 (two steps: step 5 -> Settings -> invoices) — ReportInvoiceList
      // remounts (resetting local expand state) but excludedLineIds/excludedInvoiceIds live in
      // ReportWizardPage and persist across the step navigation. (The preview modal must be
      // closed first — Story #1900 — since its backdrop would otherwise intercept the Back
      // button clicks below.)
      await wizard.goBack();
      await wizard.goBack();
      await wizard.invoiceExpandToggle(vendorName, invoice.invoiceNumber!).click();
      await wizard
        .itemExclusionCheckbox(vendorName, invoice.invoiceNumber!, `${testPrefix} Line B`)
        .click();

      // Row amount updates instantly (client-side applyLineExclusions, no network round trip).
      await expect(wizard.invoiceRowAmount(vendorName, invoice.invoiceNumber!)).toContainText(
        '300',
      );
      // Running total in the SelectionActionBar reflects the same 500 -> 300 drop.
      await expect(wizard.selectionCountLabel).toContainText('300');

      // Advancing to step 5 again (via Settings) and re-opening the preview modal proves a
      // fresh PDF generation succeeds for the new exclusion state (hardened CSP-header +
      // zero-CSP-message proof, same as the first open above). Story #1900 made every "Preview
      // PDF" click generate unconditionally from the current effective content (no
      // debounce/memoization to prove was "skipped" vs. "ran") — the earlier blob-src-changed
      // comparison this replaced is no longer a meaningful signal on its own, since every open
      // now yields a fresh `URL.createObjectURL()` blob regardless of whether content actually
      // changed.
      await wizard.goNextFromStep3();
      await wizard.step4NextButton.click();
      await wizard.openPdfPreviewModal();
    } finally {
      if (workItemAId) await deleteWorkItemViaApi(page, workItemAId);
      if (workItemBId) await deleteWorkItemViaApi(page, workItemBId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Full-exclusion — zero not negative, TriState unchecked, still included
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard expansion — full line exclusion (Scenario 4)', () => {
  test('Excluding every line on an invoice clamps its amount to zero, renders TriState unchecked, and keeps it counted as included', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemAId = '';
    let workItemBId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} FullExcl Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} FullExcl Source`,
        totalAmount: 10000,
      });
      workItemAId = await createWorkItemViaApi(page, { title: `${testPrefix} WI FullExcl A` });
      workItemBId = await createWorkItemViaApi(page, { title: `${testPrefix} WI FullExcl B` });

      const invoice = await seedInvoiceWithTwoLines(
        page,
        vendorId,
        sourceId,
        workItemAId,
        workItemBId,
        { invoiceNumber: `${testPrefix}-FULLEXCL-001`, date: '2026-04-05', status: 'pending' },
        { amount: 300, description: `${testPrefix} Full Line A` },
        { amount: 200, description: `${testPrefix} Full Line B` },
      );

      const vendorName = `${testPrefix} FullExcl Vendor`;
      await wizard.goto();
      await wizard.selectUseCase('claim');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();

      await expect(wizard.regularInvoiceRow(vendorName, invoice.invoiceNumber!)).toBeVisible();

      await wizard.invoiceExpandToggle(vendorName, invoice.invoiceNumber!).click();
      await wizard
        .itemExclusionCheckbox(vendorName, invoice.invoiceNumber!, `${testPrefix} Full Line A`)
        .click();
      await wizard
        .itemExclusionCheckbox(vendorName, invoice.invoiceNumber!, `${testPrefix} Full Line B`)
        .click();

      // ── Regression guard for fixed bug #1892 (see file-level docstring + ReportWizardPage.ts
      // class docstring) ── These assertions encode the SPEC-CONFORMANT behavior (row stays
      // visible at €0.00, never negative): ReportInvoiceList.tsx's `allocatedInvoices` filter
      // now keeps a net-zero non-refund invoice with budget lines or deposits in the list
      // instead of dropping it, so the row renders at €0.00 rather than disappearing.
      const row = wizard.invoiceRow(vendorName, invoice.invoiceNumber!);
      await expect(row).toBeVisible();
      const amountEl = wizard.invoiceRowAmount(vendorName, invoice.invoiceNumber!);
      await expect(amountEl).toContainText('0');
      await expect(amountEl).not.toContainText('-');

      const parentCheckbox = wizard.invoiceRowCheckbox(vendorName, invoice.invoiceNumber!);
      await expect(parentCheckbox).not.toBeChecked();
      expect(
        await parentCheckbox.evaluate((el) => (el as HTMLInputElement).indeterminate),
        'Fully-excluded invoice must render a plain UNCHECKED TriState (not indeterminate) — ' +
          'design spec explicitly forbids two-way sync between line and invoice exclusion',
      ).toBe(false);

      // The invoice is still counted as included (excludedInvoiceIds never touched by line
      // exclusion) — Next must not be forward-locked by the "all invoices excluded" guard.
      await expect(wizard.step3NextButton).toBeEnabled();
    } finally {
      if (workItemAId) await deleteWorkItemViaApi(page, workItemAId);
      if (workItemBId) await deleteWorkItemViaApi(page, workItemBId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Deposit tagged to a zero-line source
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard expansion — deposit tagged to a zero-line source (Scenario 5)', () => {
  test("A deposit tagged directly to a source with no budget lines for the invoice still surfaces it in that source's report, with a tagged badge and an empty items sub-table", async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceAId = '';
    let sourceBId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Tag Vendor` });
      sourceAId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Tag Source A`,
        totalAmount: 10000,
      });
      // Source B has ZERO budget lines for this invoice — it only ever gets contribution via
      // the tagged deposit (Rail B).
      sourceBId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Tag Source B`,
        totalAmount: 10000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Tag` });

      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceAId, {
        invoiceNumber: `${testPrefix}-TAG-001`,
        amount: 1000,
        date: '2026-04-06',
        status: 'paid',
      });
      await createDepositViaApi(page, invoice.id, {
        amount: 150,
        dueDate: '2026-04-10',
        status: 'paid',
        entryType: 'deposit',
        budgetSourceId: sourceBId,
      });

      const vendorName = `${testPrefix} Tag Vendor`;
      await wizard.goto();
      await wizard.selectUseCase('claim');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceBId);
      await wizard.goNextFromStep2();

      // Invoice appears in Source B's report purely via the tagged deposit.
      const row = wizard.invoiceRow(vendorName, invoice.invoiceNumber!);
      await expect(row).toBeVisible();
      await expect(wizard.invoiceRowAmount(vendorName, invoice.invoiceNumber!)).toContainText(
        '150',
      );

      await wizard.invoiceExpandToggle(vendorName, invoice.invoiceNumber!).click();

      // Items sub-table is empty — Source B genuinely has zero budget lines for this invoice.
      await expect(wizard.itemsSubTable(vendorName, invoice.invoiceNumber!)).toContainText(
        'No budget lines for this invoice',
      );

      // Deposits sub-table shows the one tagged deposit with a Source-B badge (not a plain
      // "—") in the "Allocated Source" column.
      const depositsTable = wizard.depositsSubTable(vendorName, invoice.invoiceNumber!);
      const depositRowLocator = depositsTable.locator('tbody tr').first();
      await expect(depositRowLocator).toContainText('150');
      await expect(depositRowLocator).toContainText(`${testPrefix} Tag Source B`);
      await expect(depositRowLocator.locator('td').last()).not.toHaveText('—');
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceBId) await deleteBudgetSourceViaApi(page, sourceBId);
      if (sourceAId) await deleteBudgetSourceViaApi(page, sourceAId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Claim warning count
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard expansion — claim warning count (Scenario 6)', () => {
  test('Claim confirmation shows a warning naming exactly 1 invoice when it has a partially-excluded line set', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemAId = '';
    let workItemBId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Warn Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Warn Source`,
        totalAmount: 10000,
      });
      workItemAId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Warn A` });
      workItemBId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Warn B` });

      // Partial exclusion (one of two lines) keeps the net amount > 0, so the row stays
      // visible via the normal (unaffected-by-the-Scenario-4-bug) path, and exercises the
      // TriState INDETERMINATE case rather than full exclusion.
      const invoice = await seedInvoiceWithTwoLines(
        page,
        vendorId,
        sourceId,
        workItemAId,
        workItemBId,
        { invoiceNumber: `${testPrefix}-WARN-001`, date: '2026-04-07', status: 'pending' },
        { amount: 250, description: `${testPrefix} Warn Line A` },
        { amount: 250, description: `${testPrefix} Warn Line B` },
      );

      const vendorName = `${testPrefix} Warn Vendor`;
      await wizard.goto();
      await wizard.selectUseCase('claim');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();

      await expect(wizard.regularInvoiceRow(vendorName, invoice.invoiceNumber!)).toBeVisible();

      await wizard.invoiceExpandToggle(vendorName, invoice.invoiceNumber!).click();
      await wizard
        .itemExclusionCheckbox(vendorName, invoice.invoiceNumber!, `${testPrefix} Warn Line A`)
        .click();
      await expect(wizard.invoiceRowAmount(vendorName, invoice.invoiceNumber!)).toContainText(
        '250',
      );

      // Parent TriState is indeterminate (some but not all lines excluded), invoice itself is
      // still included (not invoice-level excluded).
      const parentCheckbox = wizard.invoiceRowCheckbox(vendorName, invoice.invoiceNumber!);
      await expect(parentCheckbox).not.toBeChecked();
      expect(await parentCheckbox.evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(
        true,
      );

      await wizard.goNextFromStep3();
      await wizard.step4NextButton.click();
      await wizard.openPdfPreviewModal();
      // Story #1900: the PDF preview modal must be closed before opening the claim-confirm
      // modal — its backdrop would otherwise intercept the Mark Claimed button click below.
      await wizard.closePdfPreviewModal();

      await wizard.clickMarkClaimed();
      await expect(wizard.markClaimedWarningBlock).toBeVisible();
      await expect(wizard.markClaimedWarningBlock).toHaveText(
        /^1 invoice\(s\) will be claimed in full even though/,
      );

      await wizard.cancelClaimConfirm();
    } finally {
      if (workItemAId) await deleteWorkItemViaApi(page, workItemAId);
      if (workItemBId) await deleteWorkItemViaApi(page, workItemBId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Regression sweep — reportWizard.spec.ts locators against the new grid
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard expansion — regression sweep of pre-existing selectors (Scenario 7)', () => {
  test('selectAllCheckbox, refundRow, invoiceRowCheckbox, clearSelectionButton, and selectionCountLabel still resolve correctly against the new leading-chevron grid', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Sweep Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Sweep Source`,
        totalAmount: 10000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Sweep` });

      const plain = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-SWEEP-001`,
        amount: 400,
        date: '2026-04-08',
        status: 'pending',
      });
      const refunded = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-SWEEP-002`,
        amount: 400,
        date: '2026-04-09',
        status: 'claimed', // out of 'claim' scope on its own — only its refund is in scope
      });
      await createDepositViaApi(page, refunded.id, {
        amount: 100,
        dueDate: '2026-04-12',
        status: 'paid',
        entryType: 'refund',
      });

      const vendorName = `${testPrefix} Sweep Vendor`;
      await wizard.goto();
      await wizard.selectUseCase('claim');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();

      // Both rows present, both checked by default (select-all default).
      await expect(wizard.regularInvoiceRow(vendorName, plain.invoiceNumber!)).toBeVisible();
      const refundRow = wizard.refundRow(vendorName, refunded.invoiceNumber!);
      await expect(refundRow).toBeVisible();
      await expect(refundRow).toContainText('Refund');
      await expect(wizard.invoiceRowCheckbox(vendorName, plain.invoiceNumber!)).toBeChecked();
      await expect(refundRow.locator('input[type="checkbox"]')).toBeChecked();

      // selectAllCheckbox reflects "all checked" -> then "some checked" (indeterminate) after
      // one toggle.
      await expect(wizard.selectAllCheckbox).toBeChecked();
      await wizard.toggleInvoiceExclusion(vendorName, plain.invoiceNumber!);
      expect(
        await wizard.selectAllCheckbox.evaluate((el) => (el as HTMLInputElement).indeterminate),
      ).toBe(true);

      // clearSelectionButton ("Reset selection") clears all exclusions, restoring both
      // invoices to included and the count back to 2 of 2.
      await wizard.clearSelectionButton.click();
      await expect(wizard.selectionCountLabel).toContainText('2 of 2');
      await expect(wizard.invoiceRowCheckbox(vendorName, plain.invoiceNumber!)).toBeChecked();
      await expect(refundRow.locator('input[type="checkbox"]')).toBeChecked();
      await expect(wizard.selectAllCheckbox).toBeChecked();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});
