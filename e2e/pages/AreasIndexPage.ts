/**
 * Page Object Model for the Areas index (`/areas`, #2218, EPIC-21).
 *
 * The page is a nested-list tree (`TreeTable`): a header row (>= 768px), one `<li>` per area
 * with its row and, when it has sub-areas, a nested `<ul>` (hidden while collapsed), plus a
 * "quiet" row first among the children of an area that has items booked on itself.
 *
 * Test ids (all `areas-tree-*` come from TreeTable, prefix `areas-tree`):
 *  - `areas-tree-row-<id>`, `-toggle-<id>`, `-handle-<id>` (>= 768px only), `-menu-<id>` (the
 *    OverflowMenu), `-cell-<tasks|purchases|photos>-<id>`, `-quiet-<parentId>` (its cells use the
 *    id `quiet:<parentId>`), `-header`; menu items `-edit-`, `-add-sub-`, `-move-up-`,
 *    `-move-down-`, `-delete-<id>`.
 *  - page: `areas-page`, `areas-new`, `areas-filter`, `areas-filter-clear`, `areas-status`
 *    (polite status region), `areas-no-match`, `areas-clear-filter`, `areas-retry`,
 *    `areas-reorder-error`.
 *  - delete dialog: ConfirmDialog prefix `areas-delete-dialog`; `areas-delete-show-tasks`,
 *    `areas-delete-show-purchases` links in the blocked state.
 *  - form: ObjectForm `testId="areas-form"`; fields `#name`, `#parentId` (AreaPicker), colour
 *    `areas-color` / `areas-no-color`, `#description`.
 *
 * Counts: a cell reads "3 of 7 open", "None" or "12 photos" (+ "Latest 3 Oct" on the second
 * line); below 768px the cell carries a short visible label ("Tasks 3 of 7 open").
 * Rows are located by id (their names are not unique across the shared database), or by name
 * through `rowByName` (scope with a `testPrefix` name).
 */

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';
import { ObjectFormDialog } from './components/ObjectFormDialog.js';
import { SearchPickerControl } from './components/SearchPickerControl.js';
import { ToastRegion } from './components/ToastRegion.js';

export const AREAS_URL = routeUrl('areas');

const PREFIX = 'areas-tree';

export type AreaCountColumn = 'tasks' | 'purchases' | 'photos';
export type AreaMenuItem = 'edit' | 'add-sub' | 'move-up' | 'move-down' | 'delete';

