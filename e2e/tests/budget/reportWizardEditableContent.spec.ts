/**
 * E2E tests for the Bank Report Wizard's editable step-5 content surface (Story #1900 —
 * `/budget/reports`). Story #1900 replaced the always-present, auto-regenerating PDF `<iframe>`
 * that used to occupy step 5 with a live, always-editable HTML surface
 * (`ReportContentEditor.tsx` — cover letter `EditableField`s + an editable table) plus ON-DEMAND
 * PDF generation: a new "Preview PDF" button opens a `Modal` wrapping the unchanged
 * `ReportPdfPreview.tsx`, and Download/Upload-to-Paperless generate fresh at click time. See
 * `e2e/pages/ReportWizardPage.ts`'s class docstring for the full DOM/locator reference.
 *
 * `reportWizard.spec.ts` covers the base wizard flow (steps 1-4, claim/overview/proof-of-funds,
 * Paperless gating, forward-lock, responsive stepper, refund integration, report language).
 * `reportWizardExpansion.spec.ts` covers expandable invoice rows / line exclusion / CSP
 * hardening (Story #1891). THIS file is scoped to the NEW editable-content behavior only:
 *
 * - Scenario 1: The step-5 surface is live editable inputs, not an iframe — no PDF generation
 *   happens just by arriving on step 5.
 * - Scenario 1b: Desktop — regression guard for #1908 (fixed): the mobile-card fallback (added
 *   for #1904) must stay hidden at desktop width. It previously lacked a base `display: none`
 *   and duplicated the table; the fix landed in `ReportContentEditor.module.css`.
 * - Scenario 2: Editing a field shows its edited-dot indicator on THAT field only — not on
 *   sibling fields, not on the same field for a different invoice row.
 * - Scenario 3: The per-field reset button reverts the value to its generated baseline and
 *   clears the edited-dot.
 * - Scenario 4: A guarded step 1-4 mutation while dirty shows the discard-confirm modal; "Keep
 *   Editing" preserves the edit and does NOT apply the attempted change; a later "Discard and
 *   Continue" clears the edit AND applies the change.
 * - Scenario 5: The same guarded mutation with NO prior edits applies immediately, no modal.
 * - Scenario 6: The on-demand PDF preview modal opens successfully (hardened CSP content-check)
 *   with edited field values feeding generation.
 * - Scenario 7: Closing and reopening the preview modal is clean — no stale state, a fresh blob
 *   URL each time (proof there's no stale/revoked-URL reuse bug).
 * - Scenario 8: Download completes for edited content (see the scenario's own note on why E2E
 *   cannot assert the PDF's actual text content in this project).
 * - Scenario 9: Upload to Paperless succeeds with edited content (mocked Paperless endpoints).
 * - Scenario 10: Mark Claimed still shows the Story #1891 excluded-lines warning correctly when
 *   content edits are also present (regression guard — the two features are independent).
 * - Scenario 11: Mobile (≤767px) — cover letter fields render with visible labels, AND the
 *   invoice table's mobile-card fallback (`.mobileCardList`/`.mobileCard`/`.mobileCardRow`)
 *   renders real, editable row content in the table's place (fixed #1904 — previously the
 *   table just disappeared below the breakpoint with nothing to replace it). The follow-up bug
 *   (#1908: the fallback lacked a default `display: none`, so it also rendered — duplicated —
 *   on desktop/tablet) is fixed and regression-guarded by Scenario 1b above.
 * - Scenario 12: Mobile (≤767px) — the per-field reset button meets the WCAG 2.5.5 AA 44×44px
 *   minimum touch target size (fixed #1905 — was 24×24px).
 * - Scenario 13: Keyboard-only — Tab/Shift+Tab reaches a field and it shows a box-shadow focus
 *   ring (never `outline: 2px solid`).
 * - Scenario 14: A per-document PDF-attachment fetch failure (naturally reachable in this E2E
 *   environment since no real Paperless instance is configured — the server's
 *   `/api/paperless/documents/:id/preview` proxy returns `PAPERLESS_NOT_CONFIGURED`) produces a
 *   `footnoteFetchFailed` skip note on the step-5 page.
 * - Scenario 15: Regression guard for #1907 — changing the report language on step 4 (Settings)
 *   while content edits are dirty shows the discard-confirm modal, exactly like the
 *   attach-documents/cover-letter checkboxes on the same step (previously it bypassed the
 *   guard and applied silently).
 *
 * PDF generation (pdfmake + pdf-lib via dynamic `import()`) can be slow, especially on a cold
 * chunk load — every scenario that opens the preview modal, downloads, or uploads uses
 * `test.slow()`.
 */

