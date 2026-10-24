/**
 * Component POM for the cost line grid dialog (#2235): the grid (see `CostLineGrid`) inside a
 * `Modal` from 768px (named "Add lines" or "Split <offer label>") or a full-screen `Sheet`
 * (`cost-line-grid-sheet`) below.
 *
 * Footer: status line ("12 lines, 2 rows need attention" with the attention button), Cancel
 * (`cost-line-grid-cancel`) and the one primary Save (`cost-line-grid-save`). A discard
 * `alertdialog` (prefix `cost-line-grid-discard`) guards a dirty close. With Paperless on and a
 * linked document, the document shows beside the grid from 1024px (`cost-line-grid-preview`) or
 * behind "Show document" (`cost-line-grid-show-document`) below.
 */

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialogControl } from './ConfirmDialogControl.js';
import { CostLineGrid } from './CostLineGrid.js';

export type { GridColumnName } from './CostLineGrid.js';

export class CostLineGridDialog extends CostLineGrid {
  readonly dialog: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly statusBar: Locator;
  readonly liveStatus: Locator;
  readonly preview: Locator;
  readonly showDocumentButton: Locator;
  readonly discard: ConfirmDialogControl;

  constructor(page: Page, title: string | RegExp = 'Add lines') {
    super(page, 'cost-line-grid');
    this.dialog = page.getByRole('dialog', { name: title });
    this.saveButton = page.getByTestId('cost-line-grid-save');
    this.cancelButton = page.getByTestId('cost-line-grid-cancel');
    this.statusBar = this.dialog.locator('[class*="status"]').first();
    this.liveStatus = page.getByTestId('cost-line-grid-status');
    this.preview = page.getByTestId('cost-line-grid-preview');
    this.showDocumentButton = page.getByTestId('cost-line-grid-show-document');
    this.discard = new ConfirmDialogControl(page, 'cost-line-grid-discard');
  }

  async waitForOpen(): Promise<void> {
    await expect(this.dialog).toBeVisible();
    await expect(this.grid).toBeVisible();
  }

  async save(): Promise<void> {
    await this.saveButton.click();
  }
}
