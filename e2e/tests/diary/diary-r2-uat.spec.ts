/**
 * E2E tests for UAT Round 2 fixes for the Site diary (EPIC-13).
 *
 * Issues addressed:
 * - #866-A: Mode filter chips (All/Manual/History); removed in #2224 (system events moved to the
 *           History page, e2e/tests/history/)
 * - #866-C: the diary header link has no "+" prefix (#2222: "Log today", formerly "New Entry")
 * - #867:   Photo upload on creation form; post-create navigation to detail page
 * - #868:   Automatic events interleaved with people's entries (now on History, "Include site
 *           diary entries")
 * - #869:   Signed badge visible on diary entry cards where isSigned=true
 *
 * Scenarios covered:
 * 1.  [smoke] No mode chips on the Site diary; a "History" link starts the filter area (#2224)
 * 2.  Only the manual type chips exist (#2224)
 * 3.  The "History" link opens /history (#2224)
 * 5.  [smoke] header link text is "Log today" (no "+" prefix)
 * 6.  [smoke] History with "Include site diary entries" shows both kinds in one date group
 * 7.  [smoke] Signed badge is visible on cards with isSigned=true
 * 8.  Photo file input is present on the capture screen
 * 9.  The diary list request carries automatic=false (#2224)
 * 10. A manual type chip sends only that manual type, plus automatic=false (#2224)
 * (Scenarios 2-4 and 9-10 of the old mode-chip design moved to History: history-page.spec.ts.)
 */

import { test, expect } from '../../fixtures/auth.js';
import { mockSystemEvent } from '../../fixtures/systemEventMocks.js';
import { DiaryPage, DIARY_ROUTE } from '../../pages/DiaryPage.js';
import { HistoryPage } from '../../pages/HistoryPage.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Local mock helpers
// ─────────────────────────────────────────────────────────────────────────────

function makePaginatedEmpty(): Record<string, unknown> {
  return {
    items: [],
    pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 1 },
  };
}

function makeMockEntry(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'mock-r2-entry-001',
    entryType: 'general_note',
    entryDate: '2026-03-16',
    title: 'Mock R2 Entry',
    body: 'This is a mock diary entry for UAT R2 tests.',
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    status: 'saved',
    sourceEntityType: null,
    sourceEntityId: null,
    sourceEntityTitle: null,
    photoCount: 0,
    createdBy: { id: 'user-1', displayName: 'E2E Admin' },
    createdAt: '2026-03-16T10:00:00.000Z',
    updatedAt: '2026-03-16T10:00:00.000Z',
    ...overrides,
  };
}