import { test, expect } from '../../fixtures/auth.js';
import { statSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { ReportWizardPage } from '../../pages/ReportWizardPage.js';
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
// API helpers (local — mirrors the established pattern in reportWizard.spec.ts /
// reportWizardExpansion.spec.ts; these endpoints don't have shared fixtures/apiHelpers.ts
// entries yet)
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

/**
 * Creates an invoice allocated via TWO separate budget lines (one per work item) — used by the
 * mark-claimed/#1891-warning regression scenario, which needs a partially-excludable line set.
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

/**
 * Links a Paperless document reference to an invoice (`POST /api/document-links`) — makes the
 * invoice's `documents[]` non-empty in the source report, which is what makes
 * `row.attachmentsNote` non-null (`buildReportContent.ts`'s `getAttachmentNote`) and what makes
 * `generateReportPdf`'s attachment step actually attempt to fetch the document. The
 * `paperlessDocumentId` need not reference a real Paperless document — the link endpoint only
 * validates it's a positive integer; the actual fetch (and its success/failure) only happens
 * later, at PDF-generation time.
 */
async function linkDocumentToInvoiceViaApi(
  page: Page,
  invoiceId: string,
  paperlessDocumentId: number,
): Promise<void> {
  const response = await page.request.post('/api/document-links', {
    data: {
      entityType: 'invoice',
      entityId: invoiceId,
      paperlessDocumentId,
      attachmentType: 'invoice',
    },
  });
  expect(response.ok(), `POST document-link failed: ${response.status()}`).toBeTruthy();
}

/** Walks a fresh wizard through steps 1-4 (claim, single source) to land on step 5. */
async function reachStep5(wizard: ReportWizardPage, sourceId: string): Promise<void> {
  await wizard.goto();
  await wizard.selectUseCase('claim');
  await wizard.goNextFromStep1();
  await wizard.selectSource(sourceId);
  await wizard.goNextFromStep2();
  await wizard.goNextFromStep3();
  await wizard.step4NextButton.click();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Live inputs, not an iframe — nothing auto-generates
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — live surface, no auto-generation (Scenario 1)', () => {
  test('Step 5 renders live editable fields immediately, with no PDF ever auto-generated', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Live Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Live Source`,
        totalAmount: 10000,
        contactAddress: '1 Live St, Testville',
        reference: 'Ref-LIVE',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Live` });
      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-LIVE-001`,
        amount: 200,
        date: '2026-06-01',
        status: 'pending',
      });

      await reachStep5(wizard, sourceId);

      // Live editable content is visible immediately — no generation, no loading state.
      await expect(wizard.letterField('subject')).toBeVisible();
      await expect(wizard.letterField('subject')).not.toBeEmpty();
      await expect(wizard.contentTable).toBeVisible();
      const vendorName = `${testPrefix} Live Vendor`;
      await expect(wizard.usageField(vendorName, invoice.invoiceNumber!)).toBeVisible();

      // No PDF has ever been generated: no iframe anywhere on the page, the preview modal is
      // absent, and the action buttons are all immediately enabled (not mid-generation).
      await expect(page.locator('iframe')).toHaveCount(0);
      await expect(wizard.pdfPreviewModal).not.toBeVisible();
      await expect(wizard.previewPdfButton).toBeEnabled();
      await expect(wizard.downloadButton).toBeEnabled();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1b: Desktop — the mobile-card fallback (fixed #1904) must stay hidden
// (regression guard for #1908, now fixed)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — mobile-card fallback stays hidden on desktop (Scenario 1b)', () => {
  test('The mobile-card fallback added to fix #1904 is only meant to render ≤767px, and stays hidden on desktop (regression guard for #1908)', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} DupCard Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} DupCard Source`,
        totalAmount: 10000,
        contactAddress: '1 DupCard St, Testville',
        reference: 'Ref-DUPCARD',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI DupCard` });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-DUPCARD-001`,
        amount: 220,
        date: '2026-06-19',
        status: 'pending',
      });

      await reachStep5(wizard, sourceId);

      // WORKS: the desktop table itself renders correctly.
      await expect(wizard.contentTable).toBeVisible();

      // Regression guard for #1908 — the mobile-card fallback (added for #1904) must stay
      // hidden on desktop; it previously lacked a base `display: none` and duplicated the
      // table. `ReportContentEditor.module.css` now sets a base-rule `display: none` on
      // `.mobileCardList` outside the `@media (max-width: 767px)` block (matching the
      // established convention elsewhere, e.g. `InvoiceDepositsSection.module.css`).
      await expect(wizard.mobileCardList).not.toBeVisible();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Edited-dot appears only on the edited field
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — edited-dot placement (Scenario 2)', () => {
  test('Editing one field shows its edited-dot only on that field, not on sibling fields or other rows', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Dot Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Dot Source`,
        totalAmount: 10000,
        contactAddress: '1 Dot St, Testville',
        reference: 'Ref-DOT',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Dot` });
      const invoiceA = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-DOT-001`,
        amount: 200,
        date: '2026-06-02',
        status: 'pending',
      });
      const invoiceB = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-DOT-002`,
        amount: 300,
        date: '2026-06-03',
        status: 'pending',
      });
      await linkDocumentToInvoiceViaApi(page, invoiceA.id, 555001);

      await reachStep5(wizard, sourceId);

      const vendorName = `${testPrefix} Dot Vendor`;
      const usageA = wizard.usageField(vendorName, invoiceA.invoiceNumber!);
      const attachmentsNoteA = wizard.attachmentsNoteField(vendorName, invoiceA.invoiceNumber!);
      const usageB = wizard.usageField(vendorName, invoiceB.invoiceNumber!);
      const subject = wizard.letterField('subject');

      // Baseline: nothing edited anywhere.
      expect(await wizard.hasEditedIndicator(usageA)).toBe(false);
      expect(await wizard.hasEditedIndicator(attachmentsNoteA)).toBe(false);
      expect(await wizard.hasEditedIndicator(usageB)).toBe(false);
      expect(await wizard.hasEditedIndicator(subject)).toBe(false);

      // Edit invoice A's usage field only.
      await wizard.editField(usageA, 'Custom usage note A');
      expect(await wizard.hasEditedIndicator(usageA)).toBe(true);
      // Sibling field on the SAME row: unaffected.
      expect(await wizard.hasEditedIndicator(attachmentsNoteA)).toBe(false);
      // Same field TYPE on a DIFFERENT row: unaffected.
      expect(await wizard.hasEditedIndicator(usageB)).toBe(false);
      // A cover-letter field: unaffected.
      expect(await wizard.hasEditedIndicator(subject)).toBe(false);

      // Editing the second field on the same row shows its own dot too, without disturbing
      // the first.
      await wizard.editField(attachmentsNoteA, 'Custom attachment note A');
      expect(await wizard.hasEditedIndicator(usageA)).toBe(true);
      expect(await wizard.hasEditedIndicator(attachmentsNoteA)).toBe(true);
      expect(await wizard.hasEditedIndicator(usageB)).toBe(false);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Reset reverts the value and clears the dot
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — per-field reset (Scenario 3)', () => {
  test('Resetting an edited field reverts its value to the generated baseline and clears the edited-dot', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Reset Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Reset Source`,
        totalAmount: 10000,
        contactAddress: '1 Reset St, Testville',
        reference: 'Ref-RESET',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Reset` });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-RESET-001`,
        amount: 150,
        date: '2026-06-04',
        status: 'pending',
      });

      await reachStep5(wizard, sourceId);

      const subject = wizard.letterField('subject');
      const baseline = await subject.inputValue();
      expect(baseline).not.toBe('');

      await wizard.editField(subject, 'A completely different subject line');
      await expect(subject).toHaveValue('A completely different subject line');
      expect(await wizard.hasEditedIndicator(subject)).toBe(true);

      await wizard.resetField(subject);
      await expect(subject).toHaveValue(baseline);
      expect(await wizard.hasEditedIndicator(subject)).toBe(false);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Discard-confirm modal — Keep Editing vs. Discard and Continue
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — discard-confirm modal (Scenario 4)', () => {
  test('A guarded change while dirty shows the discard modal; "Keep Editing" preserves the edit and skips the change, "Discard and Continue" clears the edit and applies it', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Guard Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Guard Source`,
        totalAmount: 10000,
        contactAddress: '1 Guard St, Testville',
        reference: 'Ref-GUARD',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Guard` });
      const invoiceA = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-GUARD-001`,
        amount: 200,
        date: '2026-06-05',
        status: 'pending',
      });
      // A second invoice so excluding the first still leaves the "select at least one" guard
      // satisfied (irrelevant here since the change is intercepted, but keeps the seed
      // realistic).
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-GUARD-002`,
        amount: 250,
        date: '2026-06-06',
        status: 'pending',
      });

      const vendorName = `${testPrefix} Guard Vendor`;

      await reachStep5(wizard, sourceId);
      const subject = wizard.letterField('subject');
      const baseline = await subject.inputValue();
      await wizard.editField(subject, 'Edit that must survive a cancelled navigation');
      expect(await wizard.hasEditedIndicator(subject)).toBe(true);

      // Navigate back to step 3 (step 5 -> Settings -> invoices) to reach a guarded control.
      await wizard.goBack();
      await wizard.goBack();

      const checkboxA = wizard.invoiceRowCheckbox(vendorName, invoiceA.invoiceNumber!);
      await expect(checkboxA).toBeChecked();
      await wizard.toggleInvoiceExclusion(vendorName, invoiceA.invoiceNumber!);

      // The discard modal intercepts the change — the checkbox reflects the UNCHANGED React
      // state (still checked) because guardedUpdate never called applyChange().
      await expect(wizard.discardConfirmModal).toBeVisible();
      await expect(checkboxA).toBeChecked();

      // "Keep Editing" — closes the modal without applying the exclusion.
      await wizard.cancelDiscard();
      await expect(wizard.discardConfirmModal).not.toBeVisible();
      await expect(checkboxA).toBeChecked();

      // The edit survived the whole detour — going forward again shows it unchanged.
      await wizard.goNextFromStep3();
      await wizard.step4NextButton.click();
      await expect(subject).toHaveValue('Edit that must survive a cancelled navigation');
      expect(await wizard.hasEditedIndicator(subject)).toBe(true);

      // Now attempt the SAME guarded change again and discard this time.
      await wizard.goBack();
      await wizard.goBack();
      await wizard.toggleInvoiceExclusion(vendorName, invoiceA.invoiceNumber!);
      await expect(wizard.discardConfirmModal).toBeVisible();

      await wizard.confirmDiscard();
      await expect(wizard.discardConfirmModal).not.toBeVisible();
      // The exclusion is now APPLIED (the pending change ran after clearing overrides).
      await expect(checkboxA).not.toBeChecked();

      // The edit is GONE — the field is back to its generated baseline.
      await wizard.goNextFromStep3();
      await wizard.step4NextButton.click();
      await expect(subject).toHaveValue(baseline);
      expect(await wizard.hasEditedIndicator(subject)).toBe(false);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: No edits, no modal
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — no edits means no modal (Scenario 5)', () => {
  test('A guarded change with no prior edits applies immediately, without showing the discard modal', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Clean Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Clean Source`,
        totalAmount: 10000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Clean` });
      const invoiceA = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-CLEAN-001`,
        amount: 200,
        date: '2026-06-07',
        status: 'pending',
      });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-CLEAN-002`,
        amount: 250,
        date: '2026-06-08',
        status: 'pending',
      });

      const vendorName = `${testPrefix} Clean Vendor`;
      await wizard.goto();
      await wizard.selectUseCase('claim');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();

      const checkboxA = wizard.invoiceRowCheckbox(vendorName, invoiceA.invoiceNumber!);
      await expect(checkboxA).toBeChecked();
      await wizard.toggleInvoiceExclusion(vendorName, invoiceA.invoiceNumber!);

      await expect(wizard.discardConfirmModal).not.toBeVisible();
      await expect(checkboxA).not.toBeChecked();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Preview modal opens successfully with edited content
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — preview modal reflects live edits (Scenario 6)', () => {
  test('Editing fields then opening the PDF preview modal succeeds (hardened content-check passes with edited content feeding generation)', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} PrevEdit Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} PrevEdit Source`,
        totalAmount: 10000,
        contactAddress: '1 Preview St, Testville',
        reference: 'Ref-PREVEDIT',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI PrevEdit` });
      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-PREVEDIT-001`,
        amount: 275,
        date: '2026-06-09',
        status: 'pending',
      });

      await reachStep5(wizard, sourceId);

      const vendorName = `${testPrefix} PrevEdit Vendor`;
      await wizard.editField(wizard.letterField('subject'), 'Edited subject before preview');
      await wizard.editField(
        wizard.usageField(vendorName, invoice.invoiceNumber!),
        'Edited usage before preview',
      );

      // openPdfPreviewModal() runs the full Story #1891 hardened content-check (CSP header +
      // zero-CSP-violation-messages) internally — reaching that success state at all proves
      // generation didn't choke on the edited overrides.
      await wizard.openPdfPreviewModal();
      await expect(wizard.pdfPreviewModalErrorBanner).not.toBeVisible();
      await wizard.closePdfPreviewModal();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Modal close/reopen is clean
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — preview modal close/reopen cleanup (Scenario 7)', () => {
  test('Closing then reopening the preview modal works cleanly, with a fresh blob URL each time', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Reopen Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Reopen Source`,
        totalAmount: 10000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Reopen` });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-REOPEN-001`,
        amount: 175,
        date: '2026-06-10',
        status: 'pending',
      });

      await reachStep5(wizard, sourceId);

      await wizard.openPdfPreviewModal();
      const firstSrc = await wizard.getPreviewSrc();
      expect(firstSrc).toMatch(/^blob:/);

      await wizard.closePdfPreviewModal();
      await expect(wizard.pdfPreviewModal).not.toBeVisible();
      await expect(wizard.previewPdfButton).toBeEnabled();

      await wizard.openPdfPreviewModal();
      const secondSrc = await wizard.getPreviewSrc();
      expect(secondSrc).toMatch(/^blob:/);
      // A fresh object URL each open — no stale/revoked-URL reuse across the close/reopen
      // cycle (each `URL.createObjectURL()` call yields a unique URL; ReportWizardPage.tsx
      // explicitly revokes the previous one in the same handler that creates the new one).
      expect(secondSrc).not.toBe(firstSrc);

      await wizard.closePdfPreviewModal();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Download completes for edited content
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — download with edits (Scenario 8)', () => {
  test('Downloading after editing content completes and produces a non-trivial PDF file', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} DlEdit Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} DlEdit Source`,
        totalAmount: 10000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI DlEdit` });
      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-DLEDIT-001`,
        amount: 320,
        date: '2026-06-11',
        status: 'pending',
      });

      await reachStep5(wizard, sourceId);
      const vendorName = `${testPrefix} DlEdit Vendor`;
      await wizard.editField(
        wizard.usageField(vendorName, invoice.invoiceNumber!),
        'A distinctive edited usage string, unique enough to prove edits reach generation',
      );

      const today = new Date().toISOString().slice(0, 10);
      const slug = `${testPrefix} DlEdit Source`
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');
      const download = await wizard.download();
      expect(download.suggestedFilename()).toBe(`claim-${slug}-${today}.pdf`);

      // This project has no PDF-text-extraction library in its E2E dependencies (no
      // pdf-parse/pdfjs — confirmed via grep across e2e/ and the root package.json) and no
      // established precedent for reading downloaded-PDF byte content in any existing spec.
      // Consistent with Story #1879/#1899's own established boundary (PDF byte-content
      // assertions belong to the Jest `realRender.test.ts` unit test, per the QA spec), this
      // scenario asserts flow completion plus a non-trivial file size as the E2E-reachable
      // proxy for "generation actually produced real PDF content", not the literal edited
      // string's presence in the bytes.
      const filePath = await download.path();
      expect(filePath, 'Download must have saved to a local temp file').toBeTruthy();
      const stats = statSync(filePath!);
      expect(stats.size).toBeGreaterThan(1000);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Upload to Paperless with edits
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

