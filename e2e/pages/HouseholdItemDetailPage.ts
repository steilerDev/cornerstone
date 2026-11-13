/**
 * Page Object Model for the Purchase page (/project/household-items/:id), rebuilt on the object
 * template in #2249 (EPIC-21 P5.5). It replaces the old detail page and the separate edit page.
 *
 * The page is composed of shared controls:
 * - `breadcrumbs` (Purchases, optional origin Back) and `header` (`purchase-header`): h1 = the name,
 *   the status chip (`purchase-status`), ONE primary (Planned: Mark ordered `purchase-primary-ordered`;
 *   Ordered / Delivery scheduled: Mark delivered `purchase-primary-delivered`; Delivered: Log
 *   `purchase-primary-log`) and the ⋯ menu (Delete `object-header-delete`)
 * - `summary` (`purchase-summary`): facts delivery, where, company (+ Call `purchase-summary-call`),
 *   cost, invoiced, waitsFor and documents (Paperless on), ids `summary-fact-<id>`; the Late badge
 *   `purchase-late-badge` sits inside the delivery fact
 * - `tabs` (`purchase-tabs`): overview (default), timing, cost, diary, history; `?tab=` carries them
 * - Overview: ONE Details card (`section-purchase-details`): read rows `purchase-detail-*`
 *   (empty ones are omitted), edit fields `purchase-field-*` plus the Category / Company / Area
 *   pickers (EntityPicker, found by label inside the form)
 * - Timing: the Delivery card (`section-purchase-delivery`, rows `purchase-delivery-*`, inputs
 *   `purchase-*-input`, late reason `purchase-late-reason`) and the RelatedList `purchase-waits-for`
 *   (tasks or milestones; row ids are `work_item:<id>` / `milestone:<id>`)
 * - Cost: `costLines` and the RelatedList `purchase-grants`
 * - Site diary: `purchase-diary*`; History: `purchase-history-created`
 *
 * Panels mount lazily, so a spec that touches Timing, Cost or the diary opens that tab (`goto`
 * takes `tab`). Edit URLs (`/edit`, `?edit=overview`) redirect to the Overview with the Details
 * card in edit mode and drop the `edit` param.
 */

import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { BreadcrumbsBar } from './BreadcrumbsBar.js';
import { CompanyPickerControl } from './components/CompanyPickerControl.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';
import { CostLinesPanel } from './components/CostLinesPanel.js';
import { EntityPickerControl } from './components/EntityPickerControl.js';
import { ObjectHeaderControl } from './components/ObjectHeaderControl.js';
import { ObjectTabsControl } from './components/ObjectTabsControl.js';
import { RelatedListControl } from './components/RelatedListControl.js';
import { SectionCardControl } from './components/SectionCardControl.js';
import { StatusMenuControl } from './components/StatusMenuControl.js';
import { SummaryStripControl } from './components/SummaryStripControl.js';
import { ToastRegion } from './components/ToastRegion.js';

export type PurchaseTab = 'overview' | 'timing' | 'cost' | 'diary' | 'history';

export class HouseholdItemDetailPage {
  readonly page: Page;

  // Header
  readonly breadcrumbs: BreadcrumbsBar;
  readonly header: ObjectHeaderControl;
  readonly heading: Locator;
  /** Header StatusMenu chip (data-testid="purchase-status"). */
  readonly statusMenu: StatusMenuControl;
  /** The Planned primary: Mark ordered (a StatusMenu in its `action` appearance, date step). */
  readonly orderedPrimary: StatusMenuControl;
  /** The Ordered / Delivery scheduled primary: Mark delivered. */
  readonly deliveredPrimary: StatusMenuControl;
  /** The Delivered primary: Log (opens the capture screen). */
  readonly logPrimary: Locator;
  /** The area path inside the header: must stay absent (fix/1278). */
  readonly areaBreadcrumbNav: Locator;
  readonly toasts: ToastRegion;

  // Strip, tabs
  readonly summary: SummaryStripControl;
  readonly callButton: Locator;
  readonly lateBadge: Locator;
  readonly tabs: ObjectTabsControl;

  // Overview
  readonly detailsCard: SectionCardControl;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly quantityInput: Locator;
  readonly urlInput: Locator;
  readonly categoryPicker: EntityPickerControl;
  /** The Company field of the Details form (EntityPicker with the inline "New company" row). */
  readonly companyPicker: CompanyPickerControl;
  /** The chip of the chosen company inside the Details form. */
  readonly selectedCompany: Locator;
  readonly areaPicker: EntityPickerControl;
  readonly emptyNote: Locator;

