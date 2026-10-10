/**
 * E2E tests for the Photo browser (Story #2162): Spots page (/photos) and Spot viewer
 * (/photos/spot/:areaKey/:orientationKey).
 *
 * Scenarios:
 *  1.  [smoke] Navigation — main navigation "Photos" entry -> /photos, heading, aria-current
 *  2.  Table structure — rowgroup, rows, columns, count (drafts excluded), latest date, empty cell
 *  3.  Cell -> viewer — position, long date, area path, orientation, caption, diary link
 *  4.  Prev/next + arrow keys, focus hand-off at the ends
 *  5.  Same spot over time — history list order, aria-current, selection
 *  6.  Back link focus restore, deep link, goBack semantics, Escape
 *  7.  No-area spot
 *  8.  Empty state (mocked)
 *  9.  Error state + retry (mocked)
 *  10. Unknown spot -> not-found EmptyState
 *  11. Mobile chips + cards + viewer without horizontal scroll
 *  12. German locale
 *  13. Dark mode
 *
 * The E2E DB is shared across workers: every test seeds its own uniquely named areas and
 * orientations and addresses cells by spot key (area id : orientation id), never by index.
 */

import type { Page } from '@playwright/test';
import type { PhotoSpotsResponse } from '@cornerstone/shared';
import { test, expect } from '../../fixtures/auth.js';
import {
  createAreaViaApi,
  deleteAreaViaApi,
  createOrientationViaApi,
  deleteOrientationViaApi,
  createDiaryEntryViaApi,
  createDraftDiaryEntryViaApi,
  deleteDiaryEntryViaApi,
  uploadDiaryPhotoViaApi,
} from '../../fixtures/apiHelpers.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { ROUTES } from '../../fixtures/testData.js';
import { PhotosPage } from '../../pages/PhotosPage.js';
import { PhotoSpotViewerPage } from '../../pages/PhotoSpotViewerPage.js';

interface Seed {
  parentId: string;
  childId: string;
  rootId: string;
  o1Id: string;
  o2Id: string;
  parentName: string;
  childName: string;
  rootName: string;
  o1Name: string;
  o2Name: string;
  /** Newest-first: entry3 (2026-08-20), entry2 (2026-05-10), entry1 (2026-03-01) */
  entryIds: [string, string, string];
  photoIds: [string, string, string];
  titles: [string, string, string];
  caption: string;
  draftEntryId: string;
}

interface Cleanup {
  entries: string[];
  areas: string[];
  orientations: string[];
}

function newCleanup(): Cleanup {
  return { entries: [], areas: [], orientations: [] };
}

async function runCleanup(page: Page, c: Cleanup): Promise<void> {
  // Entries first (hard-delete their photos), then areas (children before parents), then orientations.
  for (const id of c.entries) await deleteDiaryEntryViaApi(page, id).catch(() => undefined);
  for (const id of [...c.areas].reverse()) await deleteAreaViaApi(page, id).catch(() => undefined);
  for (const id of c.orientations) await deleteOrientationViaApi(page, id).catch(() => undefined);
}

