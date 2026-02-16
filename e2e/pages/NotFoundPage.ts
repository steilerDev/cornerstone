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
    this.heading = page.getByRole('heading', { level: 1, name: '404 - Page Not Found' });
    this.description = page.getByText(
      'The page you are looking for does not exist or has been moved.',
    );
    this.dashboardLink = page.getByRole('link', { name: 'Go back to Dashboard' });
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