export class AreasIndexPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly description: Locator;
  readonly newButton: Locator;
  readonly filter: Locator;
  readonly filterClear: Locator;
  readonly status: Locator;
  readonly header: Locator;
  readonly tree: Locator;
  readonly noMatch: Locator;
  readonly clearFilterButton: Locator;
  readonly retryButton: Locator;
  readonly reorderError: Locator;
  readonly emptyState: Locator;
  readonly deleteDialog: ConfirmDialogControl;
  readonly showTasksLink: Locator;
  readonly showPurchasesLink: Locator;
  readonly toasts: ToastRegion;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'Areas', exact: true });
    this.description = page.getByTestId('areas-page').locator('p').first();
    this.newButton = page.getByTestId('areas-new');
    this.filter = page.getByTestId('areas-filter');
    this.filterClear = page.getByTestId('areas-filter-clear');
    this.status = page.getByTestId('areas-status');
    this.header = page.getByTestId(`${PREFIX}-header`);
    this.tree = page.getByRole('list', { name: 'Areas', exact: true }).first();
    this.noMatch = page.getByTestId('areas-no-match');
    this.clearFilterButton = page.getByTestId('areas-clear-filter');
    this.retryButton = page.getByTestId('areas-retry');
    this.reorderError = page.getByTestId('areas-reorder-error');
    this.emptyState = page.getByText(
      'No areas yet. Add your building first, then its floors and rooms.',
    );
    this.deleteDialog = new ConfirmDialogControl(page, 'areas-delete-dialog');
    this.showTasksLink = page.getByTestId('areas-delete-show-tasks');
    this.showPurchasesLink = page.getByTestId('areas-delete-show-purchases');
    this.toasts = new ToastRegion(page);
  }

  /** Open the page and wait until the tree (or the empty state) replaces the skeleton. */
  async goto(): Promise<void> {
    await this.page.goto(AREAS_URL);
    await this.waitForLoaded();
  }

  async waitForLoaded(): Promise<void> {
    await this.heading.waitFor({ state: 'visible' });
    await expect(this.newButton).not.toHaveAttribute('aria-disabled', 'true');
  }

  // ---- rows -------------------------------------------------------------------------------

  row(id: string): Locator {
    return this.page.getByTestId(`${PREFIX}-row-${id}`);
  }

  /** The row whose name is exactly `name` (names carry the `testPrefix`, so they are unique). */
  rowByName(name: string): Locator {
    return this.page.locator(`[data-testid^="${PREFIX}-row-"]`).filter({
      has: this.page.locator('[title]').filter({ hasText: new RegExp(`^${escape(name)}$`) }),
    });
  }

  /** The `<li>` that holds the row and, below it, its nested sub-area list. */
  item(id: string): Locator {
    return this.row(id).locator('xpath=..');
  }

  /** The nested `<ul>` of an area (present only when it has sub-areas; `hidden` while collapsed). */
  group(id: string): Locator {
    return this.item(id).locator(':scope > ul');
  }

  toggle(id: string): Locator {
    return this.page.getByTestId(`${PREFIX}-toggle-${id}`);
  }

  handle(id: string): Locator {
    return this.page.getByTestId(`${PREFIX}-handle-${id}`);
  }

  /** The ⋯ trigger of a row. */
  menuTrigger(id: string): Locator {
    return this.page.getByTestId(`${PREFIX}-menu-${id}`);
  }

  menuItem(item: AreaMenuItem, id: string): Locator {
    return this.page.getByTestId(`${PREFIX}-${item}-${id}`);
  }

  /** Open a row's ⋯ menu and click one item (the menu is portalled to the body). */
  async chooseMenuItem(id: string, item: AreaMenuItem): Promise<void> {
    await this.menuTrigger(id).click();
    await this.menuItem(item, id).click();
  }

  /** The quiet "whole …" row of an area that has items booked on itself AND sub-areas. */
  quietRow(areaId: string): Locator {
    return this.page.getByTestId(`${PREFIX}-quiet-${areaId}`);
  }

  /** One count cell of an area row, or of its quiet row (`quiet: true`). */
  cell(column: AreaCountColumn, id: string, quiet = false): Locator {
    return this.page.getByTestId(`${PREFIX}-cell-${column}-${quiet ? `quiet:${id}` : id}`);
  }

  /** The area names in DOM order (rows only, never quiet rows). */
  async visibleNames(): Promise<string[]> {
    return this.page
      .locator(`[data-testid^="${PREFIX}-row-"]:visible [title]`)
      .evaluateAll((els) => els.map((el) => el.getAttribute('title') ?? ''));
  }

  /** Ids of the direct children rows of an area (or the top level), in DOM order. */
  async childIds(parentId: string | null): Promise<string[]> {
    const rows =
      parentId === null
        ? this.tree.locator(':scope > li > [data-testid^="areas-tree-row-"]')
        : this.group(parentId).locator(':scope > li > [data-testid^="areas-tree-row-"]');
    return rows.evaluateAll((els) =>
      els.map((el) => (el.getAttribute('data-testid') ?? '').replace('areas-tree-row-', '')),
    );
  }

  // ---- reorder ----------------------------------------------------------------------------

  /** Keyboard reorder: Space picks the handle up, arrows move it, Space drops. */
  async reorderByKeyboard(id: string, direction: 'up' | 'down', steps = 1): Promise<void> {
    const handle = this.handle(id);
    await handle.focus();
    await this.page.keyboard.press('Space');
    await expect(handle).toHaveAttribute('aria-pressed', 'true');
    for (let i = 0; i < steps; i++) {
      await this.page.keyboard.press(direction === 'down' ? 'ArrowDown' : 'ArrowUp');
    }
    await this.page.keyboard.press('Space');
  }

  // ---- form -------------------------------------------------------------------------------

  form(title: 'New area' | 'Edit area'): ObjectFormDialog {
    return new ObjectFormDialog(this.page, title, 'areas-form');
  }

  /** The "Part of" picker (AreaPicker) inside the form dialog. */
  partOfPicker(form: ObjectFormDialog): SearchPickerControl {
    return new SearchPickerControl(this.page, 'parentId', form.dialog);
  }

  // ---- misc -------------------------------------------------------------------------------

  /** True when the document scrolls sideways. */
  async hasHorizontalOverflow(): Promise<boolean> {
    return this.page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
  }
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
