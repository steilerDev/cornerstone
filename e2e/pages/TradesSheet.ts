/**
 * Page Object Model for the Trades sheet of the Companies page (`/companies?trades=1`, #2213).
 *
 * A `Modal` from 768px and a bottom `Sheet` below (panel test id `trades-manager-sheet`); both
 * carry role="dialog" named "Trades", so one role locator covers both. It is mounted only while
 * the `trades` query parameter is `1`.
 *
 * Content: the "New trade" field with an Add button, an A-Z list (name plus "N companies" /
 * "No companies") whose rows have a ⋯ menu (Rename, Merge duplicates…, Delete), and a Done button.
 * Rename replaces the row content in place. Merge and Delete are the shared ConfirmDialog
 * (prefixes `trades-manager-merge-dialog` and `trades-manager-delete-dialog`); a blocked Delete
 * offers a "Merge instead" button.
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';

const PREFIX = 'trades-manager';

export class TradesSheet {
  readonly page: Page;
  /** The dialog (Modal or bottom Sheet), named "Trades" (or the localized title). */
  readonly dialog: Locator;
  readonly heading: Locator;
  readonly newInput: Locator;
  readonly addButton: Locator;
  readonly doneButton: Locator;
  readonly list: Locator;
  /** Persistent sr-only status line (added / renamed announcements). */
  readonly status: Locator;
  readonly renameInput: Locator;
  readonly renameSave: Locator;
  readonly renameCancel: Locator;
  readonly mergeDialog: ConfirmDialogControl;
  readonly deleteDialog: ConfirmDialogControl;
  readonly mergeInsteadButton: Locator;
  readonly mergePicker: Locator;
  readonly mergeStatus: Locator;

  constructor(page: Page, title = 'Trades') {
    this.page = page;
    this.dialog = page.getByRole('dialog', { name: title, exact: true });
    this.heading = this.dialog.getByRole('heading', { level: 2, name: title, exact: true });
    this.newInput = this.dialog.getByTestId(`${PREFIX}-new-input`);
    this.addButton = this.dialog.getByTestId(`${PREFIX}-add`);
    this.doneButton = this.dialog.getByTestId(`${PREFIX}-done`);
    this.list = this.dialog.getByRole('list', { name: title, exact: true });
    this.status = this.dialog.locator('[role="status"]').first();
    this.renameInput = this.dialog.getByTestId(`${PREFIX}-rename-input`);
    this.renameSave = this.dialog.getByTestId(`${PREFIX}-rename-save`);
    this.renameCancel = this.dialog.getByTestId(`${PREFIX}-rename-cancel`);
    this.mergeDialog = new ConfirmDialogControl(page, `${PREFIX}-merge-dialog`);
    this.deleteDialog = new ConfirmDialogControl(page, `${PREFIX}-delete-dialog`);
    this.mergeInsteadButton = page.getByTestId(`${PREFIX}-merge-instead`);
    this.mergePicker = this.mergeDialog.dialog.locator('input[type="text"]');
    this.mergeStatus = this.mergeDialog.dialog.getByRole('status');
  }

  async waitForOpen(): Promise<void> {
    await this.dialog.waitFor({ state: 'visible' });
    await this.heading.waitFor({ state: 'visible' });
  }

  async waitForClosed(): Promise<void> {
    await this.dialog.waitFor({ state: 'hidden' });
  }

  /**
   * Bounding box of the visible panel: the Sheet itself below 768px; from 768px the Modal's
   * content panel (the second child of the dialog wrapper, which spans the viewport).
   */
  async panelBox(): Promise<{ x: number; y: number; width: number; height: number }> {
    const narrow = (this.page.viewportSize()?.width ?? 0) < 768;
    const target = narrow ? this.dialog : this.dialog.locator(':scope > *').nth(1);
    const box = await target.boundingBox();
    if (!box) throw new Error('trades panel has no bounding box');
    return box;
  }

  /** The list row whose display name is exactly `name` (the name span, not the count line). */
  row(name: string): Locator {
    return this.list
      .getByRole('listitem')
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  /** The "N companies" / "No companies" line of a row. */
  rowMeta(name: string): Locator {
    return this.row(name).locator('span').nth(1);
  }

  /** The ⋯ trigger of a row ("Actions for <name>"). */
  rowActions(name: string): Locator {
    return this.row(name).getByRole('button', { name: `Actions for ${name}`, exact: true });
  }

  /** Open a row's ⋯ menu and choose an item (menu is portaled to the body). */
  async chooseAction(name: string, item: 'Rename' | 'Merge duplicates…' | 'Delete'): Promise<void> {
    await this.rowActions(name).click();
    await this.page.getByRole('menuitem', { name: item, exact: true }).click();
  }

  /** Type a name into the New trade field and press Add. */
  async addTrade(name: string): Promise<void> {
    await this.newInput.fill(name);
    await this.addButton.click();
  }

  /** Rename through the row menu; resolves when the row is back in read mode. */
  async renameTrade(from: string, to: string): Promise<void> {
    await this.chooseAction(from, 'Rename');
    await expect(this.renameInput).toBeFocused();
    await this.renameInput.fill(to);
    await this.renameSave.click();
    await expect(this.renameInput).toHaveCount(0);
  }

  /** Pick the trade to keep in the open Merge dialog. */
  async chooseMergeTarget(label: string): Promise<void> {
    await this.mergePicker.fill(label);
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }
}
