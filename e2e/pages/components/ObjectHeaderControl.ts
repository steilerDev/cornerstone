/**
 * Component POM for the shared ObjectHeader (detail template, #2233 / #2239).
 *
 * Test ids: the root is `<testId>` (default `object-header`; the invoice page passes
 * `invoice-header`), the description line `<testId>-description`, the ⋯ trigger
 * `object-header-menu`, and the menu items `object-header-copy-link`, `object-header-print`,
 * `object-header-delete` plus the host's extra items (the invoice page's `invoice-menu-edit`).
 * The h1 is the page title. The status chip, the one primary and at most one secondary are
 * located by the test id the host gave them.
 *
 * The ⋯ menu is portalled to the body (role `menuitem`); open it before locating an item.
 */

import type { Locator, Page } from '@playwright/test';

export class ObjectHeaderControl {
  readonly page: Page;
  readonly testId: string;
  readonly root: Locator;
  readonly heading: Locator;
  readonly description: Locator;
  readonly menuTrigger: Locator;

  constructor(page: Page, testId = 'object-header') {
    this.page = page;
    this.testId = testId;
    this.root = page.getByTestId(testId);
    this.heading = this.root.getByRole('heading', { level: 1 });
    this.description = page.getByTestId(`${testId}-description`);
    this.menuTrigger = this.root.getByTestId('object-header-menu');
  }

  /** The link inside the description line (the invoice page's company link). */
  descriptionLink(testId?: string): Locator {
    return testId ? this.description.getByTestId(testId) : this.description.getByRole('link');
  }

  /** A control of the header by the test id the host gave it (primary, secondary, chip). */
  control(testId: string): Locator {
    return this.root.getByTestId(testId);
  }

  /** The ⋯ menu items, in DOM order. */
  get menuItems(): Locator {
    return this.page.getByRole('menuitem');
  }

  /** Open the ⋯ menu and wait for its items. */
  async openMenu(): Promise<void> {
    await this.menuTrigger.click();
    await this.menuItems.first().waitFor({ state: 'visible' });
  }

  /** A menu item by its test id (the menu must be open). */
  menuItem(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  /** Open the menu and click one item by test id. */
  async chooseMenuItem(testId: string): Promise<void> {
    await this.openMenu();
    await this.menuItem(testId).click();
  }

  /** The visible labels of the open menu's items (separators are not items). */
  async menuLabels(): Promise<string[]> {
    return (await this.menuItems.allInnerTexts()).map((text) => text.trim());
  }
}
