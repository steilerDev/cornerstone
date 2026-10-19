/**
 * E2E tests for UAT fixes applied to the Site diary (EPIC-13).
 *
 * Issues addressed:
 * - #845: Remove PDF export and print functionality
 * - #842: the breadcrumb navigates to /diary; source entity links show entity title
 * - #838: Automatic events shown in section per date group (UAT R2 #868: now flat div, not collapsible)
 * - #843: After creating entry, navigate to /diary/:id/edit instead of detail page
 * - #844: Dashboard "Recent Diary" card showing latest entries
 *
 * Scenarios covered:
 * 1.  [smoke] Diary list page renders without export button
 * 2.  [smoke] Diary detail "Site diary" breadcrumb navigates to /diary
 * 3.  [smoke] Dashboard "Recent Diary" card is visible
 * 4.  System event row names its subject and offers "Open task" (#2223; was "Go to related item")
 * 5.  System events and manual entries are interleaved in one date group
 * 6.  [smoke] Creating an entry navigates to /diary/:id (detail page) — capture flow:
 *     first character → POST draft → /diary/:id/edit → Save entry → /diary/:id
 * 7.  Dashboard "Recent Diary" card "View All" link navigates to /diary
 * 8.  Diary detail page has no print button
 */

import { test, expect } from '../../fixtures/isolatedUser.js';
import { mockDiaryList, mockSystemEvent } from '../../fixtures/systemEventMocks.js';
import { DiaryPage, DIARY_ROUTE } from '../../pages/DiaryPage.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';
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
// Scenario 2: the breadcrumb navigates to /diary
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Breadcrumb navigates to /diary (Scenario 2)', { tag: '@responsive' }, () => {
  test(
    'The "Site diary" breadcrumb on the detail page navigates to the /diary list page',
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
        await expect(detailPage.loaded).toBeVisible();

        // UAT fix #842: the way back is the "Site diary" breadcrumb (always the list, not browser-back)
        await detailPage.breadcrumbs.trailLink('Site diary').click();

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
  // This test resets `dashboard.hiddenCards` so the Recent Diary card is guaranteed
  // to render. On the shared admin that reset collided with dashboard.spec.ts, which
  // resets the same key for its own tests and asserts card visibility against it
  // (Issue #1957). Run it as a dedicated user instead, so the row is unreachable by
  // any other test. Per-test rather than per-worker because a worker-scoped option
  // cannot be set inside a describe, and only 2 of this file's 8 tests need it.
  // Nothing here is admin-gated: the test only reads the dashboard with
  // `/api/diary-entries` mocked.
  test.use({ isolatedUserPerTest: { emailPrefix: 'diary-dash', displayName: 'E2E Diary User' } });

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
      // Reset hidden cards on this test's dedicated user to ensure "Recent Diary" is
      // visible. A freshly created user has no preference rows at all, so this is
      // belt-and-braces rather than load-bearing — but it keeps the precondition
      // explicit and would still hold if a dismiss step were added here later.
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
// Scenario 4: a system event names its subject and links to it (#2223: replaces "Go to related item")
// ─────────────────────────────────────────────────────────────────────────────
test.describe('System event subject and link (Scenario 4)', () => {
  test('A system event row names the task and offers "Open task" instead of "Go to related item"', async ({
    page,
  }) => {
    const mockEntryId = 'mock-uat-source-001';
    const mockWorkItemTitle = 'Foundation Waterproofing';

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            mockDiaryList([
              mockSystemEvent({
                id: mockEntryId,
                sourceEntityId: 'wi-mock-001',
                sourceEntityTitle: mockWorkItemTitle,
              }),
            ]),
          ),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await page.goto(DIARY_ROUTE);
      const diaryPage = new DiaryPage(page);
      await diaryPage.heading.waitFor({ state: 'visible' });

      await expect(diaryPage.systemEventRow(mockEntryId)).toContainText(
        `${mockWorkItemTitle} went from Not started to In progress`,
      );
      await expect(diaryPage.systemEventLink(mockEntryId)).toHaveText(/Open task/);
      await expect(page.getByText('Go to related item')).toHaveCount(0);
      await expect(page.getByTestId('source-link-wi-mock-001')).toHaveCount(0);
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Automatic events are in a collapsible section
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Automatic events interleaved (Scenario 5)', { tag: '@responsive' }, () => {
  test('Automatic and manual entries are interleaved in the same date group', async ({ page }) => {
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
              mockSystemEvent({
                id: 'mock-auto-001',
                createdAt: '2026-03-14T08:00:00.000Z',
                sourceEntityId: 'wi-auto-001',
                sourceEntityTitle: 'Auto Work Item',
              }),
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

      // Both entries should be visible in the same date group
      await expect(diaryPage.entryCard('mock-manual-001')).toBeVisible();
      await expect(diaryPage.systemEventRow('mock-auto-001')).toBeVisible();
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Creating an entry navigates through the two-step draft flow to /diary/:id
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create navigates to detail page (Scenario 6)', { tag: '@responsive' }, () => {
  test(
    'Saving the new entry navigates to /diary/:id (detail page)',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const capture = new DiaryCapturePage(page);
      let createdId: string | null = null;

      try {
        await capture.goto();

        // #2221 flow: the first character creates the draft (POST) and the URL becomes
        // /diary/:id/edit (replace history). Register the POST listener BEFORE typing.
        const draftResponsePromise = page.waitForResponse(
          (resp) => resp.url().includes('/api/diary-entries') && resp.request().method() === 'POST',
        );

        await capture.typeTitle(`${testPrefix} UAT Create Nav Test`);
        const draftResponse = await draftResponsePromise;
        expect(draftResponse.ok(), 'Draft creation should succeed').toBeTruthy();

        const responseBody = (await draftResponse.json()) as { id: string };
        createdId = responseBody.id;

        await page.waitForURL(new RegExp(`/diary/${createdId}/edit$`));
        expect(page.url()).toMatch(new RegExp(`/diary/${createdId}/edit$`));

        // The capture form (a "New entry" screen with Save entry) stays on screen
        await expect(capture.heading).toContainText('New entry');
        await expect(capture.saveButton).toHaveText('Save entry');

        await capture.typeText(`${testPrefix} create nav to detail body`);

        // Register the promote PATCH listener BEFORE tapping Save
        const promoteResponsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes(`/api/diary-entries/${createdId}/promote`) &&
            resp.request().method() === 'PATCH',
        );

        // Tap "Save entry" — promotes the draft to saved status
        await capture.saveButton.scrollIntoViewIfNeeded();
        await capture.saveEntry();
        const promoteResponse = await promoteResponsePromise;
        expect(promoteResponse.ok(), 'Promote should succeed').toBeTruthy();

        // After promote: navigate to /diary/:id (detail page)
        await page.waitForURL(new RegExp(`/diary/${createdId}$`));
        expect(page.url()).toMatch(new RegExp(`/diary/${createdId}$`));

        // The entry has loaded (confirms we're on the detail page)
        await expect(new DiaryEntryDetailPage(page).loaded).toBeVisible();
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
  // Same `dashboard.hiddenCards` collision as Scenario 3 — see the comment there.
  test.use({ isolatedUserPerTest: { emailPrefix: 'diary-dash', displayName: 'E2E Diary User' } });

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
      // Reset hidden cards on this test's dedicated user (see Scenario 3's note)
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
      await expect(detailPage.loaded).toBeVisible();

      // UAT fix #845: print button removed from detail page
      const printButton = page.getByRole('button', { name: /Print/i });
      await expect(printButton).not.toBeVisible();
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});
