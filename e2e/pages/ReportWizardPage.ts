/**
 * Page Object Model for the Bank Report Wizard page (/budget/reports) — Story #1879.
 *
 * The page renders:
 * - An h1 "Bank Reports" page title (PageLayout)
 * - BUDGET_TABS SubNav ("Reports" tab, 5th)
 * - A WizardStepper (`client/src/components/WizardStepper`): BOTH trees below are ALWAYS
 *   present in the DOM simultaneously — visibility is toggled purely via a
 *   `@media (max-width: 767px)` CSS rule in `WizardStepper.module.css` (`.stepper{display:
 *   none}`/`.stepperMobile{display:flex}` under the breakpoint), not conditional rendering.
 *   Locators that need viewport-specific behavior must assert visibility (`toBeVisible()` /
 *   `not.toBeVisible()`), never DOM presence (`toHaveCount()`), against these two trees.
 *   - Desktop (>=768px, visible): `<nav><ol class*="stepList">` of `<li class*="stepItem">`,
 *     each containing either a `<button class*="stepButton">` (reachable step, stepNum <=
 *     maxReachedStep) or a non-interactive `<div class*="stepButtonDisabled">` (forward-locked
 *     step — NOT a button, not in the a11y/tab tree).
 *   - Mobile (<768px, visible): `<p class*="stepCount">` + `<div class*="dotIndicators"><div
 *     class*="dot">`.
 *
 *   NOTE: `WizardStepper`'s own strings (`reportWizard.stepOfTotal`,
 *   `reportWizard.stepperAriaLabel`) and every `common.button.*` call in
 *   `ReportWizardPage.tsx` (`next`/`back`/`cancel`/`confirm`/`retry`) resolve to MISSING i18n
 *   keys as of this story (confirmed against `client/src/i18n/en/{budget,common}.json` — no
 *   `reportWizard` namespace/key exists anywhere, and `budget.json`'s own `common` object is a
 *   FLAT `{retry, cancel, ...}` shape, not `common.button.*`). Locators below therefore
 *   deliberately avoid depending on that text and use structural/class selectors instead. See
 *   the story's filed bug report for the full list.
 * - Step 1 (`Step1UseCase.tsx`): `role="radiogroup"` (aria-label "Which report do you need?"),
 *   3 `<label class*="useCaseCard">` cards, each with a hidden radio input
 *   (`input[name="useCase"][value="budget-overview"|"claim"|"proof-of-funds"]`).
 * - Step 2 (`Step2Source.tsx`): `role="radiogroup"` (aria-label "Select a budget source"),
 *   `<label class*="sourceRow">` per source, `input[name="source"][value=<sourceId>]`,
 *   discretionary sources sorted last with `class*="sourceRowDisc"`.
 * - Step 3 (`ReportInvoiceList.tsx`, `client/src/components/reports/`): header
 *   `[class*="headerCheckbox"] input[type=checkbox]` (select-all — no accessible name, see
 *   note below), `<div class*="invoiceRow">` per allocated invoice with its own
 *   `input[type=checkbox]` (aria-label "Toggle invoice {vendor} #{number}" — this one DOES
 *   resolve correctly), an unallocated group toggle (`[class*="unallocatedHeader"]`,
 *   `aria-expanded`), and a `SelectionActionBar` (`[class*="count"]` text, "Clear selection"
 *   button — text is ALSO a missing-prop bug, located structurally).
 * - Step 4 (`Step4Options.tsx` + `ReportPdfPreview.tsx`): `#attachDocuments` /
 *   `#includeCoverLetter` checkboxes, action buttons (Download PDF / Mark N invoices as
 *   claimed / Finish without marking / Upload to Paperless — all via correctly-resolving
 *   `sourceReports.*` keys), and `iframe[title="Report PDF preview"]` with a
 *   `[class*="pdfLoadingOverlay"]` spinner shown while `aria-busy="true"` on
 *   `[class*="pdfPreviewWrapper"]`.
 * - Claim confirmation modal: `role="dialog"` (name "Mark Invoices as Claimed?").
 * - Claim success: `[class*="bannerSuccess"]` banner (replaces the action buttons in Step 4).
 */

import { expect, type Page, type Locator, type Download } from '@playwright/test';

export const REPORT_WIZARD_ROUTE = '/budget/reports';

export type SourceReportUseCase = 'budget-overview' | 'claim' | 'proof-of-funds';

export class ReportWizardPage {
  readonly page: Page;

  // Page shell
  readonly heading: Locator;

  // Stepper — desktop
  readonly stepListDesktop: Locator;
  readonly stepItems: Locator;
  // Stepper — mobile
  readonly mobileStepCount: Locator;
  readonly mobileDots: Locator;

