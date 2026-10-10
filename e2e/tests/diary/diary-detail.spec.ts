/**
 * E2E tests for the Diary Entry Detail page (/diary/:id)
 *
 * Story #804: Diary timeline view with filtering and search
 *
 * Scenarios covered:
 * 1.  Detail page loads for a created entry — shows body text (@smoke @responsive)
 * 2.  The "Site diary" breadcrumb returns to the list (/diary)
 * 3.  (same, from the list) - there is no Back button or bottom link any more (#2204)
 * 4.  daily_log metadata section renders weather and workers on-site
 * 5.  site_visit outcome badge renders (pass/fail/conditional)
 * 6.  issue severity badge renders (low/medium/high/critical)
 * 7.  404 / error state shown for a non-existent entry ID
 * 8.  Automatic badge shown for automatic (system) entries (mock API)
 * 9.  Responsive — no horizontal scroll on current viewport (@responsive)
 * 10. Dark mode — page renders without layout overflow (@responsive)
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { DiaryPage } from '../../pages/DiaryPage.js';
import { API } from '../../fixtures/testData.js';
import { createDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Detail page loads for a created entry
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page load (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Diary detail page loads and shows the entry body text',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new DiaryEntryDetailPage(page);
      let createdId: string | null = null;
      const body = `${testPrefix} detail page body text`;

      try {
        createdId = await createDiaryEntryViaApi(page, {
          entryType: 'general_note',
          entryDate: '2026-03-14',
          body,
          title: `${testPrefix} Detail Smoke Test`,
        });

        await detailPage.goto(createdId);

        // The loaded marker is our primary "page is loaded" signal
        await expect(detailPage.loaded).toBeVisible();

        // Body text is rendered
        await expect(detailPage.entryBody).toContainText(body);
      } finally {
        if (createdId) await deleteDiaryEntryViaApi(page, createdId);
      }
    },
  );

  test('Entry title h1 is rendered when the entry has a title', async ({ page, testPrefix }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;
    const title = `${testPrefix} Detail Title Test`;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: 'Entry body for title test',
        title,
      });

      await detailPage.goto(createdId);

      const titleText = await detailPage.getEntryTitleText();
      expect(titleText).toContain(title);
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: the "Site diary" breadcrumb returns to the list
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Breadcrumb navigation (Scenario 2)', { tag: '@responsive' }, () => {
  test('"Site diary" breadcrumb returns to the diary list page', async ({ page, testPrefix }) => {
    const diaryPage = new DiaryPage(page);
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} back button test`,
        title: `${testPrefix} Back Button Test`,
      });

      // Start from the list page so navigate(-1) goes back there
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      // Navigate to the detail page by URL
      await page.goto(`/diary/${createdId}`);
      await detailPage.loaded.waitFor({ state: 'visible' });

      await detailPage.breadcrumbs.trailLink('Site diary').click();

      // Should return to /diary — wait for the diary list heading to confirm navigation
      // Using waitForURL with an explicit 15s timeout to handle slower WebKit tablet navigation
      await page.waitForURL('**/diary', { timeout: 15_000 });
      expect(page.url()).toContain('/diary');
      // Should not be on the detail page
      expect(page.url()).not.toMatch(/\/diary\/[a-zA-Z0-9-]+$/);
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: the breadcrumb navigates to /diary
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Breadcrumb navigation from the list (Scenario 3)', { tag: '@responsive' }, () => {
  test('"Site diary" breadcrumb navigates to /diary when navigated from the list', async ({
    page,
    testPrefix,
  }) => {
    const diaryPage = new DiaryPage(page);
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} back button navigation test`,
      });

      // Navigate to the diary list first to establish browser history
      await diaryPage.goto();
      await diaryPage.waitForLoaded();

      // Then navigate to the detail page
      await page.goto(`/diary/${createdId}`);
      await detailPage.loaded.waitFor({ state: 'visible' });

      // Click the back button
      await detailPage.breadcrumbs.trailLink('Site diary').click();

      // Should return to /diary — explicit 15s to handle slower WebKit tablet navigation
      await page.waitForURL('**/diary', { timeout: 15_000 });
      expect(page.url()).toContain('/diary');
      expect(page.url()).not.toMatch(/\/diary\/[a-zA-Z0-9-]+$/);
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: daily_log metadata renders weather and workers
// ─────────────────────────────────────────────────────────────────────────────
test.describe('daily_log metadata (Scenario 4)', () => {
  test('daily_log entry shows weather and workers-on-site in metadata summary', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: `${testPrefix} daily log entry`,
        title: `${testPrefix} Daily Log Metadata Test`,
        metadata: {
          weather: 'sunny',
          temperatureCelsius: 18,
          workersOnSite: 5,
        },
      });

      await detailPage.goto(createdId);

      // The metadata summary section should be rendered
      await expect(detailPage.dailyLogMetadata).toBeVisible();

      // Weather and workers text should appear inside the metadata area
      const metadataText = await detailPage.dailyLogMetadata.textContent();
      expect(metadataText?.toLowerCase()).toContain('sunny');
      expect(metadataText).toContain('5');
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: site_visit outcome badge renders
// ─────────────────────────────────────────────────────────────────────────────
test.describe('site_visit outcome badge (Scenario 5)', () => {
  test('site_visit entry shows outcome badge for "pass" result', async ({ page, testPrefix }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'site_visit',
        entryDate: '2026-03-14',
        body: `${testPrefix} site visit entry`,
        title: `${testPrefix} Site Visit Pass Test`,
        metadata: {
          inspectorName: 'Jane Inspector',
          outcome: 'pass',
        },
      });

      await detailPage.goto(createdId);

      // site_visit metadata wrapper should be visible
      await expect(detailPage.siteVisitMetadata).toBeVisible();

      // Outcome badge with data-testid="outcome-pass" from DiaryOutcomeBadge
      await expect(detailPage.outcomeBadge('pass')).toBeVisible();
      await expect(detailPage.outcomeBadge('pass')).toHaveText('Pass');
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });

  test('site_visit entry shows "Fail" outcome badge', async ({ page, testPrefix }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'site_visit',
        entryDate: '2026-03-14',
        body: `${testPrefix} site visit fail entry`,
        metadata: {
          outcome: 'fail',
        },
      });

      await detailPage.goto(createdId);
      await expect(detailPage.outcomeBadge('fail')).toBeVisible();
      await expect(detailPage.outcomeBadge('fail')).toHaveText('Fail');
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: issue severity badge renders
// ─────────────────────────────────────────────────────────────────────────────
test.describe('issue severity badge (Scenario 6)', () => {
  test('issue entry shows severity badge for "critical" severity', async ({ page, testPrefix }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'issue',
        entryDate: '2026-03-14',
        body: `${testPrefix} critical issue entry`,
        title: `${testPrefix} Critical Issue Test`,
        metadata: {
          severity: 'critical',
          resolutionStatus: 'open',
        },
      });

      await detailPage.goto(createdId);

      // Issue metadata wrapper should be visible
      await expect(detailPage.issueMetadata).toBeVisible();

      // Severity badge: data-testid="severity-critical" from DiarySeverityBadge
      await expect(detailPage.severityBadge('critical')).toBeVisible();
      await expect(detailPage.severityBadge('critical')).toHaveText('Critical');
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });

  test('issue entry shows "High" severity badge', async ({ page, testPrefix }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'issue',
        entryDate: '2026-03-14',
        body: `${testPrefix} high issue entry`,
        metadata: {
          severity: 'high',
          resolutionStatus: 'in_progress',
        },
      });

      await detailPage.goto(createdId);
      await expect(detailPage.severityBadge('high')).toBeVisible();
      await expect(detailPage.severityBadge('high')).toHaveText('High');
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: 404 / error state for non-existent entry
// ─────────────────────────────────────────────────────────────────────────────
test.describe('404 error state (Scenario 7)', { tag: '@responsive' }, () => {
  test('Navigating to a non-existent diary entry ID shows an error message', async ({ page }) => {
    const detailPage = new DiaryEntryDetailPage(page);

    await detailPage.goto('00000000-0000-0000-0000-000000000000');

    // Not-found state (#2204): the single h1 says so, in place of the old error banner
    await expect(detailPage.heading).toHaveText('Diary entry not found');
    await expect(detailPage.heading).toHaveCount(1);

    // "Back to Site diary" link rendered in the not-found state
    await expect(detailPage.backToDiaryLink).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: "Automatic" badge shown for system-generated entries (mock API)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Automatic entry badge (Scenario 8)', () => {
  test('Automatic system entry shows an "Automatic" badge in the detail view', async ({ page }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    const mockId = 'mock-auto-entry-001';

    // Mock the individual entry endpoint to return an automatic entry
    await page.route(`${API.diaryEntries}/${mockId}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: mockId,
            entryType: 'work_item_status',
            entryDate: '2026-03-14',
            title: null,
            body: 'Work item "Kitchen Installation" changed status from planning to in_progress.',
            metadata: {
              changeSummary: 'Status changed from planning to in_progress.',
              previousValue: 'planning',
              newValue: 'in_progress',
            },
            isAutomatic: true,
            sourceEntityType: 'work_item',
            sourceEntityId: 'wi-001',
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

      // Automatic badge should be visible
      await expect(detailPage.automaticBadge).toBeVisible();
      await expect(detailPage.automaticBadge).toHaveText('Automatic');

      // Source section links to the related work item
      await expect(detailPage.sourceSection).toBeVisible();
    } finally {
      await page.unroute(`${API.diaryEntries}/${mockId}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Responsive — no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 9)', { tag: '@responsive' }, () => {
  test('Diary detail page renders without horizontal scroll on current viewport', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} responsive detail test`,
      });

      await detailPage.goto(createdId);

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
// Scenario 10: Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering (Scenario 10)', { tag: '@responsive' }, () => {
  test('Diary detail page renders correctly in dark mode without layout overflow', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} dark mode detail test`,
      });

      await page.goto(`/diary/${createdId}`);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      await detailPage.loaded.waitFor({ state: 'visible' });

      await expect(detailPage.loaded).toBeVisible();

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});
