/**
 * Page Object Model for the Documents page (/documents)
 *
 * The Documents page is currently a stub that renders:
 *   - An h1 "Documents"
 *   - A <p> describing the planned Paperless-ngx document integration
 *
 * When document management is implemented, expand this POM with locators for
 * the document list, search, tags, and Paperless-ngx iframe/link integration.
 */

import type { Page, Locator } from '@playwright/test';

export const DOCUMENTS_ROUTE = '/documents';

export class DocumentsPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly description: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', { level: 1, name: 'Documents', exact: true });
    this.description = page.locator('[class*="description"]').first();
  }

  async goto(): Promise<void> {
    await this.page.goto(DOCUMENTS_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }
}
