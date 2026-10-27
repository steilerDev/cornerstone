/**
 * Component POM for the shared ObjectTabs (detail template, #2233 / #2239).
 *
 * `idPrefix` is the host's prefix (`invoice-tabs`): the root is `<idPrefix>`, tabs are
 * `<idPrefix>-tab-<id>` (`role="tab"`, label "Cost (3)" for the counted tabs) and panels are
 * `<idPrefix>-panel-<id>` (rendered lazily, once the tab was visited; inactive panels stay mounted
 * but hidden). Tab ids are the `?tab=` values: cost, payments, history ...
 */

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

export class ObjectTabsControl {
  readonly page: Page;
  readonly idPrefix: string;
  readonly root: Locator;
  readonly tablist: Locator;

  constructor(page: Page, idPrefix: string) {
    this.page = page;
    this.idPrefix = idPrefix;
    this.root = page.getByTestId(idPrefix);
    this.tablist = this.root.getByRole('tablist');
  }

  tab(id: string): Locator {
    return this.page.getByTestId(`${this.idPrefix}-tab-${id}`);
  }

  panel(id: string): Locator {
    return this.page.getByTestId(`${this.idPrefix}-panel-${id}`);
  }

  /** The selected tab (aria-selected). */
  get selected(): Locator {
    return this.tablist.locator('[role="tab"][aria-selected="true"]');
  }

  async select(id: string): Promise<void> {
    await this.tab(id).click();
    await expect(this.tab(id)).toHaveAttribute('aria-selected', 'true');
  }
}