test.describe('Report wizard editable content — Paperless upload with edits (Scenario 9)', () => {
  test('Uploading to Paperless after editing content succeeds and posts a multipart request', async ({
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
          body: JSON.stringify({ taskId: 'task-e2e-1900' }),
        });
      });

      vendorId = await createVendorViaApi(page, { name: `${testPrefix} UpEdit Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} UpEdit Source`,
        totalAmount: 10000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI UpEdit` });
      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-UPEDIT-001`,
        amount: 210,
        date: '2026-06-12',
        status: 'pending',
      });

      await reachStep5(wizard, sourceId);
      const vendorName = `${testPrefix} UpEdit Vendor`;
      await wizard.editField(
        wizard.usageField(vendorName, invoice.invoiceNumber!),
        'Edited usage before Paperless upload',
      );

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
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Mark Claimed + #1891 excluded-lines warning regression
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — mark-claimed warning regression (Scenario 10)', () => {
  test('The #1891 excluded-lines claim warning still shows correctly when step-5 content has also been edited', async ({
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
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} ClaimEdit Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} ClaimEdit Source`,
        totalAmount: 10000,
      });
      workItemAId = await createWorkItemViaApi(page, { title: `${testPrefix} WI ClaimEdit A` });
      workItemBId = await createWorkItemViaApi(page, { title: `${testPrefix} WI ClaimEdit B` });

      const invoice = await seedInvoiceWithTwoLines(
        page,
        vendorId,
        sourceId,
        workItemAId,
        workItemBId,
        { invoiceNumber: `${testPrefix}-CLAIMEDIT-001`, date: '2026-06-13', status: 'pending' },
        { amount: 200, description: `${testPrefix} ClaimEdit Line A` },
        { amount: 200, description: `${testPrefix} ClaimEdit Line B` },
      );

      const vendorName = `${testPrefix} ClaimEdit Vendor`;
      await wizard.goto();
      await wizard.selectUseCase('claim');
      await wizard.goNextFromStep1();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();

      // Partial line exclusion (indeterminate TriState) — same #1891 setup as
      // reportWizardExpansion.spec.ts Scenario 6.
      await wizard.invoiceExpandToggle(vendorName, invoice.invoiceNumber!).click();
      await wizard
        .itemExclusionCheckbox(vendorName, invoice.invoiceNumber!, `${testPrefix} ClaimEdit Line A`)
        .click();

      await wizard.goNextFromStep3();
      await wizard.step4NextButton.click();

      // Edit a content field — proves the two features (line exclusion + content overrides)
      // coexist without interfering with each other.
      await wizard.editField(
        wizard.usageField(vendorName, invoice.invoiceNumber!),
        'Edited usage alongside a partial line exclusion',
      );

      await wizard.clickMarkClaimed();
      await expect(wizard.markClaimedWarningBlock).toBeVisible();
      await expect(wizard.markClaimedWarningBlock).toHaveText(
        /^1 invoice\(s\) will be claimed in full even though/,
      );
      await wizard.confirmClaim();

      await expect(wizard.claimSuccessBanner).toBeVisible();
      await expect(wizard.claimSuccessBanner).toContainText('1 invoice(s) marked as claimed');
    } finally {
      if (workItemAId) await deleteWorkItemViaApi(page, workItemAId);
      if (workItemBId) await deleteWorkItemViaApi(page, workItemBId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: Mobile — cover letter labels visible; table content has a mobile-card fallback
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Report wizard editable content — mobile invoice card fallback (Scenario 11)',
  { tag: '@responsive' },
  () => {
    test('Cover letter fields render with visible labels on mobile, AND the invoice table renders real, editable row content via the mobile-card fallback', async ({
      page,
      testPrefix,
    }) => {
      test.skip(test.info().project.name !== 'mobile', 'Mobile-only layout check');
      const wizard = new ReportWizardPage(page);

      let vendorId = '';
      let sourceId = '';
      let workItemId = '';
      try {
        vendorId = await createVendorViaApi(page, { name: `${testPrefix} Mobile Vendor` });
        sourceId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} Mobile Source`,
          totalAmount: 10000,
          contactAddress: '1 Mobile St, Testville',
          reference: 'Ref-MOBILE',
        });
        workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Mobile` });
        const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
          invoiceNumber: `${testPrefix}-MOBILE-001`,
          amount: 190,
          date: '2026-06-14',
          status: 'pending',
        });

        await reachStep5(wizard, sourceId);

        // The cover letter card has no mobile-specific CSS at all — its visibly-labelled
        // fields (this story's UX requirement for mobile) render exactly as on desktop.
        await expect(wizard.coverLetterCard).toBeVisible();
        await expect(page.getByText('Subject', { exact: true })).toBeVisible();
        await expect(wizard.letterField('subject')).toBeVisible();

        // The desktop `<table>` is correctly hidden below 767px (`ReportContentEditor.module.css`
        // `@media (max-width: 767px) { .table { display: none; } }`).
        await expect(wizard.contentTable).not.toBeVisible();

        // Fixed (#1904): the invoice table's mobile-card fallback renders in its place, with
        // the same row data a desktop user would see in the `<table>`.
        const vendorName = `${testPrefix} Mobile Vendor`;
        await expect(wizard.mobileCardList).toBeVisible();
        const card = wizard.mobileCard(vendorName, invoice.invoiceNumber!);
        await expect(card).toBeVisible();
        await expect(card).toContainText(vendorName);
        await expect(card).toContainText(invoice.invoiceNumber!);

        // Proves the row is genuinely EDITABLE on mobile, not just readable text — the
        // original bug (#1904) was that a mobile user could neither see NOR edit any invoice
        // row content.
        const usage = wizard.mobileUsageField(vendorName, invoice.invoiceNumber!);
        await expect(usage).toBeVisible();
        expect(await wizard.hasEditedIndicator(usage)).toBe(false);
        await wizard.editField(usage, 'Edited from the mobile card');
        await expect(usage).toHaveValue('Edited from the mobile card');
        expect(await wizard.hasEditedIndicator(usage)).toBe(true);
        await wizard.resetField(usage);
        expect(await wizard.hasEditedIndicator(usage)).toBe(false);
      } finally {
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
        if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: Mobile — reset button meets the 44px touch-target minimum
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Report wizard editable content — mobile touch target size (Scenario 12)',
  { tag: '@responsive' },
  () => {
    test('The per-field reset button meets the WCAG 2.5.5 AA 44x44px minimum touch target size', async ({
      page,
      testPrefix,
    }) => {
      test.skip(test.info().project.name !== 'mobile', 'Mobile-only touch-target check');
      const wizard = new ReportWizardPage(page);

      let vendorId = '';
      let sourceId = '';
      let workItemId = '';
      try {
        vendorId = await createVendorViaApi(page, { name: `${testPrefix} Touch Vendor` });
        sourceId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} Touch Source`,
          totalAmount: 10000,
          contactAddress: '1 Touch St, Testville',
          reference: 'Ref-TOUCH',
        });
        workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Touch` });
        await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
          invoiceNumber: `${testPrefix}-TOUCH-001`,
          amount: 210,
          date: '2026-06-15',
          status: 'pending',
        });

        await reachStep5(wizard, sourceId);

        // The cover letter card is visible/usable on mobile (see Scenario 11) — edit the
        // Subject field to make its reset button appear, then measure it.
        const subject = wizard.letterField('subject');
        await wizard.editField(subject, 'Edited to surface the reset button');
        const resetButton = wizard.resetButtonFor(subject);
        await expect(resetButton).toBeVisible();

        const box = await resetButton.boundingBox();
        expect(box, 'Reset button must have a bounding box').not.toBeNull();
        // Fixed (#1905): EditableField.module.css now sizes `.resetButton` with explicit
        // `min-width`/`min-height: 44px` (padding 10px + a matching -10px margin keep the
        // visible icon's footprint unchanged while expanding the actual hit target) — meets
        // the WCAG 2.5.5 AA 44x44px minimum.
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      } finally {
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
        if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13: Keyboard-only — reachable fields show a box-shadow focus ring
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — keyboard focus rings (Scenario 13)', () => {
  test('Tabbing between cover letter fields reaches them via the keyboard and shows a box-shadow focus ring, never a plain outline', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Kbd Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Kbd Source`,
        totalAmount: 10000,
        contactAddress: '1 Kbd St, Testville',
        reference: 'Ref-KBD',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Kbd` });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-KBD-001`,
        amount: 160,
        date: '2026-06-16',
        status: 'pending',
      });

      await reachStep5(wizard, sourceId);

      // Subject and Body are both ALWAYS-present EditableFields (never gated on a non-null
      // value, unlike Recipient/Reference), rendered adjacent in the DOM — a real Shift+Tab
      // hop from Body proves keyboard reachability lands on Subject deterministically.
      const body = wizard.letterField('body');
      const subject = wizard.letterField('subject');
      await body.focus();
      await expect(body).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(subject).toBeFocused();

      const focusStyles = await subject.evaluate((el) => {
        const cs = getComputedStyle(el as HTMLElement);
        return { outlineStyle: cs.outlineStyle, boxShadow: cs.boxShadow };
      });
      expect(focusStyles.outlineStyle).toBe('none');
      expect(focusStyles.boxShadow).not.toBe('none');
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 14: Skip-note for a per-document fetch failure (footnoteFetchFailed)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — skip note on document fetch failure (Scenario 14)', () => {
  test('A linked document that cannot be fetched for PDF attachment produces a footnoteFetchFailed skip note on the step-5 page', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Skip Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Skip Source`,
        totalAmount: 10000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Skip` });
      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-SKIP-001`,
        amount: 240,
        date: '2026-06-17',
        status: 'pending',
      });
      // No real Paperless-ngx testcontainer is configured in this E2E environment (see the
      // e2e-test-engineer agent memory) — `PAPERLESS_URL` is unset, so the server's
      // `/api/paperless/documents/:id/preview` proxy the app fetches for PDF attachment
      // deterministically returns `PAPERLESS_NOT_CONFIGURED` (503). `merge.ts` catches that
      // per-document (`!response.ok`) and records a `footnoteFetchFailed` skip entry rather
      // than failing generation outright — this is a NATURALLY reachable condition, not one
      // requiring a `page.route()` mock.
      await linkDocumentToInvoiceViaApi(page, invoice.id, 999001);

      await reachStep5(wizard, sourceId);

      // attachDocuments defaults to true — Download PDF triggers generation, which attempts
      // (and fails) to fetch the linked document.
      const today = new Date().toISOString().slice(0, 10);
      const slug = `${testPrefix} Skip Source`
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');
      const download = await wizard.download();
      expect(download.suggestedFilename()).toBe(`claim-${slug}-${today}.pdf`);

      await expect(wizard.skippedDocumentsNote).toBeVisible();
      await expect(wizard.skippedDocumentsNote).toContainText(`${testPrefix} Skip Vendor`);
      await expect(wizard.skippedDocumentsNote).toContainText('Document could not be retrieved');
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 15: Report-language change is a guarded mutation too (regression guard for #1907)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — report-language guard (Scenario 15)', () => {
  test('Changing the report language on the Settings step while content edits are dirty shows the discard-confirm modal, consistent with the attach-documents/cover-letter controls on the same step', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} LangGuard Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} LangGuard Source`,
        totalAmount: 10000,
        contactAddress: '1 LangGuard St, Testville',
        reference: 'Ref-LANGGUARD',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI LangGuard` });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-LANGGUARD-001`,
        amount: 175,
        date: '2026-06-18',
        status: 'pending',
      });

      await reachStep5(wizard, sourceId);
      const subject = wizard.letterField('subject');
      const dirtiedValue = 'Edit that must survive a cancelled language change';
      await wizard.editField(subject, dirtiedValue);
      expect(await wizard.hasEditedIndicator(subject)).toBe(true);

      // Back to Settings (step 4) — one `goBack()` from step 5 lands directly there (the
      // single-Back-button buttonRow, same as `reachStep5`'s own navigation).
      await wizard.goBack();
      await expect(wizard.reportLanguageRadio('en')).toBeChecked();

      // Fixed (#1907): `onReportLanguageChange` is now wrapped in `guardedUpdate`, matching
      // the attach-documents/cover-letter checkboxes on the same step — the change is
      // intercepted while dirty instead of silently applying.
      await wizard.selectReportLanguage('de');
      await expect(wizard.discardConfirmModal).toBeVisible();
      // React state is unchanged — guardedUpdate never ran the pending action.
      await expect(wizard.reportLanguageRadio('en')).toBeChecked();
      await expect(wizard.reportLanguageRadio('de')).not.toBeChecked();

      // "Keep Editing" — closes the modal without applying the language change.
      await wizard.cancelDiscard();
      await expect(wizard.discardConfirmModal).not.toBeVisible();
      await expect(wizard.reportLanguageRadio('en')).toBeChecked();

      await wizard.step4NextButton.click();
      await expect(subject).toHaveValue(dirtiedValue);
      expect(await wizard.hasEditedIndicator(subject)).toBe(true);

      // Attempt again and discard this time — the language change applies AND the edit clears
      // (same "discard clears overrides THEN applies the change" contract as Scenario 4).
      await wizard.goBack();
      await wizard.selectReportLanguage('de');
      await expect(wizard.discardConfirmModal).toBeVisible();
      await wizard.confirmDiscard();
      await expect(wizard.discardConfirmModal).not.toBeVisible();
      await expect(wizard.reportLanguageRadio('de')).toBeChecked();

      await wizard.step4NextButton.click();
      // Not asserting an exact baseline value here (unlike Scenario 4): the regenerated
      // content is now in German, so the pre-edit English baseline string no longer applies —
      // clearing of the override (and the dirtied English text being gone) is enough proof.
      expect(await wizard.hasEditedIndicator(subject)).toBe(false);
      await expect(subject).not.toHaveValue(dirtiedValue);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});
