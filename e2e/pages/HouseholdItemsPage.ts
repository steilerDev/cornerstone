/**
 * Page Object Model for the Household Items page (/household-items)
 *
 * The Household Items page is currently a stub that renders:
 *   - An h1 "Household Items"
 *   - A <p> describing the planned purchase tracking functionality
 *
 * When household item management is implemented, expand this POM with
 * locators for the item list, purchase order forms, delivery date inputs, etc.
 */

import type { Page, Locator } from '@playwright/test';

export const HOUSEHOLD_ITEMS_ROUTE = '/household-items';

export class HouseholdItemsPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly description: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', { level: 1, name: 'Household Items', exact: true });
    this.description = page.locator('[class*="description"]').first();
  }

  async goto(): Promise<void> {
    await this.page.goto(HOUSEHOLD_ITEMS_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }
}
