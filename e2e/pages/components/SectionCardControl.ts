/**
 * Component POM for the shared SectionCard (a titled card with read and edit modes, #2214+).
 *
 * `testId` is the host's card id (`section-task-details`, `task-dates`, ...). Test ids derived
 * from it: the card `<testId>`, `<testId>-edit` (read mode), `<testId>-form`, `<testId>-cancel`,
 * `<testId>-save` (aria-disabled while nothing changed) and `<testId>-discard-*` for the
 * "Discard changes?" confirm. Only one card of a page is in edit mode at a time.
 */

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ConfirmDialogControl } from './ConfirmDialogControl.js';

export class SectionCardControl {
  readonly page: Page;
  readonly testId: string;
  readonly root: Locator;
  readonly heading: Locator;
  readonly editButton: Locator;
  readonly form: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly discardConfirm: ConfirmDialogControl;

  constructor(page: Page, testId: string) {
    this.page = page;
    this.testId = testId;
    this.root = page.getByTestId(testId);
    this.heading = this.root.getByRole('heading', { level: 2 });
    this.editButton = page.getByTestId(`${testId}-edit`);
    this.form = page.getByTestId(`${testId}-form`);
    this.saveButton = page.getByTestId(`${testId}-save`);
    this.cancelButton = page.getByTestId(`${testId}-cancel`);
    this.discardConfirm = new ConfirmDialogControl(page, `${testId}-discard`);
  }

  /** Press Edit and wait for the form. */
  async startEdit(): Promise<void> {
    await this.editButton.click();
    await expect(this.form).toBeVisible();
  }

  /** Press Save and wait for the card to return to read mode. */
  async save(): Promise<void> {
    await this.saveButton.click();
    await expect(this.form).toBeHidden();
  }

  /** Press Cancel (a clean form closes at once). */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}
