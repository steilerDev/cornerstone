/**
 * E2E: photo viewer layout guards (#2225, EPIC-21 P2.6).
 *
 * Before #2225 the Previous / Next arrows could sit on top of the details panel, its toggle or
 * Close (the arrows were stacked under the panel, so taps hit the wrong control). These tests
 * measure the real bounding boxes at three widths and fail on any overlap. They run in the
 * desktop project only and set the viewport explicitly, so one run covers all three widths.
 *
 * Scenarios:
 *  V1  1280, 768 and 390px, details panel closed and open: the arrows never overlap the panel,
 *      its Details button or Close; Annotate shows the visible text "Annotate"
 *  V2  a signed entry: Annotate is aria-disabled, a click does not open the annotator, and the
 *      reason is visible text in the info bar
 */

import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { PhotoViewerPage } from '../../pages/PhotoViewerPage.js';
import { todayIso } from '../../fixtures/captureSeed.js';
import {
  createDiaryEntryViaApi,
  createDraftDiaryEntryViaApi,
  deleteDiaryEntryViaApi,
  uploadDiaryPhotoViaApi,
} from '../../fixtures/apiHelpers.js';

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

const VIEWPORTS = [
  { name: '1280px', width: 1280, height: 800 },
  { name: '768px', width: 768, height: 1024 },
  { name: '390px', width: 390, height: 844 },
] as const;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The bounding box of a locator that must be on screen. */
async function boxOf(locator: Locator, label: string): Promise<Box> {
  await expect(locator, `${label} is visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} has a box`).not.toBeNull();
  return box as Box;
}

async function openViewer(page: Page, firstPhotoId: string): Promise<PhotoViewerPage> {
  const viewer = new PhotoViewerPage(page);
  const card = page.getByTestId(`photo-card-${firstPhotoId}`);
  await expect(card).toBeVisible();
  await card.click();
  await expect(viewer.modal).toBeVisible();
  await expect(viewer.annotateButton).toBeVisible();
  return viewer;
}

test.describe('Photo viewer layout (#2225)', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright needs the destructuring to declare no fixtures
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Sets its own viewports; desktop project only');
  });

  for (const viewport of VIEWPORTS) {
    test(`V1: arrows never overlap the details panel, its Details button or Close at ${viewport.name}`, async ({
      page,
      testPrefix,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const entry = new DiaryEntryDetailPage(page);
      const id = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: todayIso(),
        title: `${testPrefix} viewer layout`,
        body: 'Two photos for the viewer.',
      });
      try {
        const first = await uploadDiaryPhotoViaApi(page, id, { caption: 'First photo' });
        await uploadDiaryPhotoViaApi(page, id, { caption: 'Second photo' });
        await entry.goto(id);
        await expect(entry.loaded).toBeVisible();
        const viewer = await openViewer(page, first);

        // The Annotate label is visible text, not an icon-only button
        await expect(viewer.annotateButton).toHaveText('Annotate');
        await expect(page.getByRole('button', { name: 'Annotate', exact: true })).toBeVisible();

        const narrow = viewport.width < 768;
        // Wide: the details panel is always shown. Narrow: it is a bottom sheet behind the Details button.
        const states: Array<'closed' | 'open'> = narrow ? ['closed', 'open'] : ['open'];
        for (const state of states) {
          if (narrow && state === 'open') {
            await viewer.detailsButton.click();
            await expect(viewer.detailsPanel).toBeVisible();
          }
          const label = `${viewport.name} panel ${state}`;
          const prev = await boxOf(viewer.prevButton, `${label}: Previous`);
          const next = await boxOf(viewer.nextButton, `${label}: Next`);
          const close = await boxOf(viewer.closeButton, `${label}: Close`);
          const others: Array<[string, Box]> = [['Close', close]];
          if (await viewer.detailsPanel.isVisible()) {
            others.push(['details panel', await boxOf(viewer.detailsPanel, `${label}: panel`)]);
          }
          if (await viewer.detailsButton.isVisible()) {
            others.push([
              'Details button',
              await boxOf(viewer.detailsButton, `${label}: Details button`),
            ]);
          }
          for (const [name, box] of others) {
            expect(intersects(prev, box), `${label}: Previous overlaps ${name}`).toBe(false);
            expect(intersects(next, box), `${label}: Next overlaps ${name}`).toBe(false);
          }
          // The arrows are on screen
          expect(prev.x).toBeGreaterThanOrEqual(0);
          expect(next.x + next.width).toBeLessThanOrEqual(viewport.width);
        }
      } finally {
        await deleteDiaryEntryViaApi(page, id);
      }
    });
  }

  test('V2: on a signed entry Annotate is aria-disabled, does nothing and says why', async ({
    page,
    testPrefix,
  }) => {
    const entry = new DiaryEntryDetailPage(page);
    // A signed entry takes no new photos: attach the photo to the signed draft, then promote it
    // (promoting locks the entry, #2124)
    const id = await createDraftDiaryEntryViaApi(page, {
      entryType: 'daily_log',
      entryDate: todayIso(),
      metadata: {
        signatures: [
          { signerName: 'E2E Signer', signerType: 'self', signatureDataUrl: TINY_PNG_DATA_URL },
        ],
      },
    });
    try {
      const photoId = await uploadDiaryPhotoViaApi(page, id);
      const promoted = await page.request.patch(`/api/diary-entries/${id}/promote`, {
        data: { title: `${testPrefix} signed viewer`, body: 'Signed entry with a photo.' },
      });
      expect(promoted.ok(), `promote signed draft: ${promoted.status()}`).toBeTruthy();
      await entry.goto(id);
      await expect(entry.loaded).toBeVisible();
      const viewer = await openViewer(page, photoId);

      await expect(viewer.annotateButton).toHaveAttribute('aria-disabled', 'true');
      await expect(viewer.annotateButton).not.toHaveAttribute('disabled', '');
      await expect(viewer.annotateReason).toBeVisible();
      await expect(viewer.annotateReason).not.toBeEmpty();
      // The reason is tied to the button
      const reasonId = await viewer.annotateReason.getAttribute('id');
      expect(reasonId).toBeTruthy();
      await expect(viewer.annotateButton).toHaveAttribute('aria-describedby', reasonId as string);

      // A click does nothing: no annotator opens, the viewer stays. (`force`: Playwright treats
      // aria-disabled as "not enabled" and would otherwise wait for it forever.)
      await viewer.annotateButton.click({ force: true });
      await expect(viewer.toolPalette).toHaveCount(0);
      await expect(viewer.modal).toBeVisible();
    } finally {
      await deleteDiaryEntryViaApi(page, id);
    }
  });
});
