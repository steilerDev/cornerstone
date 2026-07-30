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
 *
 * Story #1891 follow-up additions (`ReportInvoiceList.tsx`):
 * - Each allocated invoice row is a `<div class*="invoiceRow">` on a `1.5rem auto 1fr auto
 *   auto auto` grid: [chevron|non-interactive span] [TriState checkbox + vendor info]
 *   [status Badge `class*="statusChip"`] [amount] [attachment column]. The row is only
 *   expandable (chevron rendered as a real `<button class*="expandButton">` with
 *   `aria-expanded`/`aria-controls="invoice-expand-{invoiceId}"`) when
 *   `budgetLines.length > 0 || deposits.length > 0`; otherwise a bare `aria-hidden` span
 *   fills the grid cell and there is nothing to expand.
 * - The expansion panel (`class*="expansionPanel"`, `id="invoice-expand-{invoiceId}"`) is a
 *   DOM SIBLING immediately after the row's own `invoiceRow` div (both children of the same
 *   per-invoice wrapper `<div key={invoice.invoiceId}>`), not a descendant — locators below
 *   reach it via `xpath=following-sibling::*`.
 * - Inside the panel: an items sub-table (`class*="subTableSection"` #1, budget lines, else
 *   `EmptyState`) then a deposits sub-table (`class*="subTableSection"` #2, else
 *   `EmptyState`) — always in this DOM order, so `.nth(0)`/`.nth(1)` disambiguates without
 *   depending on i18n heading text.
 * - Each budget-line row's exclusion checkbox has `aria-label="Exclude {name} from report"`
 *   (`sourceReports.expand.excludeItemAriaLabel`, `name` = line description or
 *   `t('sourceReports.expand.unnamedLine')`). Toggling it updates `excludedLineIds`
 *   (`ReportWizardPage.tsx`), which is applied PURELY client-side via
 *   `applyLineExclusions()` (`client/src/lib/reportExclusions.ts`) — it subtracts the
 *   excluded lines' `allocatedPortion` from the invoice's `allocatedAmount` for display/PDF
 *   purposes only. It NEVER touches `excludedInvoiceIds` — the invoice is still submitted in
 *   full to `markInvoicesClaimed` regardless of line exclusions (hence the claim-confirm
 *   modal's warning block, see `markClaimedWarningBlock` below).
 * - **KNOWN BUG (filed, see story E2E memory)**: `applyLineExclusions` clamps a fully-excluded
 *   invoice's `allocatedAmount` to exactly `0`, but `ReportInvoiceList`'s `allocatedInvoices`
 *   filter is `inv.allocatedAmount > 0 || inv.lineKind === 'refund-adjustment'` — so a
 *   fully-line-excluded invoice (net exactly 0, `lineKind` stays `'invoice'`) is filtered OUT
 *   of the visible list entirely instead of rendering a `€0.00` row. This also removes the
 *   only UI path back to un-excluding those lines (the row's own expand toggle). The PDF and
 *   the actual claim submission are unaffected (both operate on `excludedInvoiceIds`, not the
 *   filtered display list) — this is a display-only regression.
 * - Deposits sub-table's "Allocated Source" column renders a source-colored Badge only when
 *   `deposit.budgetSourceId === report.source.id` (the CURRENTLY viewed source); any other
 *   value (including a different source's id) renders a plain `—` — deposits tagged to a
 *   different source are never shown as tagged in someone else's report.
 * - Claim confirm modal warning block: `[role="alert"]` (`class*="warningBlock"`) rendered
 *   inside the modal ONLY when at least one included (non invoice-excluded) invoice has one
 *   or more excluded lines — text is `sourceReports.confirmClaimExcludedItemsWarning`
 *   ("{{count}} invoice(s) will be claimed in full even though...").
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

  // Story #1891: expandable rows, items/deposits sub-tables, claim warning
  readonly markClaimedWarningBlock: Locator;

  /**
   * Console messages captured since construction whose text matches
   * `/content security policy/i`. Registered in the constructor — NOT lazily on first use —
   * so a violation that fires before/during `goto()` is never missed (mirrors the established
   * convention in `invoice-auto-itemize-page.spec.ts` Scenario 18's `page.on('console', ...)`
   * CSP-error capture). A blocked `frame-src` navigation for the report preview `<iframe>`
   * surfaces here as a Chromium-emitted `'error'`-type console message, e.g.
   * `Refused to frame 'blob:...' because it violates the following Content Security Policy
   * directive: "frame-src 'self'".`
   */
  private readonly cspViolationMessages: string[] = [];

  constructor(page: Page) {
    this.page = page;

    page.on('console', (msg) => {
      if (msg.type() === 'error' && /content security policy/i.test(msg.text())) {
        this.cspViolationMessages.push(msg.text());
      }
    });

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

    // Warning block ([role="alert"], class*="warningBlock") shown inside the claim-confirm
    // modal only when an included invoice has excluded lines (see class docstring above).
    this.markClaimedWarningBlock = this.claimConfirmModal.locator('[role="alert"]');
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

  /**
   * The row's own displayed amount element — `[class*="amount"]` WITHOUT the `Column`
   * substring, so it excludes the `.amountColumn` grid-cell wrapper (which also contains
   * "amount" as a substring) and resolves to the innermost `.amount`/`.amount.amountNegative`
   * div regardless of whether the row is a plain invoice or a refund-adjustment (which nests
   * an extra unstyled wrapper `<div>` around a Badge + this same element).
   */
  invoiceRowAmount(vendorName: string, invoiceNumber: string): Locator {
    return this.invoiceRow(vendorName, invoiceNumber)
      .locator('[class*="amount"]:not([class*="Column"])')
      .first();
  }

  /**
   * The chevron expand/collapse button for an allocated invoice row (Story #1891). Only
   * present when the invoice has budget lines and/or deposits — see class docstring.
   */
  invoiceExpandToggle(vendorName: string, invoiceNumber: string): Locator {
    return this.invoiceRow(vendorName, invoiceNumber).locator('[class*="expandButton"]');
  }

  /**
   * The expansion panel for an allocated invoice row — a DOM SIBLING of the row's own
   * `invoiceRow` div (both children of the same per-invoice wrapper), not a descendant, so
   * this is reached via a relative `following-sibling::` xpath rather than `.locator()`
   * descendant search. Only present in the DOM while `isExpanded` is true.
   */
  expansionPanel(vendorName: string, invoiceNumber: string): Locator {
    return this.invoiceRow(vendorName, invoiceNumber).locator(
      'xpath=following-sibling::*[contains(@class,"expansionPanel")]',
    );
  }

  /**
   * The items (budget lines) sub-table section — always the FIRST `class*="subTableSection"`
   * child of the expansion panel, whether it renders the real `<table>` or the `EmptyState`
   * fallback (`budgetLines.length === 0`). Structural indexing avoids depending on i18n
   * heading text.
   */
  itemsSubTable(vendorName: string, invoiceNumber: string): Locator {
    return this.expansionPanel(vendorName, invoiceNumber)
      .locator('[class*="subTableSection"]')
      .nth(0);
  }

  /**
   * The deposits sub-table section — always the SECOND `class*="subTableSection"` child of
   * the expansion panel (see `itemsSubTable` docstring for the same structural-order
   * rationale).
   */
  depositsSubTable(vendorName: string, invoiceNumber: string): Locator {
    return this.expansionPanel(vendorName, invoiceNumber)
      .locator('[class*="subTableSection"]')
      .nth(1);
  }

  /**
   * A specific budget-line row within the items sub-table, matched by its description text
   * (or `t('sourceReports.expand.unnamedLine')` for an unnamed line).
   */
  itemRow(vendorName: string, invoiceNumber: string, lineDescription: string): Locator {
    return this.itemsSubTable(vendorName, invoiceNumber)
      .locator('tbody tr')
      .filter({ hasText: lineDescription });
  }

  /**
   * The "Include" checkbox for a specific budget line, matched by its
   * `aria-label="Exclude {name} from report"` (`sourceReports.expand.excludeItemAriaLabel`).
   * Unchecking it excludes the line from the display/PDF amount (never from claim eligibility
   * — see class docstring).
   */
  itemExclusionCheckbox(
    vendorName: string,
    invoiceNumber: string,
    lineDescription: string,
  ): Locator {
    return this.itemsSubTable(vendorName, invoiceNumber).getByRole('checkbox', {
      name: `Exclude ${lineDescription} from report`,
    });
  }

  /**
   * A specific deposit row within the deposits sub-table, matched by its formatted amount
   * text (e.g. from `useFormatters().formatCurrency`).
   */
  depositRow(vendorName: string, invoiceNumber: string, formattedAmount: string): Locator {
    return this.depositsSubTable(vendorName, invoiceNumber)
      .locator('tbody tr')
      .filter({ hasText: formattedAmount });
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
   * Copy of all Content-Security-Policy violation console messages captured since this POM
   * was constructed (see `cspViolationMessages` field docstring). Exposed for tests that want
   * to assert on it directly rather than only through `waitForPreviewReady`/
   * `waitForPreviewRegenerated`'s implicit check.
   */
  getCspViolations(): string[] {
    return [...this.cspViolationMessages];
  }

  /**
   * Fetches the report wizard page's own HTTP response and returns the CSP header's
   * `frame-src` directive as its space-separated source tokens (e.g. `["'self'", 'blob:']`).
   * Throws if the header or the directive is missing.
   *
   * This is a direct server-side contract check — it fails deterministically against a
   * pre-fix `frameSrc: ["'self'"]` `helmetPlugin.ts` config (no `blob:` token) and passes
   * deterministically once `blob:` is added, entirely independent of what a given browser
   * (headless or not) actually does when asked to navigate an `<iframe>` to a `blob:` PDF URL.
   * See `assertPreviewHardened`'s docstring for why this replaced the earlier
   * `page.frames()`-based navigation-matching technique.
   */
  async fetchCspFrameSrcDirective(): Promise<string[]> {
    const response = await this.page.request.get(REPORT_WIZARD_ROUTE);
    const cspHeader = response.headers()['content-security-policy'];
    if (!cspHeader) {
      throw new Error(
        `Expected a Content-Security-Policy response header on ${REPORT_WIZARD_ROUTE}, got none.`,
      );
    }
    const frameSrcMatch = cspHeader.match(/frame-src\s+([^;]+)/i);
    const frameSrcValue = frameSrcMatch?.[1];
    if (!frameSrcValue) {
      throw new Error(`Expected a frame-src directive in the CSP header, got: "${cspHeader}"`);
    }
    return frameSrcValue.trim().split(/\s+/);
  }

  /**
   * HARDENED proof that the report preview is genuinely permitted — Story #1891 AC, reworked
   * TWICE per two separate TEST_ENVIRONMENT-fix follow-ups (see below for why).
   *
   * ATTEMPT 1 (superseded): polling `page.frames()` for a browsing-context frame whose live
   * `url()` matched the iframe's `blob:` src attribute, treating a match as proof the
   * navigation actually completed (as opposed to being silently CSP-blocked while the DOM
   * `src` attribute still got set by React). That technique turned out to be UNVERIFIABLE in
   * this project's CI environment: Playwright's bundled headless Chromium shell has no
   * built-in PDF viewer plugin, so an `<iframe>` pointed at a PDF `blob:` URL aborts/blanks
   * WITHOUT ever completing a navigation or firing a CSP violation — `page.frames()` never
   * contains a matching frame REGARDLESS of whether the CSP frame-src directive is correct.
   * Confirmed via CI run 30530648400 (shard 2): even with a 10s poll, zero frame matches AND
   * zero CSP console violations, on a build where the `blob:` fix was already present.
   *
   * ATTEMPT 2 (superseded): replaced the frame-navigation check with an in-page
   * `fetch(blobSrc)` (inside `page.evaluate`) that read the blob's size/MIME type, reasoning
   * that a genuinely-resolvable non-empty PDF blob was proof enough on its own. That ALSO
   * turned out to be a dead end, for a different reason: the app's own CSP `connect-src` is
   * `'self'` and does not (and must not) include `blob:` — `fetch()`/`XHR` to a `blob:` URL is
   * itself a `connect-src`-governed request, so the in-page fetch was blocked by the exact
   * policy this test exists to verify. The application itself never fetches its own preview
   * blob (the browser resolves `<iframe src="blob:...">` internally, not via `fetch`), so
   * loosening `connect-src` to accommodate this test technique would weaken production CSP for
   * no product reason — rejected. Confirmed via CI run 30531695763 (shard 2): every scenario
   * failed in ~2s with `page.evaluate: TypeError: Failed to fetch`.
   *
   * CURRENT APPROACH — two independent, headless-safe signals, both of which must pass here,
   * plus the plain src-attribute check callers already do before calling this method:
   *  1. Direct CSP header assertion (`fetchCspFrameSrcDirective`) — the deterministic core. A
   *     server-side contract check that fails against a pre-fix `frameSrc: ["'self'"]` config
   *     and passes against the fixed `["'self'", 'blob:']` config, regardless of browser
   *     behavior.
   *  2. Zero CSP-violation console messages (`cspViolationMessages`) — defense in depth for
   *     real (non-headless-shell) browsers, where a frame-src block always also logs a console
   *     error synchronously with the blocked navigation.
   *
   * See the e2e-test-engineer agent memory (`general-e2e-patterns.md`) for the investigation
   * record of both superseded attempts, and the connect-src pitfall specifically, so a future
   * refactor doesn't re-add an in-page blob fetch.
   */
  private async assertPreviewHardened(): Promise<void> {
    const frameSrcValues = await this.fetchCspFrameSrcDirective();
    if (!frameSrcValues.includes("'self'") || !frameSrcValues.includes('blob:')) {
      throw new Error(
        "Expected CSP frame-src directive to include both 'self' and blob:, got: " +
          `[${frameSrcValues.join(', ')}]`,
      );
    }

    if (this.cspViolationMessages.length > 0) {
      throw new Error(
        `Detected ${this.cspViolationMessages.length} Content-Security-Policy violation ` +
          `console message(s) while loading the report preview: ` +
          `${this.cspViolationMessages.join('; ')}`,
      );
    }
  }

  /**
   * Waits for PDF generation to settle: the loading overlay disappears, the preview iframe
   * has a non-empty `blob:` src, AND (Story #1891 hardening) that src is proven safe — see
   * `assertPreviewHardened`'s docstring for why the src attribute alone is not sufficient
   * proof and why a browsing-context navigation match isn't either, in this environment. PDF
   * generation (pdfmake + pdf-lib, both loaded via dynamic `import()`) can be slow, especially
   * on the first call of a test (cold chunk load) — callers should pair this with
   * `test.slow()` and rely on Playwright's default generous `expect()` timeout rather than a
   * short custom one.
   */
  async waitForPreviewReady(): Promise<void> {
    await this.previewLoadingOverlay.waitFor({ state: 'hidden' });
    await this.previewIframe.waitFor({ state: 'visible' });
    const src = await this.previewIframe.getAttribute('src');
    if (!src || !src.startsWith('blob:')) {
      throw new Error(`Expected preview iframe src to be a blob: URL, got "${src}"`);
    }
    await this.assertPreviewHardened();
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
    // Poll until the src attribute actually changes from previousSrc (a fresh regeneration can
    // race the overlay hiding), then run the same Story #1891 hardened checks — see
    // assertPreviewHardened's docstring — once the new src has settled.
    await expect(async () => {
      const src = await this.getPreviewSrc();
      if (!src.startsWith('blob:')) {
        throw new Error(`Expected preview iframe src to be a blob: URL, got "${src}"`);
      }
      if (src === previousSrc) {
        throw new Error('Preview src has not changed yet — regeneration still pending');
      }
    }).toPass({ timeout: 10_000 });
    await this.assertPreviewHardened();
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
