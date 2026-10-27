/**
 * Page Object Model for the Grant page (/budget/financing/grants/:id), #2242 (EPIC-21 P4.10).
 *
 * - `header` (`grant-header`): h1 = the grant name, status chip `grant-status-badge` (Eligible ·
 *   Applied · Approved · Received · Rejected, with Undo), ONE primary: the forward status
 *   `grant-primary-status` (Mark applied / approved / received) or Log `grant-primary-log`; the ⋯ menu
 *   holds Delete (`object-header-delete`).
 * - `summary` (`grant-summary`, 5 columns): facts `summary-fact-<rate|cap|expected|deadline|documents>`.
 * - `tabs` (`grant-tabs`): Overview · Work · History. Overview: Details card (`grant-details`,
 *   read rows `grant-detail-*`, edit fields `grant-field-<name|rate|cap|deadline|description|notes>`),
 *   Eligibility card (`grant-eligibility`, `grant-field-categories` multi-picker chips,
 *   `grant-field-eligibility`, read rows `grant-detail-categories|no-category|eligibility`) and the
 *   explanation card (`grant-explanation`, `grant-explanation-text`).
 * - Work tab: RelatedList `grant-covered-items` (rows `grant-covered-items-row-<type:id>` with link,
 *   amount, ⋯ → Remove with Undo; NO row Edit: covered amounts are computed) and the link picker
 *   (`grant-link-picker`, `grant-link-submit`).
 * - History tab: `grant-history`. Delete: ConfirmDialog prefix `grant-delete`.
 */

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { BreadcrumbsBar } from './BreadcrumbsBar.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';
import { EntityPickerControl } from './components/EntityPickerControl.js';
import { ObjectHeaderControl } from './components/ObjectHeaderControl.js';
import { ObjectTabsControl } from './components/ObjectTabsControl.js';
import { RelatedListControl } from './components/RelatedListControl.js';
import { StatusMenuControl } from './components/StatusMenuControl.js';
import { SummaryStripControl } from './components/SummaryStripControl.js';
import { ToastRegion } from './components/ToastRegion.js';

export type CoveredItemType = 'work_item' | 'household_item';

export class GrantPage {
  readonly page: Page;
  readonly breadcrumbs: BreadcrumbsBar;
  readonly header: ObjectHeaderControl;
  readonly summary: SummaryStripControl;
  readonly tabs: ObjectTabsControl;
  readonly statusMenu: StatusMenuControl;
  readonly statusPrimaryMenu: StatusMenuControl;
  readonly coveredItems: RelatedListControl;
  readonly toasts: ToastRegion;
  readonly deleteDialog: ConfirmDialogControl;

  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly statusPrimary: Locator;
  readonly logPrimary: Locator;
  readonly errorCard: Locator;

  // Overview
  readonly detailsCard: Locator;
  readonly detailsEdit: Locator;
  readonly detailsSave: Locator;
  readonly detailsCancel: Locator;
  readonly nameInput: Locator;
  readonly rateInput: Locator;
  readonly capInput: Locator;
  readonly deadlineInput: Locator;
  readonly descriptionInput: Locator;
  readonly notesInput: Locator;
  readonly eligibilityCard: Locator;
  readonly eligibilityEdit: Locator;
  readonly eligibilitySave: Locator;
  readonly eligibilityCancel: Locator;
  readonly eligibilityInput: Locator;
  readonly explanation: Locator;
  readonly explanationText: Locator;

  // Work tab
  readonly linkPicker: Locator;
  readonly linkSubmit: Locator;
  readonly linkPickerInput: Locator;
  readonly linkPickerChips: Locator;

  // History
  readonly history: Locator;

