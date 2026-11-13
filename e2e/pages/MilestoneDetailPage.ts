/**
 * Page Object Model for the Milestone page (/project/milestones/:id), rebuilt on the object
 * template in #2250 (EPIC-21 P5.6). It replaces the old view card, the hand-rolled edit form and
 * both SearchPicker link pickers.
 *
 * The page is composed of shared controls:
 * - `breadcrumbs` (Tasks > Milestones, optional origin Back) and `header` (`milestone-header`):
 *   h1 = the title (once, no card repeats it), the status chip (`milestone-status`), ONE primary
 *   (not reached: Mark reached `milestone-primary-reached`, a StatusMenu in its `action`
 *   appearance with the date chips Today / On target / Pick a date; reached: Reopen
 *   `milestone-primary-reopen`, a plain button with no date step), the secondary Change target
 *   (`milestone-secondary-change-target`, hidden once reached) and the ⋯ menu (Delete
 *   `object-header-delete`)
 * - `summary` (`milestone-summary`): facts `target`, `projected` (label "Reached" once reached),
 *   `againstTarget` (Badge `milestone-against-target`) and `countsToward`; ids `summary-fact-<id>`
 * - `tabs` (`milestone-tabs`): overview (default), work, history; `?tab=` carries them
 * - Overview: ONE Details card (`section-milestone-details`): read rows `milestone-detail-*`
 *   (target, reached, color), the empty note `milestone-detail-empty`, edit fields
 *   `milestone-field-*` (title, target-date, description, color)
 * - Work: the RelatedLists `milestone-counts` (tasks only; row ids are the task id) and
 *   `milestone-waiting` (tasks and purchases; row ids are `work_item:<id>` / `household_item:<id>`)
 * - History: the created line `milestone-history-created` and the feed `section-milestone-history`
 *
 * Panels mount lazily, so a spec that touches Work or History opens that tab (`goto` takes
 * `tab`). Not found renders the h1 "Milestone not found" and a "Back to Milestones" button inside
 * the error card (role="alert").
 */

import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { BreadcrumbsBar } from './BreadcrumbsBar.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';
import { EntityPickerControl } from './components/EntityPickerControl.js';
import { ObjectHeaderControl } from './components/ObjectHeaderControl.js';
import { ObjectTabsControl } from './components/ObjectTabsControl.js';
import { RelatedListControl } from './components/RelatedListControl.js';
import { SectionCardControl } from './components/SectionCardControl.js';
import { StatusMenuControl } from './components/StatusMenuControl.js';
import { SummaryStripControl } from './components/SummaryStripControl.js';
import { ToastRegion } from './components/ToastRegion.js';

export type MilestoneTab = 'overview' | 'work' | 'history';

export class MilestoneDetailPage {
  readonly page: Page;

  // Header
  readonly breadcrumbs: BreadcrumbsBar;
  readonly header: ObjectHeaderControl;
  readonly heading: Locator; // h1 = milestone.title
  /** Header StatusMenu chip (data-testid="milestone-status"). */
  readonly statusMenu: StatusMenuControl;
  /** Alias of the chip trigger (its text is the canonical status word). */
  readonly statusBadge: Locator;
  /** The not-reached primary: Mark reached (a StatusMenu in its `action` appearance). */
  readonly reachedPrimary: StatusMenuControl;
  /** The reached primary: Reopen (plain button, no date step). */
  readonly reopenPrimary: Locator;
  /** The secondary: Change target (focuses the Target date field of the Details card). */
  readonly changeTargetButton: Locator;
  readonly toasts: ToastRegion;

  // Strip, tabs
  readonly summary: SummaryStripControl;
  readonly againstTargetBadge: Locator;
  readonly tabs: ObjectTabsControl;

  // Overview
  readonly detailsCard: SectionCardControl;
  readonly titleInput: Locator;
  readonly targetDateInput: Locator;
  readonly descriptionInput: Locator;
  readonly emptyNote: Locator;

  // Work
  readonly counts: RelatedListControl;
  readonly waiting: RelatedListControl;
  /** The task chooser opened by the Counts toward Add action. */
  readonly countsPicker: EntityPickerControl;
  /** The task-or-purchase chooser opened by the Waiting for Add action. */
  readonly waitingPicker: EntityPickerControl;

  // History
  readonly historyCreated: Locator;
  readonly history: Locator;

  // Delete (ConfirmDialog, role="alertdialog", testid prefix milestone-delete)
  readonly deleteDialog: ConfirmDialogControl;
  readonly deleteModal: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  // Error / not-found states (one error card, role="alert")
  readonly errorState: Locator;
  readonly notFoundState: Locator;
  readonly backToMilestonesButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.breadcrumbs = new BreadcrumbsBar(page);
    this.header = new ObjectHeaderControl(page, 'milestone-header');
    this.heading = page.getByRole('heading', { level: 1 });
    this.statusMenu = new StatusMenuControl(page, 'milestone-status');
    this.statusBadge = this.statusMenu.trigger;
    this.reachedPrimary = new StatusMenuControl(page, 'milestone-primary-reached');
    this.reopenPrimary = page.getByTestId('milestone-primary-reopen');
    this.changeTargetButton = page.getByTestId('milestone-secondary-change-target');
    this.toasts = new ToastRegion(page);

