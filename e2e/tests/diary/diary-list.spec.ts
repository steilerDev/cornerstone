/**
 * E2E tests for the Construction Diary list page (/diary)
 *
 * Story #804: Diary timeline view with filtering and search
 *
 * Scenarios covered:
 * 1.  Page loads with h1 "Construction Diary" (@smoke @responsive)
 * 2.  Sidebar navigation to /diary works (@responsive)
 * 3.  Empty state when no entries exist (mock API)
 * 4.  Entry created via API appears in the timeline
 * 5.  Date grouping — entries on different dates render separate date headers
 * 6.  Search filter finds a specific entry
 * 7.  "Next" pagination button fetches page 2 (mock API)
 * 8.  Entry card click navigates to the detail page
 * 9.  Type switcher filters to manual-only entries (mock API)
 * 10. Responsive — no horizontal scroll on current viewport (@responsive)
 * 11. Dark mode — page renders without layout overflow
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryPage, DIARY_ROUTE } from '../../pages/DiaryPage.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { API } from '../../fixtures/testData.js';
import { createDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — minimal mock entry shapes used for API route mocks
// ─────────────────────────────────────────────────────────────────────────────

function makeMockEntry(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'mock-entry-1',
    entryType: 'general_note',
    entryDate: '2026-03-14',
    title: 'Mock Entry',
    body: 'This is a mock diary entry body text.',
    metadata: null,
    isAutomatic: false,
    sourceEntityType: null,
    sourceEntityId: null,
    photoCount: 0,
    createdBy: { id: 'user-1', displayName: 'E2E Admin' },
    createdAt: '2026-03-14T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z',
    ...overrides,
  };
}

function makePaginatedResponse(
  entries: Record<string, unknown>[],
  overrides: Partial<{
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  }> = {},
): Record<string, unknown> {
  return {
    items: entries,
    pagination: {
      page: 1,
      pageSize: 25,
      totalItems: entries.length,
      totalPages: 1,
      ...overrides,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Page loads with h1 "Construction Diary"
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page load (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Diary list page loads with h1 "Construction Diary"',
    { tag: '@smoke' },
    async ({ page }) => {
      const diaryPage = new DiaryPage(page);

      await diaryPage.goto();

      await expect(diaryPage.heading).toBeVisible();
      await expect(diaryPage.heading).toHaveText('Construction Diary');
    },
  );

  test('Diary page URL is /diary after navigation', async ({ page }) => {
    await page.goto(DIARY_ROUTE);
    await page.waitForURL('**/diary');
    expect(page.url()).toContain('/diary');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Sidebar navigation to /diary
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Sidebar navigation (Scenario 2)', { tag: '@responsive' }, () => {
  test('Navigating to /diary from sidebar lands on Construction Diary page', async ({ page }) => {
    const diaryPage = new DiaryPage(page);
    const appShell = new AppShellPage(page);

    // Start from the home page and navigate via the sidebar "Diary" link
    await page.goto('/project/overview');

    // On mobile/tablet the sidebar is hidden behind a hamburger menu — open it first
    const viewport = page.viewportSize();
    const isMobile = viewport !== null && viewport.width < 1024;
    if (isMobile) {
      await appShell.openSidebar();
    }

    // Click the "Diary" link inside the sidebar navigation
    const diaryNavLink = appShell.sidebar.getByRole('link', { name: 'Diary', exact: true });
    await diaryNavLink.waitFor({ state: 'visible' });
    await diaryNavLink.click();

    await page.waitForURL('**/diary');
    await expect(diaryPage.heading).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Empty state when no entries exist (mock API)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state (Scenario 3)', () => {
  test('Empty state is shown when the diary has no entries', async ({ page }) => {
    const diaryPage = new DiaryPage(page);

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makePaginatedResponse([])),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await diaryPage.goto();

      // Empty state renders when entries.length === 0 and isLoading is false
      await expect(diaryPage.emptyState).toBeVisible();
      const text = await diaryPage.emptyState.textContent();
      expect(text?.toLowerCase()).toContain('no diary entries');

      // CTA link to create first entry
      const ctaLink = diaryPage.emptyState.getByRole('link', {
        name: /create your first entry/i,
      });
      await expect(ctaLink).toBeVisible();
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Entry created via API appears in the timeline
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Entry appears in timeline after API creation (Scenario 4)',
  { tag: '@responsive' },
  () => {
    test('Diary entry created via API is visible on the list page', async ({
      page,
      testPrefix,
    }) => {
      const diaryPage = new DiaryPage(page);
      let createdId: string | null = null;
      const title = `${testPrefix} API Created Diary Entry`;

      try {
        createdId = await createDiaryEntryViaApi(page, {
          entryType: 'general_note',
          entryDate: '2026-03-14',
          body: 'E2E test entry body',
          title,
        });

        await diaryPage.goto();
        await diaryPage.waitForLoaded();

        // Search for this specific title to isolate it from other test data
        await diaryPage.search(title);

        // The entry card should appear
        await expect(diaryPage.entryCard(createdId)).toBeVisible();
      } finally {
        if (createdId) await deleteDiaryEntryViaApi(page, createdId);
      }
    });

    test('Subtitle shows entry count > 0 after creating an entry', async ({ page, testPrefix }) => {
      const diaryPage = new DiaryPage(page);
      let createdId: string | null = null;

      try {
        createdId = await createDiaryEntryViaApi(page, {
          entryType: 'general_note',
          entryDate: '2026-03-14',
          body: `${testPrefix} subtitle count test`,
        });

        await diaryPage.goto();
        await diaryPage.waitForLoaded();

        const count = await diaryPage.getEntryCount();
        expect(count).toBeGreaterThan(0);
      } finally {
        if (createdId) await deleteDiaryEntryViaApi(page, createdId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Date grouping — entries on different dates render separate headers
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Date grouping (Scenario 5)', () => {
  test('Entries on different dates are grouped under separate date headers (mock)', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);

    const entries = [
      makeMockEntry({ id: 'entry-a', entryDate: '2026-03-14', title: 'Entry A' }),
      makeMockEntry({ id: 'entry-b', entryDate: '2026-03-12', title: 'Entry B' }),
    ];

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makePaginatedResponse(entries, { totalItems: 2 })),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      // Each date should have its own date group section
      const group14 = page.getByTestId('date-group-2026-03-14');
      const group12 = page.getByTestId('date-group-2026-03-12');

      await expect(group14).toBeVisible();
      await expect(group12).toBeVisible();

      // The two groups are separate — check that we have at least 2 date groups
      const groups = diaryPage.dateGroups();
      const groupCount = await groups.count();
      expect(groupCount).toBeGreaterThanOrEqual(2);
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Search filter finds a specific entry
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Search filter (Scenario 6)', { tag: '@responsive' }, () => {
  test('Search input filters entries to show only matching results', async ({
    page,
    testPrefix,
  }) => {
    const diaryPage = new DiaryPage(page);
    const created: string[] = [];
    const alphaTitle = `${testPrefix} Alpha Diary Entry`;
    const betaTitle = `${testPrefix} Beta Diary Entry`;

    try {
      created.push(
        await createDiaryEntryViaApi(page, {
          entryType: 'general_note',
          entryDate: '2026-03-14',
          body: 'Alpha entry body',
          title: alphaTitle,
        }),
      );
      created.push(
        await createDiaryEntryViaApi(page, {
          entryType: 'general_note',
          entryDate: '2026-03-14',
          body: 'Beta entry body',
          title: betaTitle,
        }),
      );

      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      // Search for the alpha entry specifically
      await diaryPage.search(`${testPrefix} Alpha`);

      // Alpha entry card should be present
      await expect(diaryPage.entryCard(created[0])).toBeVisible();

      // Beta entry card should not be visible
      await expect(diaryPage.entryCard(created[1])).not.toBeVisible();
    } finally {
      for (const id of created) {
        await deleteDiaryEntryViaApi(page, id);
      }
    }
  });

  test('Clearing search restores all matching entries', async ({ page, testPrefix }) => {
    const diaryPage = new DiaryPage(page);
    const created: string[] = [];

    try {
      created.push(
        await createDiaryEntryViaApi(page, {
          entryType: 'general_note',
          entryDate: '2026-03-14',
          body: `${testPrefix} Clear Alpha`,
          title: `${testPrefix} Clear Alpha`,
        }),
      );
      created.push(
        await createDiaryEntryViaApi(page, {
          entryType: 'general_note',
          entryDate: '2026-03-14',
          body: `${testPrefix} Clear Beta`,
          title: `${testPrefix} Clear Beta`,
        }),
      );

      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      // Narrow to just alpha
      await diaryPage.search(`${testPrefix} Clear Alpha`);
      await expect(diaryPage.entryCard(created[0])).toBeVisible();
      await expect(diaryPage.entryCard(created[1])).not.toBeVisible();

      // Clear the search and wait for the list to reload
      await diaryPage.clearSearch();
      // Small pause to let the 300ms debounce from clear() settle before asserting
      await page.waitForTimeout(400);
      await diaryPage.search(testPrefix);

      // Both entries should be visible again
      await expect(diaryPage.entryCard(created[0])).toBeVisible();
      await expect(diaryPage.entryCard(created[1])).toBeVisible();
    } finally {
      for (const id of created) {
        await deleteDiaryEntryViaApi(page, id);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: "Next" pagination button fetches page 2 (mock API)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Pagination (Scenario 7)', () => {
  test('Pagination controls are visible when totalPages > 1', async ({ page }) => {
    const diaryPage = new DiaryPage(page);

    // Return a multi-page response so the pagination bar renders
    const entries = Array.from({ length: 25 }, (_, i) =>
      makeMockEntry({
        id: `pag-entry-${i}`,
        title: `Paginated Entry ${String(i + 1).padStart(2, '0')}`,
      }),
    );

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makePaginatedResponse(entries, { totalItems: 50, totalPages: 2 })),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      await expect(diaryPage.prevPageButton).toBeVisible();
      await expect(diaryPage.nextPageButton).toBeVisible();

      // Previous button disabled on page 1
      await expect(diaryPage.prevPageButton).toBeDisabled();

      // Next button enabled on page 1
      await expect(diaryPage.nextPageButton).toBeEnabled();
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });

  test('Pagination is not shown when all entries fit on one page', async ({ page }) => {
    const diaryPage = new DiaryPage(page);

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            makePaginatedResponse([makeMockEntry()], { totalItems: 1, totalPages: 1 }),
          ),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      // Pagination buttons are not rendered when totalPages === 1
      await expect(diaryPage.prevPageButton).not.toBeVisible();
      await expect(diaryPage.nextPageButton).not.toBeVisible();
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Entry card click navigates to the detail page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Entry card navigation (Scenario 8)', () => {
  test('Clicking an entry card navigates to the diary entry detail page', async ({
    page,
    testPrefix,
  }) => {
    const diaryPage = new DiaryPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} card navigation test`,
        title: `${testPrefix} Card Nav Test`,
      });

      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      // Search to locate the card reliably
      await diaryPage.search(`${testPrefix} Card Nav Test`);
      await expect(diaryPage.entryCard(createdId)).toBeVisible();

      // Click the card — it is rendered as a <Link> so clicking navigates
      await diaryPage.entryCard(createdId).click();

      await page.waitForURL(`**/diary/${createdId}`);
      expect(page.url()).toContain(`/diary/${createdId}`);
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Type chip filter sends correct type parameters to API
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Type chip filter (Scenario 9)', () => {
  // UAT fix #840: DiaryEntryTypeSwitcher (all/manual/automatic tabs) was removed.
  // Filtering is now done via individual type chip buttons in the filter bar.
  test('Clicking "daily_log" type chip sends correct type parameter to the API', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);

    // Capture API requests to assert the query params
    const requests: URL[] = [];

    await page.route('**/api/diary-entries*', async (route) => {
      requests.push(new URL(route.request().url()));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makePaginatedResponse([])),
      });
    });

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      // Clear captured requests from the initial load
      requests.length = 0;

      // Register the response promise BEFORE clicking the chip (waitForResponse pattern)
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/diary-entries') && resp.status() === 200,
      );

      // Click the "daily_log" type chip filter button
      const typeChip = diaryPage.typeFilterChip('daily_log');
      await typeChip.waitFor({ state: 'visible' });
      await typeChip.click();
      await responsePromise;

      // The request should include the daily_log type parameter
      const lastRequest = requests[requests.length - 1];
      expect(lastRequest).toBeDefined();
      const typeParam = lastRequest?.searchParams.get('type');

      // The type parameter must be set and contain daily_log
      expect(typeParam).toBeTruthy();
      if (typeParam) {
        expect(typeParam).toContain('daily_log');
      }
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });

  test('Type chip filter buttons are visible in the filter bar', async ({ page }) => {
    const diaryPage = new DiaryPage(page);

    await diaryPage.goto();
    await diaryPage.waitForLoaded();

    // UAT fix #840: type chips replace the old type switcher tabs.
    // Verify that the manual entry type chips are visible in the filter bar.
    await expect(diaryPage.typeFilterChip('daily_log')).toBeVisible();
    await expect(diaryPage.typeFilterChip('general_note')).toBeVisible();
    await expect(diaryPage.typeFilterChip('site_visit')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Responsive — no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 10)', { tag: '@responsive' }, () => {
  test('Diary list page renders without horizontal scroll on current viewport', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);

    await diaryPage.goto();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('Filter bar is visible on all viewports', async ({ page }) => {
    const diaryPage = new DiaryPage(page);

    await diaryPage.goto();

    await expect(diaryPage.filterBar).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering (Scenario 11)', { tag: '@responsive' }, () => {
  test('Diary list page renders correctly in dark mode without layout overflow', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);

    await page.goto(DIARY_ROUTE);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await diaryPage.heading.waitFor({ state: 'visible' });

    await expect(diaryPage.heading).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});
