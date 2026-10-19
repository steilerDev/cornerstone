/**
 * E2E: the Site diary list as a feed of photo-first rows (#2225, EPIC-21 P2.6).
 *
 * Scenarios:
 *  L1  header: title, count line, one primary "Log today", History link, no Photos card
 *  L2  week groups ("This week" / "Last week") in order, each row in its group
 *  L3  photo-first row: 5 thumbnails + "+2", title link opens the entry and Back keeps the filter,
 *      company + worker plural, area chip with the full path
 *  L4  Unfinished row: drafts leave the feed, Show all lists drafts, Continue, Discard
 *  L7  states (mocked): nothing at all -> "Log today"; filtered empty -> "Clear filters"
 *  L8  infinite scroll appends into the same week group (mocked)
 *  DE  German: Filters button and "Diese Woche" heading
 *
 * The shared E2E database holds every other test's entries. Each test seeds data under its own
 * unique tag (`uniq`) and isolates its rows with `?q=<uniq>`; no global count is asserted.
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryPage } from '../../pages/DiaryPage.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';
import { ToastRegion } from '../../pages/components/ToastRegion.js';
import { openAsLocaleUser } from '../../fixtures/localeUser.js';
import { seedDiaryFeed, mondayOf, uniqueTag } from '../../fixtures/diaryFeedSeed.js';
import { stubUnfinishedEmpty } from '../../fixtures/diaryMocks.js';
import { todayIso } from '../../fixtures/captureSeed.js';
import { createDraftDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';

test.describe('Site diary feed (#2225)', { tag: '@responsive' }, () => {
  test('L1: header shows the title, the count, one Log today and the History link', async ({
    page,
    testPrefix,
  }) => {
    const diary = new DiaryPage(page);
    const seed = await seedDiaryFeed(page, testPrefix, { photoCount: 0 });
    try {
      await diary.goto();
      await diary.waitForLoaded();

      await expect(diary.heading).toHaveText('Site diary');
      await expect(diary.subtitle).toContainText(/\d+ entr(y|ies)/);
      // One primary create action, everywhere
      await expect(page.getByRole('link', { name: 'Log today', exact: true })).toHaveCount(1);
      await expect(diary.logTodayLink).toBeVisible();
      // The old Photos card is gone
      await expect(page.getByRole('heading', { name: /^Photos$/ })).toHaveCount(0);

      await diary.historyLink.click();
      await expect(page).toHaveURL((url) => url.pathname === '/history');
    } finally {
      await seed.cleanup();
    }
  });

  test('L2: entries are grouped by week, newest week first', async ({ page, testPrefix }) => {
    const diary = new DiaryPage(page);
    const seed = await seedDiaryFeed(page, testPrefix, { photoCount: 0 });
    try {
      await page.goto(`/diary?q=${encodeURIComponent(seed.uniq)}`);
      await diary.heading.waitFor({ state: 'visible' });
      await diary.waitForLoaded();

      const thisWeek = diary.weekGroup(mondayOf(todayIso()));
      const lastWeek = diary.weekGroup(mondayOf(todayIso(-7)));
      await expect(diary.weekGroups()).toHaveCount(2);
      // Order: this week above last week
      await expect(diary.weekGroups().first()).toHaveAttribute(
        'data-testid',
        `diary-week-${mondayOf(todayIso())}`,
      );
      await expect(thisWeek.getByRole('heading', { level: 2 })).toContainText('This week');
      await expect(lastWeek.getByRole('heading', { level: 2 })).toContainText('Last week');
      // The muted detail is the date range
      await expect(thisWeek.getByRole('heading', { level: 2 })).toContainText(/\d{4}/);

      for (const id of [seed.dailyLogId, seed.singleWorkerLogId, seed.deliveryId]) {
        await expect(thisWeek.getByTestId(`diary-entry-${id}`)).toBeVisible();
      }
      await expect(lastWeek.getByTestId(`diary-entry-${seed.photoNoteId}`)).toBeVisible();
      await expect(lastWeek.locator('li[data-testid^="diary-entry-"]')).toHaveCount(1);
    } finally {
      await seed.cleanup();
    }
  });

  test('L3: a row is photo-first with company, workers and the area path', async ({
    page,
    testPrefix,
  }) => {
    const diary = new DiaryPage(page);
    const seed = await seedDiaryFeed(page, testPrefix);
    try {
      await page.goto(`/diary?q=${encodeURIComponent(seed.uniq)}`);
      await diary.heading.waitFor({ state: 'visible' });
      await diary.waitForLoaded();

      // 7 photos: 5 thumbnails and a "+2" tile
      await expect(diary.thumbImages(seed.photoNoteId)).toHaveCount(5);
      await expect(diary.thumbs(seed.photoNoteId)).toContainText('+2');
      // The first line of the text only
      const photoRow = diary.entryCard(seed.photoNoteId);
      await expect(photoRow).toContainText('Progress photos from the room.');
      await expect(photoRow).not.toContainText('Second line');
      // The area chip shows the full path (parent, then area)
      await expect(diary.areaChips(seed.photoNoteId)).toContainText(seed.parentAreaName);
      await expect(diary.areaChips(seed.photoNoteId)).toContainText(seed.areaName);
      // The photo-less rows have no strip
      await expect(diary.thumbs(seed.dailyLogId)).toHaveCount(0);

      // Company and the worker plural
      const twoWorkers = diary.entryCard(seed.dailyLogId);
      await expect(twoWorkers).toContainText(seed.companyName);
      await expect(twoWorkers).toContainText('2 workers');
      const oneWorker = diary.entryCard(seed.singleWorkerLogId);
      await expect(oneWorker).toContainText('1 worker');
      await expect(oneWorker).not.toContainText('1 workers');
      // A delivery shows its free-text company
      await expect(diary.entryCard(seed.deliveryId)).toContainText(seed.companyName, {
        ignoreCase: true,
      });
      // The type badge is text, not an emoji-only glyph
      await expect(diary.typeBadge(seed.dailyLogId)).toHaveText('Daily log');

      // The title link opens the entry; Back returns to the list with the filter intact
      await diary.entryLink(seed.photoNoteId).click();
      await expect(page).toHaveURL((url) => url.pathname === `/diary/${seed.photoNoteId}`);
      await page.goBack();
      await expect(page).toHaveURL(/[?&]q=/);
      await expect(diary.searchInput).toHaveValue(seed.uniq);
      await expect(diary.entryCard(seed.photoNoteId)).toBeVisible();
    } finally {
      await seed.cleanup();
    }
  });

  test('L4: drafts leave the feed and live in the Unfinished row', async ({ page, testPrefix }) => {
    const diary = new DiaryPage(page);
    const toast = new ToastRegion(page);
    const uniq = uniqueTag(testPrefix);
    // Far-future dates keep these among the three newest drafts the row shows
    const keepId = await createDraftDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2099-12-30',
      body: `${uniq} draft to continue`,
    });
    const discardId = await createDraftDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2099-12-31',
      body: `${uniq} draft to discard`,
    });
    const created = [keepId, discardId];
    try {
      // Not in the saved feed
      await page.goto(`/diary?q=${encodeURIComponent(uniq)}`);
      await diary.heading.waitFor({ state: 'visible' });
      await diary.waitForLoaded();
      await expect(diary.entryCards()).toHaveCount(0);
      // ...but in the Unfinished row (which ignores the search)
      await expect(diary.unfinished).toBeVisible();
      await expect(diary.unfinishedRow(keepId)).toBeVisible();
      await expect(diary.unfinishedRow(discardId)).toBeVisible();

      // "Show all" target: drafts only, Draft badges, rows open the capture screen
      await page.goto(`/diary?status=draft&q=${encodeURIComponent(uniq)}`);
      await diary.heading.waitFor({ state: 'visible' });
      await expect(diary.entryCards()).toHaveCount(2);
      await expect(diary.getDraftBadge(keepId)).toBeVisible();
      await expect(diary.getDraftBadge(discardId)).toBeVisible();
      await expect(diary.unfinished).toHaveCount(0);
      await expect(diary.activeChipRemove('drafts')).toBeVisible();
      await expect(diary.entryLink(keepId)).toHaveAttribute('href', `/diary/${keepId}/edit`);

      // Continue opens the capture screen
      await diary.goto();
      await diary.continueLink(keepId).click();
      await expect(page).toHaveURL((url) => url.pathname === `/diary/${keepId}/edit`);
      // Let the capture screen settle before leaving it (WebKit interrupts a navigation made
      // while the screen is still loading)
      await new DiaryCapturePage(page).waitForForm();

      // Discard: dialog, confirm, toast, gone
      await diary.goto();
      await diary.discardButton(discardId).click();
      await expect(diary.discardDialog).toBeVisible();
      await diary.discardConfirm.click();
      await expect(toast.successToast.filter({ hasText: 'Draft discarded' })).toBeVisible();
      await expect(diary.unfinishedRow(discardId)).toHaveCount(0);
      const gone = await page.request.get(`/api/diary-entries/${discardId}`);
      expect(gone.status()).toBe(404);
      await expect(diary.unfinishedRow(keepId)).toBeVisible();
    } finally {
      for (const id of created) await deleteDiaryEntryViaApi(page, id);
    }
  });

  test('L7a: nothing at all shows the empty state with Log today (mocked)', async ({ page }) => {
    const diary = new DiaryPage(page);
    await page.route('**/api/diary-entries*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
        }),
      });
    });
    await diary.goto();
    await expect(diary.nothingAtAllState).toBeVisible();
    await expect(diary.nothingAtAllState).toContainText('No diary entries yet.');
    await expect(diary.nothingAtAllState.getByRole('link', { name: 'Log today' })).toBeVisible();
    await expect(diary.filteredEmptyState).toHaveCount(0);
  });

  test('L7b: a search with no match offers Clear filters', async ({ page, testPrefix }) => {
    const diary = new DiaryPage(page);
    const nothing = `${uniqueTag(testPrefix)}-nomatch`;
    await page.goto(`/diary?q=${encodeURIComponent(nothing)}`);
    await diary.heading.waitFor({ state: 'visible' });
    await expect(diary.filteredEmptyState).toBeVisible();
    await expect(diary.filteredEmptyState).toContainText('No entries match these filters');

    await diary.filteredEmptyClear.click();
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(diary.searchInput).toHaveValue('');
    await expect(diary.filtersButton).toBeFocused();
  });

  test('L8: the next batch appends into the same week group (mocked)', async ({ page }) => {
    const diary = new DiaryPage(page);
    const makeRows = (prefix: string, date: string) =>
      Array.from({ length: 25 }, (_, i) => ({
        id: `${prefix}-${i}`,
        entryType: 'general_note',
        entryDate: date,
        title: `Row ${prefix} ${i}`,
        body: 'Mock row.',
        metadata: null,
        status: 'saved',
        isAutomatic: false,
        isSigned: false,
        photoCount: 0,
        thumbnails: [],
        photoAreas: [],
        createdBy: { id: 'u1', displayName: 'E2E Admin' },
        createdAt: `${date}T10:00:00.000Z`,
        updatedAt: `${date}T10:00:00.000Z`,
      }));
    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const requested = new URL(route.request().url()).searchParams.get('page');
      const second = requested === '2';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: second ? makeRows('b', '2026-03-10') : makeRows('a', '2026-03-12'),
          pagination: { page: second ? 2 : 1, pageSize: 25, totalItems: 50, totalPages: 2 },
        }),
      });
    });
    await stubUnfinishedEmpty(page);

    await diary.goto();
    await diary.waitForLoaded();
    await expect(diary.entryCards()).toHaveCount(25);
    await diary.scrollToLoadMore();
    await expect(diary.entryCards()).toHaveCount(50);

    // Both pages fall in the week of Monday 2026-03-09: still one heading
    await expect(diary.weekGroups()).toHaveCount(1);
    await expect(
      diary.weekGroup('2026-03-09').locator('li[data-testid^="diary-entry-"]'),
    ).toHaveCount(50);
  });

  test('DE: the German page has the Filter button and the "Diese Woche" heading', async ({
    browser,
    page,
    testPrefix,
  }) => {
    const seed = await seedDiaryFeed(page, testPrefix, { photoCount: 0 });
    const session = await openAsLocaleUser(
      browser,
      page,
      testPrefix,
      `/diary?q=${encodeURIComponent(seed.uniq)}`,
      'de',
    );
    try {
      const diary = new DiaryPage(session.page);
      await expect(diary.filtersButton).toHaveText('Filter');
      await expect(
        diary.weekGroup(mondayOf(todayIso())).getByRole('heading', { level: 2 }),
      ).toContainText('Diese Woche');
      await expect(diary.logTodayLink).toHaveText('Heute erfassen');
    } finally {
      await session.dispose();
      await seed.cleanup();
    }
  });
});
