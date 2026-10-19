/**
 * E2E tests for Diary Entry Create, Edit, and Delete flows
 *
 * Story #805: Diary entry creation, editing, and deletion
 * Story #2221: the capture screen replaces the type-card picker and the edit form.
 *
 * Scenarios covered:
 * 1.  [smoke] /diary/new is the capture screen: photo controls, three type chips plus the More
 *             menu (Defect, Note); picking a type creates nothing, the first character creates a
 *             draft and the URL becomes /diary/:id/edit (replace history)
 * 2.  [smoke] Create general_note — happy path: type, title and text, Save entry -> /diary/:id
 * 3.  Create daily_log with weather/workers metadata (More details chips)
 * 4.  Create site_visit with inspector name and outcome metadata (chips)
 * 5.  [removed] Validation on submit (#1426); promote-time validation is in diary-drafts.spec.ts
 *             and capture-screen.spec.ts (scenario 13)
 * 6.  Edit entry — form pre-populated with existing values, Save changes returns to the entry
 * 7.  Edit page offers no Delete (it stays on the entry page); Cancel returns to the entry
 * 8.  Delete from detail page — modal confirm, redirects to /diary
 * 9.  Edit button on detail page navigates to /diary/:id/edit
 * 10. [responsive] Create page has no horizontal scroll on current viewport
 * 14. [responsive] The discard dialog on the capture screen is a shared dialog (Escape, close
 *             button, focus)
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import {
  createDiaryEntryViaApi,
  createDraftDiaryEntryViaApi,
  deleteDiaryEntryViaApi,
} from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: The capture screen's type chips
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Capture screen types (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Create page shows the photo controls and all five entry types',
    { tag: '@smoke' },
    async ({ page }) => {
      const capture = new DiaryCapturePage(page);
      await capture.goto();

      await expect(capture.heading).toContainText('New entry');
      await expect(capture.chooseButton).toBeVisible();

      // Three type chips ...
      await expect(capture.typeChip('daily_log')).toBeVisible();
      await expect(capture.typeChip('site_visit')).toBeVisible();
      await expect(capture.typeChip('delivery')).toBeVisible();

      // ... and Defect and Note behind the More menu
      await capture.tap(capture.moreTypeTrigger);
      await expect(capture.moreTypeOption('issue')).toBeVisible();
      await expect(capture.moreTypeOption('general_note')).toBeVisible();
    },
  );

  test('Picking a type creates nothing; the first character creates the draft', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
    let draftId: string | null = null;
    const created: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/diary-entries') {
        created.push(request.url());
      }
    });

    try {
      await capture.goto();
      await capture.selectType('general_note');
      await expect(capture.moreTypeTrigger).toHaveAttribute('data-current', 'true');
      expect(created).toHaveLength(0);
      await expect(page).toHaveURL(/\/diary\/new$/);

      // #2221: the first character fires POST /api/diary-entries (status: 'draft')
      const draftResponsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/diary-entries') && resp.request().method() === 'POST',
      );
      await capture.typeTitle(`${testPrefix} first`);
      const draftResponse = await draftResponsePromise;
      expect(draftResponse.ok()).toBeTruthy();
      draftId = ((await draftResponse.json()) as { id: string }).id;

      // The draft screen is the same capture screen on /diary/:id/edit
      await page.waitForURL(/diary\/.+\/edit$/);
      await expect(capture.heading).toContainText('New entry');
      await expect(capture.saveButton).toHaveText('Save entry');
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
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
      const capture = new DiaryCapturePage(page);
      const detailPage = new DiaryEntryDetailPage(page);
      let createdId: string | null = null;

      try {
        await capture.goto();
        await capture.selectType('general_note');

        const body = `${testPrefix} general note body text`;
        const title = `${testPrefix} General Note Create Test`;

        // The first character creates the draft and the URL becomes /diary/:id/edit
        const draftResponsePromise = page.waitForResponse(
          (resp) => resp.url().includes('/api/diary-entries') && resp.request().method() === 'POST',
        );
        await capture.typeTitle(title);
        const draftResponse = await draftResponsePromise;
        expect(draftResponse.ok(), 'Draft creation should succeed').toBeTruthy();
        createdId = ((await draftResponse.json()) as { id: string }).id;
        await page.waitForURL(new RegExp(`/diary/${createdId}/edit$`));

        await capture.typeText(body);

        // Register the promote PATCH listener BEFORE tapping Save entry
        const promoteResponsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes(`/api/diary-entries/${createdId}/promote`) &&
            resp.request().method() === 'PATCH',
        );
        await capture.saveButton.scrollIntoViewIfNeeded();
        await capture.saveEntry();
        const promoteResponse = await promoteResponsePromise;
        expect(promoteResponse.ok(), 'Promote should succeed').toBeTruthy();

        // After promote: navigate to /diary/:id (detail page)
        await page.waitForURL(new RegExp(`/diary/${createdId}$`));
        await expect(detailPage.loaded).toBeVisible();
        await expect(detailPage.entryBody).toContainText(body);
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
    const capture = new DiaryCapturePage(page);
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      await capture.goto();
      await capture.selectType('daily_log');
      await capture.typeText(`${testPrefix} daily log with metadata`);
      createdId = await capture.waitForDraft();

      // Workers 4+ reveals the exact number input; weather sits under More details
      await capture.tap(capture.workersChip('4+'));
      await capture.workersExact.fill('8');
      await capture.openMoreDetails();
      await capture.tap(capture.weatherChip('sunny'));
      await expect(capture.weatherChip('sunny')).toHaveAttribute('aria-pressed', 'true');

      // Autosave puts the values on the server before the entry is saved
      await expect
        .poll(async () => {
          const response = await page.request.get(`/api/diary-entries/${createdId}`);
          const entry = (await response.json()) as { metadata: Record<string, unknown> | null };
          return [entry.metadata?.weather, entry.metadata?.workersOnSite];
        })
        .toEqual(['sunny', 8]);

      await capture.saveEntry();
      await page.waitForURL(new RegExp(`/diary/${createdId}$`));

      // DiaryMetadataSummary for daily_log renders the weather and the workers count
      await detailPage.loaded.waitFor({ state: 'visible' });
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
    const capture = new DiaryCapturePage(page);
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      await capture.goto();
      await capture.selectType('site_visit');
      await capture.typeText(`${testPrefix} site visit with outcome`);
      createdId = await capture.waitForDraft();

      // Both Inspector and Outcome are required for a site visit
      await capture.inspectorInput.fill('Jane Inspector');
      await capture.tap(capture.outcomeChip('pass'));
      await expect(capture.outcomeChip('pass')).toHaveAttribute('aria-pressed', 'true');

      await capture.saveEntry();
      await page.waitForURL(new RegExp(`/diary/${createdId}$`));

      await detailPage.loaded.waitFor({ state: 'visible' });
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
// Validation now fires when the draft is saved. Coverage: diary-drafts.spec.ts (Save with
// nothing in it) and capture-screen.spec.ts scenario 13 (site visit and defect rules).

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Edit entry — form pre-populated, save redirects to detail
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit entry (Scenario 6)', { tag: '@responsive' }, () => {
  test('Edit page pre-populates form with existing entry values', async ({ page, testPrefix }) => {
    const capture = new DiaryCapturePage(page);
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

      await capture.gotoEdit(createdId);

      // A saved entry reads "Edit entry · <date>" and is pre-populated
      await expect(capture.heading).toContainText('Edit entry · ');
      await expect(capture.textArea).toHaveValue(originalBody);
      await expect(capture.titleInput).toHaveValue(originalTitle);
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });

  test('Editing and saving an entry navigates back to the detail page', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
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

      await capture.gotoEdit(createdId);
      await capture.typeText(updatedBody);

      // The sticky bar keeps Save changes in reach on every viewport
      await expect(capture.saveButton).toHaveText('Save changes');
      await capture.saveChanges();

      await page.waitForURL(`**/diary/${createdId}`);
      await detailPage.loaded.waitFor({ state: 'visible' });
      await expect(detailPage.entryBody).toContainText(updatedBody);
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });

  test('Editing a daily_log entry preserves existing metadata in the form', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
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

      await capture.gotoEdit(createdId);

      // Workers is on the page, weather and temperature sit under More details
      await expect(capture.workersChip('3')).toHaveAttribute('aria-pressed', 'true');
      await capture.openMoreDetails();
      await expect(capture.weatherChip('cloudy')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByLabel('Temperature (°C)', { exact: true })).toHaveValue('15');
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Delete lives on the entry page, not on the edit page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit page has no Delete (Scenario 7)', { tag: '@responsive' }, () => {
  test('A saved entry offers Cancel but no Delete or menu on the edit page', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} entry for delete modal test`,
      });

      await capture.gotoEdit(createdId);
      await expect(capture.heading).toContainText('Edit entry · ');

      // Delete moved to the entry page (the capture screen is for capturing and editing)
      await expect(page.getByRole('button', { name: /^Delete/ })).toHaveCount(0);
      await expect(capture.menuButton).toHaveCount(0);
      await expect(capture.discardItem).toHaveCount(0);
      await expect(capture.cancelButton).toBeVisible();
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });

  test('Cancel without changes returns to the entry page and keeps the entry', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} entry for cancel test`,
      });

      await capture.gotoEdit(createdId);
      await capture.tap(capture.cancelButton);

      // A clean form leaves at once, without asking
      await expect(page).toHaveURL(new RegExp(`/diary/${createdId}$`));
      await expect(detailPage.loaded).toBeVisible();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
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
      await expect(detailPage.loaded).toBeVisible();

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
      await expect(detailPage.loaded).toBeVisible();

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
    const capture = new DiaryCapturePage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} entry for edit button navigation test`,
        title: `${testPrefix} Edit Button Nav Test`,
      });

      await detailPage.goto(createdId);
      await expect(detailPage.loaded).toBeVisible();

      // Edit button (a <Link>) should be visible and navigate to the capture screen
      await expect(detailPage.editButton).toBeVisible();
      await detailPage.editButton.click();

      await page.waitForURL(`**/diary/${createdId}/edit`);
      await capture.waitForForm();
      await expect(capture.heading).toContainText('Edit entry · ');
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
      await expect(detailPage.loaded).toBeVisible();

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
    'Create page has no horizontal scroll on current viewport',
    { tag: '@responsive' },
    async ({ page }) => {
      const capture = new DiaryCapturePage(page);
      await capture.goto();

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    },
  );

  test('Edit page has no horizontal scroll on current viewport', async ({ page, testPrefix }) => {
    const capture = new DiaryCapturePage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} edit page responsive test`,
      });

      await capture.gotoEdit(createdId);
      await expect(capture.heading).toBeVisible();

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
    const capture = new DiaryCapturePage(page);
    await capture.goto();

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await expect(capture.heading).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Edit page renders without layout overflow in dark mode', async ({ page, testPrefix }) => {
    const capture = new DiaryCapturePage(page);
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

      await capture.waitForForm();
      await expect(capture.heading).toBeVisible();

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
// Scenario 14: Shared dialog behaviour on the capture screen (#2124/#2125 bundle)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Shared dialog on the capture screen (Scenario 14)', { tag: '@responsive' }, () => {
  test('discard dialog closes on Escape and via the close button', async ({ page }) => {
    const capture = new DiaryCapturePage(page);
    const id = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

    try {
      await capture.gotoEdit(id);
      await capture.tap(capture.menuButton);
      await capture.tap(capture.discardItem);
      await capture.discardDialog.waitForOpen();
      await page.keyboard.press('Escape');
      await expect(capture.discardDialog.dialog).not.toBeVisible();

      await capture.tap(capture.menuButton);
      await capture.tap(capture.discardItem);
      await capture.discardDialog.waitForOpen();
      await capture.discardDialog.dialog.getByRole('button', { name: 'Close dialog' }).click();
      await expect(capture.discardDialog.dialog).not.toBeVisible();
    } finally {
      await deleteDiaryEntryViaApi(page, id);
    }
  });

  test('discard dialog moves focus inside the dialog', async ({ page }) => {
    const capture = new DiaryCapturePage(page);
    const id = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

    try {
      await capture.gotoEdit(id);
      await capture.tap(capture.menuButton);
      await capture.tap(capture.discardItem);
      await capture.discardDialog.waitForOpen();
      // #2209: the safe action (Keep entry) takes the initial focus
      await expect(capture.discardDialog.cancelButton).toBeFocused();
    } finally {
      await deleteDiaryEntryViaApi(page, id);
    }
  });
});
