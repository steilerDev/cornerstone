/**
 * E2E tests for Diary PDF and printable export.
 *
 * Story #809: Diary PDF and printable export
 *
 * Scenarios covered:
 * 1.  [smoke] Export button is visible on the diary list page
 * 2.  Clicking Export opens the export dialog with "Export Diary to PDF" heading
 * 3.  Export dialog has date range inputs and entry type checkboxes
 * 4.  "Generate PDF" button is present in the dialog
 * 5.  Closing the dialog (Escape key) dismisses it
 * 6.  Clicking Cancel button dismisses the dialog
 * 7.  Generate PDF triggers the export API endpoint and initiates a download (mock)
 * 8.  Error in export shows an error banner in the dialog (mock API error)
 * 9.  Print button is visible on the diary entry detail page
 * 10. [responsive] Export dialog renders without horizontal scroll
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryPage, DIARY_ROUTE } from '../../pages/DiaryPage.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { createDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Export button visible on diary list page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Export button visibility (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Export button is visible on the diary list page',
    { tag: '@smoke' },
    async ({ page }) => {
      const diaryPage = new DiaryPage(page);
      await diaryPage.goto();

      await expect(diaryPage.exportButton).toBeVisible();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Export dialog opens with correct heading
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Export dialog opens (Scenario 2)', { tag: '@responsive' }, () => {
  test('Clicking Export opens the dialog with "Export Diary to PDF" heading', async ({ page }) => {
    const diaryPage = new DiaryPage(page);
    await diaryPage.goto();

    await diaryPage.exportButton.click();

    // Dialog should be visible
    await expect(diaryPage.exportDialog).toBeVisible();

    // Dialog heading text
    const dialogHeading = diaryPage.exportDialog.getByRole('heading', { name: /Export Diary to PDF/i });
    await expect(dialogHeading).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Export dialog has date range inputs and type checkboxes
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Export dialog form elements (Scenario 3)', () => {
  test('Export dialog contains date range inputs and entry type checkboxes', async ({ page }) => {
    const diaryPage = new DiaryPage(page);
    await diaryPage.goto();
    await diaryPage.exportButton.click();
    await expect(diaryPage.exportDialog).toBeVisible();

    // Date From input
    const dateFromInput = diaryPage.exportDialog.locator('#export-date-from');
    await expect(dateFromInput).toBeVisible();

    // Date To input
    const dateToInput = diaryPage.exportDialog.locator('#export-date-to');
    await expect(dateToInput).toBeVisible();

    // Entry type checkboxes group
    const typeCheckboxGroup = diaryPage.exportDialog.getByRole('group', {
      name: /Select entry types/i,
    });
    await expect(typeCheckboxGroup).toBeVisible();

    // Should have at least 5 type checkboxes (manual entry types)
    const checkboxes = diaryPage.exportDialog.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: "Generate PDF" button present in dialog
// ─────────────────────────────────────────────────────────────────────────────
test.describe('"Generate PDF" button (Scenario 4)', () => {
  test('"Generate PDF" button is present and enabled in the export dialog', async ({ page }) => {
    const diaryPage = new DiaryPage(page);
    await diaryPage.goto();
    await diaryPage.exportButton.click();
    await expect(diaryPage.exportDialog).toBeVisible();

    const generateButton = diaryPage.exportDialog.getByRole('button', { name: /Generate PDF/i });
    await expect(generateButton).toBeVisible();
    await expect(generateButton).toBeEnabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Escape key closes the export dialog
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Escape key closes dialog (Scenario 5)', () => {
  test('Pressing Escape dismisses the export dialog', async ({ page }) => {
    const diaryPage = new DiaryPage(page);
    await diaryPage.goto();
    await diaryPage.exportButton.click();
    await expect(diaryPage.exportDialog).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Dialog should no longer be visible
    await expect(diaryPage.exportDialog).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Cancel button closes the dialog
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Cancel button closes dialog (Scenario 6)', () => {
  test('Clicking Cancel dismisses the export dialog', async ({ page }) => {
    const diaryPage = new DiaryPage(page);
    await diaryPage.goto();
    await diaryPage.exportButton.click();
    await expect(diaryPage.exportDialog).toBeVisible();

    // Find the Cancel button inside the dialog (not "Generate PDF")
    const cancelButton = diaryPage.exportDialog.getByRole('button', {
      name: /Cancel/i,
    });
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    // Dialog should be dismissed
    await expect(diaryPage.exportDialog).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Generate PDF triggers the export API endpoint (mock)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Generate PDF triggers export API (Scenario 7)', () => {
  test('Clicking "Generate PDF" calls the export endpoint and initiates download (mock)', async ({
    page,
  }) => {
    const diaryPage = new DiaryPage(page);

    // registerBefore: waitForRequest must be registered BEFORE the action that triggers it
    const exportRequestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/diary-entries/export') && req.method() === 'GET',
    );

    await page.route('**/api/diary-entries/export*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: {
          'Content-Disposition': 'attachment; filename="construction-diary.pdf"',
        },
        body: Buffer.from('%PDF-1.4 mock pdf content'),
      });
    });

    try {
      await diaryPage.goto();
      await diaryPage.exportButton.click();
      await expect(diaryPage.exportDialog).toBeVisible();

      const generateButton = diaryPage.exportDialog.getByRole('button', { name: /Generate PDF/i });
      await generateButton.click();

      // The export request must be sent (to some /diary-entries/export path)
      const exportRequest = await exportRequestPromise;
      expect(exportRequest.url()).toContain('/api/diary-entries/export');
    } finally {
      await page.unroute('**/api/diary-entries/export*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: API error in export shows error banner in dialog
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Export error handling (Scenario 8)', () => {
  test('API error during export shows an error banner inside the dialog', async ({ page }) => {
    const diaryPage = new DiaryPage(page);

    await page.route('**/api/diary-entries/export*', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'EXPORT_EMPTY', message: 'No entries match the filter criteria.' },
        }),
      });
    });

    try {
      await diaryPage.goto();
      await diaryPage.exportButton.click();
      await expect(diaryPage.exportDialog).toBeVisible();

      const generateButton = diaryPage.exportDialog.getByRole('button', { name: /Generate PDF/i });
      await generateButton.click();

      // An error banner should appear inside the dialog (role="alert")
      const errorBanner = diaryPage.exportDialog.getByRole('alert');
      await expect(errorBanner).toBeVisible();

      // Dialog should remain open after error
      await expect(diaryPage.exportDialog).toBeVisible();
    } finally {
      await page.unroute('**/api/diary-entries/export*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Print button on diary entry detail page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Print button on detail page (Scenario 9)', { tag: '@responsive' }, () => {
  test('Print button is visible on the diary entry detail page', async ({ page, testPrefix }) => {
    const detailPage = new DiaryEntryDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: `${testPrefix} print button test`,
        title: `${testPrefix} Print Button Test`,
      });

      await detailPage.goto(createdId);
      await expect(detailPage.backButton).toBeVisible();

      // Print button should be visible
      await expect(detailPage.printButton).toBeVisible();
    } finally {
      if (createdId) await deleteDiaryEntryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Responsive — export dialog no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive — export dialog (Scenario 10)', { tag: '@responsive' }, () => {
  test('Export dialog renders without horizontal scroll on current viewport', async ({ page }) => {
    const diaryPage = new DiaryPage(page);
    await page.goto(DIARY_ROUTE);
    await diaryPage.heading.waitFor({ state: 'visible' });

    await diaryPage.exportButton.click();
    await expect(diaryPage.exportDialog).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Close dialog
    await page.keyboard.press('Escape');
  });
});
