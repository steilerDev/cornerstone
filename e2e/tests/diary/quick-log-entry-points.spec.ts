/**
 * E2E: diary entry points (#2222, EPIC-21 P2.3): the "Log now" tiles of the phone/tablet New sheet,
 * the `?start=` capture start modes, the `areaId` preset and the Diary header's "Log today".
 *
 * Scenarios (the tile tests skip from 1024px, where the New menu has no tiles)
 * Q1  <1024  The plus opens the sheet: Photo, Note, Delivery (fresh storage), first tile focused,
 *            tiles >= 80px high. Guard: the 7 general rows stay, "Diary entry" first, below the tiles.
 * Q2  <1024  On a Money page the tiles are there and the 9 rows are unchanged.
 * Q3  <1024  Last used: Note moves first ("Note, last used", data-last-used), is focused, and the
 *            order survives a reload; choosing Delivery then puts Delivery first.
 * Q4  <1024  Note tile: capture screen on Note, title focused, `start` consumed, no draft; saves a Note.
 * Q5  <1024  Delivery tile: Delivery chip pressed, title focused, Company and Materials visible.
 * Q6  <1024  Photo tile (fake camera): the camera opens without another tap, no draft; Done lands
 *            on "Take photos"; a reload leaves the camera closed.
 * Q7  <1024  Photo tile without a camera: no dialog, "Take photos" focused.
 * Q8  all    `areaId` presets the Area chip; an unknown id is ignored silently.
 * Q9  >=1024 Diary header "Log today" opens today's capture screen; the New menu still has
 *            "Diary entry" and no "Log now" group.
 * Q10 all    AC5 after a Note start: the same title as a saved entry of today offers
 *            "Add to that entry instead".
 * Q11 <1024  Choosing Note while already on /diary/new restarts the screen on Note (remount).
 *
 * Synthetic data only; every test removes the entries and areas it created.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { createDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';
import { installFakeCamera, removeMediaDevices } from '../../fixtures/fakeCamera.js';
import { CaptureSeed, getEntry, todayIso, uniqueName } from '../../fixtures/captureSeed.js';
import { ROUTES } from '../../fixtures/testData.js';
import {
  CREATE_ENTRY_LABELS,
  CreateMenu,
  GENERAL_CREATE_ENTRIES,
  MONEY_CREATE_ENTRIES,
  QUICK_LOG_LABELS,
} from '../../pages/components/CreateMenu.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';
import { DiaryPage } from '../../pages/DiaryPage.js';

const GENERAL_LABELS = GENERAL_CREATE_ENTRIES.map((id) => CREATE_ENTRY_LABELS[id]);
const ALL_LABELS = [...GENERAL_CREATE_ENTRIES, ...MONEY_CREATE_ENTRIES].map(
  (id) => CREATE_ENTRY_LABELS[id],
);
const DEFAULT_ORDER = [QUICK_LOG_LABELS.photo, QUICK_LOG_LABELS.note, QUICK_LOG_LABELS.delivery];

function skipFromDesktop(page: Page): void {
  test.skip(
    (page.viewportSize()?.width ?? 0) >= 1024,
    'the Log now tiles exist in the New sheet below 1024px only',
  );
}

/** "New entry · Mon, Oct 19" for today, formatted like the app (en-US). */
async function todayHeading(page: Page): Promise<string> {
  return page.evaluate(() => {
    const now = new Date();
    const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
    const dayMonth = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `New entry · ${weekday}, ${dayMonth}`;
  });
}

/** Counts `POST /api/diary-entries` (a draft or an entry being created). */
function countEntryPosts(page: Page): { count: () => number } {
  let posts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/diary-entries') {
      posts += 1;
    }
  });
  return { count: () => posts };
}

async function expectStartConsumed(page: Page): Promise<void> {
  await expect
    .poll(() => new URL(page.url()).searchParams.has('start'), { message: '`start` is removed' })
    .toBe(false);
}

