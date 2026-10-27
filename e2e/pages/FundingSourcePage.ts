/**
 * Page Object Model for the Funding source page (/budget/financing/sources/:id), #2242
 * (EPIC-21 P4.10), built on the detail template.
 *
 * - `header` (`source-header`): h1 = the source name, the StatusMenu chip `source-status-badge`
 *   (Active · Used up · Closed, with Undo), ONE primary: bank loan / credit line →
 *   "Prepare bank report" link `source-primary-bank-report`; other types → the forward status
 *   `source-primary-status` or Log `source-primary-log`; ⋯ menu with Delete (`object-header-delete`;
 *   absent on Own funds).
 * - `summary` (`source-summary`): facts `summary-fact-<amount|allocated|paid|submitted|unallocated|rate|documents>`
 *   (rate absent on Own funds / without a rate; documents only with Paperless); Paid carries
 *   `[data-figure="paid"]`.
 * - `tabs` (`source-tabs`): Overview · Cost (n) · History; `?tab=` carries the selection.
 * - Overview: the over-allocation warning `source-over-allocated` with `source-move-lines`
 *   ("Move lines…" opens Cost with the first checkbox focused), Allocation card (`source-allocation`,
 *   `source-allocation-legend`) and the Details card (`source-details`: read rows
 *   `source-detail-*`, edit fields `source-field-*`, Edit/Save/Cancel `source-details-edit|save|cancel`).
 * - Cost tab: the combined tree area › item › line (SourceBudgetLinePanel `#source-lines-<id>`),
 *   tri-state checkboxes (aria-labels "Select all in <area>", "Select all under <item>",
 *   "Select <line>"), the selection bar `source-lines-<id>-selection-bar` with
 *   `source-lines-<id>-move` ("Move to another source"), then the Move modal.
 * - History tab: ObjectHistorySection `source-history` (+ `source-history-show-all`).
 * - Delete: ConfirmDialog prefix `source-delete`.
 */

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { BreadcrumbsBar } from './BreadcrumbsBar.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';
import { ObjectHeaderControl } from './components/ObjectHeaderControl.js';
import { ObjectTabsControl } from './components/ObjectTabsControl.js';
import { StatusMenuControl } from './components/StatusMenuControl.js';
import { SummaryStripControl } from './components/SummaryStripControl.js';
import { ToastRegion } from './components/ToastRegion.js';

export class FundingSourcePage {
  readonly page: Page;
  readonly breadcrumbs: BreadcrumbsBar;
  readonly header: ObjectHeaderControl;
  readonly summary: SummaryStripControl;
  readonly tabs: ObjectTabsControl;
  readonly statusMenu: StatusMenuControl;
  readonly toasts: ToastRegion;
  readonly deleteDialog: ConfirmDialogControl;

  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly bankReportPrimary: Locator;
  readonly statusPrimary: Locator;
  readonly logPrimary: Locator;
  readonly errorCard: Locator;

  // Overview
  readonly overAllocatedWarning: Locator;
  readonly moveLines: Locator;
  readonly allocationCard: Locator;
  readonly allocationLegend: Locator;
  readonly detailsCard: Locator;
  readonly detailsEdit: Locator;
  readonly detailsSave: Locator;
  readonly detailsCancel: Locator;
  readonly detailsBanner: Locator;
  readonly nameInput: Locator;
  readonly typeSelect: Locator;
  readonly amountInput: Locator;
  readonly interestInput: Locator;
  readonly referenceInput: Locator;
  readonly termsInput: Locator;
  readonly contactInput: Locator;
  readonly notesInput: Locator;

  // History
  readonly history: Locator;
  readonly historyShowAll: Locator;

  // Move modal
  readonly moveModal: Locator;
  readonly moveModalSearchInput: Locator;
  readonly moveModalConfirmButton: Locator;
  readonly moveModalCancelButton: Locator;
  readonly moveModalWarningBlock: Locator;
  readonly moveModalUnderstoodCheckbox: Locator;
  readonly moveModalFormError: Locator;

