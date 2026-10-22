/**
 * E2E tests for UAT fixes applied to the Site diary (EPIC-13).
 *
 * Issues addressed:
 * - #845: Remove PDF export and print functionality
 * - #842: the breadcrumb navigates to /diary; source entity links show entity title
 * - #838: Automatic events shown in section per date group (UAT R2 #868: now flat div, not collapsible)
 * - #843: After creating entry, navigate to /diary/:id/edit instead of detail page
 * - #844: latest entries on Home (the Recent Diary card became "Latest from the site", #2230)
 *
 * Scenarios covered:
 * 1.  [smoke] Diary list page renders without export button
 * 2.  [smoke] Diary detail "Site diary" breadcrumb navigates to /diary
 * 3.  [smoke] Home "Latest from the site" section is visible
 * 4.  System event row (on History) names its subject and offers "Open task" (#2223)
 * 5.  The Site diary lists manual entries only (#2224; system events live on History)
 * 6.  [smoke] Creating an entry navigates to /diary/:id (detail page) — capture flow:
 *     first character → POST draft → /diary/:id/edit → Save entry → /diary/:id
 * 7.  Home "Latest from the site" "Site diary" link navigates to /diary
 * 8.  Diary detail page has no print button
 */

import { test, expect } from '../../fixtures/isolatedUser.js';
import { mockDiaryList, mockSystemEvent } from '../../fixtures/systemEventMocks.js';
import { DiaryPage, DIARY_ROUTE } from '../../pages/DiaryPage.js';
import { HistoryPage } from '../../pages/HistoryPage.js';
import { stubUnfinishedEmpty } from '../../fixtures/diaryMocks.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';
import { HomePage } from '../../pages/HomePage.js';
import {
  installHomeMocks,
  mockHomeDiaryEntry,
  newHomeMockState,
} from '../../fixtures/homeMocks.js';
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
// Scenario 3: Home "Latest from the site" section is visible (replaces the Recent Diary card)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Home Latest from the site (Scenario 3)', { tag: '@responsive' }, () => {
  // The section is Home's (#2230); the diary list is mocked and the home preferences are
  // per-user, so this test runs as a dedicated user (per test: a worker-scoped option cannot
  // be set inside a describe).
  test.use({ isolatedUserPerTest: { emailPrefix: 'diary-home', displayName: 'E2E Diary User' } });

  test(
    'Home shows a "Latest from the site" section with the saved entries',
    { tag: '@smoke' },
    async ({ page }) => {
      const state = newHomeMockState({
        diary: [mockHomeDiaryEntry({ id: 'mock-latest-001', title: 'Mock site note' })],
      });
      await page.request.patch('/api/users/me/preferences', {
        data: { key: 'home.hiddenSections', value: '[]' },
      });
      await installHomeMocks(page, state);
      const home = new HomePage(page);
      await home.goto();

      await expect(home.sectionHeading('Latest from the site')).toBeVisible();
      await expect(home.latestRows()).toHaveCount(1);
      await expect(home.latest).toContainText('Mock site note');
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: a system event names its subject and links to it (#2223: replaces "Go to related item")
//
// System events live on History since #2224 (the Site diary lists people's entries only), so the
// row is asserted there, with a mocked GET /api/history.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('System event subject and link (Scenario 4)', () => {
  test('A system event row names the task and offers "Open task" instead of "Go to related item"', async ({
    page,
  }) => {
    const mockEntryId = 'mock-uat-source-001';
    const mockWorkItemTitle = 'Foundation Waterproofing';

    await page.route('**/api/history*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...mockDiaryList([
              mockSystemEvent({
                id: mockEntryId,
                sourceEntityId: 'wi-mock-001',
                sourceEntityTitle: mockWorkItemTitle,
              }),
            ]),
            object: null,
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      const history = new HistoryPage(page);
      await history.goto();

      await expect(history.systemEventRow(mockEntryId)).toContainText(
        `${mockWorkItemTitle} went from Not started to In progress`,
      );
      await expect(history.systemEventLink(mockEntryId)).toHaveText(/Open task/);
      await expect(page.getByText('Go to related item')).toHaveCount(0);
      await expect(page.getByTestId('source-link-wi-mock-001')).toHaveCount(0);
    } finally {
      await page.unroute('**/api/history*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: the Site diary never mixes system events in (#2224; was "interleaved")
// ─────────────────────────────────────────────────────────────────────────────
test.describe('No system events on the Site diary (Scenario 5)', { tag: '@responsive' }, () => {
  test('A manual entry is a row; the list asks for people entries only', async ({ page }) => {
    const requests: URL[] = [];
    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') {
        requests.push(new URL(route.request().url()));
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
                status: 'saved',
                isAutomatic: false,
                isSigned: false,
                sourceEntityType: null,
                sourceEntityId: null,
                sourceEntityTitle: null,
                photoCount: 0,
                thumbnails: [],
                photoAreas: [],
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
    await stubUnfinishedEmpty(page);

    try {
      await page.goto(DIARY_ROUTE);
      const diaryPage = new DiaryPage(page);
      await diaryPage.heading.waitFor({ state: 'visible' });
      await diaryPage.waitForLoaded();

      await expect(diaryPage.entryCard('mock-manual-001')).toBeVisible();
      await expect(diaryPage.systemEventRowsAny()).toHaveCount(0);
      expect(requests.length).toBeGreaterThan(0);
      for (const url of requests) expect(url.searchParams.get('automatic')).toBe('false');
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
// Scenario 7: Home "Site diary" link navigates to /diary
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Latest from the site "Site diary" link (Scenario 7)', { tag: '@responsive' }, () => {
  test.use({ isolatedUserPerTest: { emailPrefix: 'diary-home', displayName: 'E2E Diary User' } });

  test('Clicking "Site diary" in Latest from the site navigates to /diary', async ({ page }) => {
    const state = newHomeMockState({
      diary: [mockHomeDiaryEntry({ id: 'mock-recent-001', title: 'Recent note' })],
    });
    await page.request.patch('/api/users/me/preferences', {
      data: { key: 'home.hiddenSections', value: '[]' },
    });
    await installHomeMocks(page, state);
    const home = new HomePage(page);
    await home.goto();

    await expect(home.latestMoreLink).toBeVisible();
    await home.latestMoreLink.click();
    await page.waitForURL('**/diary', { timeout: 15_000 });
    expect(page.url()).toMatch(/\/diary$/);
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
