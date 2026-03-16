/**
 * E2E tests for UAT fixes applied to the Construction Diary (EPIC-13).
 *
 * Issues addressed:
 * - #845: Remove PDF export and print functionality
 * - #842: Back button navigates to /diary; source entity links show entity title
 * - #838: Automatic events shown in section per date group (UAT R2 #868: now flat div, not collapsible)
 * - #843: After creating entry, navigate to /diary/:id/edit instead of detail page
 * - #844: Dashboard "Recent Diary" card showing latest entries
 *
 * Scenarios covered:
 * 1.  [smoke] Diary list page renders without export button
 * 2.  [smoke] Diary detail back button navigates to /diary (not browser-back)
 * 3.  [smoke] Dashboard "Recent Diary" card is visible
 * 4.  Source entity title displayed in diary card source link
 * 5.  Automatic events are in a flat "Automated Events" section (UAT R2 #868: changed from collapsible) per date group
 * 6.  Creating an entry navigates to /diary/:id (detail page) — UAT R2 #867 changed from /edit
 * 7.  Dashboard "Recent Diary" card "View All" link navigates to /diary
 * 8.  Diary detail page has no print button
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryPage, DIARY_ROUTE } from '../../pages/DiaryPage.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { DiaryEntryCreatePage } from '../../pages/DiaryEntryCreatePage.js';
import { DashboardPage } from '../../pages/DashboardPage.js';
import { createDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Diary list page renders without export button
// ─────────────────────────────────────────────────────────────────────────────
test.describe('No export button (Scenario 1)', { tag: '@responsive' }, () => {
  test('Diary list page does not show an Export button', { tag: '@smoke' }, async ({ page }) => {
    const diaryPage = new DiaryPage(page);
    await diaryPage.goto();

    // UAT fix #845: export feature removed — no button with name matching /Export/i
    const exportButton = page.getByRole('button', { name: /Export/i });
    await expect(exportButton).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Back button navigates to /diary
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Back button navigates to /diary (Scenario 2)', { tag: '@responsive' }, () => {
  test(
    'Back button on diary detail page navigates to the /diary list page',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new DiaryEntryDetailPage(page);
      let createdId: string | null = null;

      try {
        createdId = await createDiaryEntryViaApi(page, {
          entryType: 'general_note',
          entryDate: '2026-03-14',
          body: `${testPrefix} back button navigation test`,
          title: `${testPrefix} Back Nav Test`,
        });

        await detailPage.goto(createdId);
        await expect(detailPage.backButton).toBeVisible();

        // UAT fix #842: back button calls navigate('/diary') — always goes to list, not browser-back
        await detailPage.backButton.click();

        // Must land on /diary (exact path, not /diary/:id)
        await page.waitForURL('**/diary', { timeout: 15_000 });
        expect(page.url()).toMatch(/\/diary$/);
      } finally {
        if (createdId) await deleteDiaryEntryViaApi(page, createdId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Dashboard "Recent Diary" card is visible
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dashboard Recent Diary card (Scenario 3)', { tag: '@responsive' }, () => {
  test('Dashboard page shows a "Recent Diary" card', { tag: '@smoke' }, async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    // Mock diary entries so the card renders content reliably
    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [],
            pagination: { total: 0, page: 1, pageSize: 5, totalPages: 0, totalItems: 0 },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      // Reset hidden cards to ensure "Recent Diary" is visible
      await page.request.patch('/api/users/me/preferences', {
        data: { key: 'dashboard.hiddenCards', value: '[]' },
      });

      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      // UAT fix #844: "Recent Diary" card added to dashboard
      const recentDiaryCard = dashboardPage.recentDiaryCard();
      await expect(recentDiaryCard.first()).toBeVisible();

      // The card heading must be "Recent Diary"
      const cardHeading = recentDiaryCard.first().getByRole('heading', {
        name: 'Recent Diary',
        level: 2,
      });
      await expect(cardHeading).toBeVisible();
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Source entity title shown in diary card source link
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Source entity title in diary card (Scenario 4)', () => {
  test('Diary entry card shows sourceEntityTitle in the source link', async ({ page }) => {
    // Mock the diary list to return an automatic entry with a sourceEntityTitle
    const mockEntryId = 'mock-uat-source-001';
    const mockWorkItemTitle = 'Foundation Waterproofing';

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: mockEntryId,
                entryType: 'work_item_status',
                entryDate: '2026-03-14',
                title: null,
                body: 'Work item status changed to in_progress',
                metadata: null,
                isAutomatic: true,
                sourceEntityType: 'work_item',
                sourceEntityId: 'wi-mock-001',
                sourceEntityTitle: mockWorkItemTitle,
                photoCount: 0,
                createdBy: null,
                createdAt: '2026-03-14T09:00:00.000Z',
                updatedAt: '2026-03-14T09:00:00.000Z',
              },
            ],
            pagination: { total: 1, page: 1, pageSize: 25, totalPages: 1, totalItems: 1 },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await page.goto(DIARY_ROUTE);
      const diaryPage = new DiaryPage(page);
      await diaryPage.heading.waitFor({ state: 'visible' });

      // UAT R2 fix #868: automatic events are now a flat bordered div (not a collapsible).
      // The section is directly visible — no interaction needed to reveal its contents.
      const automaticSection = page.getByTestId('automatic-section-2026-03-14');
      await automaticSection.waitFor({ state: 'visible' });

      // Automatic entries show "Go to related item" as link text (UAT fix #876)
      const sourceLink = page.getByTestId(`source-link-wi-mock-001`);
      await expect(sourceLink).toBeVisible();
      await expect(sourceLink).toHaveText('Go to related item');
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Automatic events are in a collapsible section
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Automatic events flat section (Scenario 5)', { tag: '@responsive' }, () => {
  test('Date group renders automatic events inside a flat "Automated Events" div section', async ({
    page,
  }) => {
    // Mock diary entries: one manual + one automatic on the same date
    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'mock-manual-001',
                entryType: 'general_note',
                entryDate: '2026-03-14',
                title: 'Manual note',
                body: 'Some manual note content',
                metadata: null,
                isAutomatic: false,
                sourceEntityType: null,
                sourceEntityId: null,
                sourceEntityTitle: null,
                photoCount: 0,
                createdBy: null,
                createdAt: '2026-03-14T09:00:00.000Z',
                updatedAt: '2026-03-14T09:00:00.000Z',
              },
              {
                id: 'mock-auto-001',
                entryType: 'work_item_status',
                entryDate: '2026-03-14',
                title: null,
                body: 'Work item status changed automatically.',
                metadata: null,
                isAutomatic: true,
                sourceEntityType: 'work_item',
                sourceEntityId: 'wi-auto-001',
                sourceEntityTitle: 'Auto Work Item',
                photoCount: 0,
                createdBy: null,
                createdAt: '2026-03-14T08:00:00.000Z',
                updatedAt: '2026-03-14T08:00:00.000Z',
              },
            ],
            pagination: { total: 2, page: 1, pageSize: 25, totalPages: 1, totalItems: 2 },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await page.goto(DIARY_ROUTE);
      const diaryPage = new DiaryPage(page);
      await diaryPage.heading.waitFor({ state: 'visible' });
      await diaryPage.waitForLoaded();

      // UAT R2 fix #868: automatic events are now a flat bordered div (not a collapsible).
      // The section has data-testid="automatic-section-{date}" and contains a header with
      // "Automated Events" text.
      const automaticSection = page.getByTestId('automatic-section-2026-03-14');
      await expect(automaticSection).toBeVisible();

      // Verify the section contains the "Automated Events" heading text
      await expect(automaticSection).toContainText('Automated Events');

      // Verify it is a div, not a details element
      const tagName = await automaticSection.evaluate((el) => el.tagName.toLowerCase());
      expect(tagName).toBe('div');
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Creating an entry navigates to /diary/:id/edit
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create navigates to detail page (Scenario 6)', { tag: '@responsive' }, () => {
  test(
    'Submitting the create form navigates to /diary/:id (detail page)',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const createPage = new DiaryEntryCreatePage(page);
      let createdId: string | null = null;

      try {
        await createPage.goto();
        await createPage.selectType('general_note');

        await createPage.titleInput.waitFor({ state: 'visible' });
        await createPage.titleInput.fill(`${testPrefix} UAT Create Nav Test`);
        await createPage.bodyTextarea.fill(`${testPrefix} create nav to detail body`);

        // Register response listener BEFORE submit
        const responsePromise = page.waitForResponse(
          (resp) => resp.url().includes('/api/diary-entries') && resp.request().method() === 'POST',
        );

        await createPage.submit();
        const response = await responsePromise;
        expect(response.ok()).toBeTruthy();

        const responseBody = (await response.json()) as { id: string };
        createdId = responseBody.id;

        // UAT R2 fix #867: navigates to detail page (not edit page) after creation
        // Photo upload is now done during creation itself (on create form), so the
        // edit page redirect is no longer needed.
        await page.waitForURL(`**/diary/${createdId}`);
        expect(page.url()).toMatch(new RegExp(`/diary/${createdId}$`));

        // Detail page back button should be visible (confirms we're on detail page)
        const backButton = page.getByLabel('Go back to diary');
        await expect(backButton).toBeVisible();
      } finally {
        if (createdId) await deleteDiaryEntryViaApi(page, createdId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Dashboard diary card "View All" navigates to /diary
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Recent Diary "View All" link (Scenario 7)', { tag: '@responsive' }, () => {
  test('Clicking "View All" in the Recent Diary card navigates to /diary', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    // Provide mock diary entries so the RecentDiaryCard footer renders (it only renders
    // the "View All" link when entries.length > 0)
    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'mock-recent-001',
                entryType: 'general_note',
                entryDate: '2026-03-14',
                title: 'Recent note',
                body: 'Some body text for the recent note',
                metadata: null,
                isAutomatic: false,
                sourceEntityType: null,
                sourceEntityId: null,
                sourceEntityTitle: null,
                photoCount: 0,
                createdBy: null,
                createdAt: '2026-03-14T09:00:00.000Z',
                updatedAt: '2026-03-14T09:00:00.000Z',
              },
            ],
            pagination: { total: 1, page: 1, pageSize: 5, totalPages: 1, totalItems: 1 },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      // Reset hidden cards
      await page.request.patch('/api/users/me/preferences', {
        data: { key: 'dashboard.hiddenCards', value: '[]' },
      });

      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      // On mobile the Recent Diary card may be inside the primary section of mobile layout.
      // The card() helper finds article elements in both grid and mobile sections.
      const viewAllLink = dashboardPage.recentDiaryViewAllLink();
      await expect(viewAllLink.first()).toBeVisible();

      await viewAllLink.first().click();

      // Should navigate to /diary
      await page.waitForURL('**/diary', { timeout: 15_000 });
      expect(page.url()).toMatch(/\/diary$/);
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Detail page has no print button
// ─────────────────────────────────────────────────────────────────────────────
test.describe('No print button on detail page (Scenario 8)', { tag: '@responsive' }, () => {
  test('Diary entry detail page does not show a Print button', async ({ page, testPrefix }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} no print button test`,
        title: `${testPrefix} No Print Test`,
      });

      await detailPage.goto(createdId);
      await expect(detailPage.backButton).toBeVisible();

      // UAT fix #845: print button removed from detail page
      const printButton = page.getByRole('button', { name: /Print/i });
      await expect(printButton).not.toBeVisible();
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});
