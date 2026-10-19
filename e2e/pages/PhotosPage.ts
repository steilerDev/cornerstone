/**
 * Page Object Model for the Photos (Spots) page — /photos (Story #2162).
 *
 * Desktop/tablet (>= 768px) render a <table> (SpotsTable); mobile (< 768px) renders
 * area chips + per-area card grids (SpotsGrid). Cells/cards are keyed by
 * `<areaId|none>:<orientationId|none>` — `spot-cell-<key>` (table) / `spot-card-<key>` (grid).
 * Only one of the two layouts is in the DOM at a time, so `spotLink()` matches either.
 *
 * #2226: area row headers / h2 / root bands are links to the Areas index (`areaLink`); the 'No
 * area' group is a normal last group — band "No area", a plain "‹n› photos" row header, and a
 * quiet "Select photos" button that swaps the row/section for a grid of select tiles, a sticky
 * selection bar (Select all · Clear · Set tags) and the bulk "Set tags" dialog.
 */

import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';

export const PHOTOS_ROUTE = routeUrl('photos');

export class PhotosPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly table: Locator;
  readonly emptyState: Locator;
  readonly errorBanner: Locator;
  readonly retryButton: Locator;

  // 'No area' group + select mode (#2226)
  readonly noAreaToggle: Locator;
  readonly selectionBar: Locator;
  readonly selectAllButton: Locator;
  readonly clearButton: Locator;
  readonly setTagsButton: Locator;
  readonly selectGroup: Locator;
  readonly bulkDialog: Locator;
  readonly bulkSaveButton: Locator;
  readonly bulkCancelButton: Locator;
  readonly bulkError: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: /^(Photos|Fotos)$/ });
    this.table = page.getByRole('table');
    this.emptyState = page.getByText('No diary photos yet');
    this.errorBanner = page.getByRole('alert');
    this.retryButton = page.getByRole('button', { name: 'Try again' });

    this.noAreaToggle = page.getByTestId('no-area-select-toggle');
    this.selectionBar = page.getByTestId('no-area-selection-bar');
    this.selectAllButton = page.getByTestId('no-area-select-all');
    this.clearButton = page.getByTestId('no-area-clear');
    this.setTagsButton = page.getByTestId('no-area-set-tags');
    this.selectGroup = page.getByRole('group', { name: 'Photos with no area' });
    this.bulkDialog = page.getByRole('dialog', { name: /^Set tags for \d+ photos?$/ });
    this.bulkSaveButton = page.getByTestId('photo-bulk-tags-save');
    this.bulkCancelButton = page.getByTestId('photo-bulk-tags-cancel');
    this.bulkError = this.bulkDialog.getByRole('alert');
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
    // An area heading is a link whose accessible name is "Name, open in Areas" (#2226)
    return this.page.getByRole('heading', {
      level: 2,
      name: new RegExp(`^${areaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(, open in Areas)?$`),
    });
  }

  /** Link from an area's row header / h2 / root band to the Areas index (by area id). */
  areaLink(areaId: string): Locator {
    return this.page.getByTestId(`area-link-${areaId}`);
  }

  /** The 'No area' band (table) or h2 (mobile) text. */
  noAreaHeading(): Locator {
    return this.page.locator('th[scope="rowgroup"]:has-text("No area"), h2:has-text("No area")');
  }

  /** Every select tile (selectable label + locked div) of the 'No area' grid. */
  selectTiles(): Locator {
    return this.page.locator('[data-testid^="no-area-photo-"]');
  }

  /** One select tile by photo id. */
  selectTile(photoId: string): Locator {
    return this.page.getByTestId(`no-area-photo-${photoId}`);
  }

  /** The checkbox of a (not locked) select tile; it is visually hidden, click the tile itself. */
  selectCheckbox(photoId: string): Locator {
    return this.selectTile(photoId).getByRole('checkbox');
  }

  /** Enter select mode and wait for the tiles to load. */
  async startSelecting(): Promise<void> {
    await this.noAreaToggle.click();
    await expect(this.selectGroup).toBeVisible();
    await expect(this.noAreaToggle).toHaveText('Done');
  }

  /** Select the given photos by clicking their tiles. */
  async selectPhotos(photoIds: string[]): Promise<void> {
    for (const id of photoIds) {
      await this.selectTile(id).click();
      await expect(this.selectCheckbox(id)).toBeChecked();
    }
  }

  /** The labelled picker field (label + picker) of the bulk dialog. */
  bulkField(label: 'Area' | 'Orientation'): Locator {
    return this.bulkDialog.locator('label', { hasText: new RegExp(`^${label}$`) }).locator('..');
  }

  /**
   * Choose a value in a bulk-dialog picker. Both pickers start on the "Leave as is" chip, so the
   * chip's "Clear selection" is pressed first to bring the input back.
   */
  async bulkPick(label: 'Area' | 'Orientation', optionText: string | RegExp): Promise<void> {
    const field = this.bulkField(label);
    const input = field.locator('input');
    if ((await input.count()) === 0) {
      await field.getByRole('button', { name: 'Clear selection' }).click();
    }
    await input.click();
    await this.page
      .locator('[data-search-picker-dropdown]')
      .getByRole('option', { name: optionText })
      .first()
      .click();
  }
}
