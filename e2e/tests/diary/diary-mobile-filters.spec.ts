/**
 * E2E: the Site diary Filters surface (#2225, EPIC-21 P2.6; replaces the mobile filter-bar tests).
 *
 * One Filters button opens one content component in two containers: a bottom Sheet below 768px
 * (phone) and an anchored panel from 768px (tablet 810px and desktop). Filters apply live and show
 * as removable chips under the toolbar.
 *
 * Scenarios:
 *  F1  the right container per viewport; aria-expanded; Done / Escape close it and focus returns
 *  F2  type chips narrow the rows; the chip and the count pill appear; removing the chip restores
 *  F3  the Area picker keeps the surface open and narrows to the photo-tagged entry
 *  F4  the Company picker matches the daily logs and the delivery (name in another case)
 *  F5  Clear all clears every filter and the search, and focuses the Filters button
 *  F6  a reload keeps the filters (they live in the URL)
 *  F7  dates: From after To shows the error and sends no request with the invalid range
 *
 * Every test seeds its own tagged data (`seedDiaryFeed`) and isolates it with `?q=<uniq>`.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { DiaryPage } from '../../pages/DiaryPage.js';
import { seedDiaryFeed } from '../../fixtures/diaryFeedSeed.js';

/** The breakpoint of the Filters container (`useMediaQuery('(min-width: 768px)')`). */
const WIDE_MIN_WIDTH = 768;

function isWide(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1920) >= WIDE_MIN_WIDTH;
}