  constructor(page: Page) {
    this.page = page;
    this.breadcrumbs = new BreadcrumbsBar(page);
    this.header = new ObjectHeaderControl(page, 'grant-header');
    this.summary = new SummaryStripControl(page, 'grant-summary');
    this.tabs = new ObjectTabsControl(page, 'grant-tabs');
    this.statusMenu = new StatusMenuControl(page, 'grant-status-badge');
    this.statusPrimaryMenu = new StatusMenuControl(page, 'grant-primary-status');
    this.coveredItems = new RelatedListControl(page, 'grant-covered-items');
    this.toasts = new ToastRegion(page);
    this.deleteDialog = new ConfirmDialogControl(page, 'grant-delete');

    this.heading = page.getByRole('heading', { level: 1 });
    this.statusBadge = page.getByTestId('grant-status-badge');
    this.statusPrimary = page.getByTestId('grant-primary-status');
    this.logPrimary = page.getByTestId('grant-primary-log');
    this.errorCard = page.locator('[role="alert"]').filter({ hasText: /could not be/i });

    this.detailsCard = page.getByTestId('grant-details');
    this.detailsEdit = page.getByTestId('grant-details-edit');
    this.detailsSave = page.getByTestId('grant-details-save');
    this.detailsCancel = page.getByTestId('grant-details-cancel');
    this.nameInput = page.getByTestId('grant-field-name');
    this.rateInput = page.getByTestId('grant-field-rate');
    this.capInput = page.getByTestId('grant-field-cap');
    this.deadlineInput = page.getByTestId('grant-field-deadline');
    this.descriptionInput = page.getByTestId('grant-field-description');
    this.notesInput = page.getByTestId('grant-field-notes');
    this.eligibilityCard = page.getByTestId('grant-eligibility');
    this.eligibilityEdit = page.getByTestId('grant-eligibility-edit');
    this.eligibilitySave = page.getByTestId('grant-eligibility-save');
    this.eligibilityCancel = page.getByTestId('grant-eligibility-cancel');
    this.eligibilityInput = page.getByTestId('grant-field-eligibility');
    this.explanation = page.getByTestId('grant-explanation');
    this.explanationText = page.getByTestId('grant-explanation-text');

    this.linkPicker = page.getByTestId('grant-link-picker');
    this.linkSubmit = page.getByTestId('grant-link-submit');
    this.linkPickerInput = this.linkPicker.locator('input');
    this.linkPickerChips = page.getByTestId('grant-link-picker-chips');

    // ObjectHistorySection is a SectionCard without a test id: `section-<prefix>`
    this.history = page.getByTestId('section-grant-history');
  }

  async goto(id: string, query?: Record<string, string>): Promise<void> {
    await this.page.goto(routeUrl('grant', { id }, query));
    await this.heading.waitFor({ state: 'visible' });
    await this.summary.root.waitFor({ state: 'visible' });
  }

  async openWorkTab(): Promise<void> {
    await this.tabs.select('work');
  }

  async openDelete(): Promise<void> {
    await this.header.chooseMenuItem('object-header-delete');
    await this.deleteDialog.waitForOpen();
  }

  /** The id a covered-item row carries (`<type>:<id>`). */
  static rowId(type: CoveredItemType, id: string): string {
    return `${type}:${id}`;
  }

  /**
   * The "Link tasks / purchases" action: the header button once rows exist, the EmptyState's
   * button (no test id) while the list is empty.
   */
  get linkAction(): Locator {
    return this.coveredItems.addButton
      .or(
        this.coveredItems.root.getByRole('button', { name: 'Link tasks / purchases', exact: true }),
      )
      .first();
  }

  async openLinkPicker(): Promise<void> {
    await this.linkAction.click();
  }

  /** Open the Link picker, pick the items by keyboard and submit ("Link n items"). */
  async linkItems(titles: readonly string[]): Promise<void> {
    await this.openLinkPicker();
    await this.linkPicker.waitFor({ state: 'visible' });
    const picker = new EntityPickerControl(this.page, this.linkPickerInput);
    for (const title of titles) {
      await picker.pick(title);
    }
    await expect(this.linkSubmit).toContainText(`Link ${titles.length} item`);
    await this.linkSubmit.click();
    await this.linkPicker.waitFor({ state: 'hidden' });
  }
}