async function seed(page: Page, id: string, c: Cleanup): Promise<Seed> {
  const parentName = `P-${id}`;
  const childName = `C-${id}`;
  const rootName = `R-${id}`;
  const o1Name = `O1-${id}`;
  const o2Name = `O2-${id}`;

  const parentId = await createAreaViaApi(page, { name: parentName });
  c.areas.push(parentId);
  const childId = await createAreaViaApi(page, {
    name: childName,
    parentId,
    color: '#3B82F6',
  });
  c.areas.push(childId);
  const rootId = await createAreaViaApi(page, { name: rootName });
  c.areas.push(rootId);
  const o1Id = await createOrientationViaApi(page, { name: o1Name });
  c.orientations.push(o1Id);
  const o2Id = await createOrientationViaApi(page, { name: o2Name });
  c.orientations.push(o2Id);

  const dates = ['2026-03-01', '2026-05-10', '2026-08-20'];
  const entryIds: string[] = [];
  const photoIds: string[] = [];
  const titles: string[] = [];
  const caption = `Caption-${id}`;
  for (const [i, date] of dates.entries()) {
    const title = `Entry${i + 1}-${id}`;
    const entryId = await createDiaryEntryViaApi(page, {
      entryType: 'daily_log',
      entryDate: date,
      title,
      body: `Body ${i + 1}`,
    });
    c.entries.push(entryId);
    const photoId = await uploadDiaryPhotoViaApi(page, entryId, {
      areaId: childId,
      orientationId: o1Id,
      caption: i === 2 ? caption : undefined,
    });
    entryIds.push(entryId);
    photoIds.push(photoId);
    titles.push(title);
  }

  // A draft entry with a photo on the same spot: must be excluded everywhere.
  const draftEntryId = await createDraftDiaryEntryViaApi(page, { entryType: 'daily_log' });
  c.entries.push(draftEntryId);
  await uploadDiaryPhotoViaApi(page, draftEntryId, { areaId: childId, orientationId: o1Id });

  // Newest first
  return {
    parentId,
    childId,
    rootId,
    o1Id,
    o2Id,
    parentName,
    childName,
    rootName,
    o1Name,
    o2Name,
    entryIds: entryIds.reverse() as [string, string, string],
    photoIds: photoIds.reverse() as [string, string, string],
    titles: titles.reverse() as [string, string, string],
    caption,
    draftEntryId,
  };
}

/** Seed a single spot with no extra noise (used by tests that need just the data). */
function isNarrow(page: Page): boolean {
  const vp = page.viewportSize();
  return vp !== null && vp.width < 768;
}

