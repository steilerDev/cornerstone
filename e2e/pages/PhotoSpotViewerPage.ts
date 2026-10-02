/**
 * Page Object Model for the Spot viewer — /photos/spot/:areaKey/:orientationKey?photo=<id>
 * (Story #2162).
 *
 * The root `photo-spot-viewer` wraps every state; the dark stage styling only applies
 * once the viewer itself is shown. Loading/error/not-found states render EmptyState /
 * FormError on the themed page.
 */

import type { Page, Locator } from '@playwright/test';

export class PhotoSpotViewerPage {
  readonly page: Page;
  readonly root: Locator;
  readonly backLink: Locator;
  readonly prevButton: Locator;
  readonly nextButton: Locator;
  readonly position: Locator;
  readonly image: Locator;
  readonly date: Locator;
  readonly area: Locator;
  readonly orientation: Locator;
  readonly caption: Locator;
  readonly diaryLink: Locator;
  readonly historyItems: Locator;
  readonly currentHistoryItem: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('photo-spot-viewer');
    this.backLink = page.getByTestId('spot-viewer-back');
    this.prevButton = page.getByTestId('spot-viewer-prev');
    this.nextButton = page.getByTestId('spot-viewer-next');
    this.position = page.getByTestId('spot-viewer-position');
    this.image = page.getByTestId('spot-viewer-image');
    this.date = page.getByTestId('spot-viewer-date');
    this.area = page.getByTestId('spot-viewer-area');
    this.orientation = page.getByTestId('spot-viewer-orientation');
    this.caption = page.getByTestId('spot-viewer-caption');
    this.diaryLink = page.getByTestId('spot-viewer-diary-link');
    this.historyItems = page.locator('[data-testid^="spot-history-item-"]');
    this.currentHistoryItem = page.locator(
      '[data-testid^="spot-history-item-"][aria-current="true"]',
    );
  }

  async goto(areaKey: string, orientationKey: string, photoId?: string): Promise<void> {
    const q = photoId ? `?photo=${encodeURIComponent(photoId)}` : '';
    await this.page.goto(`/photos/spot/${areaKey}/${orientationKey}${q}`);
  }

  historyItem(photoId: string): Locator {
    return this.page.getByTestId(`spot-history-item-${photoId}`);
  }
}
