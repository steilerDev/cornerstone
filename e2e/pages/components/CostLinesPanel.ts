/**
 * Component POM for the cost lines of one record (#2235): `CostLinesSection` + `CostLineTable`.
 *
 * It sits on the task page, the purchase page and the offer/invoice page (test ids `cost-lines-*`).
 * The table and the card list are BOTH mounted and the list's own width switches them, so every
 * row locator filters to the visible copy (`rows()` is never the DOM total). Row test ids carry
 * the record id (`cost-lines-row-<id>`, cards `cost-lines-row-mobile-<id>`), so rows are found by
 * their text.
 *
 * - header: h2 "Cost lines" inside `cost-lines-section`, the secondary buttons "Add cost line"
 *   (`cost-lines-add`) and "Add lines (grid)" (`cost-lines-add-grid`);
 * - a row: State chip (`cost-lines-state-<id>`), description + muted facts, "qty unit × price",
 *   gross (`cost-lines-gross-<id>`; item pages add the ⓘ net tip button), ⋯ "Actions for <name>";
 * - groups (item pages): "Estimates" and one heading per offer/invoice; totals `cost-lines-total`;
 * - document pages: "Not yet split · €x" (`cost-lines-not-yet-split`) with Split (`cost-lines-split`)
 *   or "Lines are €x over" (`cost-lines-over`);
 * - the ⋯ menu is portalled to the body (role `menuitem`): Edit, Duplicate, Delete, Link to offer or
 *   invoice, Unlink, Remove from offer or invoice (by page), Assign.
 */

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ConfirmDialogControl } from './ConfirmDialogControl.js';

export type CostLineAction =
  | 'Edit'
  | 'Duplicate'
  | 'Delete'
  | 'Link to offer or invoice'
  | 'Unlink'
  | 'Remove from offer'
  | 'Remove from invoice'
  | 'Assign';

export class CostLinesPanel {
  readonly page: Page;
  readonly prefix: string;
  /** The `<section>` around the heading, buttons and table. */
  readonly section: Locator;
  readonly heading: Locator;
  readonly root: Locator;
  readonly addButton: Locator;
  readonly addGridButton: Locator;
  /** The always-mounted `role="status"` ("Saved.", "12 lines saved.", ...). */
  readonly status: Locator;
  readonly emptyTitle: Locator;
  readonly deleteDialog: ConfirmDialogControl;
  readonly unlinkDialog: ConfirmDialogControl;
  readonly removeDialog: ConfirmDialogControl;

  constructor(page: Page, prefix = 'cost-lines') {
    this.page = page;
    this.prefix = prefix;
    this.section = page.getByTestId(`${prefix}-section`);
    this.heading = this.section.getByRole('heading', { name: 'Cost lines', exact: true });
    this.root = page.getByTestId(prefix);
    this.addButton = page.getByTestId(`${prefix}-add`);
    this.addGridButton = page.getByTestId(`${prefix}-add-grid`);
    this.status = page.getByTestId(`${prefix}-status`);
    this.emptyTitle = this.section.getByText('There are no cost lines yet', { exact: true });
    this.deleteDialog = new ConfirmDialogControl(page, 'cost-line-delete');
    this.unlinkDialog = new ConfirmDialogControl(page, 'cost-line-unlink');
    this.removeDialog = new ConfirmDialogControl(page, 'cost-line-remove');
  }

  /** The section is rendered and past its loading skeleton (a table or the empty state). */
  async waitForLoaded(): Promise<void> {
    await expect(this.section).toBeVisible();
    await expect(this.root.or(this.emptyTitle)).toBeVisible();
  }

  /** All visible rows (the table rows or the cards, whichever surface the width shows). */
  rows(): Locator {
    return this.root.locator(`[data-testid^="${this.prefix}-row-"]`).filter({ visible: true });
  }

  /** The visible row whose text contains `text` (description, group-independent). */
  row(text: string | RegExp): Locator {
    return this.rows().filter({ hasText: text });
  }

  /** The State chip of a row ("Estimate", "Offered", "Invoiced", "Paid", "Submitted"). */
  stateChip(row: Locator): Locator {
    return row.locator(`[data-testid^="${this.prefix}-state-"]`);
  }

  /** The gross amount of a row. */
  gross(row: Locator): Locator {
    return row.locator(`[data-testid^="${this.prefix}-gross-"]`);
  }

  /** The ⓘ button that shows the net amount and VAT (task and purchase pages). */
  netTipButton(row: Locator): Locator {
    return row.getByRole('button', { name: /^Show the net amount and VAT for / });
  }

  /** The open tooltip (role `tooltip`). */
  get tooltip(): Locator {
    return this.page.getByRole('tooltip');
  }

  /** The ⋯ trigger of a row. */
  menuTrigger(row: Locator): Locator {
    return row.getByRole('button', { name: /^Actions for / });
  }

  menuItem(label: CostLineAction): Locator {
    return this.page.getByRole('menuitem', { name: label, exact: true });
  }

  /** Open a row's ⋯ menu and choose an action. */
  async chooseAction(row: Locator, label: CostLineAction): Promise<void> {
    await this.menuTrigger(row).click();
    await this.menuItem(label).click();
  }

  /**
   * A table-level element by id: the table copy is `<prefix>-<id>`, the card copy
   * `<prefix>-mobile-<id>` (DataTable's test id rule); only the visible one is returned.
   */
  private surfaced(id: string): Locator {
    return this.root
      .locator(`[data-testid="${this.prefix}-${id}"], [data-testid="${this.prefix}-mobile-${id}"]`)
      .filter({ visible: true });
  }

  /** The visible total ("Total" row of the table / card list). */
  total(): Locator {
    return this.surfaced('total');
  }

  /** Document pages: the "Not yet split · €x" notice. */
  notYetSplit(): Locator {
    return this.surfaced('not-yet-split');
  }

  /** Document pages: the "Lines are €x over" notice. */
  over(): Locator {
    return this.surfaced('over');
  }

  /** The Split button of the Not yet split notice. */
  splitButton(): Locator {
    return this.surfaced('split');
  }

  /** The Split action of the empty state (an offer or invoice without any line). */
  emptySplitButton(): Locator {
    return this.section.getByRole('button', { name: 'Split', exact: true });
  }

  /** Whether the card list (not the table) is the visible surface: the list's own width decides. */
  async showsCards(): Promise<boolean> {
    return (
      (await this.root
        .locator(`[data-testid^="${this.prefix}-row-mobile-"]`)
        .filter({ visible: true })
        .count()) > 0
    );
  }

  /** A group heading of an item page ("Estimates", "Offer <number>", "Invoice <number>"). */
  groupHeading(text: string | RegExp): Locator {
    return this.root
      .locator('th[scope="rowgroup"], h3')
      .filter({ hasText: text })
      .filter({ visible: true });
  }
}
