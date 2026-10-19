/**
 * E2E tests for Diary Draft Lifecycle
 *
 * Bug Fix #1426: Diary photos lost on upload failure
 * Story #2221: the capture screen. The first photo or character creates the draft; the
 * screen is the same on /diary/new and /diary/:id/edit.
 *
 * Scenarios covered:
 * 1.  [smoke] Auto-draft creation: type the first character → POST fires → URL changes to /diary/:id/edit, the capture screen stays
 * 2.  Draft persists on reload
 * 3.  URL is replace history (browser back → /diary, not /diary/new)
 * 4.  No draft without interaction (picking a date, type or tag chips creates nothing)
 * 5.  Auto-save on metadata change (daily_log weather chip)
 * 6.  Photo attach — happy path (attach 2 photos, per-photo state, tiles in the strip)
 *     Photo immediate appearance sub-test: upload → tile appears and uploads without reload
 * 7.  [removed] Concurrency of the old upload queue; upload progress is covered in capture-screen.spec.ts
 * 8.  Photo upload failure → retry (page.route() intercept)
 * 9.  Promote draft — happy path (type text, Save entry → detail page)
 * 10. Promote draft — an empty draft cannot be saved (Save is aria-disabled with a reason)
 * 11. Discard draft (⋯ → Discard entry → "Discard this entry?" dialog → /diary, entry gone)
 * 12. [smoke] Draft badge in list (create via API → /diary → Draft badge visible)
 * 13. Drafts chip (default pressed; click → hides drafts, saved visible; click again → drafts restored)
 * 14. Clicking draft in list navigates to /diary/:id/edit
 * 15. Dashboard excludes drafts; shows entry after promote
 * 16. [responsive] Draft edit page on mobile (menu, Save entry, no scroll)
 * 17. [responsive] Photo controls on tablet (Choose from library visible and tappable)
 * 18. Editing a saved entry (Edit entry, Save changes, no menu)
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { DiaryPage, DIARY_ROUTE } from '../../pages/DiaryPage.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { DashboardPage } from '../../pages/DashboardPage.js';
import {
  createDraftDiaryEntryViaApi,
  createDiaryEntryViaApi,
  deleteDiaryEntryViaApi,
} from '../../fixtures/apiHelpers.js';
import { capturePhotos } from '../../fixtures/capturePhotos.js';
import { entryStatus, getEntry, listEntryPhotos } from '../../fixtures/captureSeed.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Wait for the diary list to finish loading (timeline, empty state, or error). */
async function waitForDiaryListLoaded(diaryPage: DiaryPage): Promise<void> {
  await Promise.race([
    diaryPage.timeline.waitFor({ state: 'visible' }),
    diaryPage.emptyState.waitFor({ state: 'visible' }),
    diaryPage.errorBanner.waitFor({ state: 'visible' }),
  ]);
}

