/**
 * Page Object Model for the Task page (/project/work-items/:id), rebuilt on the detail template
 * in #2248 (EPIC-21 P5.4).
 *
 * The page is composed of shared controls:
 * - `breadcrumbs` (Tasks, optional origin Back) and `header` (`task-header`): h1 = the title, the
 *   status chip (`work-item-status`), ONE primary (Not started: `task-primary-start`; In progress:
 *   `task-primary-done`; Done/Cancelled-like: Log `task-primary-log`) and the ⋯ menu (Copy link,
 *   Print, Delete `object-header-delete`)
 * - `summary` (`task-summary`): facts when, where, who (+ Call `task-summary-call`), cost,
 *   waitsFor, holdsUp and documents (Paperless on), ids `summary-fact-<id>`
 * - `tabs` (`task-tabs`): overview (default), timing, cost, diary, history; `?tab=` carries them
 * - Overview: cards Details (`section-task-details`), Who and where (`section-task-who-where`),
 *   Checklist (`section-task-checklist`), Notes (`section-task-notes`) and the "Add ▾" menu
 *   (`task-add-menu`: Checklist item / Note, whichever card is not shown yet)
 * - Timing: cards Dates (`task-dates`), Constraints (`task-constraints`), the Reschedule section,
 *   RelatedLists `task-waits-for` / `task-waiting` / `task-milestones` / `task-purchases`
 * - Cost: `costLines` and the RelatedList `task-grants`
 * - Site diary: `task-diary-log`, the company block `task-diary`, the collapsed `<details>`
 *   `task-diary-other`
 * - History: `task-history-created` line and the history feed
 *
 * Dialogs (ObjectForm): `noteDialog` (Add note / Edit note, `note-form`), `checklistRenameDialog`,
 * `dependencyDialog(title)` (`dependency-form`), `milestoneDialog` ("Link milestone",
 * `milestone-link-form`). Deletes use the shared ConfirmDialog (prefixes `work-item-delete`,
 * `note-delete`, `subtask-delete`).
 *
 * Remove actions of the RelatedLists act at once and show an Undo toast (`toasts`).
 */

import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { BreadcrumbsBar } from './BreadcrumbsBar.js';
import { CompanyPickerControl } from './components/CompanyPickerControl.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';
import { CostLinesPanel } from './components/CostLinesPanel.js';
import { EntityPickerControl } from './components/EntityPickerControl.js';
import { ObjectFormDialog } from './components/ObjectFormDialog.js';
import { ObjectHeaderControl } from './components/ObjectHeaderControl.js';
import { ObjectTabsControl } from './components/ObjectTabsControl.js';
import { RelatedListControl } from './components/RelatedListControl.js';
import { SectionCardControl } from './components/SectionCardControl.js';
import { StatusMenuControl } from './components/StatusMenuControl.js';
import { SummaryStripControl } from './components/SummaryStripControl.js';
import { ToastRegion } from './components/ToastRegion.js';

export type TaskTab = 'overview' | 'timing' | 'cost' | 'diary' | 'history';

export class WorkItemDetailPage {
  readonly page: Page;

  // Header
  readonly breadcrumbs: BreadcrumbsBar;
  readonly header: ObjectHeaderControl;
  readonly heading: Locator;
  /** Header StatusMenu chip (data-testid="work-item-status"). */
  readonly statusMenu: StatusMenuControl;
  /** The Not started primary (Start), a StatusMenu in its `action` appearance. */
  readonly startPrimary: StatusMenuControl;
  /** The In progress primary (Mark done). */
  readonly donePrimary: StatusMenuControl;
  /** The Done primary: Log (opens the capture screen). */
  readonly logPrimary: Locator;
  /** Late / Held up chip next to the When fact; absent when neither applies. */
  readonly headerScheduleSignal: Locator;
  /** The default (nav) area path inside the header: must stay absent (fix/1278). */
  readonly areaBreadcrumbNav: Locator;
  readonly toasts: ToastRegion;

  // Strip, tabs
  readonly summary: SummaryStripControl;
  readonly callButton: Locator;
  readonly tabs: ObjectTabsControl;

