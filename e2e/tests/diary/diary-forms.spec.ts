/**
 * E2E tests for Diary Entry Create, Edit, and Delete flows
 *
 * Story #805: Diary entry creation, editing, and deletion
 *
 * Scenarios covered:
 * 1.  [smoke] Type selector shows 5 type cards at /diary/new
 * 2.  [smoke] Create general_note — happy path (two-step draft flow):
 *             fill body → blur → auto-draft POST → /diary/:id/edit → promote → /diary/:id
 *             Note: #1426 changed from single-step (submit → POST → /diary/:id) to
 *             two-step auto-draft flow (blur → POST draft → edit page → promote → detail page)
 * 3.  Create daily_log with weather/temperature/workers metadata (two-step draft flow)
 * 4.  Create site_visit with inspector name and outcome metadata (two-step draft flow)
 * 5.  [removed] Validation error on submit — removed in #1426 (no submit button on create page).
 *              Coverage moved to diary-drafts.spec.ts Scenario 10 (promote-time validation).
 * 6.  Edit entry — form pre-populated with existing values, save redirects to detail
 * 7.  Delete from edit page — modal confirm, redirects to /diary
 * 8.  Delete from detail page — modal confirm, redirects to /diary
 * 9.  Edit button on detail page navigates to /diary/:id/edit
 * 10. [responsive] Create page has no horizontal scroll on current viewport
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryEntryCreatePage, DIARY_CREATE_ROUTE } from '../../pages/DiaryEntryCreatePage.js';
import { DiaryEntryEditPage } from '../../pages/DiaryEntryEditPage.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { createDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Type selector shows 5 type cards
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Type selector (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Create page shows 5 entry type cards at /diary/new',
    { tag: '@smoke' },
    async ({ page }) => {
      const createPage = new DiaryEntryCreatePage(page);
      await createPage.goto();

      // The heading must be visible
      await expect(createPage.heading).toBeVisible();

      // All 5 type cards must be present
      const count = await createPage.typeCardCount();
      expect(count).toBe(5);

      // Each specific type card must be present
      await expect(createPage.typeCard('daily_log')).toBeVisible();
      await expect(createPage.typeCard('site_visit')).toBeVisible();
      await expect(createPage.typeCard('delivery')).toBeVisible();
      await expect(createPage.typeCard('issue')).toBeVisible();
      await expect(createPage.typeCard('general_note')).toBeVisible();
    },
  );

  test('Clicking a type card transitions to the form step', async ({ page }) => {
    const createPage = new DiaryEntryCreatePage(page);
    await createPage.goto();

    // Clicking "General Note" transitions to the form
    await createPage.selectType('general_note');

    // Form fields should be visible; the submit button was removed in #1426 (auto-draft flow).
    // The Cancel button is rendered in the form step actions area.
    await expect(createPage.bodyTextarea).toBeVisible();
    await expect(createPage.cancelButton).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Create general_note — happy path
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create general_note — happy path (Scenario 2)', { tag: '@responsive' }, () => {
  test(
    'Creates a general_note entry and navigates to the detail page',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const createPage = new DiaryEntryCreatePage(page);
      const editPage = new DiaryEntryEditPage(page);
      const detailPage = new DiaryEntryDetailPage(page);
      let createdId: string | null = null;

      try {
        await createPage.goto();
        await createPage.selectType('general_note');

        // Fill the body field — #1426: blurring the body field auto-creates a draft
        const body = `${testPrefix} general note body text`;
        const title = `${testPrefix} General Note Create Test`;

        await createPage.bodyTextarea.fill(body);

        // Register the POST listener BEFORE blurring so we don't miss the auto-draft response
        const draftResponsePromise = page.waitForResponse(
          (resp) => resp.url().includes('/api/diary-entries') && resp.request().method() === 'POST',
        );

        // Press Tab to move focus off the textarea, triggering onFieldBlur → createDraft()
        // Also call .blur() explicitly for reliable React synthetic blur event across browsers
        await createPage.bodyTextarea.press('Tab');
        await createPage.bodyTextarea.blur();
        const draftResponse = await draftResponsePromise;
        expect(draftResponse.ok(), 'Draft creation should succeed').toBeTruthy();

        const responseBody = (await draftResponse.json()) as { id: string };
        createdId = responseBody.id;

        // #1426 flow: after auto-draft creation, navigate to /diary/:id/edit (replace history)
        await page.waitForURL(new RegExp(`/diary/${createdId}/edit$`));
        expect(page.url()).toMatch(new RegExp(`/diary/${createdId}/edit$`));

        // The edit page should show the Draft badge
        await expect(editPage.draftBadge).toBeVisible();
        await expect(editPage.heading).toBeVisible();

        // Fill the title (optional — fill to ensure the entry is well-formed)
        await editPage.titleInput.waitFor({ state: 'visible' });
        await editPage.titleInput.fill(title);

        // Register the promote PATCH listener BEFORE clicking Save
        const promoteResponsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes(`/api/diary-entries/${createdId}/promote`) &&
            resp.request().method() === 'PATCH',
        );

        // Click "Save" — promotes the draft to saved status
        await editPage.submitButton.scrollIntoViewIfNeeded();
        await editPage.submitButton.click();
        const promoteResponse = await promoteResponsePromise;
        expect(promoteResponse.ok(), 'Promote should succeed').toBeTruthy();

        // After promote: navigate to /diary/:id (detail page)
        await page.waitForURL(new RegExp(`/diary/${createdId}$`));
        expect(page.url()).toMatch(new RegExp(`/diary/${createdId}$`));

        // Detail page back button should be visible (confirms we are on the detail page)
        await expect(detailPage.backButton).toBeVisible();
      } finally {
        if (createdId) await deleteDiaryEntryViaApi(page, createdId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Create daily_log with metadata
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create daily_log with metadata (Scenario 3)', () => {
  test('Creates a daily_log entry with weather and workers metadata', async ({
    page,
    testPrefix,
  }) => {
    const createPage = new DiaryEntryCreatePage(page);
    const editPage = new DiaryEntryEditPage(page);
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      await createPage.goto();
      await createPage.selectType('daily_log');

      const body = `${testPrefix} daily log with metadata`;

      // Register the POST listener FIRST — before ANY field interaction.
      // The create page calls createDraft() on the FIRST metadata onChange (e.g., weather select),
      // which fires before the test could register the listener if we filled metadata first.
      // With the listener registered upfront, it catches whichever field triggers createDraft.
      const draftResponsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/diary-entries') && resp.request().method() === 'POST',
      );

      // Fill body only on the create page. The metadata fields trigger createDraft immediately
      // on onChange (stale-closure issue: the draft is created before React state updates apply).
      // To avoid the stale-closure problem, we fill metadata on the EDIT page instead, where
      // the auto-save effect correctly captures the latest state after re-render.
      await createPage.bodyTextarea.fill(body);

      // Blur the body textarea to trigger onFieldBlur → createDraft() with status: 'draft'
      await createPage.bodyTextarea.press('Tab');
      await createPage.bodyTextarea.blur();
      const draftResponse = await draftResponsePromise;
      expect(draftResponse.ok()).toBeTruthy();

      const responseBody = (await draftResponse.json()) as { id: string };
      createdId = responseBody.id;

      // #1426 flow: navigates to /diary/:id/edit after auto-draft creation
      await page.waitForURL(new RegExp(`/diary/${createdId}/edit$`));

      // Draft badge should be visible on the edit page
      await expect(editPage.draftBadge).toBeVisible();
      await expect(editPage.heading).toBeVisible();

      // Fill metadata on the edit page. The edit-page metadata onChange handlers (setDailyLogWeather
      // etc.) correctly update React state. The auto-save effect fires immediately after each change.
      // The promote request (below) reads from React state, so it will include all metadata values.
      await editPage.weatherSelect.waitFor({ state: 'visible' });

      // Register PATCH listener before the weather change to wait for the auto-save
      const autoSavePatchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/diary-entries/${createdId}`) &&
          resp.request().method() === 'PATCH' &&
          !resp.url().includes('/promote'),
      );
      await editPage.weatherSelect.selectOption('sunny');
      await editPage.workersInput.fill('8');
      // Wait for at least one auto-save PATCH to confirm the values are persisted server-side
      await autoSavePatchPromise;

      // Register the promote PATCH listener BEFORE clicking Save
      const promoteResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/diary-entries/${createdId}/promote`) &&
          resp.request().method() === 'PATCH',
      );

      // Click "Save" to promote the draft — promote sends all current field values from React state
      await editPage.submitButton.scrollIntoViewIfNeeded();
      await editPage.submitButton.click();
      const promoteResponse = await promoteResponsePromise;
      expect(promoteResponse.ok()).toBeTruthy();

      // After promote: navigate to /diary/:id (detail page)
      await page.waitForURL(new RegExp(`/diary/${createdId}$`));

      // Verify metadata is shown on the detail page.
      // DiaryMetadataSummary for daily_log renders: weather emoji + label, and workers count.
      // Temperature (temperatureCelsius) is stored in the database but NOT displayed in the
      // summary component — only weather and workersOnSite are rendered.
      await detailPage.backButton.waitFor({ state: 'visible' });
      await expect(detailPage.dailyLogMetadata).toBeVisible();

      const metadataText = await detailPage.dailyLogMetadata.textContent();
      expect(metadataText?.toLowerCase()).toContain('sunny');
      expect(metadataText).toContain('8');
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Create site_visit with inspector/outcome metadata
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create site_visit with metadata (Scenario 4)', () => {
  test('Creates a site_visit entry with inspector name and outcome', async ({
    page,
    testPrefix,
  }) => {
    const createPage = new DiaryEntryCreatePage(page);
    const editPage = new DiaryEntryEditPage(page);
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      await createPage.goto();
      await createPage.selectType('site_visit');

      const body = `${testPrefix} site visit with outcome`;

      // Register the POST listener FIRST — before ANY field interaction.
      // On the create page, filling the inspector name input fires the onChange handler which
      // calls createDraft() immediately (stale-closure). The draft is created with null inspector.
      // By registering the listener first, we capture whichever interaction triggers the POST.
      const draftResponsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/diary-entries') && resp.request().method() === 'POST',
      );

      // Fill body only on the create page. We fill metadata on the edit page to avoid the
      // stale-closure issue where metadata onChange fires createDraft with the old (null) state.
      await createPage.bodyTextarea.fill(body);

      // Blur to trigger onFieldBlur → createDraft() with status: 'draft'
      await createPage.bodyTextarea.press('Tab');
      await createPage.bodyTextarea.blur();
      const draftResponse = await draftResponsePromise;
      expect(draftResponse.ok()).toBeTruthy();

      const responseBody = (await draftResponse.json()) as { id: string };
      createdId = responseBody.id;

      // #1426 flow: navigates to /diary/:id/edit after auto-draft creation
      await page.waitForURL(new RegExp(`/diary/${createdId}/edit$`));

      // Draft badge should be visible on the edit page
      await expect(editPage.draftBadge).toBeVisible();
      await expect(editPage.heading).toBeVisible();

      // Fill site_visit metadata on the edit page. The edit page correctly reads the latest React
      // state in auto-save (no stale-closure issue). Both inspector name and outcome are required
      // for site_visit promote; filling them on the edit page ensures validate passes at promote.
      await editPage.inspectorNameInput.waitFor({ state: 'visible' });

      // Register PATCH listener before inspector name fill to wait for auto-save
      const autoSavePatchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/diary-entries/${createdId}`) &&
          resp.request().method() === 'PATCH' &&
          !resp.url().includes('/promote'),
      );
      await editPage.inspectorNameInput.fill('Jane Inspector');
      // Blur inspector name to trigger debounced auto-save (onFieldBlur fires triggerAutoSave)
      await editPage.inspectorNameInput.press('Tab');
      await editPage.outcomeSelect.selectOption('pass');
      // Wait for auto-save to confirm inspector + outcome are persisted before promoting
      await autoSavePatchPromise;

      // Register the promote PATCH listener BEFORE clicking Save
      const promoteResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/diary-entries/${createdId}/promote`) &&
          resp.request().method() === 'PATCH',
      );

      // Click "Save" to promote — promote sends all current React state (including inspector+outcome)
      await editPage.submitButton.scrollIntoViewIfNeeded();
      await editPage.submitButton.click();
      const promoteResponse = await promoteResponsePromise;
      expect(promoteResponse.ok()).toBeTruthy();

      // After promote: navigate to /diary/:id (detail page)
      await page.waitForURL(new RegExp(`/diary/${createdId}$`));

      // Verify metadata on the detail page
      await detailPage.backButton.waitFor({ state: 'visible' });
      await expect(detailPage.siteVisitMetadata).toBeVisible();
      await expect(detailPage.outcomeBadge('pass')).toBeVisible();

      const metadataText = await detailPage.siteVisitMetadata.textContent();
      expect(metadataText).toContain('Jane Inspector');
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// NOTE: Scenario 5 (submit-based validation errors on the create page) was removed in #1426.
// The create page no longer has a submit button — it uses an auto-draft/blur flow instead.
// Validation now fires at promote-time on the edit page.
// Coverage is provided by diary-drafts.spec.ts Scenario 10:
//   "Clicking Save with empty body shows validation error; URL unchanged; entry stays draft"

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Edit entry — form pre-populated, save redirects to detail
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit entry (Scenario 6)', { tag: '@responsive' }, () => {
  test('Edit page pre-populates form with existing entry values', async ({ page, testPrefix }) => {
    const editPage = new DiaryEntryEditPage(page);
    let createdId: string | null = null;
    const originalBody = `${testPrefix} original body for edit test`;
    const originalTitle = `${testPrefix} Original Edit Title`;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: originalBody,
        title: originalTitle,
      });

      await editPage.goto(createdId);

      // Verify heading is correct
      await expect(editPage.heading).toBeVisible();

      // Verify the form is pre-populated with the existing values
      const bodyValue = await editPage.bodyTextarea.inputValue();
      expect(bodyValue).toBe(originalBody);

      const titleValue = await editPage.titleInput.inputValue();
      expect(titleValue).toBe(originalTitle);
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });

  test('Editing and saving an entry navigates back to the detail page', async ({
    page,
    testPrefix,
  }) => {
    const editPage = new DiaryEntryEditPage(page);
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;
    const originalBody = `${testPrefix} body before edit`;
    const updatedBody = `${testPrefix} body after edit`;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: originalBody,
      });

      await editPage.goto(createdId);
      await expect(editPage.heading).toBeVisible();

      // Clear and re-fill the body
      await editPage.bodyTextarea.waitFor({ state: 'visible' });
      await editPage.bodyTextarea.scrollIntoViewIfNeeded();
      await editPage.bodyTextarea.fill(updatedBody);

      // Scroll the submit button into view before clicking — important on mobile
      // viewports where the form is long and the button may be off-screen
      await editPage.submitButton.waitFor({ state: 'visible' });
      await editPage.submitButton.scrollIntoViewIfNeeded();

      // Save — waits for PATCH response internally
      await editPage.save();

      // Should navigate to the detail page
      await page.waitForURL(`**/diary/${createdId}`);
      expect(page.url()).toContain(`/diary/${createdId}`);

      // Detail page should show the updated body text
      await detailPage.backButton.waitFor({ state: 'visible' });
      await expect(detailPage.entryBody).toContainText(updatedBody);
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });

  test('Editing a daily_log entry preserves existing metadata in the form', async ({
    page,
    testPrefix,
  }) => {
    const editPage = new DiaryEntryEditPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: `${testPrefix} daily log for edit metadata test`,
        metadata: {
          weather: 'cloudy',
          temperatureCelsius: 15,
          workersOnSite: 3,
        },
      });

      await editPage.goto(createdId);
      await expect(editPage.heading).toBeVisible();

      // Metadata fields should be pre-populated
      await editPage.weatherSelect.waitFor({ state: 'visible' });
      const weatherValue = await editPage.weatherSelect.inputValue();
      expect(weatherValue).toBe('cloudy');

      const tempValue = await editPage.temperatureInput.inputValue();
      expect(tempValue).toBe('15');

      const workersValue = await editPage.workersInput.inputValue();
      expect(workersValue).toBe('3');
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Delete from edit page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete from edit page (Scenario 7)', { tag: '@responsive' }, () => {
  test('Delete modal appears when "Delete Entry" is clicked on the edit page', async ({
    page,
    testPrefix,
  }) => {
    const editPage = new DiaryEntryEditPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} entry for delete modal test`,
      });

      await editPage.goto(createdId);
      await expect(editPage.heading).toBeVisible();

      // Open delete modal
      await editPage.openDeleteModal();

      // Modal should be visible with expected content
      await expect(editPage.deleteModal).toBeVisible();
      await expect(editPage.confirmDeleteButton).toBeVisible();
      await expect(editPage.cancelDeleteButton).toBeVisible();
    } finally {
      // Entry may have been deleted by the test — attempt deletion; ignore errors
      if (createdId) {
        try {
          await deleteDiaryEntryViaApi(page, createdId);
        } catch {
          // Already deleted
        }
      }
    }
  });

  test('Cancelling the delete modal leaves the entry and stays on the edit page', async ({
    page,
    testPrefix,
  }) => {
    const editPage = new DiaryEntryEditPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} entry for cancel delete test`,
      });

      await editPage.goto(createdId);
      await expect(editPage.heading).toBeVisible();

      // Open and then cancel the modal
      await editPage.openDeleteModal();
      await expect(editPage.deleteModal).toBeVisible();
      await editPage.cancelDeleteButton.click();

      // Modal should be gone
      await expect(editPage.deleteModal).not.toBeVisible();

      // URL should still be on the edit page
      expect(page.url()).toContain(`/diary/${createdId}/edit`);
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });

  test('Confirming delete on the edit page redirects to /diary', async ({ page, testPrefix }) => {
    const editPage = new DiaryEntryEditPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} entry to delete via edit page`,
      });

      await editPage.goto(createdId);
      await expect(editPage.heading).toBeVisible();

      // Open modal and confirm delete — waitForResponse registered inside confirmDelete()
      await editPage.openDeleteModal();
      await editPage.confirmDelete();

      // Should redirect to /diary
      await page.waitForURL('**/diary');
      expect(page.url()).toContain('/diary');
      expect(page.url()).not.toMatch(/\/diary\/[a-zA-Z0-9-]+$/);

      // Mark as already deleted so finally block does not try again
      createdId = null;
    } finally {
      if (createdId) {
        try {
          await deleteDiaryEntryViaApi(page, createdId);
        } catch {
          // Already deleted
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Delete from detail page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete from detail page (Scenario 8)', { tag: '@responsive' }, () => {
  test('Confirming delete on the detail page redirects to /diary', async ({ page, testPrefix }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} entry to delete via detail page`,
      });

      await detailPage.goto(createdId);
      await expect(detailPage.backButton).toBeVisible();

      // The delete button should be visible for non-automatic entries
      await expect(detailPage.deleteButton).toBeVisible();

      // Open modal and confirm delete
      await detailPage.openDeleteModal();
      await expect(detailPage.deleteModal).toBeVisible();
      await detailPage.confirmDelete();

      // Should redirect to /diary
      await page.waitForURL('**/diary');
      expect(page.url()).toContain('/diary');
      expect(page.url()).not.toMatch(/\/diary\/[a-zA-Z0-9-]+$/);

      createdId = null;
    } finally {
      if (createdId) {
        try {
          await deleteDiaryEntryViaApi(page, createdId);
        } catch {
          // Already deleted
        }
      }
    }
  });

  test('Cancelling the delete modal on the detail page keeps the user on the page', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} entry for cancel delete from detail`,
      });

      await detailPage.goto(createdId);
      await expect(detailPage.backButton).toBeVisible();

      await detailPage.openDeleteModal();
      await expect(detailPage.deleteModal).toBeVisible();
      await detailPage.cancelDeleteButton.click();

      // Modal should be closed
      await expect(detailPage.deleteModal).not.toBeVisible();

      // URL should still be on the detail page
      expect(page.url()).toContain(`/diary/${createdId}`);
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Edit button on detail page navigates to /diary/:id/edit
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit button navigation (Scenario 9)', { tag: '@responsive' }, () => {
  test('Edit button on the detail page navigates to /diary/:id/edit', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    const editPage = new DiaryEntryEditPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} entry for edit button navigation test`,
        title: `${testPrefix} Edit Button Nav Test`,
      });

      await detailPage.goto(createdId);
      await expect(detailPage.backButton).toBeVisible();

      // Edit button (a <Link>) should be visible and navigate to edit page
      await expect(detailPage.editButton).toBeVisible();
      await detailPage.editButton.click();

      await page.waitForURL(`**/diary/${createdId}/edit`);
      expect(page.url()).toContain(`/diary/${createdId}/edit`);

      // The edit page heading should be visible
      await expect(editPage.heading).toBeVisible();
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });

  test('Automatic entries do not show Edit or Delete buttons on the detail page', async ({
    page,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    const mockId = 'mock-auto-entry-forms-001';

    // Mock an automatic entry — edit/delete buttons are not rendered for isAutomatic=true
    await page.route(`/api/diary-entries/${mockId}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: mockId,
            entryType: 'work_item_status',
            entryDate: '2026-03-14',
            title: null,
            body: 'Work item status changed automatically.',
            metadata: null,
            isAutomatic: true,
            sourceEntityType: null,
            sourceEntityId: null,
            photoCount: 0,
            createdBy: null,
            createdAt: '2026-03-14T09:00:00.000Z',
            updatedAt: '2026-03-14T09:00:00.000Z',
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await detailPage.goto(mockId);
      await expect(detailPage.backButton).toBeVisible();

      // Edit and Delete buttons must NOT be visible for automatic entries
      await expect(detailPage.editButton).not.toBeVisible();
      await expect(detailPage.deleteButton).not.toBeVisible();
    } finally {
      await page.unroute(`/api/diary-entries/${mockId}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Responsive — create page has no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 10)', { tag: '@responsive' }, () => {
  test(
    'Create page (type selector step) has no horizontal scroll on current viewport',
    { tag: '@responsive' },
    async ({ page }) => {
      await page.goto(DIARY_CREATE_ROUTE);
      const createPage = new DiaryEntryCreatePage(page);
      await createPage.heading.waitFor({ state: 'visible' });

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    },
  );

  test('Create page (form step) has no horizontal scroll on current viewport', async ({ page }) => {
    const createPage = new DiaryEntryCreatePage(page);
    await createPage.goto();
    await createPage.selectType('general_note');

    await createPage.bodyTextarea.waitFor({ state: 'visible' });

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('Edit page has no horizontal scroll on current viewport', async ({ page, testPrefix }) => {
    const editPage = new DiaryEntryEditPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} edit page responsive test`,
      });

      await editPage.goto(createdId);
      await expect(editPage.heading).toBeVisible();

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
// Additional: Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering', { tag: '@responsive' }, () => {
  test('Create page renders without layout overflow in dark mode', async ({ page }) => {
    const createPage = new DiaryEntryCreatePage(page);
    await createPage.goto();

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await createPage.heading.waitFor({ state: 'visible' });
    await expect(createPage.heading).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Edit page renders without layout overflow in dark mode', async ({ page, testPrefix }) => {
    const editPage = new DiaryEntryEditPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} dark mode edit test`,
      });

      await page.goto(`/diary/${createdId}/edit`);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      await editPage.heading.waitFor({ state: 'visible' });
      await expect(editPage.heading).toBeVisible();

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});
