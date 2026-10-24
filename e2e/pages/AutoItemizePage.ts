/**
 * Page Object Model for the Split with AI page
 * Route: /budget/invoices/:id/auto-itemize/:documentId
 *
 * Since #2235 the lines are the shared cost line grid (`CostLineGrid`, test id prefix
 * `auto-itemize-grid`): one editable row per extracted line (Include checkbox, merge-selection
 * checkbox, Description, Quantity, Unit, Unit price, Entered as Net|Gross toggle, Gross,
 * Belongs to picker, Cost category and Funding source selects, Duplicate / Use an existing cost
 * line… / Remove). The old line cards, the "Assign…" picker modal and the inline "Create Budget
 * Line" draft are gone: a row creates a NEW cost line on its task or purchase (its own Belongs to,
 * else "Assign all to"), or links an EXISTING one ("Use an existing cost line…").
 *
 * Row indexes in this class are 0-based (`lineX(0)` is "row 1" of the grid); the grid POM itself
 * is 1-based (`grid.row(1)`).
 *
 * Page structure (AutoItemizePage.tsx):
 * - Loading: Spinner role="img" aria-label="Analyzing invoice" + caption "Analyzing… (Ns)"
 * - Ready: h1 "Split with AI", breadcrumb trail "Money › Invoices › ‹invoice h1›", metadata card
 *   (#invoice-number, #amount, #date, #due-date, #notes, #invoice-status with SuggestionBadges),
 *   mode radios (Append | Replace), the grid card with the total + variance indicator, Save /
 *   Cancel; PDF preview column (iframe "Invoice PDF preview")
 * - Error: FormError banner (role="alert") + Retry
 * - Cancel with edits: the shared ConfirmDialog (prefix `auto-itemize-discard`)
 * - Merge: select two rows, "Merge" in the SelectionActionBar; a merging row is a notice row
 *   ("Merging 2 items…"), a failed one an alert row with "Restore original lines" and "Retry"
 */

import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { BreadcrumbsBar } from './BreadcrumbsBar.js';
import { CostLineGrid } from './components/CostLineGrid.js';

export class AutoItemizePage {
  readonly page: Page;

  // Header
  readonly pageTitle: Locator;
  /** Trail "Money › Invoices › ‹invoice h1›" (the invoice item appears once it has loaded). */
  readonly breadcrumbs: BreadcrumbsBar;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  // Loading state
  readonly spinner: Locator;
  readonly analyzingCaption: Locator;

  // Error state
  readonly errorBanner: Locator;
  readonly retryButton: Locator;

  // Metadata form inputs
  readonly invoiceNumberInput: Locator;
  readonly totalAmountInput: Locator;
  readonly invoiceDateInput: Locator;
  readonly dueDateInput: Locator;
  readonly notesInput: Locator;
  /** `<select id="invoice-status">` (To pay, Paid, Submitted, Offer). */
  readonly statusSelect: Locator;

  // PDF preview
  readonly pdfIframe: Locator;
  readonly pdfLoadingOverlay: Locator;
  readonly pdfFallback: Locator;

  // Cancel confirmation
  readonly cancelModal: Locator;
  readonly discardButton: Locator;
  readonly keepEditingButton: Locator;

  // Live region for a11y announcements
  readonly liveRegion: Locator;

  // Layout columns (responsive checks)
  readonly formColumn: Locator;
  readonly previewColumn: Locator;

  /** The lines grid (prefix `auto-itemize-grid`). */
  readonly grid: CostLineGrid;

  /**
   * Informational note rendered when at least one row creates a line on the discretionary
   * funding source: `<p role="note" class*="discretionaryNote">`.
   */
  readonly discretionaryNote: Locator;

  /** The "Merge" button of the SelectionActionBar (accessible name "Merge n selected line items"). */
  readonly mergeButton: Locator;
  readonly clearSelectionButton: Locator;
  /** Grid notice rows (a merging or failed merge). */
  readonly mergingRow: Locator;
  readonly mergeErrorRow: Locator;
  readonly mergeRetryButton: Locator;
  readonly mergeUndoButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.pageTitle = page.getByRole('heading', { level: 1 });
    this.breadcrumbs = new BreadcrumbsBar(page);
    this.saveButton = page.getByRole('button', { name: /^Save$|^Saving\.\.\.$/i });
    this.cancelButton = page.locator('[class*="actions"]').getByRole('button', {
      name: /^Cancel$/i,
      exact: true,
    });

    this.spinner = page.locator('[role="img"][aria-label="Analyzing invoice"]');
    this.analyzingCaption = page.locator('[class*="analyzingCaption"]');

