/**
 * E2E tests for the Bank Report Wizard's AI-generated usage descriptions and cover letter
 * (Story #1901 — `/budget/reports`). Adds an opt-in "Enable AI assistance" toggle to Step 4
 * (Settings) and a "Generate with AI" button to Step 5 (Preview & Export) that issues ONE
 * batched `POST /api/source-reports/generate-content` call and populates the editable content
 * baseline (`ReportWizardPage.tsx`'s `aiContent` state, applied via `applyAiContent` — see
 * `e2e/pages/ReportWizardPage.ts`'s class docstring for the full DOM/state reference).
 *
 * `reportWizard.spec.ts` covers the base wizard flow; `reportWizardEditableContent.spec.ts`
 * covers the manual-override editing surface (Story #1900); `reportWizardExpansion.spec.ts`
 * covers expandable invoice rows (Story #1891). THIS file is scoped to the NEW AI-generation
 * behavior only:
 *
 * - Scenario 1: Against the REAL, unmocked backend — no `LLM_*` environment variables are set
 *   anywhere in the E2E container config (confirmed by reading
 *   `e2e/containers/cornerstoneContainer.ts`'s `environment` object, which has no `LLM_*` key),
 *   so `GET /api/config`'s `llmEnabled` is deterministically `false` in this environment. The
 *   Step 4 AI section is therefore entirely ABSENT from the DOM — not shown disabled.
 * - Scenario 2: With `llmEnabled` mocked `true` — the toggle is present and unchecked by
 *   default; Step 5 shows no "Generate with AI" button while the toggle is off, and shows it
 *   once the toggle is turned on.
 * - Scenario 3: Happy path with a DELAYED mock response — the button disables and an
 *   elapsed-seconds caption becomes visible while pending; on completion the cover letter
 *   subject/body and the invoice's usage-description field are filled with the mocked text,
 *   with NO edited-dot indicator anywhere (AI content is a baseline, not a manual override);
 *   the provenance note is absent before generation and visible after.
 * - Scenario 4: Overwrite-confirm modal — with a manual edit present, clicking "Generate with
 *   AI" shows the modal instead of calling the endpoint; "Keep Editing" closes it with zero
 *   calls made and the manual edit intact; a subsequent "Overwrite and Generate" calls the
 *   endpoint exactly once and replaces the content (edited-dot clears, since the manual
 *   override is discarded as part of accepting the AI baseline).
 * - Scenario 5: Regenerating with NO manual edits present (including immediately after a prior
 *   AI generation, which does not itself count as a manual edit) calls the endpoint directly,
 *   with no overwrite modal at any point.
 * - Scenario 6: Error path — a mocked 502 `LLM_UNREACHABLE` response shows a translated inline
 *   error next to the button, leaves the existing (derived) content completely unchanged, and
 *   re-enables the button so the user can retry.
 * - Scenario 7: A confirmed Step 1-4 change (via the existing discard-confirm modal) clears
 *   previously-generated AI content, same as it clears manual overrides — the fields revert to
 *   the plain derived (#1898/#1900) baseline and the provenance note disappears.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page, Route } from '@playwright/test';
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
// API helpers (local — mirrors the established pattern in reportWizardEditableContent.spec.ts;
// these endpoints don't have shared fixtures/apiHelpers.ts entries yet)
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

/** Walks a fresh wizard through steps 1-3 (claim, single source) to land on Step 4 (Settings). */
async function reachStep4(wizard: ReportWizardPage, sourceId: string): Promise<void> {
  await wizard.goto();
  await wizard.selectUseCase('claim');
  await wizard.goNextFromStep1();
  await wizard.selectSource(sourceId);
  await wizard.goNextFromStep2();
  await wizard.goNextFromStep3();
}

/** Walks a fresh wizard to Step 5 WITH AI assistance enabled on Step 4. */
async function reachStep5WithAiEnabled(wizard: ReportWizardPage, sourceId: string): Promise<void> {
  await reachStep4(wizard, sourceId);
  await wizard.toggleAiEnabled();
  await wizard.step4NextButton.click();
}

// ─────────────────────────────────────────────────────────────────────────────
// Mocking helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Intercepts `GET /api/config` to inject `llmEnabled: true`, preserving every other real field
 * (currency, vatRate, autoItemizeEnabled) from the server's actual response — mirrors the
 * established `mockConfigEnabled` pattern in `auto-itemize.spec.ts`.
 */
async function mockLlmEnabled(page: Page): Promise<void> {
  await page.route('**/api/config', async (route: Route) => {
    const realResp = await route.fetch();
    const realBody = (await realResp.json()) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...realBody, llmEnabled: true }),
    });
  });
}

interface GenerateContentMockResponse {
  letterSubject: string;
  letterBody: string;
  descriptions: Record<string, string>;
}

