/**
 * Page Object Model for the Photos (Spots) page — /photos (Story #2162).
 *
 * Desktop/tablet (>= 768px) render a <table> (SpotsTable); mobile (< 768px) renders
 * area chips + per-area card grids (SpotsGrid). Cells/cards are keyed by
 * `<areaId|none>:<orientationId|none>` — `spot-cell-<key>` (table) / `spot-card-<key>` (grid).
 * Only one of the two layouts is in the DOM at a time, so `spotLink()` matches either.
 */

import type { Page, Locator } from '@playwright/test';

export const PHOTOS_ROUTE = '/photos';

export class PhotosPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly table: Locator;
  readonly emptyState: Locator;
  readonly errorBanner: Locator;
  readonly retryButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: /^(Photos|Fotos)$/ });
    this.table = page.getByRole('table');
    this.emptyState = page.getByText('No diary photos yet');
    this.errorBanner = page.getByRole('alert');
    this.retryButton = page.getByRole('button', { name: 'Try again' });
  }

  async goto(): Promise<void> {
    await this.page.goto(PHOTOS_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }

  columnHeader(name: string): Locator {
    return this.page.locator('thead th[scope="col"]').filter({ hasText: name });
  }

  /** The <tbody> group whose rowgroup header carries the given (root) area name. */
  group(areaName: string): Locator {
    return this.page.locator('tbody').filter({
      has: this.page.locator('th[scope="rowgroup"]', { hasText: areaName }),
    });
  }

  /** Row-header cell of the row for an area name (or "No area"). */
  rowHeader(areaName: string): Locator {
    return this.page.locator('th[scope="row"]', { hasText: areaName });
  }

  /** The <tr> for an area name. */
  row(areaName: string): Locator {
    return this.page.locator('tr').filter({ has: this.rowHeader(areaName) });
  }

  /** Table cell content (link or empty placeholder) by spot key. */
  cellByKey(areaKey: string, orientationKey: string): Locator {
    return this.page.getByTestId(`spot-cell-${areaKey}:${orientationKey}`);
  }

  /** Mobile card (link or empty placeholder) by spot key. */
  cardByKey(areaKey: string, orientationKey: string): Locator {
    return this.page.getByTestId(`spot-card-${areaKey}:${orientationKey}`);
  }

  /** Table cell or mobile card, whichever layout is active. */
  spotLink(areaKey: string, orientationKey: string): Locator {
    const key = `${areaKey}:${orientationKey}`;
    return this.page.locator(`[data-testid="spot-cell-${key}"], [data-testid="spot-card-${key}"]`);
  }

  /** Mobile area-group chip; `value` is the root area id or `all`. */
  chipByValue(value: string): Locator {
    return this.page.getByTestId(`spot-group-chip-${value}`);
  }

  /** Mobile area heading (h2) for a row. */
  areaHeading(areaName: string): Locator {
    return this.page.getByRole('heading', { level: 2, name: areaName, exact: true });
  }
}