  // Overview
  readonly detailsCard: SectionCardControl;
  readonly whoWhereCard: SectionCardControl;
  readonly checklistCard: SectionCardControl;
  readonly notesCard: SectionCardControl;
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;
  readonly descriptionText: Locator;
  readonly whoText: Locator;
  readonly areaText: Locator;
  /** The "Add ▾" trigger of the Overview (Checklist item / Note). */
  readonly addMenu: Locator;
  readonly checklistAddInput: Locator;
  readonly checklistAddButton: Locator;
  readonly notesAddButton: Locator;
  readonly whoPicker: EntityPickerControl;
  /** The chip of the chosen Who inside the Who and where form. */
  readonly selectedWho: Locator;
  /** "Clear selection" of the Who picker (edit mode, a value chosen). */
  readonly clearWho: Locator;
  readonly areaPicker: EntityPickerControl;
  readonly noteDialog: ObjectFormDialog;
  readonly editNoteDialog: ObjectFormDialog;
  readonly checklistRenameDialog: ObjectFormDialog;
  readonly noteDeleteDialog: ConfirmDialogControl;
  readonly subtaskDeleteDialog: ConfirmDialogControl;

  // Timing
  readonly timingPanel: Locator;
  readonly datesCard: SectionCardControl;
  readonly constraintsCard: SectionCardControl;
  readonly rescheduleButton: Locator;
  readonly rescheduleSection: Locator;
  readonly rescheduleRetry: Locator;
  readonly depErrorDismiss: Locator;
  readonly plannedDates: Locator;
  readonly waitsFor: RelatedListControl;
  readonly waiting: RelatedListControl;
  readonly milestones: RelatedListControl;
  readonly purchases: RelatedListControl;
  readonly milestoneDialog: ObjectFormDialog;

  // Cost
  readonly costLines: CostLinesPanel;
  readonly grants: RelatedListControl;
  /** The grant chooser opened by the Grants Add action. */
  readonly grantPicker: EntityPickerControl;
  /** "Add cost line" (same locator as `costLines.addButton`). */
  readonly addBudgetLineButton: Locator;
  /** Company picker of the cost line form (#vendorId, under "More details"). */
  readonly budgetVendorPicker: CompanyPickerControl;

  // Site diary
  readonly diaryLog: Locator;
  readonly diaryCompanyBlock: Locator;
  readonly diaryShowAll: Locator;
  readonly diaryOther: Locator;
  readonly diaryOtherSummary: Locator;
  readonly diaryOtherFeed: Locator;

  // History
  readonly historyCreated: Locator;

  // Delete confirmation (ConfirmDialog, role="alertdialog")
  readonly deleteDialog: ConfirmDialogControl;
  readonly deleteModal: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  // Error states
  readonly errorState: Locator; // load failure / 404 state (role="alert" card)

