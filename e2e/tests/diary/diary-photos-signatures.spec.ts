/**
 * E2E tests for diary photo attachments and signature capture features.
 *
 * Story #806: Photo attachments on diary entries
 * Story #807: Signature capture for diary entries
 *
 * Scenarios covered:
 * 1.  [smoke] Photo section heading is rendered on the diary entry detail page
 * 2.  Photo empty state shown when no photos are attached
 * 3.  Photo strip (up to 5 thumbnails + "+n") on the entry row when photoCount > 0 (mock API)
 * 4.  "Add photos" link navigates from detail page to edit page (for non-signed entries)
 * 5.  Photo controls are visible on the capture screen (edit URL)
 * 6.  [responsive] Photo section renders without horizontal scroll
 * 7.  Signature section is NOT shown when entry has no signatures
 * 8.  Signature section is rendered when entry metadata contains signatures (mock API)
 * 9.  Edit / Add photos are hidden for a signed entry; Delete stays in the "..." menu (mock API)
 * 10. "Add photos" link is hidden for signed entries (isSigned=true)
 * 11. Unfinished signature blocks promote client-side (#2088)
 * 12. [responsive] Signed draft survives leave-and-return, promotes, then locks (#2124)
 * 13. Issue entry with a drawn signature autosaves and promotes (#2125)
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';
import { DiaryPage } from '../../pages/DiaryPage.js';
import { API } from '../../fixtures/testData.js';
import { stubUnfinishedEmpty } from '../../fixtures/diaryMocks.js';
import {
  createDiaryEntryViaApi,
  createDraftDiaryEntryViaApi,
  deleteDiaryEntryViaApi,
} from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMockEntryDetail(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'mock-entry-photos-001',
    entryType: 'general_note',
    entryDate: '2026-03-14',
    title: 'Mock Entry with Photos',
    body: 'This entry has photo data.',
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    sourceEntityType: null,
    sourceEntityId: null,
    photoCount: 0,
    createdBy: { id: 'user-1', displayName: 'E2E Admin' },
    createdAt: '2026-03-14T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z',
    ...overrides,
  };
}

function makeMockListEntry(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'mock-entry-photos-001',
    entryType: 'general_note',
    entryDate: '2026-03-14',
    title: 'Mock Entry with Photo Count',
    body: 'This entry has photos attached.',
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    sourceEntityType: null,
    sourceEntityId: null,
    photoCount: 3,
    thumbnails: [],
    photoAreas: [],
    createdBy: { id: 'user-1', displayName: 'E2E Admin' },
    createdAt: '2026-03-14T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z',
    ...overrides,
  };
}

/** n thumbnail descriptors as the list endpoint sends them (the images need not exist). */
function mockThumbnails(count: number): Array<{ id: string; thumbnailUrl: string }> {
  return Array.from({ length: count }, (_, i) => ({
    id: `mock-thumb-${i}`,
    thumbnailUrl: `/api/photos/mock-thumb-${i}/thumbnail`,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Photo section heading on detail page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Photo section heading (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Diary detail page always renders the Photos section heading',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new DiaryEntryDetailPage(page);
      let createdId: string | null = null;

      try {
        createdId = await createDiaryEntryViaApi(page, {
          entryType: 'general_note',
          entryDate: '2026-03-14',
          body: `${testPrefix} photo section heading test`,
        });

        await detailPage.goto(createdId);
        await expect(detailPage.loaded).toBeVisible();

        // Photo section should always be rendered
        await expect(detailPage.photoSection).toBeVisible();

        // Heading should read "Photos (0)" since no photos are attached
        const headingText = await detailPage.photoHeading.textContent();
        expect(headingText).toContain('Photos');
      } finally {
        if (createdId) await deleteDiaryEntryViaApi(page, createdId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Photo empty state when no photos attached
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Photo empty state (Scenario 2)', () => {
  test('Detail page shows "No photos attached yet." when photoCount is 0', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} no photos test`,
      });

      await detailPage.goto(createdId);
      await expect(detailPage.loaded).toBeVisible();

      // Empty state text must be present
      await expect(detailPage.photoEmptyState).toBeVisible();
      const emptyText = await detailPage.photoEmptyState.textContent();
      expect(emptyText?.toLowerCase()).toContain('no photos');
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Photo count indicator on entry card when photoCount > 0 (mock)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Photo strip on the entry row (Scenario 3)', () => {
  test('A row with photos shows up to 5 thumbnails and a "+n" tile (mock API)', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);
    const mockId = 'mock-entry-photos-001';
    // 8 photos, 5 thumbnails sent by the list endpoint
    const mockEntry = makeMockListEntry({
      id: mockId,
      photoCount: 8,
      thumbnails: mockThumbnails(5),
    });

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [mockEntry],
            pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
          }),
        });
      } else {
        await route.continue();
      }
    });
    await stubUnfinishedEmpty(page);

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      await expect(diaryPage.entryCard(mockId)).toBeVisible();
      await expect(diaryPage.thumbs(mockId)).toBeVisible();
      await expect(diaryPage.thumbImages(mockId)).toHaveCount(5);
      await expect(diaryPage.thumbs(mockId)).toContainText('+3');
      // The strip is decorative; the row announces the photo count in text
      await expect(diaryPage.entryCard(mockId)).toContainText('8 photos');
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });

  test('A row without photos has no strip (mock API)', async ({ page }) => {
    const diaryPage = new DiaryPage(page);
    const mockId = 'mock-entry-no-photos-002';
    const mockEntry = makeMockListEntry({ id: mockId, photoCount: 0 });

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [mockEntry],
            pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
          }),
        });
      } else {
        await route.continue();
      }
    });
    await stubUnfinishedEmpty(page);

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      await expect(diaryPage.entryCard(mockId)).toBeVisible();
      await expect(diaryPage.thumbs(mockId)).toHaveCount(0);
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: "Add photos" link navigates to edit page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('"Add photos" link navigation (Scenario 4)', () => {
  test('"Add photos" link navigates to the edit page for non-signed entries', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} add photos link test`,
      });

      await detailPage.goto(createdId);
      await expect(detailPage.loaded).toBeVisible();

      // The actions bar and the empty photo placeholder both offer "Add photos" (same target)
      await expect(detailPage.photoEmptyState).toBeVisible();
      const addPhotosLink = detailPage.addPhotosButton;
      await expect(addPhotosLink).toBeVisible();

      // Clicking navigates to the edit page
      await addPhotosLink.click();
      await page.waitForURL(`**/diary/${createdId}/edit`);
      expect(page.url()).toContain(`/diary/${createdId}/edit`);
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: The photo controls are on the capture screen (edit URL)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Photo section on edit page (Scenario 5)', { tag: '@responsive' }, () => {
  test('Edit page renders the photo controls for an existing entry', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} photo section on edit test`,
      });

      const capture = new DiaryCapturePage(page);
      await capture.gotoEdit(createdId);

      // The photo controls (Choose from library) are on screen
      await expect(capture.heading).toContainText('Edit entry');
      await expect(capture.chooseButton).toBeVisible();
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Responsive — photo section no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive — photo section (Scenario 6)', { tag: '@responsive' }, () => {
  test('Diary detail page with photo section renders without horizontal scroll', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} photo responsive test`,
      });

      await detailPage.goto(createdId);
      await expect(detailPage.loaded).toBeVisible();
      await expect(detailPage.photoSection).toBeVisible();

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Signature section not shown when no signatures exist
// ─────────────────────────────────────────────────────────────────────────────
test.describe('No signature section without signatures (Scenario 7)', () => {
  test('Signature section is not visible when entry has no signatures in metadata', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} no signature test`,
      });

      await detailPage.goto(createdId);
      await expect(detailPage.loaded).toBeVisible();

      // signatureSection is conditionally rendered only when signatures[] is non-empty
      await expect(detailPage.signatureSection).not.toBeVisible();
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Signature section rendered when metadata contains signatures (mock)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Signature rendered in detail view (Scenario 8)', () => {
  test('Signature section is visible when entry has a signature in metadata (mock API)', async ({
    page,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    const mockId = 'mock-entry-sig-001';

    // A 1x1 white PNG as a minimal data URL (avoids canvas/browser rendering)
    const MINIMAL_PNG_DATA_URL =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

    const mockEntry = makeMockEntryDetail({
      id: mockId,
      entryType: 'daily_log',
      isSigned: true,
      metadata: {
        weather: 'sunny',
        signatures: [
          {
            signerName: 'Site Manager',
            signerType: 'self',
            signatureDataUrl: MINIMAL_PNG_DATA_URL,
          },
        ],
      },
    });

    // Mock the photos endpoint to return empty (signature entry may still call photos)
    // The /api/photos endpoint returns { photos: [] } not [] directly
    await page.route(`**/api/photos*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ photos: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API.diaryEntries}/${mockId}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockEntry),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await detailPage.goto(mockId);
      await expect(detailPage.loaded).toBeVisible();

      // Signature section should be rendered
      await expect(detailPage.signatureSection).toBeVisible();
    } finally {
      await page.unroute(`${API.diaryEntries}/${mockId}`);
      await page.unroute('**/api/photos*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Edit hidden (but Delete still shown) for signed entries (isSigned=true)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit hidden for signed entries (Scenario 9)', () => {
  test('Edit link is NOT rendered for signed entries; Delete is still shown (mock API)', async ({
    page,
  }) => {
    // UAT fix #837: signed entries can still be deleted but cannot be edited.
    // The Delete button IS rendered for isSigned=true entries.
    // Only the Edit link is hidden.
    const detailPage = new DiaryEntryDetailPage(page);
    const mockId = 'mock-entry-signed-001';
    const mockEntry = makeMockEntryDetail({ id: mockId, isSigned: true });

    // The /api/photos endpoint returns { photos: [] } not [] directly
    await page.route(`**/api/photos*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ photos: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API.diaryEntries}/${mockId}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockEntry),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await detailPage.goto(mockId);
      await expect(detailPage.loaded).toBeVisible();

      // Edit must NOT be rendered for signed entries (cannot edit a signed entry)
      await expect(detailPage.editButton).not.toBeVisible();

      // Delete IS still offered for signed entries (UAT fix #837), now inside the "..." menu
      await expect(detailPage.addPhotosButton).not.toBeVisible();
      await expect(detailPage.moreMenu).toBeVisible();
      await detailPage.moreMenu.click();
      await expect(detailPage.deleteItem).toBeVisible();
    } finally {
      await page.unroute(`${API.diaryEntries}/${mockId}`);
      await page.unroute('**/api/photos*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Photo section visibility for signed and automatic entries
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Photo section visibility (Scenario 10)', () => {
  // UAT R3 fix #875: Photo section is hidden entirely when signed + no photos,
  // and hidden entirely for automatic entries.
  test('Photo section is hidden for signed entries with no photos (isSigned=true) (mock API)', async ({
    page,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    const mockId = 'mock-entry-signed-nophoto-001';
    const mockEntry = makeMockEntryDetail({ id: mockId, isSigned: true, photoCount: 0 });

    await page.route(`**/api/photos*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ photos: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API.diaryEntries}/${mockId}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockEntry),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await detailPage.goto(mockId);
      await expect(detailPage.loaded).toBeVisible();

      // Photo section should be entirely hidden for signed entries with no photos
      await expect(page.getByRole('link', { name: /Add photos/i })).not.toBeVisible();
    } finally {
      await page.unroute(`${API.diaryEntries}/${mockId}`);
      await page.unroute('**/api/photos*');
    }
  });

  test('"Add photos" link is NOT shown for automatic entries (isAutomatic=true) (mock API)', async ({
    page,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    const mockId = 'mock-entry-auto-nophoto-001';
    const mockEntry = makeMockEntryDetail({
      id: mockId,
      isAutomatic: true,
      isSigned: false,
      photoCount: 0,
    });

    // The /api/photos endpoint returns { photos: [] } not [] directly
    await page.route(`**/api/photos*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ photos: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API.diaryEntries}/${mockId}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockEntry),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await detailPage.goto(mockId);
      await expect(detailPage.loaded).toBeVisible();

      // UAT R3 fix #875: entire photo section is hidden for automatic entries
      await expect(page.getByRole('link', { name: /Add photos/i })).not.toBeVisible();
    } finally {
      await page.unroute(`${API.diaryEntries}/${mockId}`);
      await page.unroute('**/api/photos*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: Unfinished signature blocks promote (#2088)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Unfinished signature blocks promote (#2088)', () => {
  test('promote is blocked client-side until the pending signature is removed', async ({
    page,
  }) => {
    const capture = new DiaryCapturePage(page);
    const id = await createDraftDiaryEntryViaApi(page, { entryType: 'daily_log' });

    // Promote is sent as PATCH /api/diary-entries/:id/promote
    const promoteRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes(`/api/diary-entries/${id}/promote`)) {
        promoteRequests.push(`${req.method()} ${req.url()}`);
      }
    });

    try {
      await capture.gotoEdit(id);
      await capture.typeText('Daily log with an unfinished signature');

      await capture.openMoreDetails();
      await capture.tap(capture.addSignatureButton);
      await capture.vendorSignerRadio.check();

      await capture.tap(capture.saveButton);

      await expect(capture.signatureError).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/diary/${id}/edit$`));
      expect(promoteRequests).toHaveLength(0);

      // Removing the pending signature unblocks promote
      await capture.tap(capture.removeSignatureButton);
      await capture.saveEntry();

      await expect(page).toHaveURL(new RegExp(`/diary/${id}$`));
      expect(promoteRequests.length).toBeGreaterThan(0);
    } finally {
      await deleteDiaryEntryViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: Signed draft survives leave-and-return (#2124)
// ─────────────────────────────────────────────────────────────────────────────

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

test.describe('Signed draft survives leave-and-return (#2124)', { tag: '@responsive' }, () => {
  test('signed draft stays editable, autosaves, reopens from the list, promotes, then locks', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
    const detailPage = new DiaryEntryDetailPage(page);
    const diaryPage = new DiaryPage(page);
    const id = await createDraftDiaryEntryViaApi(page, {
      entryType: 'daily_log',
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

    const forbidden: string[] = [];
    page.on('response', (resp) => {
      if (resp.url().includes('/api/diary-entries/') && resp.status() === 403) {
        forbidden.push(`${resp.request().method()} ${resp.url()}`);
      }
    });

    try {
      await capture.gotoEdit(id);
      await expect(page).toHaveURL(new RegExp(`/diary/${id}/edit$`));
      // A draft shows the capture form (not the signed EmptyState) and warns about the lock
      await expect(capture.saveButton).toHaveText('Save entry');
      await expect(capture.signedNote).toBeVisible();

      // Autosave PATCH must succeed (no 403 on a signed draft)
      const autosave = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/diary-entries/${id}`) &&
          !resp.url().includes('/promote') &&
          resp.request().method() === 'PATCH',
      );
      await capture.typeText(`${testPrefix} signed draft body`);
      await capture.textArea.blur();
      expect((await autosave).status()).toBe(200);

      // Leave and return via the draft card on the list
      await diaryPage.filterDraftsOnly();
      await diaryPage.entryLink(id).click();
      await expect(page).toHaveURL(new RegExp(`/diary/${id}/edit$`));
      await capture.waitForForm();
      await expect(capture.textArea).toHaveValue(`${testPrefix} signed draft body`);
      await expect(page.getByText('Signed entries cannot be edited')).not.toBeVisible();

      // Promote
      await capture.saveEntry();
      await expect(page).toHaveURL(new RegExp(`/diary/${id}$`));
      await expect(detailPage.signatureSection).toBeVisible();
      await expect(detailPage.editButton).not.toBeVisible();

      // Saved + signed is immutable
      const patch = await page.request.patch(`${API.diaryEntries}/${id}`, {
        data: { body: 'tampered' },
      });
      expect(patch.status()).toBe(403);
      const patchBody = (await patch.json()) as { error: { code: string } };
      expect(patchBody.error.code).toBe('IMMUTABLE_ENTRY');

      expect(forbidden).toHaveLength(0);
    } finally {
      await deleteDiaryEntryViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13: Issue entry with a drawn signature (#2125)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Issue entry signatures (#2125)', () => {
  test('a drawn signature autosaves, promotes, and locks the saved issue', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
    const detailPage = new DiaryEntryDetailPage(page);
    const id = await createDraftDiaryEntryViaApi(page, { entryType: 'issue' });

    try {
      await capture.gotoEdit(id);
      await capture.typeText(`${testPrefix} issue with signature`);
      await capture.tap(capture.severityChip('medium'));
      await capture.tap(capture.statusChip('open'));

      await capture.openMoreDetails();
      await capture.tap(capture.addSignatureButton);
      await expect(capture.signatureCanvas.first()).toBeVisible();

      const autosave = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/diary-entries/${id}`) &&
          !resp.url().includes('/promote') &&
          resp.request().method() === 'PATCH' &&
          ((resp.request().postDataJSON() as { metadata?: { signatures?: unknown[] } })?.metadata
            ?.signatures?.length ?? 0) === 1,
      );
      await capture.drawSignature();
      const resp = await autosave;
      expect(resp.status()).toBe(200);

      await capture.saveEntry();
      await expect(page).toHaveURL(new RegExp(`/diary/${id}$`));
      await expect(detailPage.signatureSection).toBeVisible();
      await expect(detailPage.editButton).not.toBeVisible();
    } finally {
      await deleteDiaryEntryViaApi(page, id);
    }
  });

  test('an unfinished second signature blocks promote client-side', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
    const id = await createDraftDiaryEntryViaApi(page, { entryType: 'issue' });

    const promoteRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes(`/api/diary-entries/${id}/promote`)) {
        promoteRequests.push(`${req.method()} ${req.url()}`);
      }
    });

    try {
      await capture.gotoEdit(id);
      await capture.typeText(`${testPrefix} issue with unfinished signature`);
      await capture.tap(capture.severityChip('low'));
      await capture.tap(capture.statusChip('open'));

      await capture.openMoreDetails();
      await capture.tap(capture.addSignatureButton);
      await expect(capture.signatureCanvas.first()).toBeVisible();
      await capture.drawSignature();

      await capture.tap(capture.addSignatureButton);
      await expect(capture.signatureCanvas.first()).toBeVisible();

      await capture.tap(capture.saveButton);

      await expect(capture.signatureError).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/diary/${id}/edit$`));
      expect(promoteRequests).toHaveLength(0);
    } finally {
      await deleteDiaryEntryViaApi(page, id);
    }
  });
});
