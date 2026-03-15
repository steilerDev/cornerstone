/**
 * E2E tests for diary photo attachments and signature capture features.
 *
 * Story #806: Photo attachments on diary entries
 * Story #807: Signature capture for diary entries
 *
 * Scenarios covered:
 * 1.  [smoke] Photo section heading is rendered on the diary entry detail page
 * 2.  Photo empty state shown when no photos are attached
 * 3.  Photo count indicator shown on entry card when photoCount > 0 (mock API)
 * 4.  "Add photos" link navigates from detail page to edit page (for non-signed entries)
 * 5.  Photo section is visible on the edit page
 * 6.  [responsive] Photo section renders without horizontal scroll
 * 7.  Signature section is NOT shown when entry has no signatures
 * 8.  Signature section is rendered when entry metadata contains signatures (mock API)
 * 9.  Edit/Delete buttons are hidden for a signed entry (mock API — isSigned=true)
 * 10. "Add photos" link is hidden for signed entries (isSigned=true)
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { DiaryPage } from '../../pages/DiaryPage.js';
import { API } from '../../fixtures/testData.js';
import { createDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMockEntryDetail(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
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

function makeMockListEntry(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
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
    createdBy: { id: 'user-1', displayName: 'E2E Admin' },
    createdAt: '2026-03-14T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z',
    ...overrides,
  };
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
        await expect(detailPage.backButton).toBeVisible();

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
      await expect(detailPage.backButton).toBeVisible();

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
test.describe('Photo count indicator on entry card (Scenario 3)', () => {
  test('Entry card shows photo count badge when photoCount > 0 (mock API)', async ({ page }) => {
    const diaryPage = new DiaryPage(page);
    const mockId = 'mock-entry-photos-001';
    const mockEntry = makeMockListEntry({ id: mockId, photoCount: 3 });

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

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      // The entry card should be visible
      await expect(diaryPage.entryCard(mockId)).toBeVisible();

      // Photo count badge must be visible with count text
      await expect(diaryPage.photoCountBadge(mockId)).toBeVisible();
      const badgeText = await diaryPage.photoCountBadge(mockId).textContent();
      expect(badgeText).toContain('3');
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });

  test('Entry card does NOT show photo count badge when photoCount is 0 (mock API)', async ({
    page,
  }) => {
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

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      await expect(diaryPage.entryCard(mockId)).toBeVisible();

      // Badge must NOT be rendered when photoCount === 0
      await expect(diaryPage.photoCountBadge(mockId)).not.toBeVisible();
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
      await expect(detailPage.backButton).toBeVisible();

      // The "Add photos" link should be visible in the photo empty state
      const addPhotosLink = page.getByRole('link', { name: /Add photos/i });
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
// Scenario 5: Photo section is visible on the edit page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Photo section on edit page (Scenario 5)', { tag: '@responsive' }, () => {
  test('Edit page renders the photo upload section for an existing entry', async ({
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

      await page.goto(`/diary/${createdId}/edit`);

      // Wait for the edit page to load
      await page.getByRole('heading', { level: 1, name: 'Edit Diary Entry' }).waitFor({
        state: 'visible',
      });

      // The "Photos" section heading should be rendered
      const photosHeading = page.getByRole('heading', { name: /Photos/i, level: 2 });
      await expect(photosHeading).toBeVisible();
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
      await expect(detailPage.backButton).toBeVisible();
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
      await expect(detailPage.backButton).toBeVisible();

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
      await expect(detailPage.backButton).toBeVisible();

      // Signature section should be rendered
      await expect(detailPage.signatureSection).toBeVisible();
    } finally {
      await page.unroute(`${API.diaryEntries}/${mockId}`);
      await page.unroute('**/api/photos*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Edit/Delete hidden for signed entries (isSigned=true)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit/Delete hidden for signed entries (Scenario 9)', () => {
  test('Edit and Delete buttons are NOT rendered for entries where isSigned is true (mock API)', async ({
    page,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    const mockId = 'mock-entry-signed-001';
    const mockEntry = makeMockEntryDetail({ id: mockId, isSigned: true });

    // The /api/photos endpoint returns { photos: [] } not [] directly
    await page.route(`**/api/photos*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ photos: [] }) });
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
      await expect(detailPage.backButton).toBeVisible();

      // For isSigned=true: Edit and Delete buttons must NOT be rendered
      await expect(detailPage.editButton).not.toBeVisible();
      await expect(detailPage.deleteButton).not.toBeVisible();
    } finally {
      await page.unroute(`${API.diaryEntries}/${mockId}`);
      await page.unroute('**/api/photos*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: "Add photos" link hidden for signed entries
// ─────────────────────────────────────────────────────────────────────────────
test.describe('"Add photos" hidden for signed entries (Scenario 10)', () => {
  test('"Add photos" link is NOT shown in photo empty state for signed entries (mock API)', async ({
    page,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    const mockId = 'mock-entry-signed-nophoto-001';
    const mockEntry = makeMockEntryDetail({ id: mockId, isSigned: true, photoCount: 0 });

    // The /api/photos endpoint returns { photos: [] } not [] directly
    await page.route(`**/api/photos*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ photos: [] }) });
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
      await expect(detailPage.backButton).toBeVisible();

      // Photo section empty state is still shown
      await expect(detailPage.photoEmptyState).toBeVisible();

      // But "Add photos" link is NOT rendered (isSigned=true hides it per source code)
      await expect(page.getByRole('link', { name: /Add photos/i })).not.toBeVisible();
    } finally {
      await page.unroute(`${API.diaryEntries}/${mockId}`);
      await page.unroute('**/api/photos*');
    }
  });
});
