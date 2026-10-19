/**
 * E2E: the Site diary entry page, re-laid out in #2225 (EPIC-21 P2.6).
 *
 * Order (manual entry): actions bar (Edit, Add photos, "..." menu) -> photos first -> meta line
 * (type badge - date - "by <name>") -> h1 -> text -> Site details -> signatures (only when
 * present) -> Areas chips -> "Related to" -> History (collapsed).
 *
 * Scenarios:
 *  E1  photos above the title; meta line; title fallback; Site details; signatures only if signed
 *  E2  an area chip opens the Areas page; History is collapsed and opens on click
 *  E3  "..." > Delete > confirm deletes the entry and returns to the Site diary
 *  E4  Edit and Add photos both open the capture screen of the entry
 *
 * Synthetic data only; every entry is created and removed by the test that uses it.
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { DiaryPage } from '../../pages/DiaryPage.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { seedDiaryFeed } from '../../fixtures/diaryFeedSeed.js';
import { todayIso } from '../../fixtures/captureSeed.js';
import { createDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

test.describe('Diary entry page (#2225)', { tag: '@responsive' }, () => {
  test('E1: photos come first, then the meta line and the title; site details; no signatures', async ({
    page,
    testPrefix,
  }) => {
    const entry = new DiaryEntryDetailPage(page);
    const seed = await seedDiaryFeed(page, testPrefix, { photoCount: 2 });
    try {
      // The photo note has two photos; the daily log has Site details but no photos
      await entry.goto(seed.photoNoteId);
      await expect(entry.loaded).toBeVisible();

      // Photos first: the first photo sits above the h1
      const firstPhoto = page.getByTestId(`photo-card-${seed.photoNotePhotoIds[0]}`);
      await expect(firstPhoto).toBeVisible();
      const photoBox = await firstPhoto.boundingBox();
      const titleBox = await entry.heading.boundingBox();
      expect(photoBox).not.toBeNull();
      expect(titleBox).not.toBeNull();
      if (photoBox && titleBox) expect(photoBox.y).toBeLessThan(titleBox.y);

      // The title is the entry's title; the meta line reads "<Type> - <date> - by <name>"
      await expect(entry.heading).toHaveText(seed.photoNoteTitle);
      await expect(entry.typeBadge).toHaveText('Note');
      await expect(entry.metaLine).toContainText(/by .+/);
      // No signatures on an unsigned entry
      await expect(entry.signatureSection).toHaveCount(0);

      // Site details of the daily log: workers and company
      await entry.goto(seed.dailyLogId);
      await expect(entry.loaded).toBeVisible();
      await expect(entry.metadataSection).toBeVisible();
      await expect(entry.dailyLogMetadata).toContainText('2 workers');
      await expect(entry.dailyLogMetadata).toContainText(seed.companyName);
      // A text-only entry has no photos: the dashed placeholder offers Add photos
      await expect(entry.photoEmptyState).toBeVisible();
    } finally {
      await seed.cleanup();
    }
  });

  test('E1b: an entry without a title falls back to "<Type> - <date>"', async ({
    page,
    testPrefix,
  }) => {
    const entry = new DiaryEntryDetailPage(page);
    const id = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: todayIso(),
      body: `${testPrefix} untitled note`,
    });
    try {
      await entry.goto(id);
      await expect(entry.loaded).toBeVisible();
      await expect(entry.heading).toHaveText(/^Note · .+/);
    } finally {
      await deleteDiaryEntryViaApi(page, id);
    }
  });

  test('E1c: a signed entry shows its signature and no Edit / Add photos', async ({
    page,
    testPrefix,
  }) => {
    const entry = new DiaryEntryDetailPage(page);
    const id = await createDiaryEntryViaApi(page, {
      entryType: 'daily_log',
      entryDate: todayIso(),
      title: `${testPrefix} signed log`,
      body: 'Signed by the site manager.',
      metadata: {
        signatures: [
          {
            signerName: 'E2E Signer',
            signerType: 'self',
            signatureDataUrl: TINY_PNG_DATA_URL,
          },
        ],
      },
    });
    try {
      await entry.goto(id);
      await expect(entry.loaded).toBeVisible();
      await expect(entry.signatureSection).toBeVisible();
      await expect(entry.signatureSection).toContainText('E2E Signer');
      // Locked: no Edit, no Add photos; Delete stays in the menu
      await expect(entry.editButton).toHaveCount(0);
      await expect(entry.addPhotosButton).toHaveCount(0);
      await expect(entry.moreMenu).toBeVisible();
    } finally {
      await deleteDiaryEntryViaApi(page, id);
    }
  });

  test('E2: an area chip opens the Areas page; History is collapsed and opens on click', async ({
    page,
    testPrefix,
  }) => {
    const entry = new DiaryEntryDetailPage(page);
    const seed = await seedDiaryFeed(page, testPrefix, { photoCount: 1 });
    try {
      await entry.goto(seed.photoNoteId);
      await expect(entry.loaded).toBeVisible();

      // History: closed by default, opens on click, holds Created
      await expect(entry.historySection).toBeVisible();
      await expect(entry.historySection).not.toHaveAttribute('open', '');
      await expect(entry.historySection.getByText('Created:')).toBeHidden();
      await entry.historySummary.click();
      await expect(entry.historySection).toHaveAttribute('open', '');
      await expect(entry.historySection.getByText('Created:')).toBeVisible();

      // The area chip shows the path and opens the area
      const chip = page.getByTestId(`diary-entry-area-${seed.areaId}`);
      await expect(entry.areasSection).toBeVisible();
      await expect(chip).toContainText(seed.parentAreaName);
      await expect(chip).toContainText(seed.areaName);
      await chip.click();
      // The area page is not built yet: chips open the Areas page (interim until P5.7)
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('areas'));
    } finally {
      await seed.cleanup();
    }
  });

  test('E3: "..." then Delete then confirm deletes the entry and returns to the Site diary', async ({
    page,
    testPrefix,
  }) => {
    const entry = new DiaryEntryDetailPage(page);
    const diary = new DiaryPage(page);
    const id = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: todayIso(),
      title: `${testPrefix} entry to delete`,
      body: 'Delete me.',
    });
    let deleted = false;
    try {
      await entry.goto(id);
      await expect(entry.loaded).toBeVisible();

      await entry.moreMenu.click();
      await expect(entry.deleteItem).toBeVisible();
      await entry.deleteItem.click();
      await expect(entry.deleteModal).toBeVisible();
      await entry.confirmDelete();

      await expect(page).toHaveURL((url) => url.pathname === routeUrl('diary'));
      await expect(diary.heading).toBeVisible();
      const gone = await page.request.get(`/api/diary-entries/${id}`);
      expect(gone.status()).toBe(404);
      deleted = true;
    } finally {
      if (!deleted) await deleteDiaryEntryViaApi(page, id);
    }
  });

  test('E4: Edit and Add photos both open the capture screen of the entry', async ({
    page,
    testPrefix,
  }) => {
    const entry = new DiaryEntryDetailPage(page);
    const id = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: todayIso(),
      title: `${testPrefix} entry to edit`,
      body: 'Edit me.',
    });
    try {
      await entry.goto(id);
      await expect(entry.loaded).toBeVisible();
      await expect(entry.editButton).toHaveAttribute('href', routeUrl('diaryEntryEdit', { id }));
      await expect(entry.addPhotosButton).toHaveAttribute(
        'href',
        routeUrl('diaryEntryEdit', { id }),
      );

      await entry.editButton.click();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('diaryEntryEdit', { id }));

      await entry.goto(id);
      await entry.addPhotosButton.click();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('diaryEntryEdit', { id }));
    } finally {
      await deleteDiaryEntryViaApi(page, id);
    }
  });
});