test.describe('Diary Filters surface (#2225)', { tag: '@responsive' }, () => {
  test('F1: the surface is a sheet on phones and a panel from 768px; Done / Escape close it', async ({
    page,
  }) => {
    const diary = new DiaryPage(page);
    await diary.goto();
    await diary.waitForLoaded();

    await expect(diary.filtersButton).toHaveAttribute('aria-expanded', 'false');
    await diary.filtersButton.click();
    await expect(diary.filtersButton).toHaveAttribute('aria-expanded', 'true');

    if (isWide(page)) {
      await expect(diary.filtersPanel).toBeVisible();
      await expect(diary.filtersSheet).toHaveCount(0);
      // The panel is anchored under the button inside the viewport
      const box = await diary.filtersPanel.boundingBox();
      const viewport = page.viewportSize();
      expect(box).not.toBeNull();
      if (box && viewport) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      }
      await page.keyboard.press('Escape');
    } else {
      await expect(diary.filtersSheet).toBeVisible();
      await expect(diary.filtersPanel).toHaveCount(0);
      await expect(diary.sheetDoneButton).toBeVisible();
      await diary.sheetDoneButton.click();
    }
    await expect(diary.filtersSurface).toBeHidden();
    await expect(diary.filtersButton).toHaveAttribute('aria-expanded', 'false');
    await expect(diary.filtersButton).toBeFocused();
  });

  test('F1b: a filter change keeps the surface open (filters apply live)', async ({
    page,
    testPrefix,
  }) => {
    const diary = new DiaryPage(page);
    const seed = await seedDiaryFeed(page, testPrefix, { photoCount: 0 });
    try {
      await page.goto(`/diary?q=${encodeURIComponent(seed.uniq)}`);
      await diary.heading.waitFor({ state: 'visible' });
      await diary.waitForLoaded();

      await diary.openFilters();
      await diary.typeFilterChip('daily_log').click();
      await expect(page).toHaveURL(/[?&]types=daily_log/);
      await expect(diary.entryCards()).toHaveCount(2);
      // The URL write (live apply) must not dismiss the surface: a second filter can follow
      await expect(diary.filtersSurface).toBeVisible();
      await diary.typeFilterChip('delivery').click();
      await expect(diary.entryCards()).toHaveCount(3);
      await expect(diary.filtersSurface).toBeVisible();
      await expect(diary.filtersButton).toHaveAttribute('aria-expanded', 'true');
    } finally {
      await seed.cleanup();
    }
  });

  test('F2: a type chip narrows the rows, shows an active chip and the count pill', async ({
    page,
    testPrefix,
  }) => {
    const diary = new DiaryPage(page);
    const seed = await seedDiaryFeed(page, testPrefix, { photoCount: 1 });
    try {
      await page.goto(`/diary?q=${encodeURIComponent(seed.uniq)}`);
      await diary.heading.waitFor({ state: 'visible' });
      await diary.waitForLoaded();
      await expect(diary.entryCards()).toHaveCount(4);

      await diary.openFilters();
      await diary.typeFilterChip('daily_log').click();
      await expect(diary.entryCards()).toHaveCount(2);
      await expect(diary.entryCard(seed.dailyLogId)).toBeVisible();
      await expect(diary.entryCard(seed.deliveryId)).toHaveCount(0);
      await expect(page).toHaveURL(/[?&]types=daily_log/);
      await diary.closeFilters();

      await expect(diary.activeChipRemove('type-daily_log')).toBeVisible();
      await expect(diary.filtersButton).toContainText('1');

      await diary.activeChipRemove('type-daily_log').click();
      await expect(diary.entryCards()).toHaveCount(4);
      await expect(diary.activeChipRemove('type-daily_log')).toHaveCount(0);
    } finally {
      await seed.cleanup();
    }
  });

  test('F3: the Area picker keeps the surface open and narrows to the tagged entry', async ({
    page,
    testPrefix,
  }) => {
    const diary = new DiaryPage(page);
    const seed = await seedDiaryFeed(page, testPrefix, { photoCount: 2 });
    try {
      await page.goto(`/diary?q=${encodeURIComponent(seed.uniq)}`);
      await diary.heading.waitFor({ state: 'visible' });
      await diary.waitForLoaded();

      await diary.pickArea(seed.areaName);
      // Picking in the portaled dropdown is not an outside press: the surface stays open
      await expect(diary.filtersSurface).toBeVisible();
      await expect(diary.entryCards()).toHaveCount(1);
      await expect(diary.entryCard(seed.photoNoteId)).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`[?&]areaId=${seed.areaId}`));

      await diary.closeFilters();
      await expect(diary.activeChipRemove('area')).toBeVisible();
      await expect(diary.activeFilters).toContainText(seed.areaName);
    } finally {
      await seed.cleanup();
    }
  });

  test('F4: the Company picker matches the daily logs and the delivery', async ({
    page,
    testPrefix,
  }) => {
    const diary = new DiaryPage(page);
    const seed = await seedDiaryFeed(page, testPrefix, { photoCount: 1 });
    try {
      await page.goto(`/diary?q=${encodeURIComponent(seed.uniq)}`);
      await diary.heading.waitFor({ state: 'visible' });
      await diary.waitForLoaded();

      await diary.pickCompany(seed.companyName);
      // Two daily logs by company id, the delivery by its free-text name in UPPER case
      await expect(diary.entryCards()).toHaveCount(3);
      for (const id of [seed.dailyLogId, seed.singleWorkerLogId, seed.deliveryId]) {
        await expect(diary.entryCard(id)).toBeVisible();
      }
      await expect(diary.entryCard(seed.photoNoteId)).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`[?&]companyId=${seed.companyId}`));

      await diary.closeFilters();
      await expect(diary.activeChipRemove('company')).toBeVisible();
      await diary.activeChipRemove('company').click();
      await expect(diary.entryCards()).toHaveCount(4);
    } finally {
      await seed.cleanup();
    }
  });

  test('F5/F6: Clear all clears filters and search and focuses Filters; a reload keeps filters', async ({
    page,
    testPrefix,
  }) => {
    const diary = new DiaryPage(page);
    const seed = await seedDiaryFeed(page, testPrefix, { photoCount: 1 });
    try {
      await page.goto(`/diary?q=${encodeURIComponent(seed.uniq)}`);
      await diary.heading.waitFor({ state: 'visible' });
      await diary.waitForLoaded();

      await diary.openFilters();
      await diary.typeFilterChip('delivery').click();
      await expect(diary.entryCards()).toHaveCount(1);
      await diary.closeFilters();

      // F6: the filter survives a reload
      await page.goto(page.url());
      await diary.heading.waitFor({ state: 'visible' });
      await expect(diary.activeChipRemove('type-delivery')).toBeVisible();
      await expect(diary.entryCards()).toHaveCount(1);
      await expect(diary.entryCard(seed.deliveryId)).toBeVisible();
      await expect(diary.searchInput).toHaveValue(seed.uniq);

      // F5: Clear all resets the filter AND the search
      await diary.clearFiltersButton.click();
      await expect(page).not.toHaveURL(/[?&](types|q)=/);
      await expect(diary.searchInput).toHaveValue('');
      await expect(diary.activeFilters).toHaveCount(0);
      await expect(diary.filtersButton).toBeFocused();
    } finally {
      await seed.cleanup();
    }
  });

  test('F7: From after To shows the range error and sends no request with that range', async ({
    page,
    testPrefix,
  }) => {
    const diary = new DiaryPage(page);
    const seed = await seedDiaryFeed(page, testPrefix, { photoCount: 0 });
    const invalidRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (
        url.pathname === '/api/diary-entries' &&
        url.searchParams.get('dateFrom') === '2026-03-10'
      ) {
        invalidRequests.push(request.url());
      }
    });
    try {
      await page.goto(`/diary?q=${encodeURIComponent(seed.uniq)}`);
      await diary.heading.waitFor({ state: 'visible' });
      await diary.waitForLoaded();

      await diary.openFilters();
      await diary.dateToInput.fill('2026-03-01');
      await expect(page).toHaveURL(/[?&]dateTo=2026-03-01/);

      // From after To: the error shows, the URL keeps the last valid range
      await diary.dateFromInput.fill('2026-03-10');
      await expect(diary.dateFromInput).toHaveAttribute('aria-invalid', 'true');
      await expect(diary.dateRangeError).toContainText(
        'The start date must be before the end date.',
      );
      await expect(page).not.toHaveURL(/dateFrom=/);
      expect(invalidRequests).toEqual([]);

      // A valid From clears the error and writes both
      await diary.dateFromInput.fill('2026-02-01');
      await expect(diary.dateRangeError).toHaveCount(0);
      await expect(page).toHaveURL(/dateFrom=2026-02-01/);
      expect(invalidRequests).toEqual([]);
      await diary.closeFilters();
      await expect(diary.activeChipRemove('from')).toBeVisible();
      await expect(diary.activeChipRemove('to')).toBeVisible();
    } finally {
      await seed.cleanup();
    }
  });
});
