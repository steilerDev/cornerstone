/**
 * Component POM for the cost line grid itself (#2235): the table of editable rows used by the
 * grid dialog (`cost-line-grid`) and by both Split with AI pages (`auto-itemize-grid`).
 *
 * The grid (`<prefix>`) is a plain table, one blank row always at the end. Inputs are named
 * "<Column>, row <n>" (1-based), so cells are found by column and row number. Rows carry
 * `data-testid="<prefix>-row-<rowId>"` (the id is opaque - use `row(n)`). On phones each row is a
 * stacked card of the same inputs (CSS only, one DOM).
 *
 * Extra columns of the Split with AI grid: Include (checkbox), Select (checkbox, merge), Cost
 * category, Funding source (selects), Belongs to (search picker) and the per-row
 * "Use an existing cost line…" button that links a line instead of creating one. A merged or
 * merging row is a single notice row (`<prefix>-notice-<action>-<rowId>`: retry, undo).
 *
 * Keyboard: Enter / Shift+Enter move down/up a column, Ctrl/⌘+D duplicates the row, Ctrl/⌘+
 * Backspace removes an empty row (Undo toast), Ctrl/⌘+S and Ctrl/⌘+Enter save, Tab from the last
 * control adds a row. A tabular paste goes through the description input's `paste` event.
 */

import type { Locator, Page } from '@playwright/test';
import { SearchPickerControl } from './SearchPickerControl.js';

export type GridColumnName =
  | 'Description'
  | 'Quantity'
  | 'Unit'
  | 'Unit price'
  | 'Cost category'
  | 'Funding source'
  | 'Belongs to'
  | 'Include'
  | 'Select';

export class CostLineGrid {
  readonly page: Page;
  readonly prefix: string;
  readonly grid: Locator;
  readonly table: Locator;
  readonly assignAllInput: Locator;
  readonly assignAll: SearchPickerControl;
  /** The "Net | Gross" chip group "Entered as for all". */
  readonly enteredAllNet: Locator;
  readonly enteredAllGross: Locator;
  readonly total: Locator;
  readonly remainder: Locator;
  readonly pasteDialog: Locator;
  readonly pasteInsert: Locator;
  readonly pasteStatus: Locator;
  /** The "Use an existing cost line" picker dialog. */
  readonly existingDialog: Locator;

  constructor(page: Page, prefix = 'cost-line-grid') {
    this.page = page;
    this.prefix = prefix;
    this.grid = page.getByTestId(prefix);
    this.table = page.getByTestId(`${prefix}-table`);
    this.assignAllInput = page.getByTestId(`${prefix}-assign-all`).locator('input');
    this.assignAll = new SearchPickerControl(page, this.assignAllInput);
    this.enteredAllNet = page.getByTestId(`${prefix}-entered-all-net`);
    this.enteredAllGross = page.getByTestId(`${prefix}-entered-all-gross`);
    this.total = page.getByTestId(`${prefix}-total`);
    this.remainder = page.getByTestId(`${prefix}-remainder`);
    this.pasteDialog = page.getByRole('dialog', { name: 'Check pasted rows' });
    this.pasteInsert = page.getByTestId('paste-preview-insert');
    this.pasteStatus = page.getByTestId('paste-preview-status');
    this.existingDialog = page.getByRole('dialog', { name: 'Use an existing cost line' });
  }

  /** All rows of the grid including the trailing blank row. */
  rows(): Locator {
    return this.grid.locator(`[data-testid^="${this.prefix}-row-"]`);
  }

  /** Row `n` (1-based). */
  row(n: number): Locator {
    return this.rows().nth(n - 1);
  }

  /** The input / select of a column in row `n` (1-based), found by its accessible name. */
  cell(column: GridColumnName, n: number): Locator {
    return this.grid.getByLabel(`${column}, row ${n}`, { exact: true });
  }

  /** The description input of row `n`. */
  description(n: number): Locator {
    return this.cell('Description', n);
  }

  /** The Net/Gross toggle button of row `n` ("Entered as, row 1: Net"). */
  enteredAs(n: number): Locator {
    return this.grid.getByRole('button', { name: new RegExp(`^Entered as, row ${n}: `) });
  }

  /** The Gross amount cell of row `n`. */
  gross(n: number): Locator {
    return this.row(n).locator('[data-col="gross"]');
  }

  /** The Include checkbox of row `n` (Split with AI grid). */
  include(n: number): Locator {
    return this.cell('Include', n);
  }

  /** The merge-selection checkbox of row `n` (Split with AI grid). */
  select(n: number): Locator {
    return this.cell('Select', n);
  }

  /** The "Belongs to" picker input of row `n`. */
  target(n: number): Locator {
    return this.cell('Belongs to', n);
  }

  /** The row's own "Belongs to" picker control. */
  targetPicker(n: number): SearchPickerControl {
    return new SearchPickerControl(this.page, this.target(n));
  }

  /** "Use an existing cost line…" button of row `n`. */
  useExistingButton(n: number): Locator {
    return this.grid.getByRole('button', {
      name: `Use an existing cost line…, Row ${n}`,
      exact: true,
    });
  }

  /**
   * Link an existing cost line to row `n`: its "Belongs to" must already be set (own pick or
   * Assign all to). Opens "Use an existing cost line", chooses the line whose text contains
   * `description` and waits for the dialog to close.
   */
  async useExisting(n: number, description: string | RegExp): Promise<void> {
    await this.useExistingButton(n).click();
    await this.existingDialog.waitFor({ state: 'visible' });
    await this.existingDialog
      .getByRole('listitem')
      .filter({ hasText: description })
      .getByRole('button', { name: 'Use', exact: true })
      .click();
    await this.existingDialog.waitFor({ state: 'hidden' });
  }

  /** "Use a new line instead" of a row that links an existing line. */
  clearExistingButton(n: number): Locator {
    return this.row(n).getByRole('button', { name: 'Use a new line instead' });
  }

  /** The "Links <description>" label of a row that links an existing line. */
  existingLabel(n: number): Locator {
    return this.row(n).locator('[class*="existingLabel"]');
  }

  duplicateButton(n: number): Locator {
    return this.grid.getByRole('button', { name: `Duplicate row ${n}`, exact: true });
  }

  removeButton(n: number): Locator {
    return this.grid.getByRole('button', { name: `Remove row ${n}`, exact: true });
  }

  /** The inline error text of a cell ("Error: Enter a description."). */
  errors(): Locator {
    return this.grid.locator('[class*="cellError"]');
  }

  /** Rows with content = all rows but the trailing blank one. */
  async filledRowCount(): Promise<number> {
    return Math.max(0, (await this.rows().count()) - 1);
  }

  /**
   * Paste tab-separated text into the description input of row `n` the way a spreadsheet paste
   * arrives: a `paste` event carrying `text/plain` in a DataTransfer (counts as keyboard input).
   */
  async paste(text: string, n = 1): Promise<void> {
    const target = this.description(n);
    await target.focus();
    await target.evaluate((element, payload) => {
      const data = new DataTransfer();
      data.setData('text/plain', payload);
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, text);
  }
}
