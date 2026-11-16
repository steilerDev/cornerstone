/**
 * Component POM for the keyboard-shortcuts help overlay (#2253).
 *
 * - One `Modal` dialog named "Keyboard shortcuts", owned by the shell. Opened by `?` (any width
 *   with a hardware keyboard), the avatar menu row (`user-menu-shortcuts`, desktop) or the
 *   More-sheet row (`more-sheet-shortcuts`, after a key press was seen).
 * - Three groups, each an `<h3>` plus a table: "On this page" (an empty state when the page has
 *   none), "Everywhere", "Go to". Rows are `keyboard-shortcut-row` with `data-key` (`g s`,
 *   `Mod+k`, `Escape`, `Delete`, ...) and `data-off="true"` only while single-key shortcuts are
 *   off; each such row also carries a `keyboard-shortcut-off` badge ("Turned off").
 * - The footer holds the "Single-key shortcuts" switch (`role="switch"` checkbox, on by default,
 *   persisted per browser in localStorage).
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export const SHORTCUTS_DIALOG_NAME = 'Keyboard shortcuts';

export class KeyboardShortcutsDialog {
  readonly page: Page;
  readonly dialog: Locator;
  readonly singleKeySwitch: Locator;
  readonly emptyPageNote: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dialog = page.getByRole('dialog', { name: SHORTCUTS_DIALOG_NAME, exact: true });
    this.singleKeySwitch = this.dialog.getByRole('switch', { name: 'Single-key shortcuts' });
    this.emptyPageNote = this.dialog.getByText('This page has no shortcuts of its own.');
  }

  groupHeading(name: 'On this page' | 'Everywhere' | 'Go to'): Locator {
    return this.dialog.getByRole('heading', { level: 3, name, exact: true });
  }

  /** A row by its registry key (`?`, `g s`, `Mod+k`, `Escape`, `Delete`, `e`, ...). */
  row(key: string): Locator {
    return this.dialog.locator(`[data-testid="keyboard-shortcut-row"][data-key="${key}"]`);
  }

  /** The "Turned off" badge of one row. */
  offBadge(key: string): Locator {
    return this.row(key).getByTestId('keyboard-shortcut-off');
  }

  /**
   * Press `?` until the dialog is up. The first press can land before the shell attached its
   * listener, so retry, but never press while the dialog is already open.
   */
  async openWithKey(): Promise<void> {
    await expect(async () => {
      if (!(await this.dialog.isVisible())) {
        await this.page.keyboard.press('?');
      }
      await expect(this.dialog).toBeVisible({ timeout: 1000 });
    }).toPass();
  }

  /** Open from the avatar menu (desktop only). */
  async openFromUserMenu(): Promise<void> {
    await this.page.getByTestId('user-menu-trigger').click();
    await this.page.getByTestId('user-menu-shortcuts').click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.dialog).toHaveCount(0);
  }
}