  // Step 1: Use case
  readonly useCaseRadioGroup: Locator;
  readonly step1NextButton: Locator;

  // Step 2: Source
  readonly sourceRadioGroup: Locator;
  readonly step2BackButton: Locator;
  readonly step2NextButton: Locator;

  // Step 3: Invoices
  readonly selectAllCheckbox: Locator;
  readonly invoiceRows: Locator;
  readonly unallocatedGroupToggle: Locator;
  readonly unallocatedRows: Locator;
  readonly selectionActionBar: Locator;
  readonly selectionCountLabel: Locator;
  readonly clearSelectionButton: Locator;
  readonly emptyState: Locator;
  readonly step3BackButton: Locator;
  readonly step3NextButton: Locator;

  // Step 4: Options + preview
  readonly attachDocumentsCheckbox: Locator;
  readonly includeCoverLetterCheckbox: Locator;
  readonly previewWrapper: Locator;
  readonly previewIframe: Locator;
  readonly previewLoadingOverlay: Locator;
  readonly previewErrorFallback: Locator;
  readonly previewRetryButton: Locator;
  readonly downloadButton: Locator;
  readonly markClaimedButton: Locator;
  readonly finishWithoutMarkingButton: Locator;
  readonly uploadPaperlessButton: Locator;
  readonly claimErrorBanner: Locator;
  readonly claimSuccessBanner: Locator;
  readonly claimSuccessInvoicesLink: Locator;
  readonly skippedDocumentsNote: Locator;
  readonly step4BackButton: Locator;

  // Claim confirm modal
  readonly claimConfirmModal: Locator;
  readonly claimConfirmModalBody: Locator;
  readonly claimConfirmConfirmButton: Locator;
  readonly claimConfirmCancelButton: Locator;

  // Data-loading error
  readonly errorLoadingDataBanner: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', { level: 1 });

    this.stepListDesktop = page.locator('[class*="stepList"]');
    this.stepItems = this.stepListDesktop.locator('[class*="stepItem"]');
    this.mobileStepCount = page.locator('[class*="stepCount"]');
    this.mobileDots = page.locator('[class*="dotIndicators"] [class*="dot"]');

    this.useCaseRadioGroup = page.getByRole('radiogroup', { name: 'Which report do you need?' });
    this.step1NextButton = page.locator('[class*="metadataCard"] [class*="btnPrimary"]').first();

    this.sourceRadioGroup = page.getByRole('radiogroup', { name: 'Select a budget source' });
    this.step2BackButton = page.locator('[class*="buttonRow"] [class*="btnSecondary"]').first();
    this.step2NextButton = page.locator('[class*="buttonRow"] [class*="btnPrimary"]').first();

    this.selectAllCheckbox = page.locator('[class*="headerCheckbox"] input[type="checkbox"]');
    this.invoiceRows = page.locator('[class*="invoiceRow"]');
    this.unallocatedGroupToggle = page.locator('[class*="unallocatedHeader"]');
    this.unallocatedRows = page.locator('[class*="unallocatedRow"]');
    this.selectionActionBar = page.locator('[class*="bar"]').filter({
      has: page.locator('[class*="count"]'),
    });
    this.selectionCountLabel = this.selectionActionBar.locator('[class*="count"]');
    this.clearSelectionButton = this.selectionActionBar.locator('[class*="btnSecondaryCompact"]');
    this.emptyState = page.locator('[class*="emptyState"]');
    this.step3BackButton = this.step2BackButton;
    this.step3NextButton = this.step2NextButton;

    this.attachDocumentsCheckbox = page.locator('#attachDocuments');
    this.includeCoverLetterCheckbox = page.locator('#includeCoverLetter');
    this.previewWrapper = page.locator('[class*="pdfPreviewWrapper"]');
    this.previewIframe = page.locator('iframe[title="Report PDF preview"]');
    this.previewLoadingOverlay = page.locator('[class*="pdfLoadingOverlay"]');
    this.previewErrorFallback = page.locator('[class*="pdfFallback"]');
    this.previewRetryButton = this.previewErrorFallback.getByRole('button');
    this.downloadButton = page.getByRole('button', { name: 'Download PDF' });
    // NOTE: `Step4Options.tsx` calls `t('sourceReports.markClaimed')` WITHOUT the `{count}`
    // interpolation param the key requires ("Mark {{count}} invoices as claimed"), so the
    // rendered text is currently the literal unresolved placeholder, not a real number. The
    // regex below matches both the intended ("Mark 2 invoices as claimed") and the current
    // broken ("Mark {{count}} invoices as claimed") text so this locator keeps working for
    // triggering the click; a dedicated test asserts the intended digit rendering separately
    // and is expected to fail until the bug is fixed (see filed bug report).
    this.markClaimedButton = page.getByRole('button', { name: /Mark .+ invoices as claimed/i });
    this.finishWithoutMarkingButton = page.getByRole('button', { name: 'Finish without marking' });
    this.uploadPaperlessButton = page.getByRole('button', { name: 'Upload to Paperless' });
    this.claimErrorBanner = page.locator('[class*="formErrorBanner"]');
    this.claimSuccessBanner = page.locator('[class*="bannerSuccess"]');
    this.claimSuccessInvoicesLink = this.claimSuccessBanner.getByRole('link');
    this.skippedDocumentsNote = page.locator('[class*="skippedNote"]');
    this.step4BackButton = page.locator('[class*="buttonRow"] [class*="btnSecondary"]').last();