test.describe('Photo browser', { tag: '@responsive' }, () => {
  let cleanup: Cleanup;

  test.beforeEach(() => {
    cleanup = newCleanup();
  });

  test.afterEach(async ({ page }) => {
    await runCleanup(page, cleanup);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Navigation
  // ───────────────────────────────────────────────────────────────────────────
  test(
    'Main navigation Photos entry opens the Photos page',
    { tag: '@smoke' },
    async ({ page }) => {
      const appShell = new AppShellPage(page);
      const photos = new PhotosPage(page);

      await page.goto(ROUTES.home);
      await expect(page.locator('main h1').first()).toBeVisible();

      await appShell.navigateTo('photos');

      await expect(page).toHaveURL((u) => u.pathname === routeUrl('photos'));
      await expect(photos.heading).toBeVisible();
      await expect(appShell.sectionLink('photos')).toHaveAttribute('aria-current', 'page');
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Table structure
  // ───────────────────────────────────────────────────────────────────────────
  test('Spots table shows groups, rows, columns, count and latest date', async ({
    page,
    testPrefix,
  }, testInfo) => {
    test.skip(isNarrow(page), 'Table layout is desktop/tablet only');
    const s = await seed(page, `${testPrefix}-${testInfo.testId}`.slice(0, 40), cleanup);
    const photos = new PhotosPage(page);
    await photos.goto();

    // Rowgroup header with the child row inside it
    await expect(photos.group(s.parentName)).toBeVisible();
    await expect(
      photos.group(s.parentName).locator('th[scope="row"]', { hasText: s.childName }),
    ).toBeVisible();

    // Childless root: row with all "No photos" cells
    const rootRow = photos.row(s.rootName);
    await expect(rootRow).toBeVisible();
    await expect(photos.cellByKey(s.rootId, s.o1Id)).toContainText('No photos');
    await expect(photos.cellByKey(s.rootId, s.o2Id)).toContainText('No photos');
    await expect(photos.cellByKey(s.rootId, 'none')).toContainText('No photos');

    // Columns
    await expect(photos.columnHeader(s.o1Name)).toBeVisible();
    await expect(photos.columnHeader(s.o2Name)).toBeVisible();
    await expect(photos.columnHeader('No orientation')).toBeVisible();

    // C x O1: count 3 (draft excluded), latest date 2026-08-20
    const cell = photos.cellByKey(s.childId, s.o1Id);
    await expect(cell).toBeVisible();
    await expect(cell).toHaveAttribute('aria-label', /3 photos, latest August 20, 2026/);
    await expect(cell).toContainText('Aug 20, 2026');

    // C x O2: dashed placeholder, no link
    const empty = photos.cellByKey(s.childId, s.o2Id);
    await expect(empty).toContainText('No photos');
    await expect(empty).not.toHaveAttribute('href', /.*/);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Cell -> viewer
  // ───────────────────────────────────────────────────────────────────────────
  test('Opening a spot shows the latest photo with its details', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const s = await seed(page, `${testPrefix}-${testInfo.testId}`.slice(0, 40), cleanup);
    const photos = new PhotosPage(page);
    const viewer = new PhotoSpotViewerPage(page);
    await photos.goto();

    await photos.spotLink(s.childId, s.o1Id).click();

    await expect(page).toHaveURL(
      new RegExp(`/photos/spot/${s.childId}/${s.o1Id}\\?photo=${s.photoIds[0]}`),
    );
    await expect(viewer.position).toHaveText('1 of 3');
    await expect(viewer.date).toHaveText('August 20, 2026');
    await expect(viewer.area).toContainText(`${s.parentName} › ${s.childName}`);
    await expect(viewer.orientation).toHaveText(s.o1Name);
    await expect(viewer.caption).toHaveText(s.caption);

    await viewer.diaryLink.click();
    await expect(page).toHaveURL(new RegExp(`/diary/${s.entryIds[0]}$`));
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Prev/next + keyboard
  // ───────────────────────────────────────────────────────────────────────────
  test('Prev/next buttons and arrow keys step through photos', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const s = await seed(page, `${testPrefix}-${testInfo.testId}`.slice(0, 40), cleanup);
    const viewer = new PhotoSpotViewerPage(page);
    await viewer.goto(s.childId, s.o1Id, s.photoIds[0]);

    await expect(viewer.position).toHaveText('1 of 3');
    await expect(viewer.nextButton).toBeDisabled();
    await expect(viewer.prevButton).toBeEnabled();

    await viewer.prevButton.click();
    await expect(viewer.position).toHaveText('2 of 3');
    await expect(viewer.date).toHaveText('May 10, 2026');

    await page.keyboard.press('ArrowLeft');
    await expect(viewer.position).toHaveText('3 of 3');
    await expect(viewer.prevButton).toBeDisabled();
    // Focus hand-off: the disabled Prev button must not strand focus on <body>
    await expect(viewer.nextButton).toBeFocused();

    await page.keyboard.press('ArrowRight');
    await expect(viewer.position).toHaveText('2 of 3');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. History list
  // ───────────────────────────────────────────────────────────────────────────
  test('Same-spot-over-time list is newest first and selectable', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const s = await seed(page, `${testPrefix}-${testInfo.testId}`.slice(0, 40), cleanup);
    const viewer = new PhotoSpotViewerPage(page);
    await viewer.goto(s.childId, s.o1Id, s.photoIds[0]);

    await expect(viewer.historyItems).toHaveCount(3);
    await expect(viewer.historyItems.nth(0)).toHaveAttribute(
      'data-testid',
      `spot-history-item-${s.photoIds[0]}`,
    );
    await expect(viewer.historyItems.nth(1)).toHaveAttribute(
      'data-testid',
      `spot-history-item-${s.photoIds[1]}`,
    );
    await expect(viewer.historyItems.nth(2)).toHaveAttribute(
      'data-testid',
      `spot-history-item-${s.photoIds[2]}`,
    );
    await expect(viewer.historyItem(s.photoIds[0])).toHaveAttribute('aria-current', 'true');
    for (const [i, photoId] of s.photoIds.entries()) {
      await expect(viewer.historyItem(photoId)).toContainText(`Daily log – ${s.titles[i]}`);
    }

    await viewer.historyItem(s.photoIds[2]).click();
    await expect(viewer.historyItem(s.photoIds[2])).toHaveAttribute('aria-current', 'true');
    await expect(viewer.date).toHaveText('March 1, 2026');
    await expect(viewer.position).toHaveText('3 of 3');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Back, deep link, history semantics
  // ───────────────────────────────────────────────────────────────────────────
  test('Deep link, back link focus restore, goBack and Escape', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const s = await seed(page, `${testPrefix}-${testInfo.testId}`.slice(0, 40), cleanup);
    const photos = new PhotosPage(page);
    const viewer = new PhotoSpotViewerPage(page);

    // Deep link to the middle photo, survives reload
    await viewer.goto(s.childId, s.o1Id, s.photoIds[1]);
    await expect(viewer.position).toHaveText('2 of 3');
    await page.reload();
    await expect(viewer.position).toHaveText('2 of 3');
    await expect(viewer.date).toHaveText('May 10, 2026');

    // Back link returns to /photos with focus on the spot's link
    await photos.goto();
    await photos.spotLink(s.childId, s.o1Id).click();
    await expect(viewer.position).toHaveText('1 of 3');
    await viewer.backLink.click();
    await expect(page).toHaveURL(/\/photos$/);
    await expect(photos.spotLink(s.childId, s.o1Id)).toBeFocused();

    // Photo steps replace history: goBack leaves the viewer entirely
    await photos.spotLink(s.childId, s.o1Id).click();
    await expect(viewer.position).toHaveText('1 of 3');
    await viewer.prevButton.click();
    await expect(viewer.position).toHaveText('2 of 3');
    await page.goBack();
    await expect(page).toHaveURL(/\/photos$/);

    // Escape also returns
    await photos.spotLink(s.childId, s.o1Id).click();
    await expect(viewer.position).toHaveText('1 of 3');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/photos$/);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. No area / no orientation
  // ───────────────────────────────────────────────────────────────────────────
  test('A photo with no area shows in the "No area" row and viewer', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const id = `${testPrefix}-${testInfo.testId}`.slice(0, 40);
    const o1Id = await createOrientationViaApi(page, { name: `O1-${id}` });
    cleanup.orientations.push(o1Id);
    const entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-04-01',
      body: 'No area photo',
    });
    cleanup.entries.push(entryId);
    await uploadDiaryPhotoViaApi(page, entryId, { orientationId: o1Id });

    const photos = new PhotosPage(page);
    const viewer = new PhotoSpotViewerPage(page);
    await photos.goto();

    await expect(photos.spotLink('none', o1Id)).toBeVisible();
    await photos.spotLink('none', o1Id).click();

    await expect(viewer.area).toHaveText('No area');
    await expect(viewer.orientation).toHaveText(`O1-${id}`);
    await expect(viewer.historyItems).toHaveCount(1);
    await expect(viewer.position).toHaveText('1 of 1');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8/9/10. Empty, error, not found
  // ───────────────────────────────────────────────────────────────────────────
  test('Empty state when there are no spots', async ({ page }) => {
    const photos = new PhotosPage(page);
    await page.route('**/api/photos/spots', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          spots: [],
          areas: [],
          orientations: [],
        } satisfies PhotoSpotsResponse),
      }),
    );
    await page.goto('/photos');
    await expect(photos.emptyState).toBeVisible();
    await expect(photos.table).toHaveCount(0);
  });

  test('Error state shows a banner and Try again recovers', async ({ page }) => {
    const photos = new PhotosPage(page);
    await page.route('**/api/photos/spots', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
      }),
    );
    await page.goto('/photos');
    await expect(
      photos.errorBanner.filter({ hasText: 'Photos could not be loaded' }),
    ).toBeVisible();
    await expect(photos.retryButton).toBeVisible();

    await page.unroute('**/api/photos/spots');
    await photos.retryButton.click();
    await expect(photos.errorBanner.filter({ hasText: 'Photos could not be loaded' })).toHaveCount(
      0,
    );
    // Either layout may render depending on the seed state of the shared DB
    await expect(photos.heading).toBeVisible();
  });

  test('Unknown spot shows the not-found state', async ({ page }) => {
    await page.goto('/photos/spot/00000000-0000-4000-8000-000000000000/none');
    await expect(page.getByText('This spot no longer exists')).toBeVisible();
    await page.getByRole('button', { name: 'Back to Photos' }).click();
    await expect(page).toHaveURL(/\/photos$/);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 11. Mobile
  // ───────────────────────────────────────────────────────────────────────────
  test('Mobile layout uses chips and cards and the viewer does not overflow', async ({
    page,
    testPrefix,
  }, testInfo) => {
    test.skip(!isNarrow(page), 'Mobile layout only');
    const s = await seed(page, `${testPrefix}-${testInfo.testId}`.slice(0, 40), cleanup);
    const photos = new PhotosPage(page);
    const viewer = new PhotoSpotViewerPage(page);
    await photos.goto();

    await expect(photos.table).toHaveCount(0);
    await expect(photos.chipByValue('all')).toHaveAttribute('aria-pressed', 'true');

    await photos.chipByValue(s.parentId).click();
    await expect(photos.chipByValue(s.parentId)).toHaveAttribute('aria-pressed', 'true');
    await expect(photos.chipByValue('all')).toHaveAttribute('aria-pressed', 'false');
    await expect(photos.areaHeading(s.childName)).toBeVisible();
    await expect(photos.areaHeading(s.rootName)).toHaveCount(0);

    const card = photos.cardByKey(s.childId, s.o1Id);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('aria-label', /3 photos/);

    await card.click();
    await expect(viewer.position).toHaveText('1 of 3');
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noOverflow).toBe(true);

    await viewer.date.scrollIntoViewIfNeeded();
    await expect(viewer.date).toBeVisible();
    await expect(viewer.historyItems.first()).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 12. German locale
  // ───────────────────────────────────────────────────────────────────────────
  test('German browser locale renders the German nav label and heading', async ({ browser }) => {
    const context = await browser.newContext({
      locale: 'de-DE',
      storageState: 'test-results/.auth/admin.json',
    });
    const page = await context.newPage();
    try {
      await page.goto(routeUrl('photos'));
      const appShell = new AppShellPage(page);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Fotos', exact: true }),
      ).toBeVisible();
      await expect(appShell.sectionLink('photos')).toHaveAccessibleName('Fotos');
    } finally {
      await context.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 13. Dark mode
  // ───────────────────────────────────────────────────────────────────────────
  test('Dark mode renders the page and a theme-independent viewer stage', async ({
    page,
    browser,
    testPrefix,
  }, testInfo) => {
    const s = await seed(page, `${testPrefix}-${testInfo.testId}`.slice(0, 40), cleanup);

    const stageBackground = async (colorScheme: 'light' | 'dark'): Promise<string> => {
      const context = await browser.newContext({
        colorScheme,
        storageState: 'test-results/.auth/admin.json',
      });
      const p = await context.newPage();
      try {
        const photosPage = new PhotosPage(p);
        await photosPage.goto();
        await expect(photosPage.spotLink(s.childId, s.o1Id)).toBeVisible();

        const viewer = new PhotoSpotViewerPage(p);
        await viewer.goto(s.childId, s.o1Id, s.photoIds[0]);
        await expect(viewer.position).toHaveText('1 of 3');
        await expect(p.locator('html')).toHaveAttribute('data-theme', colorScheme);
        return await viewer.root.evaluate((el) => getComputedStyle(el).backgroundColor);
      } finally {
        await context.close();
      }
    };

    const light = await stageBackground('light');
    const dark = await stageBackground('dark');
    expect(dark).toBe(light);
  });
});
