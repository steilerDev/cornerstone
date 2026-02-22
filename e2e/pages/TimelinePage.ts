/**
 * Page Object Model for the Timeline page (/timeline)
 *
 * The Timeline is currently a stub page that renders:
 *   - An h1 "Timeline"
 *   - A <p> describing the planned Gantt chart functionality
 *
 * When the Gantt chart is implemented, expand this POM with chart-specific
 * locators (task rows, zoom controls, dependency arrows, drag handles, etc.).
 */

import type { Page, Locator } from '@playwright/test';

export const TIMELINE_ROUTE = '/timeline';

export class TimelinePage {
  readonly page: Page;

  readonly heading: Locator;
  readonly description: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', { level: 1, name: 'Timeline', exact: true });
    this.description = page.locator('[class*="description"]').first();
  }

  async goto(): Promise<void> {
    await this.page.goto(TIMELINE_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }
}
