/**
 * Page Object Model for the shared Breadcrumbs row (client/src/components/Breadcrumbs).
 *
 * Markup (Story #2202, compact row #2207):
 * - Row: data-testid="breadcrumbs" (absent when there is nothing to show). It sits in the top
 *   bar at every width (portaled into `top-bar-slot`)
 * - Back link: data-testid="breadcrumbs-back", text "Back to {origin}" (anchor, outside the nav)
 * - Trail: <nav aria-label="You are here"> (located inside the row, so German runs work) with parents only (never the current page)
 * - Below 1024px the row is compact: ONE link inside the nav, visible text "‹{target}", accessible
 *   name "Back to {target}"; testid `breadcrumbs-back` for an origin, `breadcrumbs-parent` for the
 *   nearest parent (no origin)
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

  /** True below 1024px, where the row is the single compact link. */
  private isCompact(): boolean {
    return (this.page.viewportSize()?.width ?? Number.MAX_SAFE_INTEGER) < 1024;
  }

  /**
   * A trail link by its accessible name (the leading glyph is aria-hidden). Below 1024px the
   * single compact link is named "Back to {name}" ("Zurück zu {name}" in German).
   */
  trailLink(name: string): Locator {
    if (this.isCompact()) {
      return this.nav.getByRole('link', {
        name: new RegExp(`^(Back to|Zurück zu) ${escapeRegExp(name)}$`),
      });
    }
    return this.nav.getByRole('link', { name, exact: true });
  }

  /**
   * Assert the trail holds exactly these links, in order.
   *
   * Below 1024px (phones and tablets) the row shows ONE link: Back when there is an origin,
   * otherwise only the nearest parent (the last name), rendered "‹parent". The other trail
   * links are not rendered, so the expectation shrinks to the last name there.
   */
  async expectTrail(names: string[]): Promise<void> {
    if (this.isCompact()) {
      // One link only. With an origin it is the Back link (named after the origin, not a parent)
      await expect(this.trailLinks).toHaveCount(1);
      if ((await this.backLink.count()) === 0) {
        await expect(this.trailLinks).toHaveText(
          new RegExp(`^‹?${escapeRegExp(names[names.length - 1] ?? '')}$`),
        );
      }
      return;
    }
    await expect(this.trailLinks).toHaveText(
      names.map((name) => new RegExp(`^‹?${escapeRegExp(name)}$`)),
    );
  }

  /** Assert there is no trail at all (list/view pages). */
  async expectNoTrail(): Promise<void> {
    await expect(this.nav).toHaveCount(0);
  }

  /**
   * Assert the Back link reads "Back to {origin}". Below 1024px the visible text is
   * "‹{origin}", so the accessible name carries the "Back to" part.
   */
  async expectBack(origin: string): Promise<void> {
    await expect(this.backLink).toBeVisible();
    if (this.isCompact()) {
      await expect(this.backLink).toHaveAccessibleName(`Back to ${origin}`);
      await expect(this.backLink).toHaveText(new RegExp(`^‹?${escapeRegExp(origin)}$`));
      return;
    }
    await expect(this.backLink).toHaveText(new RegExp(`^‹?Back to ${escapeRegExp(origin)}$`));
  }

  async expectNoBack(): Promise<void> {
    await expect(this.backLink).toHaveCount(0);
  }
}
