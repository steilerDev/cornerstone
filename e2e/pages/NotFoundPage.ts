/**
 * Page Object Model for the 404 Not Found page
 */

import type { Page, Locator } from '@playwright/test';

export class NotFoundPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly description: Locator;
  readonly dashboardLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'Page not found' });
    this.description = page.getByText(
      'The page you are looking for does not exist or has been moved.',
    );
    // Scoped to the page area: the sidebar logo link carries the same accessible name (#2205)
    this.dashboardLink = page.getByRole('main').getByRole('link', { name: 'Go to Home' });
  }

  async getHeading(): Promise<string | null> {
    return await this.heading.textContent();
  }

  async getDescription(): Promise<string | null> {
    return await this.description.textContent();
  }

  async clickDashboardLink(): Promise<void> {
    await this.dashboardLink.click();
  }
}
