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
 *   happens just by arriving on step 5. Story #1923: also doubles as the AC3.3 non-claim
 *   regression guard for the source-info metadata block (uses `budget-overview`, not `claim`).
 * - Scenario 1b: Desktop — regression guard for #1908 (fixed): the mobile-card fallback (added
 *   for #1904) must stay hidden at desktop width. It previously lacked a base `display: none`
 *   and duplicated the table; the fix landed in `ReportContentEditor.module.css`.
 * - Scenario 2: Editing a field shows its edited-dot indicator on THAT field only — not on
 *   sibling fields, not on the same field for a different invoice row. Since Issue #1959 the
 *   table row's only editable field is `usageText` (the `attachmentsNote` `EditableField`/column
 *   is gone — the note is read-only meta text now), so the sibling-field axis is exercised
 *   against the cover letter's `subject`/`body`, and the removed field's absence is asserted
 *   here as "exactly one textbox per row".
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
 *   content edits are also present (regression guard — the two features are independent). Under
 *   the current invoice/deposit claim-scope split (`ReportWizardPage.tsx`'s `handleMarkClaimed`),
 *   this scenario's fixture — one invoice with a partially-excluded line and NO deposits — has
 *   an empty `invoiceIds` (the excluded line keeps the invoice out) AND an empty `depositIds`
 *   (there are none), so confirming hits the client-side "nothing claimable" guard: no API call,
 *   `sourceReports.claimNothingClaimable` shown as the error banner instead of a success banner.
 *   The warning block itself is asserted BEFORE confirming — it renders based on excluded lines
 *   alone, independent of whether the eventual submit is a no-op.
 * - Scenario 11: Mobile (≤767px) — cover letter fields render with visible labels, AND the
 *   invoice table's mobile-card fallback (`.mobileCardList`/`.mobileCard`/`.mobileCardRow`)
 *   renders real, editable row content in the table's place (fixed #1904 — previously the
 *   table just disappeared below the breakpoint with nothing to replace it). The follow-up bug
 *   (#1908: the fallback lacked a default `display: none`, so it also rendered — duplicated —
 *   on desktop/tablet) is fixed and regression-guarded by Scenario 1b above.
 * - Scenario 12: Mobile (≤767px) — the per-field reset button meets the WCAG 2.5.5 AA 44×44px
 *   minimum touch target size (fixed #1905 — was 24×24px).
 * - Scenario 13: Keyboard-only — Tab/Shift+Tab reaches a field and it shows a box-shadow focus
 *   ring (never `outline: 2px solid`). Also asserts (Round 3 regression guard) that an at-rest
 *   table-cell field's computed `background-color` genuinely resolves to the
 *   `--color-bg-tertiary` token — falsifiable by the pre-fix `:global()` dead-CSS bug in
 *   `EditableField.module.css`.
 * - Scenario 14: A per-document PDF-attachment fetch failure (naturally reachable in this E2E
 *   environment since no real Paperless instance is configured — the server's
 *   `/api/paperless/documents/:id/preview` proxy returns `PAPERLESS_NOT_CONFIGURED`) produces a
 *   `footnoteFetchFailed` skip note on the step-5 page.
 * - Scenario 15: Regression guard for #1907 — changing the report language on step 4 (Settings)
 *   while content edits are dirty shows the discard-confirm modal, exactly like the
 *   attach-documents/cover-letter checkboxes on the same step (previously it bypassed the
 *   guard and applied silently).
 *
 * Story #1923 (report table cleanup): inline deposit label, claim metadata suppression,
 * total-only summary, area in the Usage cell. Issue #1959 then REPLACED this story's `†`/`‡`
 * markers + footnote list with inline `(partial)`/`(less deposit)` labels in the Allocated Amount
 * cell, and merged the area sub-line and the (previously editable, separately-columned)
 * attachments note into ONE read-only grey meta line in the Usage cell. See `ReportWizardPage.ts`'s
 * class docstring for the full locator reference (`sourceInfoBlock`, `depositBadge`/
 * `mobileDepositBadge`, `inlineNote`/`mobileInlineNote`, `usageMetaText`/`mobileUsageMetaText`,
 * `summaryTable`/`summaryTableRows`, and `footnotesBlock`/`footnoteItems` — zero for
 * constituted-deposit-only scenarios (Scenario 17), one deduplicated entry for split/
 * deposit-reduced scenarios (Issue #1965)).
 * - Scenario 16: A `claim` report omits the source-info metadata block entirely (AC3.1) — the
 *   counterpart to Scenario 1's `budget-overview` regression guard (AC3.3).
 * - Scenario 17: A constituted-deposit row (the row's allocation is made up entirely by a
 *   deposit tagged to the currently reported source) shows the inline "Deposit" badge on
 *   desktop, tablet, AND mobile, carries NO inline `(partial)`/`(less deposit)` note (nor either
 *   legacy `†`/`‡` glyph), and there is no footnotes block at all (AC2.1, AC2.2).
 * - Scenario 18: Every split invoice carries its OWN inline `(partial)` label in its Allocated
 *   Amount cell (Issue #1959, superseding AC1.1-AC1.2's shared unnumbered `†` marker). The
 *   footnote list now contains exactly ONE deduplicated legend sentence ("Amount shown reflects
 *   only the portion allocated to this source.") pushed by `buildReportContent.ts` because
 *   `splitInvoiceIds.size > 0` (Issue #1965).
 * - Scenario 19: Invoices spanning two or more statuses still produce exactly one summary row
 *   (`Total`) — no per-status subtotal rows (AC4.1-AC4.2).
 * - Scenario 20: A budget line linked to an item with an assigned area shows the item's leaf
 *   area name as read-only grey meta text inside the Usage cell on desktop, tablet, AND mobile —
 *   joined by " · " with the attachments note when the invoice also has a linked document (Issue
 *   #1959), never as a separate editable Attachments Note column, and never folded into the
 *   editable usage text (AC5.2, AC5.3); an invoice with neither renders no meta text and no
 *   empty gap (AC5.4, AC5.5).
 *
 * Issue #1932 (cover letter overhaul): formatted body, editable signature block, personal
 * sender, professional PDF layout. See `ReportWizardPage.ts`'s own "Issue #1932" docstring
 * paragraph for the full DOM/behavior reference (`letterField('signature')`, the new Closing
 * read-only row, AC 2.6's sender/signature interaction, and the CSS-only §5 reset-button fix).
 * - Scenario 21: Desktop, light mode — editing the signature and a genuinely multi-paragraph
 *   body (two paragraphs separated by a blank line) both survive an on-demand PDF
 *   preview/export round trip (AC 7.3's load-bearing multi-paragraph case — a single-line body
 *   would not exercise AC 1.1/1.2 at all).
 * - Scenario 22: Mobile viewport + dark mode — the identical signature/body edit flow, proving
 *   the same `EditableField` instances behave identically once dark mode (`data-theme`
 *   attribute, the established convention elsewhere in this directory, e.g.
 *   `budget-categories.spec.ts`) is layered on top of the mobile viewport already in effect for
 *   this project (tagged `@responsive`, gated to the `mobile` project only — same convention as
 *   Scenario 11/12).
 * - Scenario 23: AC 2.6 — editing the signature FIRST, then the sender, must NOT silently
 *   recompute/overwrite the explicit signature override from the new sender text. This is the
 *   regression guard for the #1932 headline fix (`applyOverrides.ts`).
 * - Scenario 24: Resetting an edited signature field reverts it to the generated baseline and
 *   the reset affordance disappears — also a live regression guard that the CSS-only §5
 *   reset-button fix (glyph sizing only, unchanged `resetButton` className/DOM structure) never
 *   broke the existing `resetButtonFor`/`hasEditedIndicator` POM locators.
 *
 * PDF generation (pdfmake + pdf-lib via dynamic `import()`) can be slow, especially on a cold
 * chunk load — every scenario that opens the preview modal, downloads, or uploads uses
 * `test.slow()`. As established in Scenario 8's own note, this project has no PDF-text-extraction
 * library in its E2E dependencies — Scenarios 21-23 assert the edited values via the live editor
 * fields (the same effective `ReportContent` object that feeds PDF generation) plus a successful,
 * CSP-hardened preview-modal open as the E2E-reachable proxy for "generation didn't choke on
 * this combination of overrides"; asserting the literal strings inside the PDF bytes is
 * `realRender.test.ts`'s job (AC 7.2, owned by `qa-integration-tester`).
 */

import { test, expect } from '../../fixtures/auth.js';
import { statSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { ReportWizardPage, type SourceReportUseCase } from '../../pages/ReportWizardPage.js';
import { API } from '../../fixtures/testData.js';
import {
  createVendorViaApi,
  deleteVendorViaApi,
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createAreaViaApi,
  deleteAreaViaApi,
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

/**
 * Creates a deposit on `invoiceId`, optionally tagged to a budget source
 * (`data.budgetSourceId`) — mirrors the established pattern in `reportWizardExpansion.spec.ts`
 * (Story #1891/#1895/#1896). Used by Scenario 17 to construct a constituted-deposit row (Story
 * #1923 AC2.1).
 */
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

/**
 * Creates an invoice whose funding is SPLIT across two distinct budget sources via two separate
 * budget lines (one work item per source) — the server's `isSplit` flag
 * (`sourceReportService.ts`) is true whenever an invoice's funding spans 2+ distinct budget
 * sources across budget lines and tagged deposits, so this genuinely produces a `†`-marked row
 * (not just a multi-line invoice within a single source, which `seedInvoiceWithTwoLines` above
 * produces and does NOT mark). Used by Scenario 18 (Story #1923 AC1).
 */
async function seedSplitInvoice(
  page: Page,
  vendorId: string,
  reportedSourceId: string,
  otherSourceId: string,
  reportedWorkItemId: string,
  otherWorkItemId: string,
  data: { invoiceNumber: string; date: string; status: 'pending' | 'paid' | 'claimed' },
  reportedAmount: number,
  otherAmount: number,
): Promise<InvoiceApiResponse> {
  const invoice = await createInvoiceViaApi(page, vendorId, {
    invoiceNumber: data.invoiceNumber,
    date: data.date,
    status: data.status,
    amount: reportedAmount + otherAmount,
  });
  const reportedBudgetId = await createWorkItemBudgetViaApi(page, reportedWorkItemId, {
    plannedAmount: reportedAmount,
    budgetSourceId: reportedSourceId,
  });
  await linkInvoiceToBudgetLineViaApi(page, invoice.id, {
    workItemBudgetId: reportedBudgetId,
    itemizedAmount: reportedAmount,
  });
  const otherBudgetId = await createWorkItemBudgetViaApi(page, otherWorkItemId, {
    plannedAmount: otherAmount,
    budgetSourceId: otherSourceId,
  });
  await linkInvoiceToBudgetLineViaApi(page, invoice.id, {
    workItemBudgetId: otherBudgetId,
    itemizedAmount: otherAmount,
  });
  return invoice;
}

/**
 * Walks a fresh wizard through steps 1-4 (single source, `useCase` defaults to `claim`) to land
 * on step 5.
 */
async function reachStep5(
  wizard: ReportWizardPage,
  sourceId: string,
  useCase: SourceReportUseCase = 'claim',
): Promise<void> {
  await wizard.goto();
  await wizard.selectUseCase(useCase);
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

      // Story #1923 AC3.3 regression guard: `budget-overview` (a non-claim use case) is
      // deliberately used here (rather than the file's usual `claim` default) so this scenario
      // doubles as proof the metadata block still renders for non-claim reports — see Scenario
      // 16 below for the claim counterpart (AC3.1: the block is entirely ABSENT for `claim`).
      await reachStep5(wizard, sourceId, 'budget-overview');

      // Live editable content is visible immediately — no generation, no loading state.
      await expect(wizard.letterField('subject')).toBeVisible();
      await expect(wizard.letterField('subject')).not.toBeEmpty();
      await expect(wizard.contentTable).toBeVisible();
      const vendorName = `${testPrefix} Live Vendor`;
      await expect(wizard.usageField(vendorName, invoice.invoiceNumber!)).toBeVisible();

      // Round 3 addition: the read-only source-info block (between the cover letter card and
      // the table heading) shows the source's name and type — scoped to the block itself so
      // this never collides with the source name appearing elsewhere on the page (e.g. a step
      // 2 radio label, were the user to navigate back).
      await expect(wizard.sourceInfoBlock).toBeVisible();
      await expect(wizard.sourceInfoBlock).toContainText(`${testPrefix} Live Source`);
      await expect(wizard.sourceInfoBlock).toContainText('Savings');

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
      const usageB = wizard.usageField(vendorName, invoiceB.invoiceNumber!);
      const subject = wizard.letterField('subject');
      const body = wizard.letterField('body');

      // Invoice A's linked document (seeded above) used to give its row a SECOND editable field
      // (the `Attachments note for …` `EditableField`) — Issue #1959 removed that column and
      // turned the note into read-only grey meta text inside the Usage cell. Asserted as a
      // positive/negative pair so this can't pass vacuously against a row that simply has no
      // linked document: the note text IS rendered, and the row has exactly ONE textbox (Usage).
      await expect(wizard.usageMetaText(vendorName, invoiceA.invoiceNumber!)).toHaveText(
        '1 attachment: Invoice',
      );
      await expect(
        wizard.contentTableRow(vendorName, invoiceA.invoiceNumber!).getByRole('textbox'),
      ).toHaveCount(1);

      // Baseline: nothing edited anywhere.
      expect(await wizard.hasEditedIndicator(usageA)).toBe(false);
      expect(await wizard.hasEditedIndicator(usageB)).toBe(false);
      expect(await wizard.hasEditedIndicator(subject)).toBe(false);
      expect(await wizard.hasEditedIndicator(body)).toBe(false);

      // Edit invoice A's usage field only.
      await wizard.editField(usageA, 'Custom usage note A');
      expect(await wizard.hasEditedIndicator(usageA)).toBe(true);
      // Same field TYPE on a DIFFERENT row: unaffected.
      expect(await wizard.hasEditedIndicator(usageB)).toBe(false);
      // Cover-letter fields: unaffected.
      expect(await wizard.hasEditedIndicator(subject)).toBe(false);
      expect(await wizard.hasEditedIndicator(body)).toBe(false);

      // Editing a SIBLING field (now the cover letter's subject — the table row has only one
      // editable field left) shows its own dot too, without disturbing the first, and still
      // without leaking onto its own sibling (`body`) or the other row.
      await wizard.editField(subject, 'Custom subject line');
      expect(await wizard.hasEditedIndicator(usageA)).toBe(true);
      expect(await wizard.hasEditedIndicator(subject)).toBe(true);
      expect(await wizard.hasEditedIndicator(body)).toBe(false);
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
  test('The #1891 excluded-lines claim warning still shows correctly when step-5 content has also been edited, and confirming a nothing-claimable selection surfaces the guard error', async ({
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
        /^1 invoice\(s\) have excluded line items/,
      );
      await wizard.confirmClaim();

      // Fixture has no deposits and the only invoice has an excluded line, so both invoiceIds
      // and depositIds are empty — the client-side guard fires without an API call and the
      // claim-success banner never renders (see docstring above / handleMarkClaimed's "both
      // empty" branch).
      await expect(wizard.claimErrorBanner).toBeVisible();
      await expect(wizard.claimErrorBanner).toHaveText(/^Nothing can be marked as claimed/);
      await expect(wizard.claimSuccessBanner).not.toBeVisible();
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
      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-KBD-001`,
        amount: 160,
        date: '2026-06-16',
        status: 'pending',
      });

      await reachStep5(wizard, sourceId);

      // Round 3 regression guard: EditableField's local `.field`/`.fieldTextarea` classes
      // (`EditableField.module.css`) replaced a `:global(.input)`/`:global(.textarea)`
      // composition that silently never matched the actual generated class names — dead CSS
      // that a pre-fix build would ship without any visible failure (the shared `.input`/
      // `.textarea` base rules from `shared.module.css` still applied, just none of
      // `EditableField`'s OWN background/border/transition rules did). Assert an at-rest
      // (unfocused) table-cell `usageText` field's computed `background-color` resolves to the
      // SAME color as the `--color-bg-tertiary` token — not transparent, not the page
      // background — which only holds true when `.field`'s `background-color:
      // var(--color-bg-tertiary)` rule genuinely applies. This is only falsifiable against a
      // real webpack build (CSS Modules class hashing), not a shallow markup check.
      const vendorName = `${testPrefix} Kbd Vendor`;
      const usageField = wizard.usageField(vendorName, invoice.invoiceNumber!);
      const bgCheck = await usageField.evaluate((el) => {
        const probe = document.createElement('div');
        probe.style.backgroundColor = 'var(--color-bg-tertiary)';
        document.body.appendChild(probe);
        const resolvedTertiary = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
          fieldBackground: getComputedStyle(el as HTMLElement).backgroundColor,
          resolvedTertiary,
        };
      });
      expect(bgCheck.fieldBackground).not.toBe('rgba(0, 0, 0, 0)');
      expect(bgCheck.fieldBackground).not.toBe('transparent');
      expect(bgCheck.fieldBackground).toBe(bgCheck.resolvedTertiary);

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

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 16: Claim reports omit the metadata block (Story #1923 AC3.1)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — claim reports omit the metadata block (Scenario 16)', () => {
  test('A claim report hides the source-info metadata block entirely, while the title, table, and summary still render (Story #1923 AC3.1, AC3.4)', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} ClaimMeta Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} ClaimMeta Source`,
        totalAmount: 10000,
        reference: 'Ref-CLAIMMETA',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI ClaimMeta` });
      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-CLAIMMETA-001`,
        amount: 300,
        date: '2026-06-05',
        status: 'pending',
      });

      // `reachStep5` defaults to `useCase: 'claim'`.
      await reachStep5(wizard, sourceId);

      // The block is entirely absent from the DOM (not merely hidden) — `toHaveCount(0)`,
      // not `not.toBeVisible()`, proves the `{!content.isClaim && (...)}` conditional actually
      // omits the render, matching the ux-designer spec's "no placeholder, no ghost block" note.
      await expect(wizard.sourceInfoBlock).toHaveCount(0);

      // The rest of step 5 is unaffected: title, table, and summary still render normally.
      await expect(wizard.contentTable).toBeVisible();
      const vendorName = `${testPrefix} ClaimMeta Vendor`;
      await expect(wizard.contentTableRow(vendorName, invoice.invoiceNumber!)).toBeVisible();
      await expect(wizard.summaryTable).toBeVisible();
      await expect(wizard.summaryTableRows).toHaveCount(1);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 17: Constituted-deposit row shows the inline Deposit badge and no deposit-reduced
// note (Story #1923 AC2.1, AC2.2; note shape updated by Issue #1959)
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Report wizard editable content — inline deposit badge (Scenario 17)',
  { tag: '@responsive' },
  () => {
    test('A row whose allocation is made up entirely by a deposit tagged to the reported source shows an inline "Deposit" badge and no "(less deposit)" note, with no footnote entry, on desktop, tablet, and mobile', async ({
      page,
      testPrefix,
    }) => {
      const wizard = new ReportWizardPage(page);

      let vendorId = '';
      // Source A holds the invoice's own budget line; source B only ever gets contribution via
      // the tagged deposit — mirrors `reportWizardExpansion.spec.ts` Scenario 5's "zero-line
      // source, surfaced via the tagged deposit" shape, viewed from source B's own report.
      let sourceAId = '';
      let sourceBId = '';
      let workItemId = '';
      try {
        vendorId = await createVendorViaApi(page, { name: `${testPrefix} Deposit Vendor` });
        sourceAId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} Deposit Source A`,
          totalAmount: 10000,
        });
        sourceBId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} Deposit Source B`,
          totalAmount: 10000,
        });
        workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Deposit` });

        const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceAId, {
          invoiceNumber: `${testPrefix}-DEPOSIT-001`,
          amount: 1000,
          date: '2026-06-08',
          status: 'paid',
        });
        await createDepositViaApi(page, invoice.id, {
          amount: 150,
          dueDate: '2026-06-12',
          status: 'paid',
          entryType: 'deposit',
          budgetSourceId: sourceBId,
        });

        // View source B's own claim report — this invoice has zero budget lines for B, so its
        // entire row here is the tagged deposit: isSplit (spans A + B) with an empty
        // `budgetLines` slice for B → constituted-deposit, so `isSplit` is false (no
        // budget-line split for B) and `isDepositReduced` is false (the deposit IS tagged to B,
        // not "reduced") → NEITHER inline note (Issue #1959 replaced the old †/‡ markers with
        // the `(partial)`/`(less deposit)` labels asserted against here).
        await reachStep5(wizard, sourceBId);

        const vendorName = `${testPrefix} Deposit Vendor`;
        const isMobile = test.info().project.name === 'mobile';

        if (isMobile) {
          await expect(wizard.mobileCardList).toBeVisible();
          const card = wizard.mobileCard(vendorName, invoice.invoiceNumber!);
          await expect(card).toBeVisible();
          const badge = wizard.mobileDepositBadge(vendorName, invoice.invoiceNumber!);
          await expect(badge).toBeVisible();
          await expect(badge).toHaveText('Deposit');
          // The badge is the row's ONLY allocated-amount annotation: no `(partial)`/`(less
          // deposit)` inline note (Issue #1959), and — belt and braces — neither legacy glyph.
          await expect(wizard.mobileInlineNote(vendorName, invoice.invoiceNumber!)).toHaveCount(0);
          const cardText = (await card.textContent()) ?? '';
          expect(cardText).not.toContain('†');
          expect(cardText).not.toContain('‡');
        } else {
          await expect(wizard.contentTable).toBeVisible();
          const row = wizard.contentTableRow(vendorName, invoice.invoiceNumber!);
          await expect(row).toBeVisible();
          const badge = wizard.depositBadge(vendorName, invoice.invoiceNumber!);
          await expect(badge).toBeVisible();
          await expect(badge).toHaveText('Deposit');
          await expect(wizard.inlineNote(vendorName, invoice.invoiceNumber!)).toHaveCount(0);
          const rowText = (await row.textContent()) ?? '';
          expect(rowText).not.toContain('†');
          expect(rowText).not.toContain('‡');
        }

        // No footnote entry: this is a constituted-deposit row — the allocation is made up
        // entirely by a deposit tagged to source B, so `isSplit` is false (only source B has
        // budget lines; the invoice is not split across sources), and `isDepositReduced` is also
        // false (the deposit constitutes the row, it does not reduce a gross amount).
        // `buildReportContent.ts` only pushes legend entries when `splitInvoiceIds.size > 0` or
        // `depositReducedInvoiceIds.size > 0` — neither condition holds here, so
        // `content.footnotes` stays empty and the block is absent from the DOM (Issue #1965).
        await expect(wizard.footnotesBlock).toHaveCount(0);
      } finally {
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
        if (sourceBId) await deleteBudgetSourceViaApi(page, sourceBId);
        if (sourceAId) await deleteBudgetSourceViaApi(page, sourceAId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 18: Split invoices carry an inline "(partial)" label AND produce one deduplicated
// legend entry in the footnotes block (Issue #1965)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — inline split label (Scenario 18)', () => {
  test('Two split invoices each show a grey inline "(partial)" note in their Allocated Amount cell, and produce exactly one deduplicated legend entry in the footnotes block', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let reportedSourceId = '';
    let otherSourceId = '';
    let reportedWorkItemId = '';
    let otherWorkItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Split Vendor` });
      reportedSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Split Source A`,
        totalAmount: 10000,
      });
      otherSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Split Source B`,
        totalAmount: 10000,
      });
      reportedWorkItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Split A` });
      otherWorkItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Split B` });

      const invoice1 = await seedSplitInvoice(
        page,
        vendorId,
        reportedSourceId,
        otherSourceId,
        reportedWorkItemId,
        otherWorkItemId,
        { invoiceNumber: `${testPrefix}-SPLIT-001`, date: '2026-06-10', status: 'pending' },
        100,
        200,
      );
      const invoice2 = await seedSplitInvoice(
        page,
        vendorId,
        reportedSourceId,
        otherSourceId,
        reportedWorkItemId,
        otherWorkItemId,
        { invoiceNumber: `${testPrefix}-SPLIT-002`, date: '2026-06-11', status: 'paid' },
        150,
        250,
      );

      await reachStep5(wizard, reportedSourceId);

      const vendorName = `${testPrefix} Split Vendor`;
      const row1 = wizard.contentTableRow(vendorName, invoice1.invoiceNumber!);
      const row2 = wizard.contentTableRow(vendorName, invoice2.invoiceNumber!);

      // Issue #1959 replaced the shared, unnumbered `†` marker + its footnote entry with a grey
      // inline label appended to each split row's Allocated Amount cell. Positive first: exactly
      // one such note per split row, reading `(partial)` — the row is genuinely split (its own
      // €100.00 / €150.00 portion of a €300.00 / €400.00 invoice), so this cannot pass on a
      // mis-seeded, non-split page.
      const note1 = wizard.inlineNote(vendorName, invoice1.invoiceNumber!);
      const note2 = wizard.inlineNote(vendorName, invoice2.invoiceNumber!);
      await expect(note1).toHaveCount(1);
      await expect(note2).toHaveCount(1);
      await expect(note1).toHaveText('(partial)');
      await expect(note2).toHaveText('(partial)');
      // The label lives in the amount cell, not appended to the editable usage text.
      await expect(row1).toContainText('€100.00 (partial)');
      await expect(row2).toContainText('€150.00 (partial)');

      // Negatives, each paired with the positives above: neither legacy footnote glyph survives
      // anywhere in the row (numbered or not).
      const row1Text = (await row1.textContent()) ?? '';
      const row2Text = (await row2.textContent()) ?? '';
      expect(row1Text).not.toContain('†');
      expect(row2Text).not.toContain('†');
      expect(row1Text).not.toContain('‡');
      expect(row2Text).not.toContain('‡');

      // Issue #1965: `buildReportContent.ts` now pushes ONE deduplicated legend entry to
      // `content.footnotes` whenever `splitInvoiceIds.size > 0`. Both invoices in this fixture
      // are split, so the block must be present with exactly 1 item — deduped even though two
      // rows triggered it.
      await expect(wizard.footnotesBlock).toHaveCount(1);
      await expect(wizard.footnoteItems).toHaveCount(1);

      // The long-form legend sentence must be present in the footnote list.
      const pageText = (await page.locator('main').textContent()) ?? '';
      expect(pageText).toContain(
        'Amount shown reflects only the portion allocated to this source.',
      );
      expect(pageText).toContain('(partial)');
    } finally {
      if (reportedWorkItemId) await deleteWorkItemViaApi(page, reportedWorkItemId);
      if (otherWorkItemId) await deleteWorkItemViaApi(page, otherWorkItemId);
      if (reportedSourceId) await deleteBudgetSourceViaApi(page, reportedSourceId);
      if (otherSourceId) await deleteBudgetSourceViaApi(page, otherSourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 19: Summary shows only the Total row, even across multiple statuses
// (Story #1923 AC4)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — total-only summary (Scenario 19)', () => {
  test('Invoices spanning two statuses (pending + paid) still produce exactly one summary row — Total — with no per-status Subtotal rows', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Summary Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Summary Source`,
        totalAmount: 10000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Summary` });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-SUMMARY-001`,
        amount: 300,
        date: '2026-06-13',
        status: 'pending',
      });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-SUMMARY-002`,
        amount: 450,
        date: '2026-06-14',
        status: 'paid',
      });

      // `reachStep5` defaults to `useCase: 'claim'` — pending + paid is already 2+ statuses.
      await reachStep5(wizard, sourceId);

      await expect(wizard.summaryTable).toBeVisible();
      await expect(wizard.summaryTableRows).toHaveCount(1);
      await expect(wizard.summaryTableRows.first()).toContainText('Total');
      // Sum of both invoices' allocated amounts (300 + 450 = 750).
      await expect(wizard.summaryTableRows.first()).toContainText('750');

      const summaryText = (await wizard.summaryTable.textContent()) ?? '';
      expect(summaryText).not.toContain('Subtotal');
      expect(summaryText).not.toContain('Outstanding');
      expect(summaryText).not.toContain('Quotation');
      expect(summaryText).not.toContain('Claimed');
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 20: Area + attachments meta line in the Usage cell (Story #1923 AC5, reshaped by
// Issue #1959 — one combined grey read-only meta line, no separate Attachments Note column)
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Report wizard editable content — area/attachments meta line in Usage cell (Scenario 20)',
  { tag: '@responsive' },
  () => {
    test('A budget line linked to an item with an assigned area renders the leaf area name as read-only grey meta text inside the Usage cell, joined with the attachments note by " · " when the invoice also has a linked document, and never as a separate editable Attachments Note column (desktop, tablet, mobile); an item with neither renders no meta text at all', async ({
      page,
      testPrefix,
    }) => {
      const wizard = new ReportWizardPage(page);

      let vendorId = '';
      let sourceId = '';
      let areaId = '';
      let workItemWithAreaId = '';
      let workItemNoAreaId = '';
      try {
        vendorId = await createVendorViaApi(page, { name: `${testPrefix} Area Vendor` });
        sourceId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} Area Source`,
          totalAmount: 10000,
        });
        areaId = await createAreaViaApi(page, { name: `${testPrefix} Kitchen` });
        workItemWithAreaId = await createWorkItemViaApi(page, {
          title: `${testPrefix} WI HasArea`,
          areaId,
        });
        workItemNoAreaId = await createWorkItemViaApi(page, { title: `${testPrefix} WI NoArea` });

        const invoiceWithArea = await seedAllocatedInvoice(
          page,
          workItemWithAreaId,
          vendorId,
          sourceId,
          {
            invoiceNumber: `${testPrefix}-AREA-001`,
            amount: 120,
            date: '2026-06-20',
            status: 'pending',
          },
        );
        const invoiceNoArea = await seedAllocatedInvoice(
          page,
          workItemNoAreaId,
          vendorId,
          sourceId,
          {
            invoiceNumber: `${testPrefix}-AREA-002`,
            amount: 130,
            date: '2026-06-21',
            status: 'pending',
          },
        );
        // Third row: same area-bearing work item, but this invoice ALSO has a linked document,
        // so its meta line must carry BOTH halves joined by " · " (Issue #1959 folded the old
        // separate, editable Attachments Note column into this same line).
        const invoiceWithBoth = await seedAllocatedInvoice(
          page,
          workItemWithAreaId,
          vendorId,
          sourceId,
          {
            invoiceNumber: `${testPrefix}-AREA-003`,
            amount: 140,
            date: '2026-06-22',
            status: 'pending',
          },
        );
        await linkDocumentToInvoiceViaApi(page, invoiceWithBoth.id, 555020);

        await reachStep5(wizard, sourceId);

        const vendorName = `${testPrefix} Area Vendor`;
        const areaName = `${testPrefix} Kitchen`;
        const isMobile = test.info().project.name === 'mobile';

        // Only the container/locator flavour differs per viewport — the desktop meta line is a
        // `<div>` in the Usage `<td>`, the mobile one a `<span>` in the Usage card row; both are
        // `[class*="usageMetaText"]` and both are read-only, so the assertions themselves are
        // identical for all three projects.
        const metaOf = (invoiceNumber: string) =>
          isMobile
            ? wizard.mobileUsageMetaText(vendorName, invoiceNumber)
            : wizard.usageMetaText(vendorName, invoiceNumber);
        const containerOf = (invoiceNumber: string) =>
          isMobile
            ? wizard.mobileCard(vendorName, invoiceNumber)
            : wizard.contentTableRow(vendorName, invoiceNumber);
        const usageOf = (invoiceNumber: string) =>
          isMobile
            ? wizard.mobileUsageField(vendorName, invoiceNumber)
            : wizard.usageField(vendorName, invoiceNumber);

        // Area only → the leaf area name alone, as read-only meta text.
        const areaOnlyMeta = metaOf(invoiceWithArea.invoiceNumber!);
        await expect(areaOnlyMeta).toBeVisible();
        await expect(areaOnlyMeta).toHaveText(areaName);

        // Area + linked document → both halves, in that order, joined by " · ".
        const bothMeta = metaOf(invoiceWithBoth.invoiceNumber!);
        await expect(bothMeta).toBeVisible();
        await expect(bothMeta).toHaveText(`${areaName} · 1 attachment: Invoice`);

        // Neither → no meta element at all (not an empty one, no reserved gap).
        await expect(metaOf(invoiceNoArea.invoiceNumber!)).toHaveCount(0);

        // The meta text is READ-ONLY: even the row that has an attachments note exposes exactly
        // ONE textbox (its Usage field) — the `Attachments note for …` `EditableField` is gone.
        // Paired with the positive above, which proves the note is genuinely present, so this
        // cannot pass just because the row has no attachment.
        await expect(containerOf(invoiceWithBoth.invoiceNumber!).getByRole('textbox')).toHaveCount(
          1,
        );

        // Neither half of the meta line is folded into the EDITABLE usage text (AC5.3) — that
        // separation is what lets it survive manual edits and AI generation (Scenario 8 in
        // `reportWizardAiGeneration.spec.ts`).
        const usageValue = await usageOf(invoiceWithBoth.invoiceNumber!).inputValue();
        expect(usageValue).not.toBe('');
        expect(usageValue).not.toContain(areaName);
        expect(usageValue).not.toContain('attachment');

        // ...and there is no Attachments Note column header left on the desktop table (the
        // mobile cards have no header row at all, so this half is desktop/tablet only).
        if (!isMobile) {
          const headerRow = wizard.contentTable.locator('thead tr');
          await expect(headerRow).toContainText('Usage');
          await expect(headerRow).not.toContainText(/attachment/i);
        }
      } finally {
        if (workItemWithAreaId) await deleteWorkItemViaApi(page, workItemWithAreaId);
        if (workItemNoAreaId) await deleteWorkItemViaApi(page, workItemNoAreaId);
        if (areaId) await deleteAreaViaApi(page, areaId);
        if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 21: Cover letter overhaul — signature + multi-paragraph body, desktop light mode
// (Issue #1932, AC 7.3)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — cover letter overhaul, desktop light mode (Scenario 21)', () => {
  test('Editing the signature and a multi-paragraph body on step 5, then opening the PDF preview, reflects both edits (AC 7.3)', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Letter Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Letter Source`,
        totalAmount: 10000,
        contactAddress: '1 Letter St, Testville',
        reference: 'Ref-LETTER',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Letter` });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-LETTER-001`,
        amount: 400,
        date: '2026-06-22',
        status: 'pending',
      });

      await reachStep5(wizard, sourceId);

      // Positive existence check FIRST — a `hasEditedIndicator()` boolean-false check below
      // would otherwise pass just as vacuously against a field that never mounted (its
      // `.count() > 0` check returns `false` for zero matches without throwing) as the
      // `.not.toBeVisible()` calls flagged elsewhere in this file's Scenario 24 fix.
      await expect(wizard.coverLetterCard).toBeVisible();
      const signature = wizard.letterField('signature');
      const body = wizard.letterField('body');
      await expect(signature).toBeVisible();
      await expect(body).toBeVisible();

      expect(await wizard.hasEditedIndicator(signature)).toBe(false);
      expect(await wizard.hasEditedIndicator(body)).toBe(false);

      const editedSignature = `${testPrefix} A. Homeowner`;
      // AC 1.1/1.2: a genuinely multi-paragraph body — TWO paragraphs separated by a blank
      // line — is the load-bearing case; a single-line body would not exercise the line-break
      // round trip at all.
      const multiParagraphBody =
        `First paragraph describing the claim in detail for ${testPrefix}.\n\n` +
        `Second paragraph with further context, on its own paragraph after a blank line.`;

      await wizard.editField(signature, editedSignature);
      await wizard.editField(body, multiParagraphBody);

      await expect(signature).toHaveValue(editedSignature);
      await expect(body).toHaveValue(multiParagraphBody);
      expect(await wizard.hasEditedIndicator(signature)).toBe(true);
      expect(await wizard.hasEditedIndicator(body)).toBe(true);

      // AC 7.3: exporting/previewing with both edits in place succeeds. Reuses the
      // established hardened content-check (CSP header + zero CSP-violation console
      // messages) — the same technique Scenario 6 relies on to prove edited overrides reach
      // generation without choking.
      await wizard.openPdfPreviewModal();
      await expect(wizard.pdfPreviewModalErrorBanner).not.toBeVisible();
      await wizard.closePdfPreviewModal();

      // Both edits are still reflected in the editor after the round trip through generation.
      await expect(signature).toHaveValue(editedSignature);
      await expect(body).toHaveValue(multiParagraphBody);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 22: Cover letter overhaul — mobile viewport + dark mode (Issue #1932, AC 7.3)
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Report wizard editable content — cover letter overhaul, mobile dark mode (Scenario 22)',
  { tag: '@responsive' },
  () => {
    test('Editing the signature and a multi-paragraph body on step 5 behaves identically at mobile viewport in dark mode (AC 7.3)', async ({
      page,
      testPrefix,
    }) => {
      test.skip(test.info().project.name !== 'mobile', 'Mobile-only viewport/theme check');
      test.slow();
      const wizard = new ReportWizardPage(page);

      let vendorId = '';
      let sourceId = '';
      let workItemId = '';
      try {
        vendorId = await createVendorViaApi(page, { name: `${testPrefix} DarkLetter Vendor` });
        sourceId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} DarkLetter Source`,
          totalAmount: 10000,
          contactAddress: '1 DarkLetter St, Testville',
          reference: 'Ref-DARKLETTER',
        });
        workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI DarkLetter` });
        await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
          invoiceNumber: `${testPrefix}-DARKLETTER-001`,
          amount: 410,
          date: '2026-06-23',
          status: 'pending',
        });

        await reachStep5(wizard, sourceId);

        // Established `data-theme` dark-mode convention elsewhere in this directory (e.g.
        // budget-categories.spec.ts's "Dark mode rendering" scenario) rather than spinning up a
        // second browser context — this test is already gated to the `mobile` project's iPhone
        // 13 viewport above, so setting the theme attribute on the SAME page combines both axes.
        // The cover letter card has no mobile-specific CSS of its own (see Scenario 11), so this
        // proves the SAME EditableField instances behave identically with both applied together.
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-theme', 'dark');
        });

        await expect(wizard.coverLetterCard).toBeVisible();
        const signature = wizard.letterField('signature');
        const body = wizard.letterField('body');
        await expect(signature).toBeVisible();
        await expect(body).toBeVisible();

        const editedSignature = `${testPrefix} Dark Signature`;
        const multiParagraphBody =
          `Dark-mode first paragraph for ${testPrefix}.\n\n` +
          `Dark-mode second paragraph after a blank line.`;

        await wizard.editField(signature, editedSignature);
        await wizard.editField(body, multiParagraphBody);

        await expect(signature).toHaveValue(editedSignature);
        await expect(body).toHaveValue(multiParagraphBody);
        expect(await wizard.hasEditedIndicator(signature)).toBe(true);
        expect(await wizard.hasEditedIndicator(body)).toBe(true);

        await wizard.openPdfPreviewModal();
        await expect(wizard.pdfPreviewModalErrorBanner).not.toBeVisible();
        await wizard.closePdfPreviewModal();
      } finally {
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
        if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 23: AC 2.6 — an explicit signature edit survives a later sender edit (Issue #1932)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — signature survives a later sender edit (Scenario 23, AC 2.6)', () => {
  test('Editing the signature first, then the sender, keeps the explicit signature instead of silently recomputing it from the new sender', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Ac26 Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Ac26 Source`,
        totalAmount: 10000,
        contactAddress: '1 Ac26 St, Testville',
        reference: 'Ref-AC26',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Ac26` });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-AC26-001`,
        amount: 420,
        date: '2026-06-24',
        status: 'pending',
      });

      await reachStep5(wizard, sourceId);

      // Positive existence check FIRST, before any edit/fill — see Scenario 21's own note on
      // why this matters even though `fill()` itself would also fail against a 0-element
      // locator (this makes the failure mode explicit and immediate rather than a generic
      // actionability timeout).
      await expect(wizard.coverLetterCard).toBeVisible();
      const signature = wizard.letterField('signature');
      const sender = wizard.letterField('sender');
      await expect(signature).toBeVisible();
      await expect(sender).toBeVisible();

      // Edit the signature FIRST — an explicit override.
      const explicitSignature = `${testPrefix} Explicitly Signed`;
      await wizard.editField(signature, explicitSignature);
      await expect(signature).toHaveValue(explicitSignature);
      expect(await wizard.hasEditedIndicator(signature)).toBe(true);

      // THEN edit the sender — the pre-#1932 bug recomputed signature from the new sender's
      // first line here (`applyOverrides.ts` L66-68), silently discarding the explicit edit
      // made above.
      const editedSender = `${testPrefix} A Completely Different Sender\nNew Address`;
      await wizard.editField(sender, editedSender);
      await expect(sender).toHaveValue(editedSender);

      // AC 2.6: the explicit signature override always wins — it must NOT have been silently
      // recomputed from the new sender.
      await expect(signature).toHaveValue(explicitSignature);
      expect(await wizard.hasEditedIndicator(signature)).toBe(true);

      // Confirm the same holds through the exported/previewed content — the effective
      // `ReportContent` object driving this field is the same one PDF generation consumes.
      await wizard.openPdfPreviewModal();
      await expect(wizard.pdfPreviewModalErrorBanner).not.toBeVisible();
      await wizard.closePdfPreviewModal();
      await expect(signature).toHaveValue(explicitSignature);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 24: Reset interaction on the new signature field (Issue #1932 — regression guard
// that the CSS-only §5 reset-button fix never broke the existing reset locators)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard editable content — signature field reset (Scenario 24)', () => {
  test('Resetting an edited signature field reverts it to the generated baseline and the reset affordance disappears', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} ResetSig Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} ResetSig Source`,
        totalAmount: 10000,
        // The cover letter only mounts when the source has a contactAddress or reference
        // (`ReportWizardPage.tsx` L279's `setIncludeCoverLetter` auto-enable check) — without
        // one of these, `content.coverLetter` is null, `letterField('signature')` resolves to
        // ZERO elements, and every assertion below (including the `.not.toBeVisible()` ones)
        // would pass vacuously against a locator matching nothing rather than proving anything
        // about reset behavior. Matches the seed shape used by Scenarios 21-23.
        contactAddress: '1 ResetSig St, Testville',
        reference: 'Ref-RESETSIG',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI ResetSig` });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-RESETSIG-001`,
        amount: 430,
        date: '2026-06-25',
        status: 'pending',
      });

      await reachStep5(wizard, sourceId);

      // Positive existence check FIRST: proves the cover letter card (and therefore the
      // signature field) actually mounted, before relying on any `.not.toBeVisible()`
      // assertion below — a locator matching zero elements would otherwise pass those
      // trivially without proving the scenario is looking at the right page state at all.
      await expect(wizard.coverLetterCard).toBeVisible();
      const signature = wizard.letterField('signature');
      await expect(signature).toBeVisible();
      const baseline = await signature.inputValue();

      // No reset affordance before any edit — the button is conditionally MOUNTED, not merely
      // hidden (see `resetButtonFor`'s own docstring), so `.not.toBeVisible()` here also proves
      // it isn't present at all (now safe: `signature`'s own existence was already confirmed
      // above).
      await expect(wizard.resetButtonFor(signature)).not.toBeVisible();

      await wizard.editField(signature, 'A completely different signature');
      await expect(signature).toHaveValue('A completely different signature');
      expect(await wizard.hasEditedIndicator(signature)).toBe(true);
      // Regression guard: the reset button still resolves via the SAME
      // `[class*="resetButton"]` locator after the §5 CSS-only glyph-sizing fix (unchanged
      // className/DOM — see `ReportWizardPage.ts`'s "Issue #1932" docstring paragraph).
      await expect(wizard.resetButtonFor(signature)).toBeVisible();

      await wizard.resetField(signature);
      await expect(signature).toHaveValue(baseline);
      expect(await wizard.hasEditedIndicator(signature)).toBe(false);
      // The reset affordance itself disappears once the field is no longer edited.
      await expect(wizard.resetButtonFor(signature)).not.toBeVisible();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 24: Column-visibility toggles — local state, no persistence (#1966)
// ─────────────────────────────────────────────────────────────────────────────
//
// ReportContentEditor renders a `role="group"` labelled "Show/hide columns" above the summary
// table. Checkboxes control per-column visibility using local `useState` only — the PDF always
// includes every column regardless of toggle state. This scenario asserts:
//   AC1: every column checkbox is present and locatable by accessible name;
//   AC2: the rendered checkbox count equals the component-defined toggleable-column count;
//   AC3: toggling fires no PATCH to /api/users/me/preferences (local state, not persisted);
//   AC4: coverage runs at desktop viewport only (no `@responsive` tag) — the toggle group and
//        checkboxes are always visible regardless of viewport, but the `<th>` removal assertion
//        uses `getByRole('columnheader')` which requires elements in the accessibility tree;
//        the table is CSS-hidden on mobile (`max-width: 767px → .table { display: none }`), so
//        `columnheader` assertions would fail at mobile. The mobile card layout is tested in
//        other scenarios that carry `@responsive`.
//
// Uses `budget-overview` (7 columns incl. Status) to exercise the `content.isOverview` branch
// in ReportContentEditor's column list — a claim report would render 6 columns.

test.describe('Report wizard editable content — column-visibility toggles, local state (Scenario 24, #1966)', () => {
  // toggleable columns for budget-overview in insertion order (matches component source)
  const OVERVIEW_COLUMNS = [
    'Vendor',
    'Invoice No.',
    'Date',
    'Status',
    'Invoice Amount',
    'Allocated Amount',
    'Usage',
  ] as const;
  const OVERVIEW_COLUMN_COUNT = OVERVIEW_COLUMNS.length; // 7

  test('Column toggles show/hide column headers (desktop) and never write to /api/users/me/preferences', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Toggle Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Toggle Source`,
        totalAmount: 5000,
        // contactAddress + reference required for cover letter to auto-enable on budget-overview
        contactAddress: '1 Toggle St, Testville',
        reference: 'Ref-TOGGLE',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Toggle` });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-TOG-001`,
        amount: 500,
        date: '2026-06-01',
        status: 'pending',
      });

      await reachStep5(wizard, sourceId, 'budget-overview');

      // ── AC1 + AC2: group present, every checkbox visible and checked, count matches component ──
      const columnGroup = page.getByRole('group', { name: 'Show/hide columns' });
      await expect(columnGroup).toBeVisible();

      const checkboxes = columnGroup.getByRole('checkbox');
      // AC2: count must equal the component-defined column list length so a future column
      // addition fails this test instead of silently going uncovered.
      await expect(checkboxes).toHaveCount(OVERVIEW_COLUMN_COUNT);

      // AC1: each column is locatable by its label and checked by default
      for (const label of OVERVIEW_COLUMNS) {
        await expect(columnGroup.getByLabel(label)).toBeVisible();
        await expect(columnGroup.getByLabel(label)).toBeChecked();
      }

      // ── AC3: intercept preference writes ──
      // Note: API is an object (`testData.ts`), so `${API}/...` would expand to
      // `[object Object]/...` and never match. Use the glob form instead.
      const prefPatches: string[] = [];
      await page.route('**/api/users/me/preferences', (route) => {
        if (route.request().method() === 'PATCH') prefPatches.push(route.request().url());
        void route.continue();
      });

      // Positive control: confirm the interceptor fires before relying on "nothing fired".
      // A real PATCH issued via page.evaluate() must increment the counter.
      await page.evaluate(async () => {
        await fetch('/api/users/me/preferences', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
      });
      expect(
        prefPatches,
        'positive control: interceptor must capture a manually-triggered PATCH',
      ).toHaveLength(1);
      prefPatches.length = 0; // reset before the actual toggle assertions

      // ── Toggle off: "Vendor" disappears from table header ──
      await columnGroup.getByLabel('Vendor').uncheck();
      await expect(columnGroup.getByLabel('Vendor')).not.toBeChecked();

      // ReportContentEditor uses conditional rendering (`show('vendor') && <th>…`), so the
      // element is removed from the DOM entirely, not merely CSS-hidden.
      const vendorHeader = page.getByRole('columnheader', { name: 'Vendor', exact: true });
      await expect(vendorHeader).toHaveCount(0);

      // ── Toggle back on: column returns ──
      await columnGroup.getByLabel('Vendor').check();
      await expect(columnGroup.getByLabel('Vendor')).toBeChecked();
      await expect(vendorHeader).toHaveCount(1);

      // AC3: no preference PATCH was issued during any column toggle
      expect(prefPatches, 'column toggle must not write to /api/users/me/preferences').toHaveLength(
        0,
      );
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});