    this.claimConfirmModal = page.getByRole('dialog', { name: 'Mark Invoices as Claimed?' });
    this.claimConfirmModalBody = this.claimConfirmModal.locator('p');
    this.claimConfirmConfirmButton = this.claimConfirmModal.locator('[class*="btnPrimary"]');
    this.claimConfirmCancelButton = this.claimConfirmModal.locator('[class*="btnSecondary"]');

    this.errorLoadingDataBanner = page.locator('[class*="metadataCard"] [role="alert"]').first();
  }

  async goto(sourceId?: string): Promise<void> {
    const url = sourceId
      ? `${REPORT_WIZARD_ROUTE}?sourceId=${encodeURIComponent(sourceId)}`
      : REPORT_WIZARD_ROUTE;
    await this.page.goto(url);
    await this.heading.waitFor({ state: 'visible' });
  }

  // ─── Step 1 ──────────────────────────────────────────────────────────────

  useCaseCard(useCase: SourceReportUseCase): Locator {
    return this.page.locator(`input[name="useCase"][value="${useCase}"]`);
  }

  async selectUseCase(useCase: SourceReportUseCase): Promise<void> {
    // Clicking the (visually-hidden) radio input directly toggles it and fires onChange
    // (the enclosing <label class*="useCaseCard"> also intercepts clicks anywhere in the
    // card, but targeting the input is unambiguous regardless of card layout).
    await this.useCaseCard(useCase).click({ force: true });
  }

  // ─── Step 2 ──────────────────────────────────────────────────────────────

  sourceRow(sourceId: string): Locator {
    return this.page.locator(`input[name="source"][value="${sourceId}"]`);
  }

  sourceRowByName(sourceName: string): Locator {
    return this.page
      .locator('[class*="sourceRow"]')
      .filter({ has: this.page.locator('[class*="sourceName"]', { hasText: sourceName }) });
  }

  async selectSource(sourceId: string): Promise<void> {
    await this.sourceRow(sourceId).click({ force: true });
  }

  // ─── Step 3 ──────────────────────────────────────────────────────────────

  /**
   * An invoice row within the (allocated) list, matched by vendor name AND invoice number
   * (both rendered as separate text nodes within the row — `vendorName` alone can collide
   * across seed data from other tests running in parallel).
   */
  invoiceRow(vendorName: string, invoiceNumber: string): Locator {
    return this.invoiceRows.filter({ hasText: vendorName }).filter({ hasText: invoiceNumber });
  }

  invoiceRowCheckbox(vendorName: string, invoiceNumber: string): Locator {
    return this.invoiceRow(vendorName, invoiceNumber).locator('input[type="checkbox"]');
  }

  /**
   * The refund-adjustment row for a given invoice (Issue #1876 refund entries surfaced in a
   * source report as a separate `lineKind: 'refund-adjustment'` line, red "Refund" badge +
   * negative amount). Disambiguated from the invoice's own `lineKind: 'invoice'` row — both
   * can share the same vendor name + invoice number text.
   */
  refundRow(vendorName: string, invoiceNumber: string): Locator {
    return this.invoiceRow(vendorName, invoiceNumber).filter({
      has: this.page.locator('[class*="refund"]'),
    });
  }

  regularInvoiceRow(vendorName: string, invoiceNumber: string): Locator {
    return this.invoiceRow(vendorName, invoiceNumber).filter({
      hasNot: this.page.locator('[class*="refund"]'),
    });
  }

  async toggleInvoiceExclusion(vendorName: string, invoiceNumber: string): Promise<void> {
    await this.invoiceRowCheckbox(vendorName, invoiceNumber).click();
  }

  async toggleSelectAll(): Promise<void> {
    await this.selectAllCheckbox.click();
  }

  async expandUnallocatedGroup(): Promise<void> {
    await this.unallocatedGroupToggle.click();
  }

  // ─── Cross-step navigation ───────────────────────────────────────────────

  /**
   * Clicks a reachable step's circle in the desktop stepper (1-indexed). Only valid for
   * `stepNum <= maxReachedStep` — steps beyond that render a non-interactive `<div>`, not a
   * button, and this locator will fail to find a clickable element (by design — see
   * `isStepInteractive`).
   */
  async goToStep(stepNum: number): Promise<void> {
    await this.stepItems
      .nth(stepNum - 1)
      .locator('[class*="stepButton"]:not([class*="Disabled"])')
      .click();
  }

  /** True if the desktop stepper renders step `stepNum` as an actual `<button>` (reachable). */
  async isStepInteractive(stepNum: number): Promise<boolean> {
    const item = this.stepItems.nth(stepNum - 1);
    return (await item.locator('button').count()) > 0;
  }

  async goNextFromStep1(): Promise<void> {
    await this.step1NextButton.click();
  }

  async goNextFromStep2(): Promise<void> {
    await this.step2NextButton.click();
  }

  async goNextFromStep3(): Promise<void> {
    await this.step3NextButton.click();
  }

  async goBack(): Promise<void> {
    await this.step2BackButton.click();
  }

  // ─── Step 4 ──────────────────────────────────────────────────────────────

  async toggleAttachDocuments(): Promise<void> {
    await this.attachDocumentsCheckbox.click();
  }

  async toggleCoverLetter(): Promise<void> {
    await this.includeCoverLetterCheckbox.click();
  }

  /**
   * Waits for PDF generation to settle: the loading overlay disappears AND the preview
   * iframe has a non-empty `blob:` src. PDF generation (pdfmake + pdf-lib, both loaded via
   * dynamic `import()`) can be slow, especially on the first call of a test (cold chunk
   * load) — callers should pair this with `test.slow()` and rely on Playwright's default
   * generous `expect()` timeout rather than a short custom one.
   */
  async waitForPreviewReady(): Promise<void> {
    await this.previewLoadingOverlay.waitFor({ state: 'hidden' });
    await this.previewIframe.waitFor({ state: 'visible' });
    const src = await this.previewIframe.getAttribute('src');
    if (!src || !src.startsWith('blob:')) {
      throw new Error(`Expected preview iframe src to be a blob: URL, got "${src}"`);
    }
  }

  /** Current preview iframe `blob:` src, for detecting a regeneration via a src change. */
  async getPreviewSrc(): Promise<string> {
    return (await this.previewIframe.getAttribute('src')) ?? '';
  }

  /**
   * Waits for a NEW preview to be ready after an options change, proven by the iframe's
   * `blob:` src actually changing from `previousSrc` (not merely re-reading the same URL).
   * Deliberately does NOT assert the loading overlay becomes visible first: regeneration is
   * debounced (400ms) then CPU-bound (pdfmake, no network I/O for attachment-less test
   * invoices), and for trivial content that round trip can complete fast enough that the
   * transient overlay never has an observable "visible" window for Playwright's polling to
   * reliably catch — the established convention elsewhere in the suite
   * (`invoice-auto-itemize-page.spec.ts`) only ever asserts the overlay's terminal hidden
   * state, never its transient appearance, for the same reason.
   */
  async waitForPreviewRegenerated(previousSrc: string): Promise<void> {
    await this.previewLoadingOverlay.waitFor({ state: 'hidden' });
    await this.previewIframe.waitFor({ state: 'visible' });
    await expect(async () => {
      const src = await this.getPreviewSrc();
      if (!src.startsWith('blob:')) {
        throw new Error(`Expected preview iframe src to be a blob: URL, got "${src}"`);
      }
      if (src === previousSrc) {
        throw new Error('Preview src has not changed yet — regeneration still pending');
      }
    }).toPass();
  }

  async download(): Promise<Download> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.downloadButton.click(),
    ]);
    return download;
  }

  async clickMarkClaimed(): Promise<void> {
    await this.markClaimedButton.click();
    await this.claimConfirmModal.waitFor({ state: 'visible' });
  }

  async confirmClaim(): Promise<void> {
    await this.claimConfirmConfirmButton.click();
  }

  async cancelClaimConfirm(): Promise<void> {
    await this.claimConfirmCancelButton.click();
    await this.claimConfirmModal.waitFor({ state: 'hidden' });
  }

  async clickFinishWithoutMarking(): Promise<void> {
    await this.finishWithoutMarkingButton.click();
  }

  async clickUploadToPaperless(): Promise<void> {
    await this.uploadPaperlessButton.click();
  }
}
