/**
 * Page Object Model for the Spot viewer — /photos/spot/:areaKey/:orientationKey?photo=<id>
 * (Story #2162, rebuilt by #2226).
 *
 * The root `photo-spot-viewer` wraps every state; the dark stage styling only applies
 * once the viewer itself is shown. Loading/error/not-found states render EmptyState /
 * FormError on the themed page.
 *
 * #2226: the title is a VISIBLE h1 ("‹area path› · ‹orientation›", "No area" for the no-area
 * group), the details (date, area, orientation, caption, diary link, "Same spot over time" list,
 * Edit tags) live in `PhotoDetailsPanel` — a side column from 768px, a bottom Sheet behind the
 * "Details" button below it (the panel is only in the DOM while that sheet is open, so call
 * `openDetails()` first on phones). On phones the app shell bars are not rendered while the
 * viewer shows, and a tap on the photo toggles the viewer chrome (top row, arrows, toolbar).
 */

import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';

export class PhotoSpotViewerPage {
  readonly page: Page;
  readonly root: Locator;
  readonly backLink: Locator;
  /** The top row (Back, title, position); faded out with the other chrome on phones. */
  readonly topBar: Locator;
  /** The visible h1: "‹area path› · ‹orientation›", or "No area" for the group. */
  readonly title: Locator;
  readonly prevButton: Locator;
  readonly nextButton: Locator;
  readonly position: Locator;
  readonly image: Locator;

  // Toolbar under the photo
  readonly toolbar: Locator;
  readonly annotateButton: Locator;
  /** The visible reason text under a disabled Annotate (signed entry, missing dimensions). */
  readonly annotateReason: Locator;
  readonly viewOriginalButton: Locator;
  /** Phones only (< 768px): opens the details sheet. */
  readonly detailsButton: Locator;
  readonly detailsSheet: Locator;

  // Details panel
  readonly detailsPanel: Locator;
  readonly date: Locator;
  readonly area: Locator;
  readonly orientation: Locator;
  readonly caption: Locator;
  readonly diaryLink: Locator;
  readonly editTagsButton: Locator;
  readonly detailsForm: Locator;
  readonly captionField: Locator;
  readonly saveTagsButton: Locator;
  readonly cancelTagsButton: Locator;
  readonly tagsSavedNote: Locator;
  readonly historyItems: Locator;
  readonly currentHistoryItem: Locator;
  /** The "Same spot over time" / "Photos with no area" heading above the history list. */
  readonly historyHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('photo-spot-viewer');
    this.backLink = page.getByTestId('spot-viewer-back');
    this.title = page.getByTestId('spot-viewer-title');
    this.topBar = this.title.locator('xpath=..');
    this.prevButton = page.getByTestId('spot-viewer-prev');
    this.nextButton = page.getByTestId('spot-viewer-next');
    this.position = page.getByTestId('spot-viewer-position');
    this.image = page.getByTestId('spot-viewer-image');

    this.toolbar = page.getByTestId('spot-viewer-toolbar');
    this.annotateButton = page.getByTestId('spot-viewer-annotate');
    this.annotateReason = this.toolbar.locator('p');
    this.viewOriginalButton = page.getByTestId('spot-viewer-view-original');
    this.detailsButton = page.getByTestId('spot-viewer-details');
    this.detailsSheet = page.getByTestId('spot-viewer-details-sheet');

    this.detailsPanel = page.getByTestId('spot-viewer-details-panel');
    this.date = page.getByTestId('spot-viewer-details-panel-date');
    this.area = page.getByTestId('spot-viewer-details-panel-area');
    this.orientation = page.getByTestId('spot-viewer-details-panel-orientation');
    this.caption = page.getByTestId('spot-viewer-details-panel-caption-value');
    this.diaryLink = page.getByTestId('spot-viewer-diary-link');
    this.editTagsButton = page.getByTestId('spot-viewer-details-panel-edit-tags');
    this.detailsForm = page.getByTestId('spot-viewer-details-panel-form');
    this.captionField = page.getByTestId('spot-viewer-details-panel-caption');
    this.saveTagsButton = page.getByTestId('spot-viewer-details-panel-save-tags');
    this.cancelTagsButton = page.getByTestId('spot-viewer-details-panel-cancel');
    this.tagsSavedNote = page.getByTestId('spot-viewer-details-panel-saved');
    this.historyItems = page.locator('[data-testid^="spot-history-item-"]');
    this.currentHistoryItem = page.locator(
      '[data-testid^="spot-history-item-"][aria-current="true"]',
    );
    this.historyHeading = this.detailsPanel.getByRole('heading', { level: 2 }).last();
  }

  async goto(areaKey: string, orientationKey: string, photoId?: string): Promise<void> {
    await this.page.goto(
      routeUrl('photoSpot', { areaKey, orientationKey }, { photo: photoId || undefined }),
    );
  }

  /** The labelled picker field (label + picker) of the open editor. */
  formField(label: 'Area' | 'Orientation'): Locator {
    return this.detailsForm.locator('label', { hasText: new RegExp(`^${label}$`) }).locator('..');
  }

  /** Phones (< 768px) get the Details sheet, wider screens the side column. */
  isPhone(): boolean {
    return (this.page.viewportSize()?.width ?? 1280) < 768;
  }

  /**
   * Phones (< 768px): open the Details sheet unless it is open. Desktop/tablet: the panel is a
   * side column, so this only waits for it.
   */
  async openDetails(): Promise<void> {
    await expect(this.position).toBeVisible();
    if (this.isPhone() && !(await this.detailsPanel.isVisible())) {
      await this.detailsButton.click();
    }
    await expect(this.detailsPanel).toBeVisible();
  }

  /** Phones: close the Details sheet with Escape so the stage behind it is reachable. */
  async closeDetailsIfPhone(): Promise<void> {
    if (this.isPhone() && (await this.detailsPanel.isVisible())) {
      await this.page.keyboard.press('Escape');
      await expect(this.detailsPanel).toHaveCount(0);
    }
  }

  /** Open the details panel and enter the tag editor unless it is open. */
  async openTagsEditor(): Promise<void> {
    await this.openDetails();
    if (!(await this.detailsForm.isVisible())) await this.editTagsButton.click();
    await expect(this.detailsForm).toBeVisible();
  }

  /**
   * Pick an option in a picker field of the open editor. A picker holding a value shows a chip
   * with "Clear selection" instead of an input, so clear it first when the input is missing.
   */
  async pickInEditor(label: 'Area' | 'Orientation', optionText: string | RegExp): Promise<void> {
    const field = this.formField(label);
    const input = field.locator('input');
    if ((await input.count()) === 0) {
      await field.getByRole('button', { name: 'Clear selection' }).click();
    }
    await input.click();
    const option = this.page
      .locator('[data-search-picker-dropdown]')
      .getByRole('option', { name: optionText })
      .first();
    await option.click();
  }

  historyItem(photoId: string): Locator {
    return this.page.getByTestId(`spot-history-item-${photoId}`);
  }
}