function makePaginatedResponse(entries: Record<string, unknown>[]): Record<string, unknown> {
  return {
    items: entries,
    pagination: {
      page: 1,
      pageSize: 25,
      totalItems: entries.length,
      totalPages: 1,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: no mode chips on the Site diary; a "History ›" link instead (#2224)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('No mode chips, History link (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'The filter bar has no All/Manual/History mode chips and starts with a "History" link',
    { tag: '@smoke' },
    async ({ page }) => {
      const diaryPage = new DiaryPage(page);

      await page.route('**/api/diary-entries*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(makePaginatedEmpty()),
          });
        } else {
          await route.continue();
        }
      });

      try {
        await diaryPage.goto();

        // On mobile the filter panel may be collapsed behind a toggle button
        await diaryPage.openFiltersIfCollapsed();

        await expect(diaryPage.historyLink).toBeVisible();
        await expect(diaryPage.historyLink).toContainText('History');
        await expect(diaryPage.historyLink).toHaveAttribute('href', '/history');
        await expect(diaryPage.modeChips).toHaveCount(0);
      } finally {
        await page.unroute('**/api/diary-entries*');
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: only the manual type chips remain (#2224)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Manual type chips only (Scenario 2)', () => {
  test('The five manual type chips are shown and no automatic type chip exists', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);

    await page.route('**/api/diary-entries*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makePaginatedEmpty()),
      });
    });

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();
      await diaryPage.openFiltersIfCollapsed();

      await expect(diaryPage.typeFilterChip('daily_log')).toBeVisible();
      await expect(diaryPage.typeFilterChip('general_note')).toBeVisible();
      await expect(diaryPage.typeFilterChip('site_visit')).toBeVisible();
      await expect(diaryPage.typeFilterChip('delivery')).toBeVisible();
      await expect(diaryPage.typeFilterChip('issue')).toBeVisible();

      for (const automatic of [
        'work_item_status',
        'invoice_status',
        'milestone_delay',
        'subsidy_status',
        'auto_reschedule',
      ]) {
        await expect(diaryPage.typeFilterChip(automatic)).toHaveCount(0);
      }
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: the "History ›" link opens the History page (#2224)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('History link opens History (Scenario 3)', { tag: '@responsive' }, () => {
  test('Clicking "History" on the Site diary lands on /history', async ({ page }) => {
    const diaryPage = new DiaryPage(page);
    const history = new HistoryPage(page);

    await diaryPage.goto();
    await diaryPage.openFiltersIfCollapsed();
    await diaryPage.historyLink.click();

    await expect(page).toHaveURL(/\/history$/);
    await expect(history.heading).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: "Log today" link text (#2222; formerly "New Entry")
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Log today link text (Scenario 5)', { tag: '@responsive' }, () => {
  test(
    'The create entry link text is "Log today" without a "+" prefix',
    { tag: '@smoke' },
    async ({ page }) => {
      const diaryPage = new DiaryPage(page);

      await diaryPage.goto();

      // The "Log today" link must be present with the exact text (no "+" prefix)
      await expect(diaryPage.logTodayLink).toBeVisible();
      await expect(diaryPage.logTodayLink).toHaveText('Log today');

      // Verify there is no button with a "+" prefix (old text)
      const plusButton = page.getByRole('link', { name: '+ Log today', exact: true });
      await expect(plusButton).not.toBeVisible();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: History with "Include site diary entries" interleaves both kinds in one day group
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Automatic entries interleaved (Scenario 6)', { tag: '@responsive' }, () => {
  test(
    'System events and people entries share one date group on History',
    { tag: '@smoke' },
    async ({ page }) => {
      // Midday UTC keeps the event's local calendar day equal to the entry date in any zone
      const mockDate = '2026-03-16';

      await page.route('**/api/history*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ...makePaginatedResponse([
                mockSystemEvent({
                  id: 'mock-auto-r2-001',
                  createdAt: `${mockDate}T12:00:00.000Z`,
                }),
                makeMockEntry({
                  id: 'mock-manual-r2-001',
                  entryDate: mockDate,
                  isAutomatic: false,
                  body: 'A manual general note',
                }),
              ]),
              hiddenCount: 0,
              object: null,
            }),
          });
        } else {
          await route.continue();
        }
      });

      try {
        const history = new HistoryPage(page);
        await history.goto({ include: 'diary' });
        await expect(history.includeDiaryCheckbox).toBeChecked();

        // Both entries are visible in the same date group (interleaved)
        await expect(history.systemEventRow('mock-auto-r2-001')).toBeVisible();
        await expect(page.getByTestId('diary-card-mock-manual-r2-001')).toBeVisible();
        await expect(history.dateGroups()).toHaveCount(1);
      } finally {
        await page.unroute('**/api/history*');
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Signed badge visible on entry cards
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Signed badge on entry cards (Scenario 7)', { tag: '@responsive' }, () => {
  test(
    'Entry card with isSigned=true shows a "Signed" badge',
    { tag: '@smoke' },
    async ({ page }) => {
      const signedEntryId = 'mock-signed-r2-001';

      await page.route('**/api/diary-entries*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
              makePaginatedResponse([
                makeMockEntry({
                  id: signedEntryId,
                  isSigned: true,
                  entryType: 'daily_log',
                  body: 'Signed daily log entry',
                }),
              ]),
            ),
          });
        } else {
          await route.continue();
        }
      });

      try {
        const diaryPage = new DiaryPage(page);
        await page.goto(DIARY_ROUTE);
        await diaryPage.heading.waitFor({ state: 'visible' });
        await diaryPage.waitForLoaded();

        // The entry card must be visible
        const entryCard = diaryPage.entryCard(signedEntryId);
        await expect(entryCard).toBeVisible();

        // The signed badge must be visible on the card
        // data-testid="signed-badge-{id}" with text "✓ Signed"
        const signedBadge = page.getByTestId(`signed-badge-${signedEntryId}`);
        await expect(signedBadge).toBeVisible();
        await expect(signedBadge).toContainText('Signed');
      } finally {
        await page.unroute('**/api/diary-entries*');
      }
    },
  );

  test('Entry card with isSigned=false does NOT show a signed badge', async ({ page }) => {
    const unsignedEntryId = 'mock-unsigned-r2-001';

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            makePaginatedResponse([
              makeMockEntry({
                id: unsignedEntryId,
                isSigned: false,
              }),
            ]),
          ),
        });
      } else {
        await route.continue();
      }
    });

    try {
      const diaryPage = new DiaryPage(page);
      await page.goto(DIARY_ROUTE);
      await diaryPage.heading.waitFor({ state: 'visible' });
      await diaryPage.waitForLoaded();

      // Badge must not be present for unsigned entries
      const signedBadge = page.getByTestId(`signed-badge-${unsignedEntryId}`);
      await expect(signedBadge).not.toBeVisible();
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Photo file input on the capture screen (#2221)
//
// The type-card picker and the old PhotoUpload input are gone. /diary/new is the capture
// screen itself: its library input exists before any draft does.
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Photo upload input on the capture screen (Scenario 8)',
  { tag: '@responsive' },
  () => {
    test('The capture screen includes an image file input that takes several files', async ({
      page,
    }) => {
      const capture = new DiaryCapturePage(page);
      await capture.goto();

      // The library input is on the screen before any draft exists (#2221: no draft yet)
      await expect(capture.libraryInput).toBeAttached();

      // Verify it accepts image files (accept="image/*")
      await expect(capture.libraryInput).toHaveAttribute('accept', /image\/\*/i);

      // Verify it supports multiple files (boolean attribute — present as empty string)
      await expect(capture.libraryInput).toHaveAttribute('multiple', '');
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: the diary list never asks for system events (#2224)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Diary list request carries automatic=false (Scenario 9)', () => {
  test('Every GET /api/diary-entries from the Site diary sends automatic=false', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);
    const requests: URL[] = [];

    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') requests.push(new URL(route.request().url()));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makePaginatedEmpty()),
      });
    });

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      expect(requests.length).toBeGreaterThan(0);
      for (const url of requests) {
        expect(url.searchParams.get('automatic'), url.toString()).toBe('false');
      }
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: a manual type chip sends only manual types (#2224)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Manual type chip API parameter (Scenario 10)', () => {
  test('Selecting a manual type chip sends that type and automatic=false', async ({ page }) => {
    const diaryPage = new DiaryPage(page);

    await page.route('**/api/diary-entries*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makePaginatedEmpty()),
      });
    });

    try {
      await diaryPage.goto();
      await diaryPage.waitForLoaded();
      await diaryPage.openFiltersIfCollapsed();

      // The listener is registered before the click and predicated on the type param, so a
      // trailing response from the initial load can never satisfy it.
      const responsePromise = page.waitForResponse((resp) => {
        if (!resp.url().includes('/api/diary-entries') || resp.status() !== 200) return false;
        return new URL(resp.url()).searchParams.get('type') === 'daily_log';
      });
      await diaryPage.typeFilterChip('daily_log').click();
      const response = await responsePromise;

      const params = new URL(response.url()).searchParams;
      expect(params.get('type')).toBe('daily_log');
      expect(params.get('automatic')).toBe('false');
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});