/** Wait for an API response matching the diary entries endpoint. */
function waitForDiaryListResponse(page: Page) {
  return page.waitForResponse(
    (resp) => resp.url().includes('/api/diary-entries') && resp.status() === 200,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Auto-draft creation on the first character
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Auto-draft creation on the first character (Scenario 1)',
  { tag: '@responsive' },
  () => {
    test(
      '[smoke] Typing the first character auto-creates a draft and navigates to /diary/:id/edit',
      { tag: '@smoke' },
      async ({ page, testPrefix }) => {
        const capture = new DiaryCapturePage(page);
        let draftId: string | null = null;

        try {
          await capture.goto();

          // Register the POST response listener BEFORE typing — the first character fires
          // POST /api/diary-entries immediately (status: 'draft').
          const draftResponsePromise = page.waitForResponse(
            (resp) =>
              resp.url().includes('/api/diary-entries') && resp.request().method() === 'POST',
          );

          await capture.typeTitle(`${testPrefix} draft`);
          const draftResponse = await draftResponsePromise;
          expect(draftResponse.ok(), 'Draft creation response should be OK').toBeTruthy();

          const responseBody = (await draftResponse.json()) as { id: string };
          draftId = responseBody.id;

          // URL should change to /diary/:id/edit (replace navigation)
          await page.waitForURL(/diary\/.+\/edit$/);
          expect(page.url()).toMatch(new RegExp(`/diary/${draftId}/edit$`));

          // The capture screen stays: a "New entry" heading and Save entry (not Save changes)
          await expect(capture.heading).toContainText('New entry');
          await expect(capture.saveButton).toHaveText('Save entry');
        } finally {
          if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Draft persists on reload
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Draft persists on reload (Scenario 2)', () => {
  test('Draft entry created by typing is still visible after a full page reload', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
    let draftId: string | null = null;
    const title = `${testPrefix} reload`;

    try {
      await capture.goto();
      await capture.typeTitle(title);
      draftId = await capture.waitForDraft();
      // The rest of the title is autosaved a moment after the draft exists: wait for the server
      await expect.poll(async () => (await getEntry(page, draftId!)).title).toBe(title);

      // Reload the page — the draft should persist (served from server)
      await page.reload();
      await capture.waitForForm();

      // Still a draft with what was typed
      await expect(capture.heading).toContainText('New entry');
      await expect(capture.saveButton).toHaveText('Save entry');
      await expect(capture.titleInput).toHaveValue(title);
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: URL is replace history (browser back → /diary)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Auto-draft URL is replace history (Scenario 3)', () => {
  test('Browser back after the draft is created navigates to /diary, not /diary/new', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
    let draftId: string | null = null;

    try {
      // Navigate first to /diary so back-stack has an entry
      await page.goto(DIARY_ROUTE);
      await page.getByRole('heading', { level: 1, name: 'Site diary', exact: true }).waitFor({
        state: 'visible',
      });

      // Now navigate to /diary/new
      await capture.goto();

      await capture.typeTitle(`${testPrefix} history`);
      draftId = await capture.waitForDraft();

      // Press browser back — should navigate to /diary (the entry before /diary/new in history)
      // because navigate({ replace: true }) was used when creating the draft
      await page.goBack();

      // URL should be /diary — NOT /diary/new
      await page.waitForURL('**/diary');
      expect(page.url()).not.toContain('/diary/new');
      expect(page.url()).not.toContain(`/diary/${draftId}`);
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: No draft without interaction
// ─────────────────────────────────────────────────────────────────────────────
test.describe('No draft created without interaction (Scenario 4)', () => {
  test('Picking a date and a type on /diary/new and leaving creates no draft', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
    const diaryPage = new DiaryPage(page);

    // Open /diary/new and use the chips, but type nothing and add no photo
    await capture.goto();
    await capture.tap(capture.dateChip('yesterday'));
    await capture.selectType('delivery');
    await expect(capture.typeChip('delivery')).toHaveAttribute('aria-pressed', 'true');

    // Navigate directly to /diary
    await page.goto(DIARY_ROUTE);
    await diaryPage.heading.waitFor({ state: 'visible' });

    // Navigate to drafts-only view to check no spurious draft was created
    const statusResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/diary-entries') &&
        resp.url().includes('status=draft') &&
        resp.status() === 200,
    );
    await diaryPage.filterDraftsOnly();
    const statusResponse = await statusResponsePromise;

    const body = (await statusResponse.json()) as {
      items: Array<{ id: string; body: string; title: string | null }>;
    };

    // No draft entries for this test prefix should exist
    // (other tests create/clean up their own drafts; parallel-safe because testPrefix is unique)
    const ourDrafts = body.items.filter(
      (item) =>
        (item.body && item.body.includes(testPrefix)) ||
        (item.title && item.title.includes(testPrefix)),
    );
    expect(ourDrafts).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Auto-save on metadata change
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Auto-save on metadata change (Scenario 5)', () => {
  test('Tapping a weather chip on a draft triggers auto-save; value persists on reload', async ({
    page,
  }) => {
    const capture = new DiaryCapturePage(page);
    let draftId: string | null = null;

    try {
      // Create a draft daily_log via API
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'daily_log' });

      await capture.gotoEdit(draftId);
      await expect(capture.saveButton).toHaveText('Save entry');
      await capture.openMoreDetails();

      // Register the PATCH listener before tapping the chip (a chip saves at once)
      const autoSavePatchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/diary-entries/${draftId}`) &&
          resp.request().method() === 'PATCH',
      );

      await capture.tap(capture.weatherChip('sunny'));
      await autoSavePatchPromise;
      await expect(capture.savedText).toBeVisible();

      // Reload and verify the weather value was persisted
      await page.reload();
      await capture.waitForForm();
      await capture.openMoreDetails();
      await expect(capture.weatherChip('sunny')).toHaveAttribute('aria-pressed', 'true');
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Photo attach — happy path
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Photo attach — happy path (Scenario 6)', { tag: '@responsive' }, () => {
  test('Attaching 2 photos to a draft shows uploading then uploaded state', async ({
    page,
    testPrefix,
  }) => {
    let draftId: string | null = null;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      const capture = new DiaryCapturePage(page);
      await capture.gotoEdit(draftId);

      // Picking photos starts the upload at once: no per-photo details step any more
      const uploadResponse = page.waitForResponse(
        (resp) => resp.url().includes('/api/photos') && resp.request().method() === 'POST',
      );
      await capture.chooseFromLibrary(capturePhotos(2, `${testPrefix}-att`));
      await uploadResponse;

      // Both tiles end up uploaded and the server has both photos
      await capture.waitForUploaded(2);
      await expect.poll(async () => (await listEntryPhotos(page, draftId!)).length).toBe(2);
      await expect(capture.strip).toBeVisible();
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });

  // ── Photo immediate appearance sub-test (#1435) ──────────────────────────
  test('Photo appears in the strip immediately after picking (without page reload)', async ({
    page,
    testPrefix,
  }) => {
    let draftId: string | null = null;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      const capture = new DiaryCapturePage(page);
      await capture.gotoEdit(draftId);
      await expect(capture.tiles).toHaveCount(0);

      await capture.chooseFromLibrary(capturePhotos(1, `${testPrefix}-now`));

      // The tile appears without a page reload, then settles on uploaded
      await expect(capture.tiles).toHaveCount(1);
      await capture.waitForUploaded(1);
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Photo upload failure → retry
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Photo upload failure and retry (Scenario 8)', () => {
  test('A failed photo shows error and retry button; clicking retry re-uploads successfully', async ({
    page,
    testPrefix,
  }) => {
    let draftId: string | null = null;
    let callCount = 0;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      const capture = new DiaryCapturePage(page);
      await capture.gotoEdit(draftId);

      // Route: the first call fails with 400 (a 5xx would be retried automatically), the
      // second call (the user's Retry) goes through to the server
      await page.route('**/api/photos', async (route) => {
        if (route.request().method() === 'POST') {
          callCount++;
          if (callCount === 1) {
            await route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Rejected' } }),
            });
            return;
          }
        }
        await route.continue();
      });

      await capture.chooseFromLibrary(capturePhotos(1, `${testPrefix}-retry`));

      // The failed state shows a Retry button on the tile
      await expect(capture.tile(0)).toHaveAttribute('data-state', 'failed');
      await expect(capture.tileRetry(0)).toBeVisible();

      const retryResponsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/photos') && resp.request().method() === 'POST',
      );
      await capture.tap(capture.tileRetry(0));
      const retryResponse = await retryResponsePromise;
      expect(retryResponse.ok(), 'Retry upload should succeed').toBeTruthy();

      // After the retry the tile is uploaded and the Retry button is gone
      await capture.waitForUploaded(1);
      await expect(capture.tileRetry(0)).toHaveCount(0);
    } finally {
      await page.unroute('**/api/photos');
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Promote draft — happy path
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Promote draft — happy path (Scenario 9)', { tag: '@responsive' }, () => {
  test(
    'Typing text and tapping Save entry promotes the draft and navigates to /diary/:id',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const capture = new DiaryCapturePage(page);
      const detailPage = new DiaryEntryDetailPage(page);
      let draftId: string | null = null;

      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

        await capture.gotoEdit(draftId);
        await expect(capture.saveButton).toHaveText('Save entry');

        // Something to save: the text
        await capture.typeText(`${testPrefix} promote happy path body`);
        await capture.saveButton.scrollIntoViewIfNeeded();

        // Register the promote PATCH listener before tapping
        const promoteResponsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes(`/api/diary-entries/${draftId}/promote`) &&
            resp.request().method() === 'PATCH',
        );

        await capture.saveEntry();
        const promoteResponse = await promoteResponsePromise;
        expect(promoteResponse.ok(), 'Promote response should be OK').toBeTruthy();

        // Should navigate to /diary/:id (detail page)
        await page.waitForURL(new RegExp(`/diary/${draftId}$`));
        expect(page.url()).toMatch(new RegExp(`/diary/${draftId}$`));

        // Detail page should load — no draft indicator
        await detailPage.loaded.waitFor({ state: 'visible' });
        await expect(page.getByTestId('draft-status-badge')).not.toBeVisible();
      } finally {
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Promote draft — nothing to save
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Promote draft — validation (Scenario 10)', () => {
  test('An empty draft cannot be saved: Save entry is disabled with a reason; entry stays draft', async ({
    page,
  }) => {
    const capture = new DiaryCapturePage(page);
    let draftId: string | null = null;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      await capture.gotoEdit(draftId);
      await expect(capture.textArea).toHaveValue('');

      // Save entry is aria-disabled and says what is missing
      await capture.saveButton.scrollIntoViewIfNeeded();
      await expect(capture.saveButton).toHaveAttribute('aria-disabled', 'true');
      await expect(capture.saveReason).toHaveText('Add a photo, a title or some text.');

      // Tapping it does nothing: no navigation, still a draft
      await capture.saveButton.click({ force: true });
      expect(page.url()).toContain(`/diary/${draftId}/edit`);
      await expect(capture.saveButton).toHaveText('Save entry');

      // Typing the text enables it
      await capture.typeText('Now there is something to save');
      await expect(capture.saveButton).not.toHaveAttribute('aria-disabled', 'true');
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: Discard draft
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Discard draft (Scenario 11)', { tag: '@responsive' }, () => {
  test('Discard entry → confirmation dialog → confirm → navigates to /diary; entry gone', async ({
    page,
  }) => {
    const capture = new DiaryCapturePage(page);
    const diaryPage = new DiaryPage(page);
    let draftId: string | null = null;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      await capture.gotoEdit(draftId);

      // Open the discard confirmation dialog from the ⋯ menu
      await capture.tap(capture.menuButton);
      await capture.tap(capture.discardItem);
      await capture.discardDialog.waitForOpen();
      await expect(capture.discardDialog.dialog).toHaveAccessibleName('Discard this entry?');
      await expect(capture.discardDialog.confirmButton).toHaveText('Discard');
      await expect(capture.discardDialog.cancelButton).toHaveText('Keep entry');

      // Confirm discard
      await capture.discardDialog.confirm();

      // Should navigate to /diary
      await page.waitForURL('**/diary');
      expect(page.url()).not.toMatch(/\/diary\/[a-zA-Z0-9-]+/);

      // The entry no longer exists and is not in the list
      await waitForDiaryListLoaded(diaryPage);
      await expect(diaryPage.entryCard(draftId)).not.toBeVisible();
      await expect.poll(() => entryStatus(page, draftId!)).toBe(404);

      // Mark deleted so finally block doesn't try again
      draftId = null;
    } finally {
      if (draftId) {
        try {
          await deleteDiaryEntryViaApi(page, draftId);
        } catch {
          // Already deleted
        }
      }
    }
  });

  test('Keep entry inside the discard dialog keeps the draft and stays on the edit page', async ({
    page,
  }) => {
    const capture = new DiaryCapturePage(page);
    let draftId: string | null = null;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      await capture.gotoEdit(draftId);

      await capture.tap(capture.menuButton);
      await capture.tap(capture.discardItem);
      await capture.discardDialog.waitForOpen();

      // Tap "Keep entry" to cancel
      await capture.discardDialog.cancel();

      // URL should still be on the edit page and the entry still exists
      expect(page.url()).toContain(`/diary/${draftId}/edit`);
      await expect(capture.saveButton).toHaveText('Save entry');
      expect(await entryStatus(page, draftId)).toBe(200);
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: Draft badge in list
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Draft badge in list view (Scenario 12)', { tag: '@responsive' }, () => {
  test(
    '[smoke] Draft entry created via API shows Draft badge in the diary list',
    { tag: '@smoke' },
    async ({ page }) => {
      const diaryPage = new DiaryPage(page);
      let draftId: string | null = null;

      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

        // Navigate to /diary?status=draft to see draft entries
        const filterResponsePromise = waitForDiaryListResponse(page);
        await diaryPage.filterDraftsOnly();
        await filterResponsePromise;

        // The draft card should be visible
        await expect(diaryPage.entryCard(draftId)).toBeVisible();

        // Draft badge on the card: data-testid="draft-badge-{id}"
        await expect(diaryPage.getDraftBadge(draftId)).toBeVisible();
      } finally {
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13: Drafts chip (#1446)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Drafts chip (Scenario 13)', () => {
  test('Drafts chip — default pressed; click hides drafts; click again restores them', async ({
    page,
    testPrefix,
  }) => {
    const diaryPage = new DiaryPage(page);
    let draftId: string | null = null;
    let savedId: string | null = null;

    try {
      // Create one draft and one saved entry
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
      savedId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-05-16',
        body: `${testPrefix} saved entry for drafts-chip test`,
      });

      await diaryPage.goto();
      await waitForDiaryListLoaded(diaryPage);
      // The filter panel is collapsed by default on mobile — expand it so
      // the Drafts chip is interactable across all viewports.
      await diaryPage.openFiltersIfCollapsed();

      // ── Default: chip is pressed (aria-pressed="true"), both entries visible ──
      await expect(diaryPage.draftsChip).toHaveAttribute('aria-pressed', 'true');
      await expect(diaryPage.entryCard(draftId)).toBeVisible();
      await expect(diaryPage.entryCard(savedId)).toBeVisible();

      // ── Click chip → hide drafts; URL gets ?status=saved ──
      const savedFilterResponse = waitForDiaryListResponse(page);
      await diaryPage.draftsChip.scrollIntoViewIfNeeded();
      await diaryPage.draftsChip.click();
      await savedFilterResponse;
      await waitForDiaryListLoaded(diaryPage);

      // Chip should now be un-pressed
      await expect(diaryPage.draftsChip).toHaveAttribute('aria-pressed', 'false');
      // URL should contain status=saved
      expect(page.url()).toContain('status=saved');
      // Draft card should NOT be visible; saved card should be visible
      await expect(diaryPage.entryCard(draftId)).not.toBeVisible();
      await expect(diaryPage.entryCard(savedId)).toBeVisible();

      // ── Click chip again → restore drafts; status param removed ──
      const allFilterResponse = waitForDiaryListResponse(page);
      await diaryPage.draftsChip.click();
      await allFilterResponse;
      await waitForDiaryListLoaded(diaryPage);

      // Chip should be pressed again
      await expect(diaryPage.draftsChip).toHaveAttribute('aria-pressed', 'true');
      // URL should NOT contain status=saved
      expect(page.url()).not.toContain('status=saved');
      // Both cards should be visible again
      await expect(diaryPage.entryCard(draftId)).toBeVisible();
      await expect(diaryPage.entryCard(savedId)).toBeVisible();
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      if (savedId) await deleteDiaryEntryViaApi(page, savedId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 14: Clicking draft in list navigates to /diary/:id/edit
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Draft card click navigates to edit page (Scenario 14)', () => {
  test('Clicking a draft entry card navigates to /diary/:id/edit, not /diary/:id', async ({
    page,
  }, testInfo) => {
    // Give this test its own generous absolute budget instead of test.slow().
    // NOTE (bug #1829): test.slow() only triples the *overall* per-test timeout
    // (15s -> 45s here) — it does NOT triple actionTimeout/expect.timeout, and it
    // is a single shared ceiling for every step in the test PLUS the finally-block
    // cleanup below. Use an explicit absolute timeout instead, and keep per-step
    // ceilings proportionate.
    test.setTimeout(60_000);

    const diaryPage = new DiaryPage(page);
    const capture = new DiaryCapturePage(page);
    let draftId: string | null = null;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      // Navigate to /diary?status=draft to ensure our draft card is visible
      const filterResponse = waitForDiaryListResponse(page);
      await diaryPage.filterDraftsOnly();
      await filterResponse;
      await waitForDiaryListLoaded(diaryPage);

      // Click the draft card
      await expect(diaryPage.entryCard(draftId)).toBeVisible();

      // Register the getDiaryEntry response listener BEFORE clicking the card so the
      // response cannot arrive and be missed between the click and the listener attachment.
      const entryLoadPromise = page.waitForResponse(
        (resp) =>
          resp.url().endsWith(`/api/diary-entries/${draftId}`) &&
          resp.request().method() === 'GET' &&
          resp.status() === 200,
        { timeout: 15_000 },
      );

      await diaryPage.entryCard(draftId).click();

      // Should navigate to /diary/:id/edit. On loaded CI runners the SPA router +
      // React re-render after the click can exceed the default 10s navigationTimeout.
      await page.waitForURL(new RegExp(`/diary/${draftId}/edit$`), { timeout: 15_000 });
      expect(page.url()).toContain(`/diary/${draftId}/edit`);

      // The capture screen renders after getDiaryEntry() returns.
      await entryLoadPromise;
      await capture.waitForForm();

      // A draft reads "New entry" with Save entry (entry.status === 'draft')
      await expect(capture.heading).toContainText('New entry', { timeout: 15_000 });
      await expect(capture.saveButton).toHaveText('Save entry', { timeout: 15_000 });
    } finally {
      // Guarantee cleanup gets its own dedicated time budget on top of whatever remains.
      testInfo.setTimeout(testInfo.timeout + 15_000);
      if (draftId) {
        try {
          await deleteDiaryEntryViaApi(page, draftId);
        } catch (error) {
          // Best-effort cleanup: a slow/failed delete must not mask this test's outcome.
          console.warn(`[diary-drafts] cleanup failed for draft ${draftId}:`, error);
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 15: Dashboard excludes drafts; shows entry after promote
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dashboard excludes drafts (Scenario 15)', () => {
  test('Draft entries do not appear in Recent Diary; promoted entry appears after refresh', async ({
    page,
    testPrefix,
  }) => {
    const dashboardPage = new DashboardPage(page);
    const capture = new DiaryCapturePage(page);
    let draftId: string | null = null;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      // Navigate to dashboard — register diary entries API listener BEFORE goto() to avoid
      // race where the response arrives before the listener is attached.
      // DashboardPage fetches GET /api/diary-entries?pageSize=5&status=saved — drafts excluded.
      let diaryApiPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/diary-entries') &&
          resp.url().includes('status=saved') &&
          resp.status() === 200,
      );
      await dashboardPage.goto();
      await diaryApiPromise;
      // Wait for all concurrent dashboard API calls to settle before asserting.
      await page.waitForLoadState('networkidle');

      // The Recent Diary card should NOT contain our draft entry.
      // DashboardPage renders two layouts simultaneously (desktop grid + mobile
      // sections), so the same testId can appear twice when the entry IS present.
      await expect(page.getByTestId(`recent-diary-${draftId}`).first()).not.toBeVisible();

      // Now promote the draft to saved
      await capture.gotoEdit(draftId);
      await expect(capture.saveButton).toHaveText('Save entry');
      await capture.typeText(`${testPrefix} promoted for dashboard test`);
      await capture.saveButton.scrollIntoViewIfNeeded();

      const promotePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/diary-entries/${draftId}/promote`) &&
          resp.request().method() === 'PATCH',
      );
      await capture.saveEntry();
      await promotePromise;

      // Navigate back to dashboard and reload to pick up the newly saved entry.
      diaryApiPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/diary-entries') &&
          resp.url().includes('status=saved') &&
          resp.status() === 200,
      );
      await dashboardPage.goto();
      await diaryApiPromise;
      // Wait for the full allSettled batch before asserting on card content.
      await page.waitForLoadState('networkidle');

      // The promoted entry should now appear in Recent Diary.
      await expect(page.getByTestId(`recent-diary-${draftId}`).first()).toBeVisible();
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 16: Responsive — draft edit page on mobile
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Responsive — draft edit page on mobile (Scenario 16)',
  { tag: '@responsive' },
  () => {
    test(
      'Save entry and the ⋯ menu are visible without horizontal scroll on current viewport',
      { tag: '@responsive' },
      async ({ page }) => {
        const capture = new DiaryCapturePage(page);
        let draftId: string | null = null;

        try {
          draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

          await capture.gotoEdit(draftId);
          await expect(capture.saveButton).toHaveText('Save entry');

          // The sticky bar keeps Save entry on screen; the ⋯ menu holds Discard entry
          await expect(capture.saveButton).toBeInViewport();
          await expect(capture.menuButton).toBeVisible();

          // No horizontal scroll
          const hasHorizontalScroll = await page.evaluate(() => {
            return document.documentElement.scrollWidth > window.innerWidth;
          });
          expect(hasHorizontalScroll).toBe(false);
        } finally {
          if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 17: Responsive — photo controls on tablet
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive — photo controls on tablet (Scenario 17)', { tag: '@responsive' }, () => {
  test(
    'Choose from library is visible on current viewport without horizontal scroll',
    { tag: '@responsive' },
    async ({ page }) => {
      const capture = new DiaryCapturePage(page);
      let draftId: string | null = null;

      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

        await capture.gotoEdit(draftId);

        // The photo controls come first on every viewport (Take photos too on touch devices)
        await capture.chooseButton.scrollIntoViewIfNeeded();
        await expect(capture.chooseButton).toBeVisible();
        await expect(capture.chooseButton).toBeEnabled();

        // No horizontal scroll
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(hasHorizontalScroll).toBe(false);
      } finally {
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 18: Editing a saved entry
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Editing a saved entry (Scenario 18)', { tag: '@responsive' }, () => {
  test('Editing and saving a saved entry shows no draft menu and Save changes', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
    const detailPage = new DiaryEntryDetailPage(page);
    let savedId: string | null = null;

    try {
      savedId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-05-16',
        body: `${testPrefix} saved entry for saved-mode test`,
      });

      await capture.gotoEdit(savedId);
      await expect(capture.heading).toContainText('Edit entry · ');

      // No ⋯ menu (no Discard entry) for a saved entry
      await expect(capture.menuButton).toHaveCount(0);

      // The button says "Save changes" (not "Save entry" as in draft mode)
      await expect(capture.saveButton).toHaveText('Save changes');

      // Edit and save
      const updatedBody = `${testPrefix} saved-mode updated body`;
      await capture.typeText(updatedBody);
      await capture.saveButton.scrollIntoViewIfNeeded();
      await capture.saveChanges();

      // Should navigate to detail page
      await page.waitForURL(new RegExp(`/diary/${savedId}$`));
      expect(page.url()).toContain(`/diary/${savedId}`);

      // Detail page — updated text, no draft badge
      await detailPage.loaded.waitFor({ state: 'visible' });
      await expect(detailPage.entryBody).toContainText(updatedBody);
      await expect(page.getByTestId('draft-status-badge')).not.toBeVisible();
    } finally {
      if (savedId) await deleteDiaryEntryViaApi(page, savedId);
    }
  });
});
