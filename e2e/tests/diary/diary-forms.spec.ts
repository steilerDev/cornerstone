/**
 * E2E tests for Diary Entry Create, Edit, and Delete flows
 *
 * Story #805: Diary entry creation, editing, and deletion
 *
 * Scenarios covered:
 * 1.  [smoke] Type selector shows 5 type cards at /diary/new
 * 2.  [smoke] Create general_note — happy path (fill body, submit, verify edit page)
 *             Note: UAT fix #843 changed post-creation navigation from /diary/:id to /diary/:id/edit
 * 3.  Create daily_log with weather/temperature/workers metadata
 * 4.  Create site_visit with inspector name and outcome metadata
 * 5.  Validation error — empty body shows error, no navigation
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

    // Form fields should be visible
    await expect(createPage.bodyTextarea).toBeVisible();
    await expect(createPage.submitButton).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Create general_note — happy path
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create general_note — happy path (Scenario 2)', { tag: '@responsive' }, () => {
  test(
    'Creates a general_note entry and navigates to the edit page',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const createPage = new DiaryEntryCreatePage(page);
      const editPage = new DiaryEntryEditPage(page);
      let createdId: string | null = null;

      try {
        await createPage.goto();
        await createPage.selectType('general_note');

        // Fill required fields
        const body = `${testPrefix} general note body text`;
        const title = `${testPrefix} General Note Create Test`;

        await createPage.titleInput.waitFor({ state: 'visible' });
        await createPage.titleInput.fill(title);
        await createPage.bodyTextarea.fill(body);

        // Register the waitForResponse BEFORE submitting
        const responsePromise = page.waitForResponse(
          (resp) => resp.url().includes('/api/diary-entries') && resp.request().method() === 'POST',
        );

        await createPage.submit();
        const response = await responsePromise;
        expect(response.ok()).toBeTruthy();

        const responseBody = (await response.json()) as { id: string };
        createdId = responseBody.id;

        // UAT fix #843: after creation, the app navigates to /diary/:id/edit (not /diary/:id)
        // so users can immediately attach photos
        await page.waitForURL(`**/diary/${createdId}/edit`);
        expect(page.url()).toContain(`/diary/${createdId}/edit`);

        // Edit page should be loaded (heading visible)
        await expect(editPage.heading).toBeVisible();
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
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      await createPage.goto();
      await createPage.selectType('daily_log');

      const body = `${testPrefix} daily log with metadata`;

      await createPage.bodyTextarea.fill(body);

      // Fill daily_log-specific metadata
      await createPage.weatherSelect.waitFor({ state: 'visible' });
      await createPage.weatherSelect.selectOption('sunny');
      await createPage.temperatureInput.fill('22');
      await createPage.workersInput.fill('8');

      // Register the response listener BEFORE submitting
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/diary-entries') && resp.request().method() === 'POST',
      );

      await createPage.submit();
      const response = await responsePromise;
      expect(response.ok()).toBeTruthy();

      const responseBody = (await response.json()) as { id: string };
      createdId = responseBody.id;

      // UAT fix #843: navigate to edit page after creation
      await page.waitForURL(`**/diary/${createdId}/edit`);

      // Navigate to the detail page to verify metadata
      await detailPage.goto(createdId);

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
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      await createPage.goto();
      await createPage.selectType('site_visit');

      const body = `${testPrefix} site visit with outcome`;

      await createPage.bodyTextarea.fill(body);

      // Fill site_visit-specific metadata (both required)
      await createPage.inspectorNameInput.waitFor({ state: 'visible' });
      await createPage.inspectorNameInput.fill('Jane Inspector');
      await createPage.outcomeSelect.selectOption('pass');

      // Register the response listener BEFORE submitting
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/diary-entries') && resp.request().method() === 'POST',
      );

      await createPage.submit();
      const response = await responsePromise;
      expect(response.ok()).toBeTruthy();

      const responseBody = (await response.json()) as { id: string };
      createdId = responseBody.id;

      // UAT fix #843: navigate to edit page after creation
      await page.waitForURL(`**/diary/${createdId}/edit`);

      // Navigate to the detail page to verify metadata
      await detailPage.goto(createdId);

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

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Validation error — empty body
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Validation errors (Scenario 5)', () => {
  test('Submitting with an empty body shows a validation error and does not navigate', async ({
    page,
  }) => {
    const createPage = new DiaryEntryCreatePage(page);
    await createPage.goto();

    // Select a type to get to the form step
    await createPage.selectType('general_note');

    // Fill the body with whitespace only: native HTML5 required validation passes
    // (textarea is non-empty at the DOM level) but React's validateForm() trims the
    // value and produces a "Entry text is required" error.
    await createPage.bodyTextarea.fill(' ');

    // Submit — handleSubmit fires, validateForm() detects trimmed body is empty
    await createPage.submit();

    // URL should remain on /diary/new
    expect(page.url()).toContain('/diary/new');

    // Validation error should be shown via role="alert"
    const errors = await createPage.getValidationErrors();
    expect(errors.length).toBeGreaterThan(0);
    const hasBodyError = errors.some((e) => e.toLowerCase().includes('entry text is required'));
    expect(hasBodyError).toBe(true);
  });

  test('site_visit form requires inspector name', async ({ page }) => {
    const createPage = new DiaryEntryCreatePage(page);
    await createPage.goto();
    await createPage.selectType('site_visit');

    // Fill body so the textarea's native required validation passes
    await createPage.bodyTextarea.fill('Site visit body text');

    // Fill inspector name with whitespace only — native required on the text input passes
    // (non-empty), but React validateForm() trims the value and produces an error.
    // Select an outcome value so the outcome select's native required validation also passes,
    // allowing handleSubmit to fire and exercise the React validation path.
    await createPage.inspectorNameInput.waitFor({ state: 'visible' });
    await createPage.inspectorNameInput.fill(' ');
    await createPage.outcomeSelect.selectOption('pass');
    // Reset outcome back to empty via selectOption to test missing outcome error.
    // The outcome select uses value="" for the placeholder option — native validation
    // would block this, so instead we check inspector-only error when outcome is present.
    // (Testing both missing fields simultaneously is not feasible without disabling native
    // HTML5 form validation, which is browser-managed for <select required> with value="".)

    await createPage.submit();

    // URL should remain on /diary/new
    expect(page.url()).toContain('/diary/new');

    // React validation error for the whitespace-only inspector name should appear
    const errors = await createPage.getValidationErrors();
    expect(errors.length).toBeGreaterThan(0);
    const hasInspectorError = errors.some((e) =>
      e.toLowerCase().includes('inspector name is required'),
    );
    expect(hasInspectorError).toBe(true);
  });
});

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