  // Timing
  readonly timingPanel: Locator;
  readonly deliveryCard: SectionCardControl;
  readonly lateReason: Locator;
  readonly waitsFor: RelatedListControl;
  /** The Waits for chooser opened by its Add action (tasks and milestones in one list). */
  readonly waitsForPicker: EntityPickerControl;

  // Cost
  readonly costPanel: Locator;
  readonly costLines: CostLinesPanel;
  /** The Cost tab's content (cost lines and grants); scope for cost assertions. */
  readonly budgetSection: Locator;
  readonly grants: RelatedListControl;
  readonly grantPicker: EntityPickerControl;

  // Site diary, History
  readonly diaryLog: Locator;
  readonly diaryCompanyBlock: Locator;
  readonly historyCreated: Locator;

  // Delete (ConfirmDialog, role="alertdialog", testid prefix purchase-delete)
  readonly deleteDialog: ConfirmDialogControl;
  readonly deleteModal: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  // Error states
  readonly errorState: Locator;

  constructor(page: Page) {
    this.page = page;

    this.breadcrumbs = new BreadcrumbsBar(page);
    this.header = new ObjectHeaderControl(page, 'purchase-header');
    this.heading = page.getByRole('heading', { level: 1 });
    this.statusMenu = new StatusMenuControl(page, 'purchase-status');
    this.orderedPrimary = new StatusMenuControl(page, 'purchase-primary-ordered');
    this.deliveredPrimary = new StatusMenuControl(page, 'purchase-primary-delivered');
    this.logPrimary = page.getByTestId('purchase-primary-log');
    this.areaBreadcrumbNav = this.header.root.getByRole('navigation', { name: /area path/i });
    this.toasts = new ToastRegion(page);

    this.summary = new SummaryStripControl(page, 'purchase-summary');
    this.callButton = page.getByTestId('purchase-summary-call');
    this.lateBadge = page.getByTestId('purchase-late-badge');
    this.tabs = new ObjectTabsControl(page, 'purchase-tabs');

    // Overview
    this.detailsCard = new SectionCardControl(page, 'section-purchase-details');
    this.nameInput = page.getByTestId('purchase-field-name');
    this.descriptionInput = page.getByTestId('purchase-field-description');
    this.quantityInput = page.getByTestId('purchase-field-quantity');
    this.urlInput = page.getByTestId('purchase-field-url');
    const detailsForm = this.detailsCard.form;
    this.categoryPicker = new EntityPickerControl(
      page,
      detailsForm.getByLabel(/^Category/),
      detailsForm,
    );
    const companyField = detailsForm.locator('label', { hasText: /^Company$/ }).locator('xpath=..');
    this.companyPicker = new CompanyPickerControl(
      page,
      detailsForm.getByLabel('Company', { exact: true }),
      companyField,
    );
    this.selectedCompany = companyField.locator('[class*="selectedDisplay"]').first();
    this.areaPicker = new EntityPickerControl(
      page,
      detailsForm.getByLabel('Area', { exact: true }),
      detailsForm,
    );
    this.emptyNote = page.getByTestId('purchase-detail-empty');

    // Timing
    this.timingPanel = page.getByTestId('purchase-timing-panel');
    this.deliveryCard = new SectionCardControl(page, 'section-purchase-delivery');
    this.lateReason = page.getByTestId('purchase-late-reason');
    this.waitsFor = new RelatedListControl(page, 'purchase-waits-for');
    this.waitsForPicker = new EntityPickerControl(
      page,
      this.waitsFor.root.locator('input').first(),
    );

    // Cost
    this.costPanel = page.getByTestId('purchase-cost-panel');
    this.costLines = new CostLinesPanel(page);
    this.budgetSection = this.costPanel;
    this.grants = new RelatedListControl(page, 'purchase-grants');
    this.grantPicker = new EntityPickerControl(page, this.grants.root.locator('input').first());

    // Site diary, History
    this.diaryLog = page.getByTestId('purchase-diary-log');
    this.diaryCompanyBlock = page.getByTestId('purchase-diary');
    this.historyCreated = page.getByTestId('purchase-history-created');

    this.deleteDialog = new ConfirmDialogControl(page, 'purchase-delete');
    this.deleteModal = this.deleteDialog.dialog;
    this.deleteConfirmButton = this.deleteDialog.confirmButton;
    this.deleteCancelButton = this.deleteDialog.cancelButton;

    this.errorState = page.locator('[class*="errorCard"]');
  }

