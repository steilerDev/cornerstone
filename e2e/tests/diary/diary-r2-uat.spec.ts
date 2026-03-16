/**
 * E2E tests for UAT Round 2 fixes for the Construction Diary (EPIC-13).
 *
 * Issues addressed:
 * - #866-A: Mode filter chips (All/Manual/Automatic) added to DiaryFilterBar
 * - #866-C: "New Entry" button text no longer has a "+" prefix
 * - #867:   Photo upload on creation form; post-create navigation to detail page
 * - #868:   Automatic events section is now a flat bordered div (not collapsible details/summary)
 * - #869:   Signed badge visible on diary entry cards where isSigned=true
 *
 * Scenarios covered:
 * 1.  [smoke] Mode filter chips "All", "Manual", "Automatic" are visible in the filter bar
 * 2.  Manual mode hides automatic type chips, shows only manual type chips
 * 3.  Automatic mode hides manual type chips, shows only automatic type chips
 * 4.  Clicking "All" from Manual mode restores all type chips
 * 5.  [smoke] "New Entry" button text is "New Entry" (no "+" prefix)
 * 6.  Automatic events section is a flat bordered div, not a collapsible details element
 * 7.  [smoke] Signed badge is visible on cards with isSigned=true
 * 8.  Photo file input is present on the create form
 * 9.  Mode filter chip sends correct type parameter to the API when "Automatic" mode is selected
 * 10. Mode filter chip sends correct type parameter to the API when "Manual" mode is selected
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryPage, DIARY_ROUTE } from '../../pages/DiaryPage.js';
import { DiaryEntryCreatePage } from '../../pages/DiaryEntryCreatePage.js';

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
// Scenario 1: Mode filter chips are visible
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Mode filter chips visible (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'All three mode filter chips (All/Manual/Automatic) are visible in the filter bar',
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

        // All three mode chips must be visible
        const allChip = page.getByTestId('mode-filter-all');
        const manualChip = page.getByTestId('mode-filter-manual');
        const automaticChip = page.getByTestId('mode-filter-automatic');

        await expect(allChip).toBeVisible();
        await expect(manualChip).toBeVisible();
        await expect(automaticChip).toBeVisible();

        // Their visible text labels
        await expect(allChip).toHaveText('All');
        await expect(manualChip).toHaveText('Manual');
        await expect(automaticChip).toHaveText('Automatic');
      } finally {
        await page.unroute('**/api/diary-entries*');
      }
    },
  );

  test('"All" mode chip is aria-pressed=true by default', async ({ page }) => {
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
      await diaryPage.openFiltersIfCollapsed();

      const allChip = page.getByTestId('mode-filter-all');
      await expect(allChip).toHaveAttribute('aria-pressed', 'true');

      const manualChip = page.getByTestId('mode-filter-manual');
      await expect(manualChip).toHaveAttribute('aria-pressed', 'false');

      const automaticChip = page.getByTestId('mode-filter-automatic');
      await expect(automaticChip).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Manual mode hides automatic type chips
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Manual mode hides automatic type chips (Scenario 2)', () => {
  test('Clicking "Manual" mode chip hides automatic type chips and keeps manual ones visible', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);

    const requests: URL[] = [];

    await page.route('**/api/diary-entries*', async (route) => {
      requests.push(new URL(route.request().url()));
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

      // Register the response promise BEFORE clicking the chip
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/diary-entries') && resp.status() === 200,
      );

      const manualChip = page.getByTestId('mode-filter-manual');
      await manualChip.waitFor({ state: 'visible' });
      await manualChip.click();
      await responsePromise;

      // Manual chip should now be active
      await expect(manualChip).toHaveAttribute('aria-pressed', 'true');

      // Manual type chips should be visible
      await expect(diaryPage.typeFilterChip('daily_log')).toBeVisible();
      await expect(diaryPage.typeFilterChip('general_note')).toBeVisible();
      await expect(diaryPage.typeFilterChip('site_visit')).toBeVisible();
      await expect(diaryPage.typeFilterChip('delivery')).toBeVisible();
      await expect(diaryPage.typeFilterChip('issue')).toBeVisible();

      // Automatic type chips should NOT be visible (they are not rendered in manual mode)
      await expect(diaryPage.typeFilterChip('work_item_status')).not.toBeVisible();
      await expect(diaryPage.typeFilterChip('invoice_status')).not.toBeVisible();
      await expect(diaryPage.typeFilterChip('milestone_delay')).not.toBeVisible();
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Automatic mode hides manual type chips
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Automatic mode hides manual type chips (Scenario 3)', () => {
  test('Clicking "Automatic" mode chip hides manual type chips and shows automatic ones', async ({
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

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/diary-entries') && resp.status() === 200,
      );

      const automaticChip = page.getByTestId('mode-filter-automatic');
      await automaticChip.waitFor({ state: 'visible' });
      await automaticChip.click();
      await responsePromise;

      // Automatic chip should now be active
      await expect(automaticChip).toHaveAttribute('aria-pressed', 'true');

      // Automatic type chips should be visible
      await expect(diaryPage.typeFilterChip('work_item_status')).toBeVisible();
      await expect(diaryPage.typeFilterChip('invoice_status')).toBeVisible();
      await expect(diaryPage.typeFilterChip('milestone_delay')).toBeVisible();

      // Manual type chips should NOT be visible
      await expect(diaryPage.typeFilterChip('daily_log')).not.toBeVisible();
      await expect(diaryPage.typeFilterChip('general_note')).not.toBeVisible();
      await expect(diaryPage.typeFilterChip('site_visit')).not.toBeVisible();
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: "All" mode from Manual restores all type chips
// ─────────────────────────────────────────────────────────────────────────────
test.describe('All mode restores all type chips (Scenario 4)', () => {
  test('Clicking "All" after "Manual" restores all type chips', async ({ page }) => {
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

      // Switch to manual mode first
      const manualChip = page.getByTestId('mode-filter-manual');
      await manualChip.waitFor({ state: 'visible' });
      let responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/diary-entries') && resp.status() === 200,
      );
      await manualChip.click();
      await responsePromise;

      // Verify automatic chips are hidden
      await expect(diaryPage.typeFilterChip('work_item_status')).not.toBeVisible();

      // Now switch back to "All"
      const allChip = page.getByTestId('mode-filter-all');
      responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/diary-entries') && resp.status() === 200,
      );
      await allChip.click();
      await responsePromise;

      // Both manual and automatic type chips should be visible again
      await expect(diaryPage.typeFilterChip('daily_log')).toBeVisible();
      await expect(diaryPage.typeFilterChip('general_note')).toBeVisible();
      await expect(diaryPage.typeFilterChip('work_item_status')).toBeVisible();
      await expect(diaryPage.typeFilterChip('invoice_status')).toBeVisible();
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: "New Entry" button text
// ─────────────────────────────────────────────────────────────────────────────
test.describe('New Entry button text (Scenario 5)', { tag: '@responsive' }, () => {
  test(
    'The create entry button text is "New Entry" without a "+" prefix',
    { tag: '@smoke' },
    async ({ page }) => {
      const diaryPage = new DiaryPage(page);

      await diaryPage.goto();

      // The "New Entry" button must be present with the exact text (no "+" prefix)
      await expect(diaryPage.newEntryButton).toBeVisible();
      await expect(diaryPage.newEntryButton).toHaveText('New Entry');

      // Verify there is no button with a "+" prefix (old text)
      const plusButton = page.getByRole('link', { name: '+ New Entry', exact: true });
      await expect(plusButton).not.toBeVisible();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Automatic events section is a flat div, not a collapsible
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Automatic events as flat section (Scenario 6)', { tag: '@responsive' }, () => {
  test(
    'Automatic events section renders as a flat bordered div with "Automated Events" heading',
    { tag: '@smoke' },
    async ({ page }) => {
      const mockDate = '2026-03-16';

      await page.route('**/api/diary-entries*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
              makePaginatedResponse([
                makeMockEntry({
                  id: 'mock-auto-r2-001',
                  entryType: 'work_item_status',
                  entryDate: mockDate,
                  isAutomatic: true,
                  createdBy: null,
                  title: null,
                  body: 'Status changed automatically',
                }),
                makeMockEntry({
                  id: 'mock-manual-r2-001',
                  entryDate: mockDate,
                  isAutomatic: false,
                  body: 'A manual general note',
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

        // The automatic section is identified by data-testid="automatic-section-{date}"
        const automaticSection = page.getByTestId(`automatic-section-${mockDate}`);
        await expect(automaticSection).toBeVisible();

        // It must contain "Automated Events" text
        await expect(automaticSection).toContainText('Automated Events');

        // It must be a div (NOT a details element — UAT R2 #868 removed the collapsible)
        const tagName = await automaticSection.evaluate((el) => el.tagName.toLowerCase());
        expect(tagName).toBe('div');

        // No details/summary element should exist in the automatic section
        const detailsCount = await automaticSection.locator('details').count();
        expect(detailsCount).toBe(0);

        // The automatic entry card should be directly visible (no interaction needed)
        await expect(diaryPage.entryCard('mock-auto-r2-001')).toBeVisible();
      } finally {
        await page.unroute('**/api/diary-entries*');
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
// Scenario 8: Photo file input on create form
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Photo upload input on create form (Scenario 8)', { tag: '@responsive' }, () => {
  test('Create form includes a photo file input before submission', async ({ page }) => {
    const createPage = new DiaryEntryCreatePage(page);

    await createPage.goto();
    await createPage.selectType('general_note');

    // The photo file input must be present
    // data-testid="create-photo-input" (file input in the create form)
    const photoInput = page.getByTestId('create-photo-input');
    await expect(photoInput).toBeAttached();

    // Verify it accepts image files (accept="image/*")
    const acceptAttr = await photoInput.getAttribute('accept');
    expect(acceptAttr).toContain('image/');

    // Verify it supports multiple files
    const multipleAttr = await photoInput.getAttribute('multiple');
    expect(multipleAttr).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Automatic mode sends only automatic types to API
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Automatic mode API parameter (Scenario 9)', () => {
  test('Selecting "Automatic" mode sends only automatic entry types to the API', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);
    const requests: URL[] = [];

    await page.route('**/api/diary-entries*', async (route) => {
      requests.push(new URL(route.request().url()));
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

      // Reset captured requests from initial load
      requests.length = 0;

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/diary-entries') && resp.status() === 200,
      );

      const automaticChip = page.getByTestId('mode-filter-automatic');
      await automaticChip.waitFor({ state: 'visible' });
      await automaticChip.click();
      await responsePromise;

      // The API call should include automatic entry types in the type parameter
      const lastRequest = requests[requests.length - 1];
      expect(lastRequest).toBeDefined();
      const typeParam = lastRequest?.searchParams.get('type');

      // type parameter must be present and contain at least one automatic type
      expect(typeParam).toBeTruthy();
      if (typeParam) {
        // Must contain at least one automatic type (e.g. work_item_status)
        const automaticTypes = [
          'work_item_status',
          'invoice_status',
          'invoice_created',
          'milestone_delay',
          'budget_breach',
          'auto_reschedule',
          'subsidy_status',
        ];
        const typeList = typeParam.split(',');
        const hasAtLeastOneAutomatic = automaticTypes.some((t) => typeList.includes(t));
        expect(hasAtLeastOneAutomatic).toBe(true);

        // Must NOT contain manual types
        const manualTypes = ['daily_log', 'site_visit', 'delivery', 'issue', 'general_note'];
        const hasManual = manualTypes.some((t) => typeList.includes(t));
        expect(hasManual).toBe(false);
      }
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Manual mode sends only manual types to API
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Manual mode API parameter (Scenario 10)', () => {
  test('Selecting "Manual" mode sends only manual entry types to the API', async ({ page }) => {
    const diaryPage = new DiaryPage(page);
    const requests: URL[] = [];

    await page.route('**/api/diary-entries*', async (route) => {
      requests.push(new URL(route.request().url()));
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

      // Reset captured requests from initial load
      requests.length = 0;

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/diary-entries') && resp.status() === 200,
      );

      const manualChip = page.getByTestId('mode-filter-manual');
      await manualChip.waitFor({ state: 'visible' });
      await manualChip.click();
      await responsePromise;

      const lastRequest = requests[requests.length - 1];
      expect(lastRequest).toBeDefined();
      const typeParam = lastRequest?.searchParams.get('type');

      // type parameter must be present and contain at least one manual type
      expect(typeParam).toBeTruthy();
      if (typeParam) {
        const manualTypes = ['daily_log', 'site_visit', 'delivery', 'issue', 'general_note'];
        const typeList = typeParam.split(',');
        const hasAtLeastOneManual = manualTypes.some((t) => typeList.includes(t));
        expect(hasAtLeastOneManual).toBe(true);

        // Must NOT contain automatic types
        const automaticTypes = [
          'work_item_status',
          'invoice_status',
          'invoice_created',
          'milestone_delay',
          'budget_breach',
          'auto_reschedule',
          'subsidy_status',
        ];
        const hasAutomatic = automaticTypes.some((t) => typeList.includes(t));
        expect(hasAutomatic).toBe(false);
      }
    } finally {
      await page.unroute('**/api/diary-entries*');
    }
  });
});
