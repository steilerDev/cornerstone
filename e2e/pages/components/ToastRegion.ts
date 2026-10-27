/**
 * Component POM for the toast regions (#2209).
 *
 * Toasts carry no ARIA role (the two persistent live regions do); locate them by test id.
 * Undo toasts show for 6 s: act on them immediately after the triggering action.
 */

import type { Page, Locator } from '@playwright/test';

export class ToastRegion {
  readonly page: Page;
  readonly undoToast: Locator;
  readonly undoButton: Locator;
  readonly successToast: Locator;
  readonly infoToast: Locator;
  readonly errorToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.undoToast = page.getByTestId('toast-undo');
    this.undoButton = page.getByTestId('toast-undo-button');
    this.successToast = page.getByTestId('toast-success');
    this.infoToast = page.getByTestId('toast-info');
    this.errorToast = page.getByTestId('toast-error');
  }

  /** The undo toast whose message contains `text`. */
  undoToastWith(text: string | RegExp): Locator {
    return this.undoToast.filter({ hasText: text });
  }

  /** The toast's own dismiss (X) control: the last button of the toast, after Undo. */
  get dismissUndoButton(): Locator {
    return this.undoToast.getByRole('button').last();
  }

  /**
   * Close the undo toast(s) through their dismiss control. Unlike waiting for the 6 s clock, this
   * never depends on the pointer: hover (or focus) pauses an undo toast's clock, and on a phone
   * the toast appears under the pointer that just tapped the menu item.
   */
  async dismissUndoToasts(): Promise<void> {
    while ((await this.undoToast.count()) > 0) {
      await this.dismissUndoButton.click();
      await this.undoToast
        .first()
        .waitFor({ state: 'detached' })
        .catch(() => undefined);
    }
  }

  get undoneToast(): Locator {
    return this.infoToast.filter({ hasText: 'Change undone.' });
  }

  /** Click Undo and wait for the confirming "Change undone." toast. */
  async undoViaButton(): Promise<void> {
    await this.undoButton.click();
    await this.undoneToast.waitFor({ state: 'visible' });
  }

  /** Keyboard undo (Ctrl/Cmd+Z); the caller picks the modifier for the browser. */
  async undoViaShortcut(modifier: 'Control' | 'Meta'): Promise<void> {
    await this.page.keyboard.press(`${modifier}+z`);
    await this.undoneToast.waitFor({ state: 'visible' });
  }
}