  /** The Documents panel trigger: the `summary-fact-documents` strip fact (bare count text). */
  get documentsButton(): Locator {
    return this.summary.fact('documents');
  }

  /**
   * Navigate to the purchase page by id (optionally on a tab or with extra query). Waits for the
   * h1 or the error state (load failure / 404).
   */
  async goto(
    id: string,
    options: { tab?: PurchaseTab; query?: Record<string, string>; hash?: string } = {},
  ): Promise<void> {
    const query: Record<string, string> = { ...(options.query ?? {}) };
    if (options.tab) query.tab = options.tab;
    const url = routeUrl(
      'householdItem',
      { id },
      Object.keys(query).length > 0 ? query : undefined,
    );
    await this.page.goto(`${url}${options.hash ?? ''}`, { waitUntil: 'domcontentloaded' });
    await Promise.race([
      this.heading.waitFor({ state: 'visible' }),
      this.errorState.waitFor({ state: 'visible' }),
    ]);
  }

  /** The h1 text (the purchase name). */
  async getHeadingText(): Promise<string> {
    return (await this.heading.textContent()) ?? '';
  }

  /** Select a tab and wait for its panel. */
  async openTab(tab: PurchaseTab): Promise<void> {
    await this.tabs.select(tab);
    await expect(this.tabs.panel(tab)).toBeVisible();
  }

  /** Edit the Details card: set the given fields and Save. */
  async editDetails(values: {
    name?: string;
    description?: string;
    quantity?: string;
    url?: string;
  }): Promise<void> {
    await this.detailsCard.startEdit();
    if (values.name !== undefined) await this.nameInput.fill(values.name);
    if (values.description !== undefined) await this.descriptionInput.fill(values.description);
    if (values.quantity !== undefined) await this.quantityInput.fill(values.quantity);
    if (values.url !== undefined) await this.urlInput.fill(values.url);
    await this.detailsCard.save();
  }

  /** Edit the Delivery card (Timing tab): fill the given ISO dates and Save. */
  async editDelivery(values: {
    ordered?: string;
    earliest?: string;
    latest?: string;
    delivered?: string;
  }): Promise<void> {
    await this.deliveryCard.startEdit();
    if (values.ordered !== undefined) {
      await this.page.getByTestId('purchase-ordered-input').fill(values.ordered);
    }
    if (values.earliest !== undefined) {
      await this.page.getByTestId('purchase-earliest-input').fill(values.earliest);
    }
    if (values.latest !== undefined) {
      await this.page.getByTestId('purchase-latest-input').fill(values.latest);
    }
    if (values.delivered !== undefined) {
      await this.page.getByTestId('purchase-delivered-input').fill(values.delivered);
    }
    await this.deliveryCard.save();
  }

  /** A Details read row (dd) by field: description, category, quantity, company, link, area. */
  detail(field: 'description' | 'category' | 'quantity' | 'company' | 'link' | 'area'): Locator {
    return this.page.getByTestId(`purchase-detail-${field}`);
  }

  /** A Delivery card read row (dd): ordered, earliest, latest, target, delivered. */
  delivery(field: 'ordered' | 'earliest' | 'latest' | 'target' | 'delivered'): Locator {
    return this.page.getByTestId(`purchase-delivery-${field}`);
  }

  /** The Add action of a related list: the header button or the empty state's button. */
  addAction(list: RelatedListControl): Locator {
    return list.addButton.or(list.addAction('Add')).first();
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  /** Open the delete confirmation from the ⋯ menu. */
  async openDeleteModal(): Promise<void> {
    await this.header.chooseMenuItem('object-header-delete');
    await this.deleteDialog.waitForOpen();
  }

  /** Confirm deletion in the dialog. The page navigates to the Purchases list on success. */
  async confirmDelete(): Promise<void> {
    await this.deleteDialog.confirmButton.click();
    await this.page.waitForURL('**/project/household-items');
  }

  /** Delete the purchase through the ⋯ menu and the confirm dialog. */
  async deletePurchase(): Promise<void> {
    await this.openDeleteModal();
    await this.confirmDelete();
  }
}
