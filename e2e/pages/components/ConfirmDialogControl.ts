/**
 * Component POM for the shared ConfirmDialog (role="alertdialog", #2209).
 *
 * Every delete / remove / deactivate / restore / discard confirmation renders the same
 * dialog; only the test-id prefix differs per host (`work-item-delete`, `vendor-delete`, ...).
 * Pass the prefix and optionally the accessible name (the title question, e.g. "Delete Kitchen?")
 * to scope to one dialog. Initial focus is on Cancel. The action is aria-disabled while the
 * delete-impact counts load (Playwright treats that as not enabled, so click() waits for it).
 */

import type { Page, Locator } from '@playwright/test';

export class ConfirmDialogControl {
  readonly page: Page;
  readonly prefix: string;
  readonly dialog: Locator;
  readonly cancelButton: Locator;
  readonly confirmButton: Locator;
  readonly retryButton: Locator;
  readonly consequencesList: Locator;

  constructor(page: Page, prefix: string, name?: string | RegExp) {
    this.page = page;
    this.prefix = prefix;
    this.dialog =
      name === undefined
        ? page.getByRole('alertdialog').filter({ has: page.getByTestId(`${prefix}-cancel`) })
        : page.getByRole('alertdialog', { name });
    this.cancelButton = this.dialog.getByTestId(`${prefix}-cancel`);
    this.confirmButton = this.dialog.getByTestId(`${prefix}-confirm`);
    this.retryButton = this.dialog.getByTestId(`${prefix}-retry`);
    this.consequencesList = this.dialog.getByTestId(`${prefix}-consequences`);
  }

  async waitForOpen(): Promise<void> {
    await this.dialog.waitFor({ state: 'visible' });
  }

  /** A single count row by label fragment, e.g. consequence('Subtasks deleted with it'). */
  consequence(label: string | RegExp): Locator {
    return this.consequencesList.getByRole('listitem').filter({ hasText: label });
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.dialog.waitFor({ state: 'hidden' });
  }

  /** Click the action (waits for it to be enabled, i.e. counts loaded). */
  async confirm(): Promise<void> {
    await this.confirmButton.click();
  }

  async confirmAndWaitClosed(): Promise<void> {
    await this.confirm();
    await this.dialog.waitFor({ state: 'hidden' });
  }
}
