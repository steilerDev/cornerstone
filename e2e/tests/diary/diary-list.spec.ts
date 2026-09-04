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
 * 7.  Infinite scroll replaces the numbered pager (Issue #2060) — auto-load on scroll,
 *     keyboard-only "Load more", full pager removal, dedupe under fast scroll, end-of-list,
 *     empty state, filter/search reset, error+retry, legacy ?page= bookmarks, dark mode
 * 8.  Entry card click navigates to the detail page
 * 9.  Type switcher filters to manual-only entries (mock API)
 * 10. Responsive — no horizontal scroll on current viewport (@responsive)
 * 11. Dark mode — page renders without layout overflow
 * 12. Default filter mode is Manual when navigating to /diary with no params (@smoke)
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryPage, DIARY_ROUTE } from '../../pages/DiaryPage.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
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
// Scenario 7: Infinite scroll replaces the numbered pager (Issue #2060)
//
// The pager (prev/next buttons, ?page= URL param) is gone entirely. Older entries now
// load via IntersectionObserver-driven auto-append (useInfiniteScroll) plus an always
// -present keyboard-reachable "Load more"/"Retry" button (InfiniteScrollFooter). Both
// paths call the same loadMore()/retry() functions from the hook, so there is exactly
// one code path per action. See client/src/hooks/useInfiniteScroll.ts and
// client/src/components/InfiniteScrollFooter/InfiniteScrollFooter.tsx.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Infinite scroll (Scenario 7)', () => {
  test.describe('Auto-load on scroll', { tag: '@responsive' }, () => {
    test(
      'Scrolling near the bottom automatically loads and appends the next batch',
      { tag: '@smoke' },
      async ({ page }) => {
        const diaryPage = new DiaryPage(page);

        const page1Entries = Array.from({ length: 25 }, (_, i) =>
          makeMockEntry({
            id: `is-p1-${i}`,
            title: `Batch 1 Entry ${String(i + 1).padStart(2, '0')}`,
          }),
        );
        const page2Entries = Array.from({ length: 25 }, (_, i) =>
          makeMockEntry({
            id: `is-p2-${i}`,
            title: `Batch 2 Entry ${String(i + 1).padStart(2, '0')}`,
          }),
        );

        await page.route('**/api/diary-entries*', async (route) => {
          if (route.request().method() !== 'GET') {
            await route.continue();
            return;
          }
          const requestedPage = new URL(route.request().url()).searchParams.get('page');
          const body =
            requestedPage === '2'
              ? makePaginatedResponse(page2Entries, { page: 2, totalItems: 50, totalPages: 2 })
              : makePaginatedResponse(page1Entries, { totalItems: 50, totalPages: 2 });
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(body),
          });
        });

        try {
          await diaryPage.goto();
          await diaryPage.waitForLoaded();

          await expect(diaryPage.entryCard('is-p1-0')).toBeVisible();
          await expect(diaryPage.entryCard('is-p2-0')).toHaveCount(0);

          const page2ResponsePromise = page.waitForResponse(
            (resp) =>
              resp.url().includes('/api/diary-entries') &&
              new URL(resp.url()).searchParams.get('page') === '2',
          );
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page2ResponsePromise;

          // The original page-1 cards must remain mounted — appending never replaces them.
          await expect(diaryPage.entryCard('is-p1-0')).toBeVisible();
          await expect(diaryPage.entryCard('is-p2-0')).toBeVisible();
          await expect(diaryPage.endOfListMessage).toBeVisible();

          // No pagination-style URL state is ever introduced.
          expect(new URL(page.url()).searchParams.has('page')).toBe(false);
        } finally {
          await page.unroute('**/api/diary-entries*');
        }
      },
    );
  });

  test('"Load more" button loads the next batch via keyboard alone, with no scroll', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);

    // Stub out IntersectionObserver for this test only. Without this, the sentinel can already
    // be within the observer's 600px rootMargin the instant it mounts (page-1's mocked entries are
    // short, and focusing/tabbing to an off-screen element also scrolls it into view as a normal
    // part of browser/Playwright focus handling) — either way, the auto-scroll loadMore() path can
    // fire and complete (the mock has no delay) before this test's own focus/keyboard assertions
    // run, unmounting diary-load-more-button once hasMore flips to false and turning
    // `toBeFocused()` into a deterministic "element(s) not found". This test's whole point is to
    // prove the button's OWN click/keypress activation works independent of the auto-scroll
    // observer, so isolate that path entirely rather than trying to out-race it.
    await page.addInitScript(() => {
      class StubIntersectionObserver implements IntersectionObserver {
        readonly root: Element | Document | null = null;
        readonly rootMargin = '';
        readonly thresholds: ReadonlyArray<number> = [];
        constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
        disconnect(): void {}
        observe(): void {}
        unobserve(): void {}
        takeRecords(): IntersectionObserverEntry[] {
          return [];
        }
      }
      window.IntersectionObserver = StubIntersectionObserver;
    });

    const page1Entries = Array.from({ length: 25 }, (_, i) => makeMockEntry({ id: `kbd-p1-${i}` }));
    const page2Entries = Array.from({ length: 25 }, (_, i) => makeMockEntry({ id: `kbd-p2-${i}` }));

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const requestedPage = new URL(route.request().url()).searchParams.get('page');
      const body =
        requestedPage === '2'
          ? makePaginatedResponse(page2Entries, { page: 2, totalItems: 50, totalPages: 2 })
          : makePaginatedResponse(page1Entries, { totalItems: 50, totalPages: 2 });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      await expect(diaryPage.loadMoreButton).toBeVisible();
      await diaryPage.loadMoreButton.focus();
      await expect(diaryPage.loadMoreButton).toBeFocused();

      // A visible focus outline (box-shadow ring, per shared.btnSecondary:focus-visible) must be
      // present in both light and dark mode — never a plain/missing outline.
      const lightFocusBoxShadow = await diaryPage.loadMoreButton.evaluate(
        (el) => getComputedStyle(el).boxShadow,
      );
      expect(lightFocusBoxShadow).not.toBe('none');

      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      const darkFocusBoxShadow = await diaryPage.loadMoreButton.evaluate(
        (el) => getComputedStyle(el).boxShadow,
      );
      expect(darkFocusBoxShadow).not.toBe('none');
      await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

      // No mouse/scroll interaction at all — just focus + Enter. With IntersectionObserver
      // stubbed above, this Enter press is the ONLY thing that can trigger the fetch below.
      const page2ResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/diary-entries') &&
          new URL(resp.url()).searchParams.get('page') === '2',
      );
      await page.keyboard.press('Enter');
      await page2ResponsePromise;

      await expect(diaryPage.entryCard('kbd-p2-0')).toBeVisible();
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });

  test('No pagination controls remain anywhere on the page — full removal, not just hidden', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);

    await diaryPage.goto();
    await diaryPage.waitForLoaded();

    await expect(page.getByTestId('prev-page-button')).toHaveCount(0);
    await expect(page.getByTestId('next-page-button')).toHaveCount(0);
  });

  test('Fast repeated scrolling does not issue duplicate requests for the same batch (best-effort)', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);

    const page1Entries = Array.from({ length: 25 }, (_, i) => makeMockEntry({ id: `dd-p1-${i}` }));
    const page2Entries = Array.from({ length: 25 }, (_, i) => makeMockEntry({ id: `dd-p2-${i}` }));
    let pageTwoRequestCount = 0;

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const requestedPage = new URL(route.request().url()).searchParams.get('page');
      if (requestedPage === '2') {
        pageTwoRequestCount += 1;
        // Artificial delay so multiple rapid scroll triggers land while the fetch is in flight.
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            makePaginatedResponse(page2Entries, { page: 2, totalItems: 50, totalPages: 2 }),
          ),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          makePaginatedResponse(page1Entries, { totalItems: 50, totalPages: 2 }),
        ),
      });
    });

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      const page2ResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/diary-entries') &&
          new URL(resp.url()).searchParams.get('page') === '2',
      );

      // Fire several scroll-to-bottom events in quick succession, well within the 500ms
      // in-flight window for the page-2 request.
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(50);
      }

      await page2ResponsePromise;
      expect(pageTwoRequestCount).toBe(1);
      await expect(diaryPage.entryCard('dd-p2-0')).toBeVisible();
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });

  test('A dataset smaller than one batch reaches end-of-list immediately with no second request', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);
    let requestCount = 0;

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      requestCount += 1;
      const entries = Array.from({ length: 5 }, (_, i) => makeMockEntry({ id: `small-${i}` }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makePaginatedResponse(entries, { totalItems: 5, totalPages: 1 })),
      });
    });

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      await expect(diaryPage.endOfListMessage).toBeVisible();
      await expect(diaryPage.loadMoreButton).toHaveCount(0);
      expect(requestCount).toBe(1);
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });

  test('Zero matching entries renders the empty state with no footer, sentinel, or load-more control', async ({
    page,
  }) => {
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

      await expect(diaryPage.emptyState).toBeVisible();
      await expect(diaryPage.loadMoreButton).toHaveCount(0);
      await expect(diaryPage.infiniteScrollSentinel).toHaveCount(0);
      await expect(diaryPage.endOfListMessage).toHaveCount(0);
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });

  test('Changing a filter mid-scroll discards the old batches and loads a fresh first batch', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);

    const manualPage1 = Array.from({ length: 25 }, (_, i) =>
      makeMockEntry({ id: `flt-man1-${i}` }),
    );
    const manualPage2 = Array.from({ length: 25 }, (_, i) =>
      makeMockEntry({ id: `flt-man2-${i}` }),
    );
    const automaticEntries = [makeMockEntry({ id: 'flt-auto-0', entryType: 'work_item_status' })];

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const url = new URL(route.request().url());
      const typeParam = url.searchParams.get('type') ?? '';
      const requestedPage = url.searchParams.get('page');

      if (typeParam.includes('work_item_status')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            makePaginatedResponse(automaticEntries, { totalItems: 1, totalPages: 1 }),
          ),
        });
        return;
      }

      const body =
        requestedPage === '2'
          ? makePaginatedResponse(manualPage2, { page: 2, totalItems: 50, totalPages: 2 })
          : makePaginatedResponse(manualPage1, { totalItems: 50, totalPages: 2 });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();
      await diaryPage.scrollToLoadMore();

      await expect(diaryPage.entryCard('flt-man1-0')).toBeVisible();
      await expect(diaryPage.entryCard('flt-man2-0')).toBeVisible();

      await diaryPage.openFiltersIfCollapsed();
      const automaticResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/diary-entries') &&
          new URL(resp.url()).searchParams.get('type')?.includes('work_item_status') === true,
      );
      await page.getByTestId('mode-filter-automatic').click();
      await automaticResponsePromise;
      await diaryPage.waitForLoaded();

      // Old manual-mode batches are discarded, not just visually hidden.
      await expect(diaryPage.entryCard('flt-man1-0')).toHaveCount(0);
      await expect(diaryPage.entryCard('flt-man2-0')).toHaveCount(0);
      await expect(diaryPage.entryCard('flt-auto-0')).toBeVisible();

      const count = await diaryPage.getEntryCount();
      expect(count).toBe(1);
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });

  test('Typing a search query resets the list and the URL never gains a page param', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);

    const page1Entries = Array.from({ length: 25 }, (_, i) =>
      makeMockEntry({ id: `srch-p1-${i}` }),
    );
    const page2Entries = Array.from({ length: 25 }, (_, i) =>
      makeMockEntry({ id: `srch-p2-${i}` }),
    );

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const requestedPage = new URL(route.request().url()).searchParams.get('page');
      const body =
        requestedPage === '2'
          ? makePaginatedResponse(page2Entries, { page: 2, totalItems: 50, totalPages: 2 })
          : makePaginatedResponse(page1Entries, { totalItems: 50, totalPages: 2 });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();
      await diaryPage.scrollToLoadMore();

      expect(new URL(page.url()).searchParams.has('page')).toBe(false);

      await diaryPage.search('mock search query');

      expect(page.url()).toContain('q=');
      expect(new URL(page.url()).searchParams.has('page')).toBe(false);
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });

  test('A failed batch shows an error with retry at the footer, and retry appends the batch exactly once', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);

    const page1Entries = Array.from({ length: 25 }, (_, i) => makeMockEntry({ id: `err-p1-${i}` }));
    const page2Entries = Array.from({ length: 25 }, (_, i) => makeMockEntry({ id: `err-p2-${i}` }));
    let pageTwoRequestCount = 0;

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const requestedPage = new URL(route.request().url()).searchParams.get('page');
      if (requestedPage === '2') {
        pageTwoRequestCount += 1;
        if (pageTwoRequestCount === 1) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            makePaginatedResponse(page2Entries, { page: 2, totalItems: 50, totalPages: 2 }),
          ),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          makePaginatedResponse(page1Entries, { totalItems: 50, totalPages: 2 }),
        ),
      });
    });

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      const failedResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/diary-entries') &&
          new URL(resp.url()).searchParams.get('page') === '2',
      );
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await failedResponsePromise;

      await expect(diaryPage.footerError).toBeVisible();
      // Every already-loaded entry remains on screen.
      await expect(diaryPage.entryCard('err-p1-0')).toBeVisible();

      // Scrolling again while errored must not re-issue the request (AC15).
      const requestsBeforeExtraScroll = pageTwoRequestCount;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
      expect(pageTwoRequestCount).toBe(requestsBeforeExtraScroll);

      // Retry re-requests the same batch; on success it appends with no duplicates.
      const retryResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/diary-entries') &&
          new URL(resp.url()).searchParams.get('page') === '2' &&
          resp.status() === 200,
      );
      await diaryPage.loadMoreButton.click();
      await retryResponsePromise;

      await expect(diaryPage.entryCard('err-p1-0')).toBeVisible();
      await expect(diaryPage.entryCard('err-p2-0')).toHaveCount(1);
      await expect(diaryPage.endOfListMessage).toBeVisible();
      expect(pageTwoRequestCount).toBe(2);
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });

  test('An old /diary?page=3 bookmark loads normally from the first batch with no error', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);
    const entries = Array.from({ length: 5 }, (_, i) => makeMockEntry({ id: `bm-${i}` }));
    const requestedPages: (string | null)[] = [];

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      requestedPages.push(new URL(route.request().url()).searchParams.get('page'));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makePaginatedResponse(entries, { totalItems: 5, totalPages: 1 })),
      });
    });

    try {
      await page.goto(`${DIARY_ROUTE}?page=3`);
      await diaryPage.heading.waitFor({ state: 'visible' });
      await diaryPage.waitForLoaded();

      await expect(diaryPage.heading).toBeVisible();
      await expect(diaryPage.errorBanner).not.toBeVisible();
      await expect(diaryPage.entryCard('bm-0')).toBeVisible();

      // The internal batch counter always starts at 1, regardless of a stale ?page= value.
      expect(requestedPages[0]).toBe('1');
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });

  test.describe('Dark mode', { tag: '@responsive' }, () => {
    test('Loading-error and end-of-list footer states render correctly in dark mode', async ({
      page,
    }) => {
      const diaryPage = new DiaryPage(page);

      const page1Entries = Array.from({ length: 25 }, (_, i) =>
        makeMockEntry({ id: `dm-p1-${i}` }),
      );
      const page2Entries = Array.from({ length: 25 }, (_, i) =>
        makeMockEntry({ id: `dm-p2-${i}` }),
      );
      let pageTwoAttempts = 0;

      await page.route('**/api/diary-entries*', async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        const requestedPage = new URL(route.request().url()).searchParams.get('page');
        if (requestedPage === '2') {
          pageTwoAttempts += 1;
          if (pageTwoAttempts === 1) {
            await route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
            });
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
              makePaginatedResponse(page2Entries, { page: 2, totalItems: 50, totalPages: 2 }),
            ),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            makePaginatedResponse(page1Entries, { totalItems: 50, totalPages: 2 }),
          ),
        });
      });

      try {
        await page.goto(DIARY_ROUTE);
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-theme', 'dark');
        });
        await diaryPage.heading.waitFor({ state: 'visible' });
        await diaryPage.waitForLoaded();

        const failedResponsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/api/diary-entries') &&
            new URL(resp.url()).searchParams.get('page') === '2',
        );
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await failedResponsePromise;

        await expect(diaryPage.footerError).toBeVisible();
        const loadMoreClass = await diaryPage.loadMoreButton.getAttribute('class');
        expect(loadMoreClass).toContain('btnSecondary');

        let hasHorizontalScroll = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(hasHorizontalScroll).toBe(false);

        const successResponsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/api/diary-entries') &&
            new URL(resp.url()).searchParams.get('page') === '2' &&
            resp.status() === 200,
        );
        await diaryPage.loadMoreButton.click();
        await successResponsePromise;

        await expect(diaryPage.endOfListMessage).toBeVisible();
        hasHorizontalScroll = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(hasHorizontalScroll).toBe(false);
      } finally {
        await page.unroute('**/api/diary-entries*');
      }
    });
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

    await page.route('**/api/diary-entries*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makePaginatedResponse([])),
      });
    });

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      // Register the listener BEFORE clicking the chip, and predicate it on the response's OWN
      // request URL containing the expected type param — not just "any diary-entries 200". A
      // generic predicate (plus reading a separately captured requests[] array) can resolve
      // against a trailing response from the initial load landing after the click, silently
      // asserting on the wrong response — see #2030, the same bug in the sibling
      // diary-automatic-events.spec.ts test. Reading the type param straight off the resolved
      // Response removes the shared-mutable-array request/response race entirely.
      const responsePromise = page.waitForResponse((resp) => {
        if (!resp.url().includes('/api/diary-entries') || resp.status() !== 200) return false;
        const typeParam = new URL(resp.url()).searchParams.get('type');
        return !!typeParam && typeParam.includes('daily_log');
      });

      // Click the "daily_log" type chip filter button
      const typeChip = diaryPage.typeFilterChip('daily_log');
      await typeChip.waitFor({ state: 'visible' });
      await typeChip.click();
      const response = await responsePromise;

      // The request should include the daily_log type parameter
      const typeParam = new URL(response.url()).searchParams.get('type');
      expect(typeParam).toBeTruthy();
      expect(typeParam).toContain('daily_log');
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

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: Default filter mode is Manual
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Default filter is Manual (Scenario 12)', () => {
  test(
    'Default filter mode is Manual when navigating to /diary with no params',
    { tag: '@smoke' },
    async ({ page }) => {
      const diaryPage = new DiaryPage(page);

      // Capture API request URLs to assert the type param on the initial load
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
        await diaryPage.openFiltersIfCollapsed();

        // Manual chip must be the only one pressed by default
        await expect(page.getByTestId('mode-filter-manual')).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await expect(page.getByTestId('mode-filter-all')).toHaveAttribute('aria-pressed', 'false');
        await expect(page.getByTestId('mode-filter-automatic')).toHaveAttribute(
          'aria-pressed',
          'false',
        );

        // The initial API request must include a type param that covers manual entry types
        // (daily_log, general_note, site_visit) — not automatic types (budget_breach, etc.)
        const initialRequest = requests[0];
        expect(initialRequest).toBeDefined();
        if (initialRequest) {
          const typeParam = initialRequest.searchParams.get('type');
          expect(typeParam).toBeTruthy();
          if (typeParam) {
            expect(typeParam).toContain('daily_log');
          }
        }
      } finally {
        await page.unroute('**/api/diary-entries*');
      }
    },
  );
});