    this.summary = new SummaryStripControl(page, 'milestone-summary');
    this.againstTargetBadge = page.getByTestId('milestone-against-target');
    this.tabs = new ObjectTabsControl(page, 'milestone-tabs');

    this.detailsCard = new SectionCardControl(page, 'section-milestone-details');
    this.titleInput = page.getByTestId('milestone-field-title');
    this.targetDateInput = page.getByTestId('milestone-field-target-date');
    this.descriptionInput = page.getByTestId('milestone-field-description');
    this.emptyNote = page.getByTestId('milestone-detail-empty');

    this.counts = new RelatedListControl(page, 'milestone-counts');
    this.waiting = new RelatedListControl(page, 'milestone-waiting');
    this.countsPicker = new EntityPickerControl(page, this.counts.root.locator('input').first());
    this.waitingPicker = new EntityPickerControl(page, this.waiting.root.locator('input').first());

    this.historyCreated = page.getByTestId('milestone-history-created');
    // ObjectHistorySection is a SectionCard without a test id: `section-<prefix>`
    this.history = page.getByTestId('section-milestone-history');

    this.deleteDialog = new ConfirmDialogControl(page, 'milestone-delete');
    this.deleteModal = this.deleteDialog.dialog;
    this.deleteConfirmButton = this.deleteDialog.confirmButton;
    this.deleteCancelButton = this.deleteDialog.cancelButton;

    this.errorState = page.locator('[role="alert"][class*="errorCard"]');
    this.notFoundState = this.errorState;
    this.backToMilestonesButton = this.errorState.getByRole('button', {
      name: 'Back to Milestones',
    });
  }

  /**
   * Navigate to the milestone page by id (optionally on a tab). Waits for the summary strip (the
   * loaded page; the h1 is already present on the loading skeleton) or the error state (404).
   */
  async goto(id: number | string, options: { tab?: MilestoneTab } = {}): Promise<void> {
    const url = routeUrl('milestone', { id }, options.tab ? { tab: options.tab } : undefined);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await Promise.race([
      this.summary.root.waitFor({ state: 'visible' }),
      this.errorState.waitFor({ state: 'visible' }),
    ]);
  }

  /** The h1 text (the milestone title). */
  async getTitle(): Promise<string> {
    return (await this.heading.textContent()) ?? '';
  }

  /** The status chip text (e.g. "Upcoming", "Late · 3 d", "Reached"). */
  async getStatusText(): Promise<string> {
    return (await this.statusBadge.textContent()) ?? '';
  }

  /** Select a tab and wait for its panel. */
  async openTab(tab: MilestoneTab): Promise<void> {
    await this.tabs.select(tab);
    await expect(this.tabs.panel(tab)).toBeVisible();
  }

  /** Edit the Details card: set the given fields and Save. */
  async editDetails(values: {
    title?: string;
    targetDate?: string;
    description?: string;
  }): Promise<void> {
    await this.detailsCard.startEdit();
    if (values.title !== undefined) await this.titleInput.fill(values.title);
    if (values.targetDate !== undefined) await this.targetDateInput.fill(values.targetDate);
    if (values.description !== undefined) await this.descriptionInput.fill(values.description);
    await this.detailsCard.save();
  }

  /** A Details read row (dd) by field. */
  detail(field: 'target' | 'reached' | 'color'): Locator {
    return this.page.getByTestId(`milestone-detail-${field}`);
  }

  /**
   * The Add action of a related list: the header button, or the empty state's button of the same
   * label ("Add task" / "Add task or purchase").
   */
  addAction(list: RelatedListControl, label: string): Locator {
    return list.addButton.or(list.addAction(label)).first();
  }

  /** The row key of a task in the Waiting for list. */
  static taskKey(id: string): string {
    return `work_item:${id}`;
  }

  /** The row key of a purchase in the Waiting for list. */
  static purchaseKey(id: string): string {
    return `household_item:${id}`;
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  /** Open the delete confirmation from the ⋯ menu. */
  async openDeleteModal(): Promise<void> {
    await this.header.chooseMenuItem('object-header-delete');
    await this.deleteDialog.waitForOpen();
  }

  /** Cancel the delete dialog without deleting. */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  /** Confirm deletion in the dialog. The page navigates to the Milestones list on success. */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
    await this.page.waitForURL('**/project/milestones');
  }

  /** Delete the milestone through the ⋯ menu and the confirm dialog. */
  async deleteMilestone(): Promise<void> {
    await this.openDeleteModal();
    await this.confirmDelete();
  }

  /** Probe for the not-found state (the error card with the "Milestone not found" h1). */
  async isInNotFoundState(): Promise<boolean> {
    return (
      (await this.errorState.isVisible()) &&
      (await this.heading.textContent()) === 'Milestone not found'
    );
  }
}
