/**
 * Page Object Model for the Project Overview page (/project/overview)
 *
 * The Project Overview is currently a stub page that renders:
 *   - An h1 "Overview"
 *   - A <p> describing the planned overview functionality
 *
 * When the page gains real content (activity feed, budget summary, etc.)
 * expand this POM with the new locators and helper methods.
 */

import type { Page, Locator } from '@playwright/test';

export const DASHBOARD_ROUTE = '/project/overview';

export class DashboardPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly description: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', {
      level: 1,
      name: 'Project',
      exact: true,
    });
    // The description is a <p> with the CSS-module class "description".
    // Matching via [class*="description"] is robust against the production
    // content-hash localIdentName while remaining unique on this page.
    this.description = page.locator('[class*="description"]').first();
  }

  async goto(): Promise<void> {
    await this.page.goto(DASHBOARD_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }
}