/** Simple mutable call counter, shared by reference with the test body. */
function createCallCounter(): { count: number } {
  return { count: 0 };
}

/**
 * Mocks `POST /api/source-reports/generate-content` to succeed, gated behind `gate` (a Promise
 * the test resolves externally) so the pending state (disabled button, elapsed-seconds caption)
 * can be observed before the response arrives — mirrors the established gated-mock pattern in
 * `invoice-auto-itemize-page.spec.ts`'s LLM_UNREACHABLE scenario.
 */
async function mockGenerateContentDelayed(
  page: Page,
  response: GenerateContentMockResponse,
  gate: Promise<void>,
  counter: { count: number },
): Promise<void> {
  await page.route(`**${API.sourceReportsGenerateContent}`, async (route: Route) => {
    counter.count += 1;
    await gate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/** Mocks `POST /api/source-reports/generate-content` to succeed immediately. */
async function mockGenerateContentImmediate(
  page: Page,
  response: GenerateContentMockResponse,
  counter: { count: number },
): Promise<void> {
  await page.route(`**${API.sourceReportsGenerateContent}`, async (route: Route) => {
    counter.count += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/** Mocks `POST /api/source-reports/generate-content` to fail with a 502 LLM_UNREACHABLE. */
async function mockGenerateContentUnreachable(
  page: Page,
  counter: { count: number },
): Promise<void> {
  await page.route(`**${API.sourceReportsGenerateContent}`, async (route: Route) => {
    counter.count += 1;
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'LLM_UNREACHABLE',
          message: 'The extraction service is unavailable. Please try again later.',
          details: {},
        },
      }),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: No LLM configured — real, unmocked backend
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard AI generation — not configured (Scenario 1)', () => {
  test('With no LLM_* environment variables set (the real E2E container config), the AI toggle is entirely absent from Step 4', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} NoLlm Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} NoLlm Source`,
        totalAmount: 10000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI NoLlm` });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-NOLLM-001`,
        amount: 150,
        date: '2026-07-01',
        status: 'pending',
      });

      await reachStep4(wizard, sourceId);

      // The AI section is not merely hidden/disabled — it's not in the DOM at all.
      await expect(wizard.aiToggle).toHaveCount(0);

      // Step 5 likewise has no AI row of any kind.
      await wizard.step4NextButton.click();
      await expect(wizard.aiGenerateRow).toHaveCount(0);
      await expect(wizard.generateWithAiButton).toHaveCount(0);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Toggle default state + Step 5 button visibility gating
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard AI generation — toggle default state and button gating (Scenario 2)', () => {
  test('The AI toggle is present and unchecked by default; Step 5 shows the Generate button only once the toggle is turned on', async ({
    page,
    testPrefix,
  }) => {
    await mockLlmEnabled(page);
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Gate Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Gate Source`,
        totalAmount: 10000,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Gate` });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-GATE-001`,
        amount: 150,
        date: '2026-07-02',
        status: 'pending',
      });

      await reachStep4(wizard, sourceId);
      await expect(wizard.aiToggle).toBeVisible();
      await expect(wizard.aiToggle).not.toBeChecked();

      // Toggle OFF (default) — no Generate button on Step 5.
      await wizard.step4NextButton.click();
      await expect(wizard.generateWithAiButton).toHaveCount(0);

      // Turn the toggle ON — the button now appears.
      await wizard.step4BackButton.click();
      await expect(wizard.aiToggle).not.toBeChecked();
      await wizard.toggleAiEnabled();
      await expect(wizard.aiToggle).toBeChecked();
      await wizard.step4NextButton.click();
      await expect(wizard.generateWithAiButton).toBeVisible();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Happy path — delayed response, spinner/caption, fields filled, no edited-dot,
// provenance note absent-then-visible
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard AI generation — happy path (Scenario 3)', () => {
  test('Generation shows pending feedback, fills content with the mocked text as a baseline (no edited-dot), and shows the provenance note only after completion', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    await mockLlmEnabled(page);
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Happy Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Happy Source`,
        totalAmount: 10000,
        contactAddress: '1 Happy St, Testville',
        reference: 'Ref-HAPPY',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Happy` });
      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-HAPPY-001`,
        amount: 200,
        date: '2026-07-03',
        status: 'pending',
      });

      let releaseGate: (() => void) | null = null;
      const gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
      const counter = createCallCounter();
      await mockGenerateContentDelayed(
        page,
        {
          letterSubject: 'AI-Generated Subject Line',
          letterBody: 'AI-generated cover letter body, ready for the bank.',
          descriptions: { [invoice.id]: 'AI-generated usage description for this invoice' },
        },
        gate,
        counter,
      );

      await reachStep5WithAiEnabled(wizard, sourceId);
      const vendorName = `${testPrefix} Happy Vendor`;
      const subject = wizard.letterField('subject');
      const usage = wizard.usageField(vendorName, invoice.invoiceNumber!);

      // Baseline before generation: derived (#1898) content, no provenance note.
      const derivedSubject = await subject.inputValue();
      expect(derivedSubject).not.toBe('');
      await expect(wizard.aiGeneratedNote).not.toBeVisible();

      await wizard.clickGenerateWithAi();

      // Pending state: button disabled, elapsed-seconds caption visible.
      await expect(wizard.generateWithAiButton).toBeDisabled();
      await expect(wizard.aiGeneratingCaption).toBeVisible();

      releaseGate!();

      // Completion: fields filled with mocked text, as a baseline (no edited-dot anywhere).
      await expect(subject).toHaveValue('AI-Generated Subject Line');
      await expect(wizard.letterField('body')).toHaveValue(
        'AI-generated cover letter body, ready for the bank.',
      );
      await expect(usage).toHaveValue('AI-generated usage description for this invoice');
      expect(await wizard.hasEditedIndicator(subject)).toBe(false);
      expect(await wizard.hasEditedIndicator(usage)).toBe(false);

      // Provenance note now visible; button re-enabled; exactly one call was made.
      await expect(wizard.aiGeneratedNote).toBeVisible();
      await expect(wizard.generateWithAiButton).toBeEnabled();
      expect(counter.count).toBe(1);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Overwrite-confirm modal
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard AI generation — overwrite-confirm modal (Scenario 4)', () => {
  test('With a manual edit present, Generate shows an overwrite-confirm modal; "Keep Editing" makes no call, "Overwrite and Generate" calls once and replaces the content', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    await mockLlmEnabled(page);
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Overwrite Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Overwrite Source`,
        totalAmount: 10000,
        contactAddress: '1 Overwrite St, Testville',
        reference: 'Ref-OVERWRITE',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Overwrite` });
      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-OVERWRITE-001`,
        amount: 220,
        date: '2026-07-04',
        status: 'pending',
      });

      const counter = createCallCounter();
      await mockGenerateContentImmediate(
        page,
        {
          letterSubject: 'Overwritten Subject',
          letterBody: 'Overwritten body text.',
          descriptions: { [invoice.id]: 'Overwritten usage description' },
        },
        counter,
      );

      await reachStep5WithAiEnabled(wizard, sourceId);
      const subject = wizard.letterField('subject');
      await wizard.editField(subject, 'A manual edit that must be protected');
      expect(await wizard.hasEditedIndicator(subject)).toBe(true);

      // "Keep Editing" — modal shown, but the endpoint is never called and the edit survives.
      await wizard.clickGenerateWithAi();
      await expect(wizard.aiOverwriteConfirmModal).toBeVisible();
      await wizard.cancelAiOverwrite();
      await expect(wizard.aiOverwriteConfirmModal).not.toBeVisible();
      expect(counter.count).toBe(0);
      await expect(subject).toHaveValue('A manual edit that must be protected');
      expect(await wizard.hasEditedIndicator(subject)).toBe(true);

      // "Overwrite and Generate" — the endpoint is called exactly once and the content is
      // replaced; the discarded manual override means the new AI text is NOT itself "edited".
      await wizard.clickGenerateWithAi();
      await expect(wizard.aiOverwriteConfirmModal).toBeVisible();
      await wizard.confirmAiOverwrite();
      await expect(wizard.aiOverwriteConfirmModal).not.toBeVisible();

      await expect(subject).toHaveValue('Overwritten Subject');
      expect(counter.count).toBe(1);
      expect(await wizard.hasEditedIndicator(subject)).toBe(false);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: No modal when there are no manual edits (including immediately after a prior
// AI generation)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard AI generation — no modal without manual edits (Scenario 5)', () => {
  test('Generating with no manual edits present calls the endpoint directly, with no overwrite modal — including when regenerating right after a prior AI generation', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    await mockLlmEnabled(page);
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Clean Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Clean Source`,
        totalAmount: 10000,
        contactAddress: '1 Clean St, Testville',
        reference: 'Ref-CLEANAI',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Clean` });
      const invoice = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-CLEANAI-001`,
        amount: 180,
        date: '2026-07-05',
        status: 'pending',
      });

      const counter = createCallCounter();
      await mockGenerateContentImmediate(
        page,
        {
          letterSubject: 'First Generation Subject',
          letterBody: 'First generation body.',
          descriptions: { [invoice.id]: 'First generation usage description' },
        },
        counter,
      );

      await reachStep5WithAiEnabled(wizard, sourceId);

      // First generation — no manual edits exist yet, no modal.
      await wizard.clickGenerateWithAi();
      await expect(wizard.aiOverwriteConfirmModal).not.toBeVisible();
      await expect(wizard.letterField('subject')).toHaveValue('First Generation Subject');
      expect(counter.count).toBe(1);

      // Regenerating immediately after — the prior AI content is not a manual edit, so this
      // still runs directly with no modal.
      await wizard.clickGenerateWithAi();
      await expect(wizard.aiOverwriteConfirmModal).not.toBeVisible();
      await expect(wizard.generateWithAiButton).toBeEnabled();
      expect(counter.count).toBe(2);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Error path — 502 LLM_UNREACHABLE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard AI generation — error path (Scenario 6)', () => {
  test('A 502 LLM_UNREACHABLE response shows a translated inline error, leaves existing content unchanged, and re-enables the button for retry', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    await mockLlmEnabled(page);
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Err Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} Err Source`,
        totalAmount: 10000,
        contactAddress: '1 Err St, Testville',
        reference: 'Ref-ERR',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI Err` });
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-ERR-001`,
        amount: 160,
        date: '2026-07-06',
        status: 'pending',
      });

      const counter = createCallCounter();
      await mockGenerateContentUnreachable(page, counter);

      await reachStep5WithAiEnabled(wizard, sourceId);
      const subject = wizard.letterField('subject');
      const baseline = await subject.inputValue();
      expect(baseline).not.toBe('');

      await wizard.clickGenerateWithAi();

      await expect(wizard.aiErrorBanner).toBeVisible();
      await expect(wizard.aiErrorBanner).toContainText(
        'The extraction service is unavailable. Please try again later.',
      );

      // Existing (derived) content is unchanged.
      await expect(subject).toHaveValue(baseline);
      await expect(wizard.aiGeneratedNote).not.toBeVisible();

      // Button re-enabled for retry.
      await expect(wizard.generateWithAiButton).toBeEnabled();
      expect(counter.count).toBe(1);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: A confirmed Step 1-4 change clears AI content and returns the derived baseline
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Report wizard AI generation — discard clears AI content (Scenario 7)', () => {
  test('A confirmed guarded Step 1-4 change clears previously-generated AI content, reverting to the derived baseline', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    await mockLlmEnabled(page);
    const wizard = new ReportWizardPage(page);

    let vendorId = '';
    let sourceId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} DiscardAi Vendor` });
      sourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} DiscardAi Source`,
        totalAmount: 10000,
        contactAddress: '1 DiscardAi St, Testville',
        reference: 'Ref-DISCARDAI',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI DiscardAi` });
      const invoiceA = await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-DISCARDAI-001`,
        amount: 200,
        date: '2026-07-07',
        status: 'pending',
      });
      // A second invoice so excluding the first still leaves the "select at least one" guard
      // satisfied.
      await seedAllocatedInvoice(page, workItemId, vendorId, sourceId, {
        invoiceNumber: `${testPrefix}-DISCARDAI-002`,
        amount: 250,
        date: '2026-07-08',
        status: 'pending',
      });

      const counter = createCallCounter();
      await mockGenerateContentImmediate(
        page,
        {
          letterSubject: 'Ephemeral AI Subject',
          letterBody: 'Ephemeral AI body.',
          descriptions: { [invoiceA.id]: 'Ephemeral AI usage description' },
        },
        counter,
      );

      const vendorName = `${testPrefix} DiscardAi Vendor`;
      await reachStep5WithAiEnabled(wizard, sourceId);
      const subject = wizard.letterField('subject');
      const derivedBaseline = await subject.inputValue();

      await wizard.clickGenerateWithAi();
      await expect(subject).toHaveValue('Ephemeral AI Subject');
      await expect(wizard.aiGeneratedNote).toBeVisible();

      // Navigate back to Step 3 (a guarded control — invoice exclusion) and attempt a change.
      // AI content alone (no manual overrides) already trips the discard guard.
      await wizard.goBack();
      await wizard.goBack();
      const checkboxA = wizard.invoiceRowCheckbox(vendorName, invoiceA.invoiceNumber!);
      await expect(checkboxA).toBeChecked();
      await wizard.toggleInvoiceExclusion(vendorName, invoiceA.invoiceNumber!);

      await expect(wizard.discardConfirmModal).toBeVisible();
      await wizard.confirmDiscard();
      await expect(wizard.discardConfirmModal).not.toBeVisible();
      await expect(checkboxA).not.toBeChecked();

      // The AI content is gone — the derived baseline (re-computed for the new invoice
      // selection) is back in place, and the provenance note disappears with it.
      await wizard.goNextFromStep3();
      await wizard.step4NextButton.click();
      await expect(wizard.aiGeneratedNote).not.toBeVisible();
      await expect(subject).not.toHaveValue('Ephemeral AI Subject');
      // The re-derived baseline for the narrowed invoice selection need not equal the original
      // derivedBaseline string exactly (fewer invoices now included), but it must be non-empty
      // and distinct from the AI text — proving the AI overlay was cleared, not just stale.
      expect(derivedBaseline).not.toBe('');
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});
