/**
 * Page Object Model for the Project Overview / Dashboard page (/project/overview)
 *
 * The Dashboard page displays a grid of cards showing budget, timeline,
 * invoice, and subsidy information with card hide/show customization.
 */

import type { Page, Locator } from '@playwright/test';

export const DASHBOARD_ROUTE = '/project/overview';

export class DashboardPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly cardGrid: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', {
      level: 1,
      name: 'Project',
      exact: true,
    });
    this.cardGrid = page.locator('[class*="grid"]').first();
  }

  async goto(): Promise<void> {
    await this.page.goto(DASHBOARD_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }
}
