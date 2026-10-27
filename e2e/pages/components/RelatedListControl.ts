/**
 * Component POM for the shared RelatedList (#2236 / #2239), parameterised by the host's test id
 * prefix (`invoice-progress-payments`, `invoice-refunds`).
 *
 * Test ids: the section `<testId>` (h2 "Title (n)"), a row `<testId>-row-<id>`, its link
 * `<testId>-link-<id>`, the pencil `<testId>-edit-<id>`, the ⋯ trigger `<testId>-actions-<id>`,
 * its Remove item `<testId>-remove-<id>`, the header Add button `<testId>-add` (absent while the
 * list is empty: the empty state then carries the same action as a button named like it) and
 * `<testId>-show-all`. Remove acts at once and shows an Undo toast (no dialog).
 */

import type { Locator, Page } from '@playwright/test';

export class RelatedListControl {
  readonly page: Page;
  readonly testId: string;
  readonly root: Locator;
  readonly heading: Locator;
  /** The header Add button (absent while the list is empty). */
  readonly addButton: Locator;
  readonly showAll: Locator;

  constructor(page: Page, testId: string) {
    this.page = page;
    this.testId = testId;
    this.root = page.getByTestId(testId);
    this.heading = this.root.getByRole('heading', { level: 2 });
    this.addButton = page.getByTestId(`${testId}-add`);
    this.showAll = page.getByTestId(`${testId}-show-all`);
  }

  /** Every row. */
  get rows(): Locator {
    return this.root.locator(`[data-testid^="${this.testId}-row-"]`);
  }

  row(id: string): Locator {
    return this.page.getByTestId(`${this.testId}-row-${id}`);
  }

  /** The row whose text contains `text`. */
  rowWith(text: string | RegExp): Locator {
    return this.rows.filter({ hasText: text });
  }

  link(id: string): Locator {
    return this.page.getByTestId(`${this.testId}-link-${id}`);
  }

  editButton(id: string): Locator {
    return this.page.getByTestId(`${this.testId}-edit-${id}`);
  }

  actionsTrigger(id: string): Locator {
    return this.page.getByTestId(`${this.testId}-actions-${id}`);
  }

  removeItem(id: string): Locator {
    return this.page.getByTestId(`${this.testId}-remove-${id}`);
  }

  /** Open the row's ⋯ menu and choose Remove (acts at once; an Undo toast follows). */
  async remove(id: string): Promise<void> {
    await this.actionsTrigger(id).click();
    await this.removeItem(id).click();
  }

  /** The Add action by its label: the header button, or the empty state's button. */
  addAction(label: string): Locator {
    return this.root.getByRole('button', { name: label, exact: true });
  }

  /** The empty-state message. */
  emptyMessage(text: string | RegExp): Locator {
    return this.root.getByText(text);
  }
}