    this.errorBanner = page.locator('[role="alert"]').first();
    this.retryButton = page.getByRole('button', { name: /^Retry$/i });

    this.invoiceNumberInput = page.locator('#invoice-number');
    this.totalAmountInput = page.locator('#amount');
    this.invoiceDateInput = page.locator('#date');
    this.dueDateInput = page.locator('#due-date');
    this.notesInput = page.locator('#notes');
    this.statusSelect = page.locator('#invoice-status');

    this.pdfIframe = page.locator('iframe[title="Invoice PDF preview"]');
    this.pdfLoadingOverlay = page.locator('[class*="pdfLoadingOverlay"]');
    this.pdfFallback = page.locator('[role="region"][aria-label="PDF preview unavailable"]');

    this.cancelModal = page
      .getByRole('alertdialog')
      .filter({ has: page.getByTestId('auto-itemize-discard-cancel') });
    this.discardButton = this.cancelModal.getByTestId('auto-itemize-discard-confirm');
    this.keepEditingButton = this.cancelModal.getByTestId('auto-itemize-discard-cancel');

    this.liveRegion = page.locator('[role="status"][aria-atomic="true"]');

    this.formColumn = page.locator('[class*="formColumn"]');
    this.previewColumn = page.locator('[class*="previewColumn"]');

    this.grid = new CostLineGrid(page, 'auto-itemize-grid');
    this.discretionaryNote = page.locator('[role="note"][class*="discretionaryNote"]');

