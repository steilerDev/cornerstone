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