test.describe('Log now tiles in the New sheet', { tag: '@responsive' }, () => {
  test.beforeEach(({ page }) => skipFromDesktop(page));

  test('Q1: tiles in default order above the 7 general rows, first one focused', async ({
    page,
  }) => {
    const createMenu = new CreateMenu(page);
    await page.goto(ROUTES.home);
    await createMenu.open();

    await expect(createMenu.quickLogGroup).toBeVisible();
    await expect(createMenu.quickLogTiles()).toHaveText(DEFAULT_ORDER);
    await expect(createMenu.quickLogTile('photo')).toBeFocused();
    for (const tile of await createMenu.quickLogTiles().all()) {
      const box = await tile.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(80);
    }

    // Guard: the tiles are not rows, and every tile sits above "Diary entry".
    await expect(createMenu.rows()).toHaveText(GENERAL_LABELS);
    await expect(createMenu.rows()).toHaveCount(GENERAL_CREATE_ENTRIES.length);
    const diaryRow = await createMenu.row('diaryEntry').boundingBox();
    for (const tile of await createMenu.quickLogTiles().all()) {
      const box = await tile.boundingBox();
      expect(box?.y ?? Number.MAX_SAFE_INTEGER).toBeLessThan(diaryRow?.y ?? 0);
    }
  });

  test('Q2: on a Money page the tiles are there and the 9 rows are unchanged', async ({ page }) => {
    const createMenu = new CreateMenu(page);
    await page.goto(routeUrl('budgetOverview'));
    await createMenu.open();

    await expect(createMenu.quickLogTiles()).toHaveText(DEFAULT_ORDER);
    await expect(createMenu.rows()).toHaveText(ALL_LABELS);
    await expect(createMenu.rows()).toHaveCount(ALL_LABELS.length);
  });

  test('Q3: the last used tile moves first, is marked and focused, and survives a reload', async ({
    page,
  }) => {
    const createMenu = new CreateMenu(page);
    await page.goto(ROUTES.home);
    await createMenu.chooseQuickLog('note');
    await expect(page).toHaveURL(/\/diary\/new/);

    await page.goto(ROUTES.home);
    await createMenu.open();
    await expect(createMenu.quickLogTiles()).toHaveText(['Note', 'Photo', 'Delivery']);
    const note = createMenu.quickLogTile('note');
    await expect(note).toHaveAttribute('data-last-used', 'true');
    await expect(
      createMenu.quickLogGroup.getByRole('link', { name: 'Note, last used' }),
    ).toHaveCount(1);
    await expect(createMenu.quickLogTile('photo')).not.toHaveAttribute('data-last-used', 'true');
    await expect(note).toBeFocused();

    await page.reload();
    await createMenu.open();
    await expect(createMenu.quickLogTiles()).toHaveText(['Note', 'Photo', 'Delivery']);
    await expect(note).toBeFocused();

    await createMenu.quickLogTile('delivery').click();
    await expect(page).toHaveURL(/\/diary\/new/);
    await page.goto(ROUTES.home);
    await createMenu.open();
    await expect(createMenu.quickLogTiles()).toHaveText(['Delivery', 'Photo', 'Note']);
    await expect(createMenu.quickLogTile('delivery')).toHaveAttribute('data-last-used', 'true');
  });

  test('Q4: Note tile opens a Note with the title focused, no draft; the entry saves as a Note', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const posts = countEntryPosts(page);
      const createMenu = new CreateMenu(page);
      const capture = new DiaryCapturePage(page);
      await page.goto(ROUTES.home);
      await createMenu.chooseQuickLog('note');
      await capture.waitForForm();

      expect(new URL(page.url()).pathname).toBe('/diary/new');
      await expectStartConsumed(page);
      await expect(capture.moreTypeTrigger).toHaveAttribute('data-current', 'true');
      await expect(capture.moreTypeTrigger).toContainText('Note');
      await expect(capture.titleInput).toBeFocused();
      expect(posts.count()).toBe(0);

      const title = uniqueName(testPrefix, 'Quick note');
      await capture.typeTitle(title);
      seed.trackEntry(await capture.waitForDraft());
      await capture.saveEntry();
      const entry = await getEntry(page, capture.entryIdFromUrl());
      expect(entry.entryType).toBe('general_note');
      expect(entry.title).toBe(title);
      expect(entry.status).toBe('saved');
    } finally {
      await seed.cleanup();
    }
  });

  test('Q5: Delivery tile opens a Delivery with the title focused; a title alone saves', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const posts = countEntryPosts(page);
      const createMenu = new CreateMenu(page);
      const capture = new DiaryCapturePage(page);
      await page.goto(ROUTES.home);
      await createMenu.chooseQuickLog('delivery');
      await capture.waitForForm();

      await expectStartConsumed(page);
      await expect(capture.typeChip('delivery')).toHaveAttribute('aria-pressed', 'true');
      await expect(capture.titleInput).toBeFocused();
      await expect(page.getByTestId('capture-company')).toBeVisible();
      await expect(capture.materialInput).toBeVisible();
      expect(posts.count()).toBe(0);

      const title = uniqueName(testPrefix, 'Quick delivery');
      await capture.typeTitle(title);
      seed.trackEntry(await capture.waitForDraft());
      await capture.saveEntry();
      const entry = await getEntry(page, capture.entryIdFromUrl());
      expect(entry.entryType).toBe('delivery');
      expect(entry.status).toBe('saved');
    } finally {
      await seed.cleanup();
    }
  });

  test('Q6: Photo tile opens the live camera without another tap and without a draft', async ({
    page,
  }) => {
    await installFakeCamera(page);
    const posts = countEntryPosts(page);
    const createMenu = new CreateMenu(page);
    const capture = new DiaryCapturePage(page);
    await page.goto(ROUTES.home);
    await createMenu.chooseQuickLog('photo');

    await expect(capture.camera.dialog).toBeVisible();
    await expectStartConsumed(page);
    expect(posts.count()).toBe(0);

    await capture.camera.done.click();
    await expect(capture.camera.dialog).toBeHidden();
    await expect(capture.takePhotosButton).toBeFocused();
    expect(posts.count()).toBe(0);

    // `start` was consumed: a reload does not reopen the camera.
    await page.reload();
    await capture.waitForForm();
    await expect(capture.camera.dialog).toHaveCount(0);
    expect(posts.count()).toBe(0);
  });

  test('Q7: Photo tile without a camera falls back to a focused "Take photos"', async ({
    page,
  }) => {
    await removeMediaDevices(page);
    const createMenu = new CreateMenu(page);
    const capture = new DiaryCapturePage(page);
    await page.goto(ROUTES.home);
    await createMenu.chooseQuickLog('photo');
    await capture.waitForForm();

    await expect(capture.camera.dialog).toHaveCount(0);
    await expect(capture.takePhotosButton).toBeFocused();
  });

  test('Q11: choosing a tile while on the capture screen restarts it on that start', async ({
    page,
  }) => {
    const createMenu = new CreateMenu(page);
    const capture = new DiaryCapturePage(page);
    await capture.goto();
    await expect(capture.typeChip('daily_log')).toHaveAttribute('aria-pressed', 'true');

    await createMenu.chooseQuickLog('note');
    await expect(capture.moreTypeTrigger).toHaveAttribute('data-current', 'true');
    await expect(capture.titleInput).toBeFocused();
    await expectStartConsumed(page);

    // And again to Delivery: the screen restarts rather than ignoring the second start.
    await createMenu.chooseQuickLog('delivery');
    await expect(capture.typeChip('delivery')).toHaveAttribute('aria-pressed', 'true');
    await expect(capture.titleInput).toBeFocused();
  });
});

