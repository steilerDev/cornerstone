/**
 * Page Object Model for the "No access" page rendered in place when a member opens an
 * admin-only route (/settings/users, /settings/backups) — Story #2200.
 */

import type { Page, Locator } from '@playwright/test';

export class NoAccessPage {
  readonly page: Page;
  readonly root: Locator;
  readonly heading: Locator;
  readonly backLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('no-access-page');
    this.heading = page.getByRole('heading', { level: 1, name: 'No access', exact: true });
    this.backLink = this.root.getByRole('link', { name: 'Back to Home' });
  }
}
