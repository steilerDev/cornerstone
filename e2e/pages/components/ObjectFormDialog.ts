/**
 * Component POM for the ObjectForm create dialog (#2212).
 *
 * `/project/work-items/new`, `/project/household-items/new` and `/project/milestones/new` open
 * this dialog over the page the user came from (or over the parent list on a deep link). From
 * 768px it is a `Modal`; below, a full-screen `Sheet` (panel test id `<testId>-sheet`). Both
 * carry role="dialog" named by the title, so one role locator covers both containers.
 *
 * Field ids are the schema field names (`#title`, `#name`, ...). Non-essential fields sit
 * behind the "More details" disclosure (`hidden` while collapsed); `expandMoreDetails()` opens
 * it and is a no-op when open or absent. The discard confirm is the shared ConfirmDialog with
 * test-id prefix `<testId>-discard`.
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialogControl } from './ConfirmDialogControl.js';

export class ObjectFormDialog {
  readonly page: Page;
  readonly title: string;
  readonly testId: string;
  /** The dialog (Modal or full-screen Sheet), named by its title. */
  readonly dialog: Locator;
  /** The h2 inside the dialog. */
  readonly heading: Locator;
  /** The `<form>` (carries the `object-form` test id whatever the container). */
  readonly form: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  /** The container's own Close (x) button. */
  readonly closeButton: Locator;
  readonly moreToggle: Locator;
  readonly addAnotherCheckbox: Locator;
  /** The always-mounted status line that confirms an "Add another" save. */
  readonly addedStatus: Locator;
  /** Back link of a child step ("Back to <parent>"). */
  readonly backButton: Locator;
  /** Save-error banner (role="alert"); field errors are not alerts. */
  readonly errorBanner: Locator;
  readonly discardConfirm: ConfirmDialogControl;

  constructor(page: Page, title: string, testId = 'object-form') {
    this.page = page;
    this.title = title;
    this.testId = testId;
    this.dialog = page.getByRole('dialog', { name: title, exact: true });
    this.heading = this.dialog.getByRole('heading', { level: 2, name: title, exact: true });
    this.form = this.dialog.getByTestId(testId);
    this.saveButton = this.dialog.getByTestId(`${testId}-save`);
    this.cancelButton = this.dialog.getByTestId(`${testId}-cancel`);
    this.closeButton = this.dialog.getByRole('button', { name: 'Close dialog', exact: true });
    this.moreToggle = this.dialog.getByTestId(`${testId}-more`);
    this.addAnotherCheckbox = this.dialog.getByTestId(`${testId}-add-another`);
    this.addedStatus = this.dialog.getByTestId(`${testId}-added`);
    this.backButton = this.dialog.getByTestId(`${testId}-back`);
    this.errorBanner = this.dialog.getByRole('alert');
    this.discardConfirm = new ConfirmDialogControl(page, `${testId}-discard`);
  }

  /** A field control by its schema name (the DOM id). */
  field(name: string): Locator {
    return this.dialog.locator(`#${name}`);
  }

  /** The inline error text under a field (`#<name>-error`). */
  fieldError(name: string): Locator {
    return this.dialog.locator(`#${name}-error`);
  }

  async waitForOpen(): Promise<void> {
    await this.dialog.waitFor({ state: 'visible' });
    await this.heading.waitFor({ state: 'visible' });
  }

  /** Wait for the open/slide-in transition to finish so measurements are of the settled dialog. */
  async settled(): Promise<void> {
    await this.dialog.evaluate((el) =>
      Promise.all(
        el
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      ),
    );
  }

  async waitForClosed(): Promise<void> {
    await this.dialog.waitFor({ state: 'hidden' });
  }

  /** Open the "More details" disclosure (no-op when it is open or the form has none). */
  async expandMoreDetails(): Promise<void> {
    if ((await this.moreToggle.count()) === 0) return;
    if ((await this.moreToggle.getAttribute('aria-expanded')) !== 'true') {
      await this.moreToggle.click();
    }
    await expect(this.moreToggle).toHaveAttribute('aria-expanded', 'true');
  }

  async save(): Promise<void> {
    await this.saveButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }

  /** Bounding box of the dialog panel (full viewport on the sheet). */
  async box(): Promise<{ x: number; y: number; width: number; height: number }> {
    const box = await this.dialog.boundingBox();
    if (!box) throw new Error('dialog has no bounding box');
    return box;
  }
}
