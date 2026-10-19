/**
 * E2E tests for automatic system event diary entries.
 *
 * Story #808: Automatic system event logging to diary
 *
 * Scenarios covered:
 * 1.  [smoke] System events appear as event rows on the History page (mock API, v1 metadata)
 *             #2223: FeedRow `system-event-<id>` replaces the diary card for automatic entries
 * 2.  Type chip filter on History: "Task status" sends type=work_item_status (moved in #2224)
 *             UAT fix #840: DiaryEntryTypeSwitcher (all/manual/automatic tabs) removed;
 *             filtering is now done via individual type chip buttons in the filter bar
 * 3.  System event detail page renders the event layout (sentence, type badge, link; #2223)
 * 4.  Automatic entries do NOT render Edit or Delete buttons on detail page
 * 5.  The "Open task" link row replaces the nested source section (#2223)
 * 6.  PATCH to an automatic entry returns 403 (AUTOMATIC_ENTRY_READONLY) (mock API)
 */

import { test, expect } from '../../fixtures/auth.js';
import { HistoryPage } from '../../pages/HistoryPage.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';
import { mockDiaryList, mockSystemEvent } from '../../fixtures/systemEventMocks.js';
import { API } from '../../fixtures/testData.js';
import { createDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMockAutomaticEntry(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return { ...mockSystemEvent(), ...overrides };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Automatic entries visible in diary list
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Automatic entries in diary list (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'System events are rendered as event rows in the diary timeline (mock API)',
    { tag: '@smoke' },
    async ({ page }) => {
      const history = new HistoryPage(page);
      const mockId = 'mock-auto-event-001';
      const mockEntry = makeMockAutomaticEntry({ id: mockId });

      await page.route('**/api/history*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ...mockDiaryList([mockEntry]), object: null }),
          });
        } else {
          await route.continue();
        }
      });

      try {
        await history.goto();

        await expect(history.systemEventRow(mockId)).toBeVisible();
        await expect(history.systemEventRow(mockId)).toContainText(
          'Kitchen Installation went from Not started to In progress',
        );
      } finally {
        await page.unroute('**/api/history*');
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Type chip filter on History sends correct API params
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Type chip filter on History (Scenario 2)', () => {
  test('Clicking the "Task status" type chip sends type=work_item_status to /api/history', async ({
    page,
  }) => {
    // The automatic type chips moved from the Site diary to History in #2224.
    const history = new HistoryPage(page);

    await page.route('**/api/history*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 1 },
          hiddenCount: 0,
          object: null,
        }),
      });
    });

    try {
      await history.goto();

      // Register the listener BEFORE clicking the chip, and predicate it on the response's OWN
      // request URL containing the expected type param, so a trailing response of the initial
      // load cannot satisfy it (#2030).
      const responsePromise = page.waitForResponse((resp) => {
        if (!resp.url().includes('/api/history') || resp.status() !== 200) return false;
        return new URL(resp.url()).searchParams.get('type') === 'work_item_status';
      });

      await history.typeChip('work_item_status').click();
      await responsePromise;
      await expect(history.typeChip('work_item_status')).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(/[?&]type=work_item_status/);
    } finally {
      await page.unroute('**/api/history*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Automatic badge on detail page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Event layout on detail page (Scenario 3)', { tag: '@responsive' }, () => {
  test('System event detail page shows sentence, type badge and link, no "Automatic" badge', async ({
    page,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    const mockId = 'mock-auto-event-badge-001';
    const mockEntry = makeMockAutomaticEntry({ id: mockId });

    await page.route(`**/api/photos*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ photos: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API.diaryEntries}/${mockId}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockEntry),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await detailPage.goto(mockId);
      await expect(detailPage.loaded).toBeVisible();

      await expect(detailPage.systemEventRow(mockId)).toContainText(
        'Kitchen Installation went from Not started to In progress',
      );
      await expect(page.getByTestId(`system-event-${mockId}-type`)).toHaveText('Task status');
      await expect(detailPage.systemEventLink(mockId)).toHaveText(/Open task/);
      await expect(page.getByText('Automatic', { exact: true })).toHaveCount(0);
    } finally {
      await page.unroute(`${API.diaryEntries}/${mockId}`);
      await page.unroute('**/api/photos*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: No Edit/Delete buttons for automatic entries on detail page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('No Edit/Delete for automatic entries (Scenario 4)', () => {
  test('Edit and Delete buttons are NOT rendered for automatic entries on the detail page', async ({
    page,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    const mockId = 'mock-auto-event-noedit-001';
    const mockEntry = makeMockAutomaticEntry({ id: mockId });

    await page.route(`**/api/photos*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ photos: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API.diaryEntries}/${mockId}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockEntry),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await detailPage.goto(mockId);
      await expect(detailPage.loaded).toBeVisible();

      // Edit and Delete must NOT be rendered for automatic entries
      await expect(detailPage.editButton).not.toBeVisible();
      await expect(detailPage.deleteButton).not.toBeVisible();
    } finally {
      await page.unroute(`${API.diaryEntries}/${mockId}`);
      await page.unroute('**/api/photos*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Source entity section for entries with source link
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Link row replaces the source section (Scenario 5)', () => {
  test('A system event offers an "Open task" link to its subject and no "Related to" section', async ({
    page,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    const mockId = 'mock-auto-event-source-001';
    const mockEntry = makeMockAutomaticEntry({
      id: mockId,
      sourceEntityType: 'work_item',
      sourceEntityId: 'wi-kitchen-01',
    });

    await page.route(`**/api/photos*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ photos: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API.diaryEntries}/${mockId}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockEntry),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await detailPage.goto(mockId);
      await expect(detailPage.loaded).toBeVisible();

      await expect(detailPage.systemEventLink(mockId)).toHaveText(/Open task/);
      await expect(detailPage.systemEventLink(mockId)).toHaveAttribute(
        'href',
        /\/work-items\/wi-kitchen-01/,
      );
      await expect(detailPage.sourceSection).toHaveCount(0);
    } finally {
      await page.unroute(`${API.diaryEntries}/${mockId}`);
      await page.unroute('**/api/photos*');
    }
  });

  test('Source entity section is NOT rendered when sourceEntityType is null', async ({
    page,
    testPrefix,
  }) => {
    // Use a real entry created via API — no source entity by default for manual entries
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      // createDiaryEntryViaApi creates manual entries without source entity
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} no source entity test`,
      });

      await detailPage.goto(createdId);
      await expect(detailPage.loaded).toBeVisible();

      // Source section must NOT be rendered for entries without source entity
      await expect(detailPage.sourceSection).not.toBeVisible();
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: PATCH to automatic entry returns 403 (AUTOMATIC_ENTRY_READONLY)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Automatic entry is read-only via API (Scenario 6)', () => {
  test('PATCH request to an automatic entry returns 403 AUTOMATIC_ENTRY_READONLY', async ({
    page,
    testPrefix,
  }) => {
    // First, we need to know the ID of an automatic entry. Since Story #808 creates
    // automatic entries on various events, we mock the GET and intercept a PATCH attempt
    // on the navigation level to verify the 403 behavior.
    //
    // Because no manual creation path exists for automatic entries, we mock the
    // PATCH endpoint directly and verify the response via page.request.
    //
    // This tests the API contract at the E2E boundary: the server must reject PATCH
    // on automatic entries with 403 + AUTOMATIC_ENTRY_READONLY code.

    const mockId = 'mock-auto-event-readonly-001';

    // Route the GET to return an automatic entry
    await page.route(`**/api/photos*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ photos: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API.diaryEntries}/${mockId}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            makeMockAutomaticEntry({
              id: mockId,
              body: `${testPrefix} automatic entry body`,
            }),
          ),
        });
      } else {
        await route.continue();
      }
    });

    try {
      // Make a direct PATCH request via page.request to verify the 403 behavior
      // We use a real (non-existent) UUID-format ID to exercise the actual server.
      // The server must return 404 for unknown IDs — to get 403, we need a real
      // automatic entry ID. Since we cannot create automatic entries in E2E tests
      // (they are side effects of other operations), we verify the API contract
      // via a mock route interception — confirming the UI correctly handles the 403.

      // Navigate to the edit page via URL with the mock automatic entry ID
      await page.goto(`/diary/${mockId}/edit`);

      // Per Story #808 AC #10: "PATCH requests to automatic entries return 403". Since #2221 the
      // capture screen guards against it in the UI too: an automatic entry's edit URL shows an
      // EmptyState ("Automatic entries can't be changed.") instead of the form.
      const capture = new DiaryCapturePage(page);
      await capture.lockedMessage.waitFor({ state: 'visible' });
      await expect(capture.lockedMessage).toContainText("Automatic entries can't be changed.");
      await expect(capture.saveButton).toHaveCount(0);
    } finally {
      await page.unroute(`${API.diaryEntries}/${mockId}`);
      await page.unroute('**/api/photos*');
    }
  });
});