    this.mergeButton = page.getByRole('button', { name: /^Merge \d+ selected line items$/i });
    this.clearSelectionButton = page.getByRole('button', { name: /^Clear selection$/i });
    this.mergingRow = this.grid.grid.locator('[role="status"]').filter({ hasText: /^Merging / });
    this.mergeErrorRow = this.grid.grid.locator('[role="alert"]');
    this.mergeRetryButton = page.locator('[data-testid^="auto-itemize-grid-notice-retry-"]');
    this.mergeUndoButton = page.locator('[data-testid^="auto-itemize-grid-notice-undo-"]');
  }

  /**
   * Navigate directly to the page. In real usage it is reached via the Documents panel's
   * "Itemize" action on the invoice page.
   */
  async goto(invoiceId: string, documentId: number): Promise<void> {
    await this.page.goto(routeUrl('invoiceAutoItemize', { id: invoiceId, documentId }));
    await this.pageTitle.waitFor({ state: 'visible' });
  }

  /**
   * The SuggestionBadge container of a metadata field (a sibling of the field control inside its
   * `.fieldRow`).
   */
  suggestionBadge(field: 'amount' | 'date' | 'dueDate' | 'invoiceNumber' | 'notes'): Locator {
    return this.page
      .locator(`#${AutoItemizePage.inputId(field)}`)
      .locator('xpath=ancestor::div[contains(@class,"fieldRow")]')
      .locator('[class*="badge"]')
      .first();
  }

  /** The Apply button inside a SuggestionBadge. */
  applyBadgeButton(field: 'amount' | 'date' | 'dueDate' | 'invoiceNumber' | 'notes'): Locator {
    return this.page
      .locator(`#${AutoItemizePage.inputId(field)}`)
      .locator('xpath=ancestor::div[contains(@class,"fieldRow") or contains(@class,"field")]')
      .first()
      .getByRole('button', { name: /Apply/i });
  }

  private static inputId(field: 'amount' | 'date' | 'dueDate' | 'invoiceNumber' | 'notes'): string {
    if (field === 'dueDate') return 'due-date';
    if (field === 'invoiceNumber') return 'invoice-number';
    return field;
  }

  // ─── Grid rows (0-based indexes) ───────────────────────────────────────────

  /** Row `index` (0-based) of the lines grid. */
  lineRow(index: number): Locator {
    return this.grid.row(index + 1);
  }

  /** The Include checkbox of the row. */
  lineCheckbox(index: number): Locator {
    return this.grid.include(index + 1);
  }

  lineDescription(index: number): Locator {
    return this.grid.description(index + 1);
  }

  lineQuantity(index: number): Locator {
    return this.grid.cell('Quantity', index + 1);
  }

  /** The Unit price input (the whole amount for a line without a quantity). */
  lineUnitPrice(index: number): Locator {
    return this.grid.cell('Unit price', index + 1);
  }

  /** The Net | Gross toggle of the row (replaces the old "Price includes VAT" checkbox). */
  lineEnteredAs(index: number): Locator {
    return this.grid.enteredAs(index + 1);
  }

  /** The gross amount cell of the row. */
  lineGross(index: number): Locator {
    return this.grid.gross(index + 1);
  }

  lineCategory(index: number): Locator {
    return this.grid.cell('Cost category', index + 1);
  }

  lineFundingSource(index: number): Locator {
    return this.grid.cell('Funding source', index + 1);
  }

  /** The row's own "Belongs to" picker input. */
  lineTarget(index: number): Locator {
    return this.grid.target(index + 1);
  }

  /** "Use an existing cost line…" of the row. */
  lineUseExistingButton(index: number): Locator {
    return this.grid.useExistingButton(index + 1);
  }

  /** "Use a new line instead" of a row that links an existing line. */
  lineClearExistingButton(index: number): Locator {
    return this.grid.clearExistingButton(index + 1);
  }

  /** The "Links <description>" label of a row that links an existing line. */
  lineExistingLabel(index: number): Locator {
    return this.grid.existingLabel(index + 1);
  }

  /** The AI certainty text of the row ("AI certainty 95%"). */
  lineCertainty(index: number): Locator {
    return this.lineRow(index).locator('[class*="certainty"]');
  }

  /** The merge-selection checkbox of the row. */
  lineSelectCheckbox(index: number): Locator {
    return this.grid.select(index + 1);
  }

  /** Number of extracted lines in the grid (the trailing blank row is not counted). */
  async lineCount(): Promise<number> {
    return this.grid.filledRowCount();
  }

  /**
   * Waits for the LLM dry-run to complete and the grid to render: the analyzing caption goes
   * away and the grid shows.
   *
   * Callers that navigate with `page.goto()` register `page.waitForResponse()` for the dry-run
   * POST BEFORE the goto and await it before this method; otherwise the caption may not be
   * mounted yet and the check passes too early.
   */
  async waitForAnalyzingDone(): Promise<void> {
    await this.analyzingCaption.waitFor({ state: 'hidden' });
    await this.grid.grid.waitFor({ state: 'visible' });
  }

  /** Clicks Save and waits for navigation back to the invoice detail page. */
  async save(): Promise<void> {
    await this.saveButton.click();
    await this.page.waitForURL(/\/budget\/invoices\/[^/]+$/);
  }

  /**
   * Clicks Cancel. With `expectModal` waits for the discard confirmation; otherwise expects
   * immediate navigation back.
   */
  async cancel(expectModal = false): Promise<void> {
    await this.cancelButton.click();
    if (expectModal) {
      await this.cancelModal.waitFor({ state: 'visible' });
    } else {
      await this.page.waitForURL(/\/budget\/invoices\/[^/]+$/);
    }
  }

  /**
   * The variance indicator of the totals card: varianceMatch (<= 1%), varianceWarning (1-5%) or
   * varianceDanger (> 5%).
   */
  getVarianceIndicator(): Locator {
    return this.page.locator(
      '[class*="varianceMatch"], [class*="varianceWarning"], [class*="varianceDanger"]',
    );
  }

  /** The PDF preview iframe (alias of `pdfIframe`). */
  getPdfPreviewIframe(): Locator {
    return this.pdfIframe;
  }

  /** The metadata Amount input (#amount); alias of `totalAmountInput`. */
  getMetadataAmountInput(): Locator {
    return this.totalAmountInput;
  }

  // ─── Merge multiple extracted lines ────────────────────────────────────────

  /** Selects the row for merging (adds it to the merge selection). */
  /** The sticky SelectionActionBar (present while at least one row is selected). */
  selectionActionBar(): Locator {
    return this.mergeButton.locator('xpath=ancestor::div[contains(@class,"bar")][1]');
  }

  async selectLineForMerge(index: number): Promise<void> {
    await this.lineSelectCheckbox(index).check();
  }

  async clickMergeButton(): Promise<void> {
    await this.mergeButton.click();
  }

  async clickClearSelection(): Promise<void> {
    await this.clearSelectionButton.first().click();
  }

  /**
   * State of the Merge button: 'hidden' with no selection (no action bar), 'disabled' with one
   * row selected (merge needs two; the button is `aria-disabled`), 'enabled' with two or more.
   */
  async getMergeButtonState(): Promise<'hidden' | 'disabled' | 'enabled'> {
    if ((await this.mergeButton.count()) === 0) return 'hidden';
    if (!(await this.mergeButton.isVisible())) return 'hidden';
    return (await this.mergeButton.getAttribute('aria-disabled')) === 'true'
      ? 'disabled'
      : 'enabled';
  }

  /** Waits until no row is merging any more. */
  async waitForMergedRow(): Promise<void> {
    await this.mergingRow.waitFor({ state: 'hidden' });
  }

  async clickRetryMerge(): Promise<void> {
    await this.mergeRetryButton.click();
  }

  async clickUndoMerge(): Promise<void> {
    await this.mergeUndoButton.click();
  }
}
