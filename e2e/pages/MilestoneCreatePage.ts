/**
 * Page Object Model for the New milestone dialog (/project/milestones/new), #2212.
 *
 * The create page is gone: `/project/milestones/new` opens the ObjectForm dialog over the page
 * the user came from (the Calendar view pre-fills the visible date; a deep link shows the
 * Milestones list behind it). From 768px it is a Modal, below a full-screen Sheet; both are
 * role="dialog" named "New milestone".
 *
 * Fields (all essential, no "More details"):
 * - #title (text, required)           data-testid="milestone-title-input"
 * - #targetDate (date, required)      data-testid="milestone-target-date-input"
 * - #description (textarea)           data-testid="milestone-description-input"
 *
 * Behaviour:
 * - Save is `object-form-save`; Cancel is a button (`object-form-cancel`), no longer a link.
 * - Validation errors are inline field errors (`#title-error`, `#targetDate-error`); the first
 *   invalid field takes focus. The alert banner is for save failures only.
 * - On success the URL is replaced with the new milestone (`/project/milestones/:id`).
 */

import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { ObjectFormDialog } from './components/ObjectFormDialog.js';

export const MILESTONE_CREATE_ROUTE = routeUrl('milestoneNew');

export interface MilestoneFormData {
  title?: string;
  targetDate?: string;
  description?: string;
}

export class MilestoneCreatePage {
  readonly page: Page;
  readonly form: ObjectFormDialog;

  // Header
  readonly dialog: Locator;
  /** The dialog's h2 "New milestone". */
  readonly heading: Locator;

  // Form fields
  readonly titleInput: Locator;
  readonly targetDateInput: Locator;
  readonly descriptionInput: Locator;

  // Form actions
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  // Error display
  readonly titleErrorText: Locator;
  readonly targetDateErrorText: Locator;
  /** Save-error banner (role="alert"); validation errors are inline per field. */
  readonly errorBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.form = new ObjectFormDialog(page, 'New milestone');
    this.dialog = this.form.dialog;
    this.heading = this.form.heading;

    this.titleInput = this.form.field('title');
    this.targetDateInput = this.form.field('targetDate');
    this.descriptionInput = this.form.field('description');

    this.submitButton = this.form.saveButton;
    this.cancelButton = this.form.cancelButton;

    this.titleErrorText = this.form.fieldError('title');
    this.targetDateErrorText = this.form.fieldError('targetDate');
    this.errorBanner = this.form.errorBanner;
  }

  /** Open the dialog by deep link (the Milestones list renders behind it) and wait for it. */
  async goto(): Promise<void> {
    await this.page.goto(MILESTONE_CREATE_ROUTE);
    await this.form.waitForOpen();
  }

  /** Fill only the title field. */
  async fillTitle(title: string): Promise<void> {
    await this.titleInput.fill(title);
  }

  /** Fill multiple form fields at once. Only provided fields are filled. */
  async fillForm(data: MilestoneFormData): Promise<void> {
    if (data.title !== undefined) await this.titleInput.fill(data.title);
    if (data.targetDate !== undefined) await this.targetDateInput.fill(data.targetDate);
    if (data.description !== undefined) await this.descriptionInput.fill(data.description);
  }

  /** Click Save. Does NOT wait for navigation — the caller must do that. */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /** Click Cancel and wait for the dialog to close. */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.form.waitForClosed();
  }
}