  constructor(page: Page) {
    this.page = page;
    this.breadcrumbs = new BreadcrumbsBar(page);
    this.header = new ObjectHeaderControl(page, 'source-header');
    this.summary = new SummaryStripControl(page, 'source-summary');
    this.tabs = new ObjectTabsControl(page, 'source-tabs');
    this.statusMenu = new StatusMenuControl(page, 'source-status-badge');
    this.toasts = new ToastRegion(page);
    this.deleteDialog = new ConfirmDialogControl(page, 'source-delete');

    this.heading = page.getByRole('heading', { level: 1 });
    this.statusBadge = page.getByTestId('source-status-badge');
    this.bankReportPrimary = page.getByTestId('source-primary-bank-report');
    this.statusPrimary = page.getByTestId('source-primary-status');
    this.logPrimary = page.getByTestId('source-primary-log');
    this.errorCard = page.locator('[role="alert"]').filter({ hasText: /could not be/i });

    this.overAllocatedWarning = page.getByTestId('source-over-allocated');
    this.moveLines = page.getByTestId('source-move-lines');
    this.allocationCard = page.getByTestId('source-allocation');
    this.allocationLegend = page.getByTestId('source-allocation-legend');
    this.detailsCard = page.getByTestId('source-details');
    this.detailsEdit = page.getByTestId('source-details-edit');
    this.detailsSave = page.getByTestId('source-details-save');
    this.detailsCancel = page.getByTestId('source-details-cancel');
    this.detailsBanner = this.detailsCard.getByRole('alert');
    this.nameInput = page.getByTestId('source-field-name');
    this.typeSelect = page.getByTestId('source-field-type');
    this.amountInput = page.getByTestId('source-field-amount');
    this.interestInput = page.getByTestId('source-field-interest-rate');
    this.referenceInput = page.getByTestId('source-field-reference');
    this.termsInput = page.getByTestId('source-field-terms');
    this.contactInput = page.getByTestId('source-field-contact');
    this.notesInput = page.getByTestId('source-field-notes');

    // ObjectHistorySection is a SectionCard without a test id: `section-<prefix>`
    this.history = page.getByTestId('section-source-history');
    this.historyShowAll = page.getByTestId('source-history-show-all');

    this.moveModal = page.getByRole('dialog', { name: 'Move lines to another source' });
    this.moveModalSearchInput = this.moveModal.locator('#target-source');
    this.moveModalConfirmButton = this.moveModal.getByRole('button', {
      name: /Move lines|Loading/i,
    });
    this.moveModalCancelButton = this.moveModal.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    this.moveModalWarningBlock = this.moveModal.locator('[role="alert"]');
    this.moveModalUnderstoodCheckbox = this.moveModal.getByRole('checkbox', {
      name: 'I understand this will reassign lines with a submitted invoice',
    });
    this.moveModalFormError = this.moveModal.locator('[class*="banner"]');
  }

  async goto(id: string, query?: Record<string, string>): Promise<void> {
    await this.page.goto(routeUrl('fundingSource', { id }, query));
    await this.heading.waitFor({ state: 'visible' });
    await this.summary.root.waitFor({ state: 'visible' });
  }

  async openCostTab(): Promise<void> {
    await this.tabs.select('cost');
  }

  async openDetailsEdit(): Promise<void> {
    await this.detailsEdit.click();
    await this.nameInput.waitFor({ state: 'visible' });
  }

  async openDelete(): Promise<void> {
    await this.header.chooseMenuItem('object-header-delete');
    await this.deleteDialog.waitForOpen();
  }

  // ─── Cost tab ──────────────────────────────────────────────────────────────

  linesPanel(sourceId: string): Locator {
    return this.page.locator(`[id="source-lines-${sourceId}"]`);
  }

  lineCheckbox(sourceId: string, description: string): Locator {
    return this.linesPanel(sourceId).getByRole('checkbox', { name: `Select ${description}` });
  }

  areaCheckbox(sourceId: string, areaName: string): Locator {
    return this.linesPanel(sourceId).getByRole('checkbox', { name: `Select all in ${areaName}` });
  }

  itemCheckbox(sourceId: string, itemName: string): Locator {
    return this.linesPanel(sourceId).getByRole('checkbox', {
      name: `Select all under ${itemName}`,
    });
  }

  itemLink(sourceId: string, itemName: string): Locator {
    return this.linesPanel(sourceId).getByRole('link', { name: `Open ${itemName}` });
  }

  /** Area headings (h2), item headings (h3) of the tree, in DOM order. */
  areaHeadings(sourceId: string): Locator {
    return this.linesPanel(sourceId).locator('h2');
  }

  itemHeadings(sourceId: string): Locator {
    return this.linesPanel(sourceId).locator('h3');
  }

  selectionBar(sourceId: string): Locator {
    return this.page.getByTestId(`source-lines-${sourceId}-selection-bar`);
  }

  moveButton(sourceId: string): Locator {
    return this.page.getByTestId(`source-lines-${sourceId}-move`);
  }

  async openMoveModal(sourceId: string): Promise<void> {
    await this.moveButton(sourceId).click();
    await this.moveModal.waitFor({ state: 'visible' });
  }

  /** Click the "I understand" label text (clicking the nested input double-fires on WebKit). */
  async clickUnderstoodLabel(): Promise<void> {
    await this.moveModal.locator('[class*="understoodLabel"]').click();
  }

  async selectMoveTarget(targetName: string): Promise<void> {
    const input = this.moveModalSearchInput;
    await input.waitFor({ state: 'visible' });
    await input.click();
    await input.fill(targetName);
    // The dropdown is portalled to the body, outside the modal
    await this.page.getByRole('option', { name: targetName }).click();
  }

  async confirmMove(): Promise<void> {
    await this.moveModalConfirmButton.click();
  }

  /** Wait for the page to show the given source name as h1 (after a Details save). */
  async expectName(name: string): Promise<void> {
    await expect(this.heading).toHaveText(name);
  }
}