test.describe('Capture start options', { tag: '@responsive' }, () => {
  test('Q8: areaId presets the Area chip; an unknown id is ignored', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const area = await seed.area('Preset hall');
      const capture = new DiaryCapturePage(page);

      await capture.goto({ areaId: area.id });
      await expect(capture.areaChip(area.name)).toHaveAttribute('aria-pressed', 'true');

      await capture.goto({ areaId: 'unknown-area-id' });
      await expect(capture.tagChips.getByRole('button', { pressed: true })).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(capture.titleInput).toBeEditable();
    } finally {
      await seed.cleanup();
    }
  });

  test('Q10: after a Note start, the same title as today\'s entry offers "Add to that entry instead"', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const title = uniqueName(testPrefix, 'Quick lookup');
      seed.trackEntry(
        await createDiaryEntryViaApi(page, {
          entryType: 'general_note',
          entryDate: todayIso(),
          body: 'Seeded',
          title,
          status: 'saved',
        }),
      );
      const capture = new DiaryCapturePage(page);

      await capture.goto({ start: 'note' });
      await expect(capture.titleInput).toBeFocused();
      await capture.typeTitle(title);
      seed.trackEntry(await capture.waitForDraft());

      await expect(capture.lookupRows).toHaveCount(1);
      await expect(capture.addToThatButton).toBeVisible();
    } finally {
      await seed.cleanup();
    }
  });
});

test.describe('Log today on the Diary page', { tag: '@responsive' }, () => {
  test('Q9: the header link opens today\'s capture screen; the New menu keeps "Diary entry"', async ({
    page,
  }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1024, 'desktop shell: the New menu has no tiles');
    const diaryPage = new DiaryPage(page);
    const capture = new DiaryCapturePage(page);
    const createMenu = new CreateMenu(page);
    await diaryPage.goto();

    await expect(diaryPage.logTodayLink).toBeVisible();
    await diaryPage.logTodayLink.click();
    await capture.waitForForm();
    await expect(capture.heading).toHaveText(await todayHeading(page));
    await expect(capture.dateChip('today')).toHaveAttribute('aria-pressed', 'true');
    await capture.breadcrumbs.expectTrail(['Site diary']);
    await capture.breadcrumbs.trailLink('Site diary').click();
    await expect(page).toHaveURL(new RegExp(`${routeUrl('diary')}$`));

    await createMenu.open();
    await expect(createMenu.row('diaryEntry')).toHaveText(CREATE_ENTRY_LABELS.diaryEntry);
    await expect(createMenu.quickLogGroup).toHaveCount(0);
    await createMenu.row('diaryEntry').click();
    await capture.waitForForm();
    await expect(capture.heading).toHaveText(await todayHeading(page));
  });
});
