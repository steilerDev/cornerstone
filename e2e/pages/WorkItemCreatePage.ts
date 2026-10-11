/**
 * Page Object Model for the New task dialog (/project/work-items/new), #2212.
 *
 * The create page is gone: `/project/work-items/new` opens the ObjectForm dialog over the page
 * the user came from (or over the Tasks list on a deep link). From 768px it is a Modal, below a
 * full-screen Sheet; both are role="dialog" named "New task" (see ObjectFormDialog).
 *
 * Fields (ids kept from the page):
 * - Essentials: #title (required), area picker (label for="area"), #assignment, #durationDays
 * - Behind "More details": #description, #status, #startAfter, #startBefore, dependencies
 *
 * Behaviour:
 * - Save is `object-form-save` ("Save" / "Saving…"); Cancel is `object-form-cancel`.
 * - Validation errors are inline field errors (`#title-error`), never an alert; the first
 *   invalid field takes focus. The alert banner is for save failures only.
 * - On success the URL is replaced with the new task (`/project/work-items/:id`).
 * - "Add another after saving" keeps the dialog open and resets it (area is kept).
 */

import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { ObjectFormDialog } from './components/ObjectFormDialog.js';

export const WORK_ITEM_CREATE_ROUTE = routeUrl('workItemNew');

export interface WorkItemFormData {
  title?: string;
  description?: string;
  status?: string;
  assignedUserId?: string;
  startDate?: string;
  endDate?: string;
  durationDays?: string;
  startAfter?: string;
  startBefore?: string;
}

export class WorkItemCreatePage {
  readonly page: Page;
  readonly form: ObjectFormDialog;

  // Header
  /** The dialog (Modal or full-screen Sheet). */
  readonly dialog: Locator;
  /** The dialog's h2 "New task". */
  readonly heading: Locator;

  // Form fields
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;
  readonly statusSelect: Locator;
  readonly assignedUserSelect: Locator;
  readonly startDateInput: Locator;
  readonly endDateInput: Locator;
  readonly durationInput: Locator;
  readonly startAfterInput: Locator;
  readonly startBeforeInput: Locator;

  // Area picker and breadcrumb preview
  // AreaPicker renders a SearchPicker input with placeholder "Select an area".
  // NOTE: areaPickerInput only exists in the DOM when NO area is selected. Once an area is
  // selected, SearchPicker replaces the <input> with a selectedDisplay chip + clear button.
  readonly areaPickerInput: Locator;
  readonly areaBreadcrumbPreview: Locator;
  readonly areaClearButton: Locator;

  // Form actions
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly moreDetailsToggle: Locator;

  // Error/validation display
  readonly errorBanner: Locator;
  readonly titleErrorText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.form = new ObjectFormDialog(page, 'New task');
    this.dialog = this.form.dialog;
    this.heading = this.form.heading;

    this.titleInput = this.form.field('title');
    this.descriptionInput = this.form.field('description');
    this.statusSelect = this.form.field('status');
    this.assignedUserSelect = this.form.field('assignment');
    this.startDateInput = this.form.field('startDate');
    this.endDateInput = this.form.field('endDate');
    this.durationInput = this.form.field('durationDays');
    this.startAfterInput = this.form.field('startAfter');
    this.startBeforeInput = this.form.field('startBefore');

    this.areaPickerInput = this.dialog.getByPlaceholder('Select an area');
    this.areaBreadcrumbPreview = this.dialog.getByRole('navigation', { name: /area path/i });
    // Direct-parent <div> of <label for="area"> only (child combinator), so the :has() cannot
    // match every ancestor <div> of the label.
    this.areaClearButton = this.dialog
      .locator('div:has(> label[for="area"])')
      .getByRole('button', { name: 'Clear selection', exact: true });

    this.submitButton = this.form.saveButton;
    this.cancelButton = this.form.cancelButton;
    this.moreDetailsToggle = this.form.moreToggle;

    this.errorBanner = this.form.errorBanner;
    this.titleErrorText = this.form.fieldError('title');
  }

  /**
   * Open the dialog by deep link and wait until it is up. The Tasks list renders behind it.
   * Use this on a fresh page (the test's first navigation); use `page.context().newPage()` for
   * a second fresh visit, never a same-URL goto.
   */
  async goto(): Promise<void> {
    await this.page.goto(WORK_ITEM_CREATE_ROUTE);
    await this.form.waitForOpen();
  }

  /** Open the "More details" disclosure. */
  async expandMoreDetails(): Promise<void> {
    await this.form.expandMoreDetails();
  }

  /** Fill only the title field. */
  async fillTitle(title: string): Promise<void> {
    await this.titleInput.fill(title);
  }

  /**
   * Fill multiple form fields at once. Only provided fields are filled; "More details" is
   * opened first when a non-essential field is given.
   */
  async fillForm(data: WorkItemFormData): Promise<void> {
    const needsMore =
      data.description !== undefined ||
      data.status !== undefined ||
      data.startDate !== undefined ||
      data.endDate !== undefined ||
      data.startAfter !== undefined ||
      data.startBefore !== undefined;
    if (needsMore) await this.expandMoreDetails();

    if (data.title !== undefined) await this.titleInput.fill(data.title);
    if (data.description !== undefined) await this.descriptionInput.fill(data.description);
    if (data.status !== undefined) await this.statusSelect.selectOption(data.status);
    if (data.assignedUserId !== undefined) {
      await this.assignedUserSelect.selectOption(data.assignedUserId);
    }
    if (data.startDate !== undefined) await this.startDateInput.fill(data.startDate);
    if (data.endDate !== undefined) await this.endDateInput.fill(data.endDate);
    if (data.durationDays !== undefined) await this.durationInput.fill(data.durationDays);
    if (data.startAfter !== undefined) await this.startAfterInput.fill(data.startAfter);
    if (data.startBefore !== undefined) await this.startBeforeInput.fill(data.startBefore);
  }

  /** Click Save. */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /** Click Cancel and wait for the dialog to close (the URL then leaves `/new`). */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.form.waitForClosed();
  }

  /**
   * Clear the current area selection. areaPickerInput is absent from the DOM once an area is
   * selected, so this clicks the chip's "Clear selection" button instead.
   */
  async clearAreaPicker(): Promise<void> {
    await this.areaClearButton.waitFor({ state: 'visible' });
    await this.areaClearButton.click();
  }
}
