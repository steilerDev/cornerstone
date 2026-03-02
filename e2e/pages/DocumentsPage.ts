/**
 * Page Object Model for the Documents page (/documents)
 *
 * After EPIC-08, the Documents page is a full implementation containing a
 * DocumentBrowser component. It renders one of several states based on whether
 * Paperless-ngx is configured and reachable:
 *
 *   1. "Checking..." — initial load state (aria-busy="true")
 *   2. "Not Configured" — PAPERLESS_URL / PAPERLESS_API_TOKEN not set
 *   3. "Unreachable" — configured but Paperless-ngx is down
 *   4. Full browser — search input, tag filter strip, document grid
 *
 * In the E2E test environment, Paperless-ngx is NOT configured (no env vars
 * in the testcontainer), so tests exercise states 1 and 2.
 */

import type { Page, Locator } from '@playwright/test';

export const DOCUMENTS_ROUTE = '/documents';

export class DocumentsPage {
  readonly page: Page;

  // Page structure
  readonly heading: Locator;

  // DocumentBrowser states
  /** The "not configured" info state container */
  readonly notConfiguredState: Locator;
  /** The "not configured" h2 heading inside the browser */
  readonly notConfiguredTitle: Locator;
  /** The info text paragraphs inside the browser (not-configured or checking) */
  readonly infoText: Locator;

  /** The "unreachable" error state container */
  readonly unreachableState: Locator;

  /** Search input (only present when Paperless is reachable) */
  readonly searchInput: Locator;

  /** The document grid (role="list") */
  readonly documentGrid: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', { level: 1, name: 'Documents', exact: true });

    // "Not configured" state — the h2 heading "Paperless-ngx Not Configured"
    this.notConfiguredTitle = page.getByRole('heading', {
      level: 2,
      name: 'Paperless-ngx Not Configured',
      exact: true,
    });

    // Container for not-configured info state (the .infoState div in DocumentBrowser)
    this.notConfiguredState = page.locator('[class*="infoState"]');

    // Info text paragraphs inside the browser states
    this.infoText = page.locator('[class*="infoText"]');

    // Unreachable error state
    this.unreachableState = page.locator('[class*="errorState"]');

    // Search input (only when fully configured and reachable)
    this.searchInput = page.getByRole('searchbox', { name: 'Search documents' });

    // Document grid
    this.documentGrid = page.getByRole('list', { name: 'Documents' });
  }

  async goto(): Promise<void> {
    await this.page.goto(DOCUMENTS_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }
}
