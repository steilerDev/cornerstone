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
 *  --- #2226 (P2.7) ---
 *  14. AC1  Never-photographed area: dashed "No photos" cells; "No orientation" column
 *  15. AC2  'No area' group is last: band/section, "n photos" row header, no Unsorted/Tidy words
 *  16. AC4  Visible h1 "area path · orientation" and "n of N" with 1 = newest
 *  17. AC5  D-31: /photos/spot/none/none is the 'No area' group (not "Same spot over time"); every
 *           'No area' cell opens it; old none/<orientation> links still work
 *  18. AC7  Area row header / h2 links to the Areas index; Back returns to Photos
 *  19. AC8  Annotate dialog (Cancel closes, focus returns); signed photo -> aria-disabled + reason
 *  20. AC8  Phone only: app shell bars are not rendered; a tap on the photo hides/shows the chrome
 *  21. Dark mode smoke of the viewer chrome and the select tiles
 *  22. German locale: select toggle, area link suffix, group viewer, Edit tags (no raw keys)
 *  (the bulk Set tags flow and Edit tags live in photo-no-area.spec.ts)
 *
 * The E2E DB is shared across workers: every test seeds its own uniquely named areas and
 * orientations and addresses cells by spot key (area id : orientation id), never by index.
 */

import type { Page } from '@playwright/test';
import type { PhotoSpotsResponse } from '@cornerstone/shared';
import { test, expect } from '../../fixtures/auth.js';
import type { Locator } from '@playwright/test';
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
import { AreasIndexPage } from '../../pages/AreasIndexPage.js';
import { PhotoViewerPage } from '../../pages/PhotoViewerPage.js';

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

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

/** An empty "No photos" cell is drawn with a dashed border (the element or a descendant). */
async function expectDashed(locator: Locator): Promise<void> {
  await expect
    .poll(() =>
      locator.evaluate((el) =>
        [el, ...Array.from(el.querySelectorAll('*'))].some(
          (n) => getComputedStyle(n).borderTopStyle === 'dashed',
        ),
      ),
    )
    .toBe(true);
}