  constructor(page: Page) {
    this.page = page;

    this.breadcrumbs = new BreadcrumbsBar(page);
    this.header = new ObjectHeaderControl(page, 'task-header');
    this.heading = page.getByRole('heading', { level: 1 });
    this.statusMenu = new StatusMenuControl(page, 'work-item-status');
    this.startPrimary = new StatusMenuControl(page, 'task-primary-start');
    this.donePrimary = new StatusMenuControl(page, 'task-primary-done');
    this.logPrimary = page.getByTestId('task-primary-log');
    this.headerScheduleSignal = page.getByTestId('work-item-schedule-signal');
    this.areaBreadcrumbNav = this.header.root.getByRole('navigation', { name: /area path/i });
    this.toasts = new ToastRegion(page);

    this.summary = new SummaryStripControl(page, 'task-summary');
    this.callButton = page.getByTestId('task-summary-call');
    this.tabs = new ObjectTabsControl(page, 'task-tabs');

    // Overview
    this.detailsCard = new SectionCardControl(page, 'section-task-details');
    this.whoWhereCard = new SectionCardControl(page, 'section-task-who-where');
    this.checklistCard = new SectionCardControl(page, 'section-task-checklist');
    this.notesCard = new SectionCardControl(page, 'section-task-notes');
    this.titleInput = page.getByTestId('task-field-title');
    this.descriptionInput = page.getByTestId('task-field-description');
    this.descriptionText = page.getByTestId('task-detail-description');
    this.whoText = page.getByTestId('task-detail-who');
    this.areaText = page.getByTestId('task-detail-area');
    this.addMenu = page.getByTestId('task-add-menu');
    this.checklistAddInput = page.getByTestId('task-checklist-add-input');
    this.checklistAddButton = page.getByTestId('task-checklist-add');
    this.notesAddButton = page.getByTestId('task-notes-add');
    const whoWhereForm = page.getByTestId('section-task-who-where-form');
    this.whoPicker = new EntityPickerControl(
      page,
      whoWhereForm.getByLabel('Who', { exact: true }),
      whoWhereForm,
    );
    this.selectedWho = whoWhereForm.locator('[class*="selectedDisplay"]').first();
    this.clearWho = whoWhereForm.getByRole('button', { name: 'Clear selection', exact: true });
    this.areaPicker = new EntityPickerControl(
      page,
      whoWhereForm.getByLabel('Area', { exact: true }),
      whoWhereForm,
    );
    this.noteDialog = new ObjectFormDialog(page, 'Add note', 'note-form');
    this.editNoteDialog = new ObjectFormDialog(page, 'Edit note', 'note-form');
    this.checklistRenameDialog = new ObjectFormDialog(
      page,
      'Rename checklist item',
      'checklist-item-form',
    );
    this.noteDeleteDialog = new ConfirmDialogControl(page, 'note-delete');
    this.subtaskDeleteDialog = new ConfirmDialogControl(page, 'subtask-delete');

    // Timing
    this.timingPanel = page.getByTestId('task-timing-panel');
    this.datesCard = new SectionCardControl(page, 'task-dates');
    this.constraintsCard = new SectionCardControl(page, 'task-constraints');
    this.rescheduleButton = page.getByTestId('task-reschedule');
    this.rescheduleSection = page.getByTestId('task-reschedule-section');
    this.rescheduleRetry = page.getByTestId('task-reschedule-retry');
    this.depErrorDismiss = page.getByTestId('task-dep-error-dismiss');
    this.plannedDates = page.getByTestId('work-item-planned-dates');
    this.waitsFor = new RelatedListControl(page, 'task-waits-for');
    this.waiting = new RelatedListControl(page, 'task-waiting');
    this.milestones = new RelatedListControl(page, 'task-milestones');
    this.purchases = new RelatedListControl(page, 'task-purchases');
    this.milestoneDialog = new ObjectFormDialog(page, 'Link milestone', 'milestone-link-form');

    // Cost
    this.costLines = new CostLinesPanel(page);
    this.addBudgetLineButton = this.costLines.addButton;
    this.grants = new RelatedListControl(page, 'task-grants');
    this.grantPicker = new EntityPickerControl(page, this.grants.root.locator('input').first());
    this.budgetVendorPicker = new CompanyPickerControl(
      page,
      'vendorId',
      page.getByTestId('cost-line-form'),
    );

    // Site diary
    this.diaryLog = page.getByTestId('task-diary-log');
    this.diaryCompanyBlock = page.getByTestId('task-diary');
    this.diaryShowAll = page.getByTestId('task-diary-show-all');
    this.diaryOther = page.getByTestId('task-diary-other');
    this.diaryOtherSummary = this.diaryOther.locator('summary');
    this.diaryOtherFeed = page.getByTestId('task-diary-other-feed');

    this.historyCreated = page.getByTestId('task-history-created');

    this.deleteDialog = new ConfirmDialogControl(page, 'work-item-delete');
    this.deleteModal = this.deleteDialog.dialog;
    this.deleteConfirmButton = this.deleteDialog.confirmButton;
    this.deleteCancelButton = this.deleteDialog.cancelButton;

    this.errorState = page.locator('[class*="errorCard"]');
  }

  /**
   * Navigate directly to the task page by id (optionally on a tab or with extra query).
   * Waits for the h1 heading to appear (page loaded) OR the error state (load failure / 404).
   */
  async goto(
    id: string,
    options: { tab?: TaskTab; query?: Record<string, string>; hash?: string } = {},
  ): Promise<void> {
    const query: Record<string, string> = { ...(options.query ?? {}) };
    if (options.tab) query.tab = options.tab;
    const url = routeUrl('workItem', { id }, Object.keys(query).length > 0 ? query : undefined);
    // `domcontentloaded`, not the default `load`: the heading/error wait below is the real
    // readiness signal, and `load` also waits for every subresource.
    await this.page.goto(`${url}${options.hash ?? ''}`, { waitUntil: 'domcontentloaded' });
    await Promise.race([
      this.heading.waitFor({ state: 'visible' }),
      this.errorState.waitFor({ state: 'visible' }),
    ]);
  }

  /** The h1 text. */
  async getTitle(): Promise<string> {
    return (await this.heading.textContent()) ?? '';
  }

  /** Select a tab and wait for its panel. */
  async openTab(tab: TaskTab): Promise<void> {
    await this.tabs.select(tab);
    await expect(this.tabs.panel(tab)).toBeVisible();
  }

  // ─── Overview ──────────────────────────────────────────────────────────────

