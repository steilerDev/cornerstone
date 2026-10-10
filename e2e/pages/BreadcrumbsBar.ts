/**
 * Page Object Model for the shared Breadcrumbs row (client/src/components/Breadcrumbs).
 *
 * Markup (Story #2202):
 * - Row: data-testid="breadcrumbs" (absent when there is nothing to show)
 * - Back link: data-testid="breadcrumbs-back", text "Back to {origin}" (anchor, outside the nav)
 * - Trail: <nav aria-label="You are here"> (located inside the row, so German runs work) with parents only (never the current page)
 *
 * Views (list pages, Schedule, Calendar) render neither Back nor a trail.
 *
 * The leading "‹" glyphs are aria-hidden spans but still part of textContent, so text
 * assertions here tolerate an optional leading "‹".
 */

import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class BreadcrumbsBar {
  readonly page: Page;
  readonly row: Locator;
  readonly nav: Locator;
  readonly backLink: Locator;
  readonly trailLinks: Locator;

  constructor(page: Page) {
    this.page = page;
    this.row = page.getByTestId('breadcrumbs');
    // Locale independent: the nav's accessible name is translated ("You are here" / German)
    this.nav = this.row.getByRole('navigation');
    this.backLink = page.getByTestId('breadcrumbs-back');
    this.trailLinks = this.nav.getByRole('link');
  }

  /** A trail link by its accessible name (the leading glyph is aria-hidden). */
  trailLink(name: string): Locator {
    return this.nav.getByRole('link', { name, exact: true });
  }

  /**
   * Assert the trail holds exactly these links, in order.
   *
   * On a phone (< 768px) the row shows ONE link: Back when there is an origin, otherwise only
   * the nearest parent (the last name), rendered "‹ parent". The other trail links are not
   * rendered/visible, so the expectation shrinks to the last name there.
   */
  async expectTrail(names: string[]): Promise<void> {
    const width = this.page.viewportSize()?.width ?? Number.MAX_SAFE_INTEGER;
    const expected = width < 768 ? names.slice(-1) : names;
    await expect(this.trailLinks).toHaveText(
      expected.map((name) => new RegExp(`^‹?${escapeRegExp(name)}$`)),
    );
  }

  /** Assert there is no trail at all (list/view pages). */
  async expectNoTrail(): Promise<void> {
    await expect(this.nav).toHaveCount(0);
  }

  /** Assert the Back link reads "Back to {origin}". */
  async expectBack(origin: string): Promise<void> {
    await expect(this.backLink).toBeVisible();
    await expect(this.backLink).toHaveText(new RegExp(`^‹?Back to ${escapeRegExp(origin)}$`));
  }

  async expectNoBack(): Promise<void> {
    await expect(this.backLink).toHaveCount(0);
  }
}