/** Seed a saved entry holding one photo with no area (optionally an orientation). */
async function seedNoAreaPhoto(
  page: Page,
  c: Cleanup,
  opts: { date: string; title: string; orientationId?: string },
): Promise<{ entryId: string; photoId: string }> {
  const entryId = await createDiaryEntryViaApi(page, {
    entryType: 'general_note',
    entryDate: opts.date,
    title: opts.title,
    body: 'No area photo',
  });
  c.entries.push(entryId);
  const photoId = await uploadDiaryPhotoViaApi(page, entryId, {
    orientationId: opts.orientationId,
  });
  return { entryId, photoId };
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
    await expectDashed(photos.cellByKey(s.rootId, s.o1Id));

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
    await viewer.openDetails();
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

    await page.keyboard.press('ArrowLeft');
    await expect(viewer.position).toHaveText('3 of 3');
    await expect(viewer.prevButton).toBeDisabled();
    // Focus hand-off: the disabled Prev button must not strand focus on <body>
    await expect(viewer.nextButton).toBeFocused();

    await page.keyboard.press('ArrowRight');
    await expect(viewer.position).toHaveText('2 of 3');
    await viewer.openDetails();
    await expect(viewer.date).toHaveText('May 10, 2026');
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
    await viewer.openDetails();

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
    await viewer.openDetails();
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
  // 7. No area / no orientation (the 'No area' cells open the group since #2226)
  // ───────────────────────────────────────────────────────────────────────────
  test('A photo with no area shows in the "No area" row and opens the group viewer', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const id = `${testPrefix}-${testInfo.testId}`.slice(0, 40);
    const o1Id = await createOrientationViaApi(page, { name: `O1-${id}` });
    cleanup.orientations.push(o1Id);
    const { photoId } = await seedNoAreaPhoto(page, cleanup, {
      date: '2026-04-01',
      title: `NoArea-${id}`,
      orientationId: o1Id,
    });

    const photos = new PhotosPage(page);
    const viewer = new PhotoSpotViewerPage(page);
    await photos.goto();

    await expect(photos.spotLink('none', o1Id)).toBeVisible();
    await photos.spotLink('none', o1Id).click();

    // The group, opened at this cell's latest photo (the E2E DB is shared: N is not asserted)
    await expect(page).toHaveURL(
      (u) => u.pathname === '/photos/spot/none/none' && u.searchParams.get('photo') === photoId,
    );
    await expect(viewer.title).toHaveText('No area');
    await viewer.openDetails();
    await expect(viewer.area).toHaveText('No area');
    await expect(viewer.orientation).toHaveText(`O1-${id}`);
    await expect(viewer.historyItem(photoId)).toHaveAttribute('aria-current', 'true');
    await expect(viewer.position).toHaveText(/^\d+ of \d+$/);
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

    await expectDashed(photos.cardByKey(s.childId, s.o2Id));

    await card.click();
    await expect(viewer.position).toHaveText('1 of 3');
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noOverflow).toBe(true);

    // The phone's details live in a sheet behind the Details button
    await viewer.openDetails();
    await expect(viewer.date).toBeVisible();
    await expect(viewer.historyItems.first()).toBeVisible();
    const noOverflowOpen = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noOverflowOpen).toBe(true);
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

  // ═══════════════════════════════════════════════════════════════════════════
  // #2226 (P2.7): spots, the 'No area' group, the viewer
  // ═══════════════════════════════════════════════════════════════════════════

  // ───────────────────────────────────────────────────────────────────────────
  // 14. AC1: never-photographed area, No orientation column
  // ───────────────────────────────────────────────────────────────────────────
  test('AC1: a never-photographed area shows dashed "No photos" cells and a No orientation column', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const s = await seed(page, `${testPrefix}-${testInfo.testId}`.slice(0, 40), cleanup);
    const photos = new PhotosPage(page);
    await photos.goto();

    // The root area was never photographed: every cell (incl. "No orientation") is a dashed placeholder
    for (const orientationKey of [s.o1Id, s.o2Id, 'none']) {
      const cell = photos.spotLink(s.rootId, orientationKey);
      await expect(cell).toContainText('No photos');
      await expectDashed(cell);
    }
    if (!isNarrow(page)) {
      await expect(photos.columnHeader('No orientation')).toBeVisible();
    } else {
      await expect(photos.cardByKey(s.rootId, 'none')).toContainText('No orientation');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 15. AC2: the 'No area' group is a neutral, last group
  // ───────────────────────────────────────────────────────────────────────────
  test('AC2: the No area group is last, neutral, and has no Unsorted/Tidy wording', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const id = `${testPrefix}-${testInfo.testId}`.slice(0, 40);
    await seed(page, id, cleanup);
    await seedNoAreaPhoto(page, cleanup, { date: '2026-04-02', title: `NoAreaLast-${id}` });
    const photos = new PhotosPage(page);
    await photos.goto();

    if (!isNarrow(page)) {
      const last = page.locator('tbody').last();
      await expect(last.locator('th[scope="rowgroup"]')).toContainText('No area');
      await expect(last.locator('th[scope="row"]')).toHaveText(/^\d+ photos?$/);
      await expect(last.getByTestId('no-area-select-toggle')).toHaveText('Select photos');
    } else {
      await expect(page.locator('[data-testid^="spot-group-chip-"]').last()).toHaveText('No area');
      const section = page.locator('section').filter({ has: photos.noAreaHeading() });
      await expect(section).toHaveCount(1);
      await expect(section.getByRole('heading', { level: 2 })).toHaveText('No area');
      await expect(section).toContainText(/\d+ photos?/);
      await expect(page.locator('section').last()).toContainText('No area');
      await expect(photos.noAreaToggle).toHaveText('Select photos');
    }
    // No Unsorted mode, no banner, no Tidy-up
    await expect(page.locator('body')).not.toContainText(/Unsorted|Tidy/i);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 16. AC4: visible title and position
  // ───────────────────────────────────────────────────────────────────────────
  test('AC4: the viewer shows a visible h1 "area path · orientation" and "n of N", 1 = newest', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const s = await seed(page, `${testPrefix}-${testInfo.testId}`.slice(0, 40), cleanup);
    const viewer = new PhotoSpotViewerPage(page);
    await viewer.goto(s.childId, s.o1Id, s.photoIds[0]);

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toBeVisible();
    await expect(h1).toHaveText(`${s.parentName} › ${s.childName} · ${s.o1Name}`);
    await expect(viewer.position).toHaveText('1 of 3');
    await viewer.openDetails();
    await expect(viewer.date).toHaveText('August 20, 2026');

    await viewer.closeDetailsIfPhone();
    await viewer.prevButton.click();
    await expect(viewer.position).toHaveText('2 of 3');
    // Visible text, not sr-only: it has a real box inside the viewport
    const box = await h1.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(8);
    expect(box!.width).toBeGreaterThan(40);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 17. AC5 / D-31: /photos/spot/none/none is the 'No area' group
  // ───────────────────────────────────────────────────────────────────────────
  test('D-31: /photos/spot/none/none is the No area group, any orientation, not a spot', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const id = `${testPrefix}-${testInfo.testId}`.slice(0, 40);
    const o1Id = await createOrientationViaApi(page, { name: `O1-${id}` });
    cleanup.orientations.push(o1Id);
    const o2Id = await createOrientationViaApi(page, { name: `O2-${id}` });
    cleanup.orientations.push(o2Id);
    const a = await seedNoAreaPhoto(page, cleanup, {
      date: '2026-02-01',
      title: `GA-${id}`,
      orientationId: o1Id,
    });
    const b = await seedNoAreaPhoto(page, cleanup, {
      date: '2026-02-02',
      title: `GB-${id}`,
      orientationId: o2Id,
    });
    const c = await seedNoAreaPhoto(page, cleanup, { date: '2026-02-03', title: `GC-${id}` });

    const viewer = new PhotoSpotViewerPage(page);
    await viewer.goto('none', 'none');

    await expect(viewer.title).toHaveText('No area');
    await expect(page).toHaveTitle(/^No area · Photos/);
    await expect(viewer.position).toHaveText(/^1 of \d+$/);
    await viewer.openDetails();
    // The list heading says "Photos with no area", never "Same spot over time"
    await expect(viewer.historyHeading).toHaveText('Photos with no area');
    await expect(page.getByText('Same spot over time')).toHaveCount(0);
    // All three orientations (and none) are in the one group
    for (const photo of [a, b, c]) {
      await expect(viewer.historyItem(photo.photoId)).toBeVisible();
    }

    // Stepping to a photo of another orientation keeps the group (no re-fetch of a spot)
    await viewer.historyItem(b.photoId).click();
    await expect(viewer.orientation).toHaveText(`O2-${id}`);
    await expect(viewer.title).toHaveText('No area');

    // Every cell of the 'No area' row opens the group, at that cell's latest photo
    const photos = new PhotosPage(page);
    await photos.goto();
    await photos.spotLink('none', o2Id).click();
    await expect(page).toHaveURL(
      (u) => u.pathname === '/photos/spot/none/none' && u.searchParams.get('photo') === b.photoId,
    );
    await expect(viewer.title).toHaveText('No area');

    // An old /none/<orientation> link still works: that orientation's no-area photos
    await viewer.goto('none', o1Id);
    await expect(viewer.title).toHaveText(`No area · O1-${id}`);
    await viewer.openDetails();
    await expect(viewer.historyHeading).toHaveText('Photos with no area');
    await expect(viewer.historyItems).toHaveCount(1);
    await expect(viewer.historyItem(a.photoId)).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 18. AC7: area names link to the Areas index
  // ───────────────────────────────────────────────────────────────────────────
  test('AC7: an area row header / heading links to the Areas index and Back returns to Photos', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const s = await seed(page, `${testPrefix}-${testInfo.testId}`.slice(0, 40), cleanup);
    const photos = new PhotosPage(page);
    const areas = new AreasIndexPage(page);
    await photos.goto();

    const link = photos.areaLink(s.childId);
    await expect(link).toHaveAccessibleName(`${s.childName}, open in Areas`);
    await expect(link).toHaveAttribute('href', '/areas');
    // The root band of a group links too (table only: the band is a table row)
    if (!isNarrow(page)) {
      await expect(photos.areaLink(s.parentId)).toHaveAccessibleName(
        `${s.parentName}, open in Areas`,
      );
    }

    await link.click();
    await expect(page).toHaveURL((u) => u.pathname === '/areas');
    await expect(areas.heading).toBeVisible();

    // Browser Back returns to Photos (the link pushed one history entry)
    await page.goBack();
    await expect(page).toHaveURL((u) => u.pathname === '/photos');
    await expect(photos.heading).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 19. AC8: Annotate in the spot viewer
  // ───────────────────────────────────────────────────────────────────────────
  test('AC8: Annotate opens the annotate dialog; Cancel closes it and focus returns to Annotate', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const s = await seed(page, `${testPrefix}-${testInfo.testId}`.slice(0, 40), cleanup);
    const viewer = new PhotoSpotViewerPage(page);
    const annotator = new PhotoViewerPage(page);
    await viewer.goto(s.childId, s.o1Id, s.photoIds[0]);

    await expect(viewer.annotateButton).toHaveText('Annotate');
    await expect(viewer.annotateButton).not.toHaveAttribute('aria-disabled', 'true');
    await viewer.annotateButton.click();

    await expect(page.getByTestId('photo-annotate-dialog')).toBeVisible();
    await expect(annotator.cancelButton).toBeVisible();
    await annotator.cancelButton.click();

    await expect(page.getByTestId('photo-annotate-dialog')).toHaveCount(0);
    await expect(viewer.annotateButton).toBeFocused();
    await expect(viewer.position).toHaveText('1 of 3');
  });

  test('AC8: on a signed entry Annotate is aria-disabled with a visible reason', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const id = `${testPrefix}-${testInfo.testId}`.slice(0, 40);
    const o1Id = await createOrientationViaApi(page, { name: `O1-${id}` });
    cleanup.orientations.push(o1Id);
    // A signed entry takes no new photos: attach to the signed draft, then promote (locks it)
    const draftId = await createDraftDiaryEntryViaApi(page, {
      entryType: 'daily_log',
      entryDate: '2026-04-03',
      metadata: {
        signatures: [
          { signerName: 'E2E Signer', signerType: 'self', signatureDataUrl: TINY_PNG_DATA_URL },
        ],
      },
    });
    cleanup.entries.push(draftId);
    const photoId = await uploadDiaryPhotoViaApi(page, draftId, { orientationId: o1Id });
    const promoted = await page.request.patch(`/api/diary-entries/${draftId}/promote`, {
      data: { title: `Signed-${id}`, body: 'Signed entry with a photo.' },
    });
    expect(promoted.ok(), `promote signed draft: ${promoted.status()}`).toBeTruthy();

    const viewer = new PhotoSpotViewerPage(page);
    await viewer.goto('none', o1Id, photoId);
    await expect(viewer.position).toHaveText('1 of 1');

    await expect(viewer.annotateButton).toHaveAttribute('aria-disabled', 'true');
    await expect(viewer.annotateButton).not.toHaveAttribute('disabled', '');
    await expect(viewer.annotateReason).toBeVisible();
    await expect(viewer.annotateReason).not.toBeEmpty();
    const reasonId = await viewer.annotateReason.getAttribute('id');
    expect(reasonId).toBeTruthy();
    await expect(viewer.annotateButton).toHaveAttribute('aria-describedby', reasonId as string);

    // A click does nothing (`force`: Playwright treats aria-disabled as not enabled)
    await viewer.annotateButton.click({ force: true });
    await expect(page.getByTestId('photo-annotate-dialog')).toHaveCount(0);
    await expect(viewer.position).toHaveText('1 of 1');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 20. AC8 (phone): immersive viewer, chrome toggles on tap
  // ───────────────────────────────────────────────────────────────────────────
  test('Phone: the shell bars are gone in the viewer and a tap on the photo toggles the chrome', async ({
    page,
    testPrefix,
  }, testInfo) => {
    test.skip(!isNarrow(page), 'Phone only');
    const s = await seed(page, `${testPrefix}-${testInfo.testId}`.slice(0, 40), cleanup);
    const photos = new PhotosPage(page);
    const viewer = new PhotoSpotViewerPage(page);
    const shell = new AppShellPage(page);

    await photos.goto();
    await expect(shell.topBar).toBeVisible();
    await expect(shell.bottomBar).toBeVisible();

    await photos.spotLink(s.childId, s.o1Id).click();
    await expect(viewer.position).toHaveText('1 of 3');

    // The shell bars are not rendered at all (out of the tab order and the accessibility tree)
    await expect(shell.topBar).toHaveCount(0);
    await expect(shell.bottomBar).toHaveCount(0);

    // The chrome is on screen; a tap on the photo hides it, the next tap shows it again
    await expect(viewer.backLink).toBeVisible();
    await expect(viewer.toolbar).toBeVisible();
    await expect(viewer.topBar).toHaveCSS('opacity', '1');
    await viewer.image.tap();
    // Hidden chrome is faded out and ignores pointers (it stays in the accessibility tree)
    for (const chrome of [viewer.topBar, viewer.toolbar, viewer.prevButton]) {
      await expect(chrome).toHaveCSS('opacity', '0');
      await expect(chrome).toHaveCSS('pointer-events', 'none');
    }
    await viewer.image.tap();
    for (const chrome of [viewer.topBar, viewer.toolbar, viewer.prevButton]) {
      await expect(chrome).toHaveCSS('opacity', '1');
    }
    await expect(viewer.backLink).toBeVisible();
    await expect(viewer.toolbar).toBeVisible();

    // Details opens the sheet
    await viewer.detailsButton.click();
    await expect(viewer.detailsSheet).toBeVisible();
    await expect(viewer.date).toHaveText('August 20, 2026');
    await page.keyboard.press('Escape');
    await expect(viewer.detailsPanel).toHaveCount(0);

    // Back returns to the Photos page with both bars again
    await viewer.backLink.click();
    await expect(page).toHaveURL((u) => u.pathname === '/photos');
    await expect(shell.topBar).toBeVisible();
    await expect(shell.bottomBar).toBeVisible();
  });

  test('Desktop/tablet: the shell stays and there is no Details button', async ({
    page,
    testPrefix,
  }, testInfo) => {
    test.skip(isNarrow(page), 'Wide layouts only');
    const s = await seed(page, `${testPrefix}-${testInfo.testId}`.slice(0, 40), cleanup);
    const viewer = new PhotoSpotViewerPage(page);
    await viewer.goto(s.childId, s.o1Id, s.photoIds[0]);
    await expect(viewer.position).toHaveText('1 of 3');
    await expect(viewer.detailsButton).toHaveCount(0);
    await expect(viewer.detailsPanel).toBeVisible();
    await expect(viewer.editTagsButton).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 21. Dark mode smoke
  // ───────────────────────────────────────────────────────────────────────────
  test('Dark mode renders the select tiles and the viewer chrome', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const id = `${testPrefix}-${testInfo.testId}`.slice(0, 40);
    const s = await seed(page, id, cleanup);
    const none = await seedNoAreaPhoto(page, cleanup, { date: '2026-04-04', title: `Dark-${id}` });
    await page.emulateMedia({ colorScheme: 'dark' });
    const photos = new PhotosPage(page);
    const viewer = new PhotoSpotViewerPage(page);

    await photos.goto();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await photos.startSelecting();
    await expect(photos.selectTile(none.photoId)).toBeVisible();
    await photos.selectPhotos([none.photoId]);
    await expect(photos.selectionBar).toBeVisible();
    await expect(photos.setTagsButton).toBeVisible();
    // The selection bar does not paint a light surface in dark mode
    const barBackground = await photos.selectionBar.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(barBackground).not.toBe('rgb(255, 255, 255)');

    await viewer.goto(s.childId, s.o1Id, s.photoIds[0]);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(viewer.title).toBeVisible();
    await expect(viewer.annotateButton).toBeVisible();
    await expect(viewer.position).toHaveText('1 of 3');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 22. German locale for the #2226 strings
  // ───────────────────────────────────────────────────────────────────────────
  test('German locale: select toggle, area link, No area group viewer and Edit tags', async ({
    page,
    browser,
    testPrefix,
  }, testInfo) => {
    const id = `${testPrefix}-${testInfo.testId}`.slice(0, 40);
    const s = await seed(page, id, cleanup);
    const none = await seedNoAreaPhoto(page, cleanup, { date: '2026-04-05', title: `De-${id}` });

    const context = await browser.newContext({
      locale: 'de-DE',
      viewport: page.viewportSize() ?? undefined,
      storageState: 'test-results/.auth/admin.json',
    });
    const p = await context.newPage();
    try {
      const photos = new PhotosPage(p);
      const viewer = new PhotoSpotViewerPage(p);
      await p.goto(routeUrl('photos'));
      await expect(p.getByRole('heading', { level: 1, name: 'Fotos', exact: true })).toBeVisible();

      await expect(photos.noAreaToggle).toHaveText('Fotos auswählen');
      await expect(photos.areaLink(s.childId)).toHaveAccessibleName(
        `${s.childName}, in Bereiche öffnen`,
      );
      await expect(p.locator('body')).not.toContainText(/Unsorted|Tidy|Select photos/);

      await photos.noAreaToggle.click();
      await expect(photos.noAreaToggle).toHaveText('Fertig');
      await expect(p.getByRole('group', { name: 'Fotos ohne Bereich' })).toBeVisible();

      // The group viewer and the tag editor
      await p.goto(
        routeUrl('photoSpot', { areaKey: 'none', orientationKey: 'none' }, { photo: none.photoId }),
      );
      await expect(viewer.title).toHaveText('Kein Bereich');
      await viewer.openDetails();
      await expect(viewer.historyHeading).toHaveText('Fotos ohne Bereich');
      await expect(viewer.editTagsButton).toHaveText('Zuordnung bearbeiten');
      await expect(viewer.annotateButton).not.toHaveText('Annotate');
      // No raw translation keys anywhere
      await expect(p.locator('body')).not.toContainText(/\b(photos|photoViewer):[a-zA-Z.]+/);
      await expect(p.locator('body')).not.toContainText(/\b(viewer|select|bulk|spots)\.[a-zA-Z]+/);
    } finally {
      await context.close();
    }
  });
});