  /** Open the Add ▾ menu and choose "Checklist item" or "Note". */
  async chooseAdd(item: 'Checklist item' | 'Note'): Promise<void> {
    await this.addMenu.click();
    await this.page.getByRole('menuitem', { name: item, exact: true }).click();
  }

  /** One checklist row by its title. */
  checklistItem(title: string): Locator {
    return this.page.locator('[data-testid^="task-checklist-item-"]').filter({ hasText: title });
  }

  /** The ⋯ trigger of a checklist row. */
  checklistActions(title: string): Locator {
    return this.checklistItem(title).getByRole('button', { name: `Actions for ${title}` });
  }

  /** Choose a ⋯ action (Rename, Move up, Move down, Delete) of a checklist row. */
  async chooseChecklistAction(
    title: string,
    action: 'Rename' | 'Move up' | 'Move down' | 'Delete',
  ): Promise<void> {
    await this.checklistActions(title).click();
    await this.page.getByRole('menuitem', { name: action, exact: true }).click();
  }

  /** Add a checklist item through the card's add field and wait for its row. */
  async addChecklistItem(title: string): Promise<void> {
    await this.checklistAddInput.fill(title);
    await this.checklistAddButton.click();
    await expect(this.checklistItem(title)).toBeVisible();
  }

  /** One note by its text. */
  note(text: string): Locator {
    return this.page.locator('[data-testid^="task-note-"]').filter({ hasText: text });
  }

  /** Choose Edit or Delete from the ⋯ menu of a note. */
  async chooseNoteAction(text: string, action: 'Edit' | 'Delete'): Promise<void> {
    await this.note(text)
      .getByRole('button', { name: /^Actions for the note/ })
      .click();
    await this.page.getByRole('menuitem', { name: action, exact: true }).click();
  }

  /** Add a note through the dialog (the Notes card's "Add note" or the Add ▾ menu). */
  async saveNoteInDialog(text: string): Promise<void> {
    await this.noteDialog.waitForOpen();
    await this.noteDialog.field('content').fill(text);
    await this.noteDialog.save();
    await this.noteDialog.waitForClosed();
    await expect(this.note(text)).toBeVisible();
  }

  /** Edit the details card: set title and/or description, Save. */
  async editDetails(values: { title?: string; description?: string }): Promise<void> {
    await this.detailsCard.startEdit();
    if (values.title !== undefined) await this.titleInput.fill(values.title);
    if (values.description !== undefined) await this.descriptionInput.fill(values.description);
    await this.detailsCard.save();
  }

  // ─── Timing ────────────────────────────────────────────────────────────────

  /** The Timing tab's input of a date card by its test id. */
  input(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  /** The Add action of a dependency list: the header button or the empty state's button. */
  dependencyAdd(list: RelatedListControl): Locator {
    return list.addButton.or(list.addAction('Add')).first();
  }

  /** The dependency dialog; `title` is the dialog's h2 (see `dependencyDialogTitles`). */
  dependencyDialog(title: string): ObjectFormDialog {
    return new ObjectFormDialog(this.page, title, 'dependency-form');
  }

  /** The "Link milestone" Add action: header button or empty-state button. */
  milestoneAdd(): Locator {
    return this.milestones.addButton.or(this.milestones.addAction('Link milestone')).first();
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  /** Open the delete confirmation from the ⋯ menu. */
  async openDeleteModal(): Promise<void> {
    await this.header.chooseMenuItem('object-header-delete');
    await this.deleteDialog.waitForOpen();
  }

  /** Confirm deletion in the dialog. The page navigates to the task list on success. */
  async confirmDelete(): Promise<void> {
    await this.deleteDialog.confirmButton.click();
    await this.page.waitForURL('**/project/work-items');
  }

  /** Cancel the delete dialog without deleting. */
  async cancelDelete(): Promise<void> {
    await this.deleteDialog.cancel();
  }

  /** Delete the task through the ⋯ menu and the confirm dialog. */
  async deleteWorkItem(): Promise<void> {
    await this.openDeleteModal();
    await this.confirmDelete();
  }

  /** Whether the page loaded in the error state (404 or load failure). */
  async isInErrorState(): Promise<boolean> {
    try {
      // Short timeout: we are probing for an optional state.
      await this.errorState.waitFor({ state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }
}

/** The h2 of the dependency dialog per direction/mode (workItems:taskPage.dependencyDialog). */
export const dependencyDialogTitles = {
  addWaitsFor: 'Add a task this one waits for',
  addWaiting: 'Add a task that waits for this one',
  edit: (title: string) => `Dependency: ${title}`,
} as const;
