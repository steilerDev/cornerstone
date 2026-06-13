/**
 * E2E tests for the daily_log vendor + work start/end time + computed duration feature
 *
 * Story #1672: Daily log — vendor selector, work start/end time, computed duration
 *
 * Scenarios covered:
 * 1. [smoke] Vendor selection happy path: create vendor + entry, open edit page, search and
 *            select vendor, save, verify vendor name appears in detail page metadata summary.
 * 2. Time entry + duration: fill start 08:00 and end 16:30, verify "8.50 h" in form,
 *            save, verify times and duration on detail page.
 * 3. End ≤ start validation: fill start 16:00 end 08:00, attempt save, verify inline error
 *            "End time must be after start time" visible and times NOT persisted after reload.
 * 4. All fields then clear vendor: add vendor + times via UI, save, reload, clear vendor, save,
 *            verify vendor no longer appears in summary.
 * 5. [smoke] Smoke: bare daily_log entry loads on edit page, vendor SearchPicker is present,
 *            no duration display shown when both times absent.
 * 6. [responsive] Responsive: at current viewport, time inputs are usable and no horizontal overflow.
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryEntryEditPage } from '../../pages/DiaryEntryEditPage.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import {
  createDiaryEntryViaApi,
  deleteDiaryEntryViaApi,
  createVendorViaApi,
  deleteVendorViaApi,
} from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a saved daily_log entry via API.
 * Provides required fields (entryDate, body) so the entry is in status="saved".
 */
async function createDailyLogEntry(
  page: Parameters<typeof createDiaryEntryViaApi>[0],
  prefix: string,
  options: {
    metadata?: Record<string, unknown>;
  } = {},
): Promise<string> {
  return createDiaryEntryViaApi(page, {
    entryType: 'daily_log',
    entryDate: '2026-03-14',
    body: `${prefix} daily log body`,
    title: `${prefix} Daily Log`,
    metadata: options.metadata ?? null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Vendor selection happy path (@smoke)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Vendor selection happy path (Scenario 1)', () => {
  test(
    'User can search and select a vendor on daily_log edit page; vendor name appears in summary',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const editPage = new DiaryEntryEditPage(page);
      const detailPage = new DiaryEntryDetailPage(page);
      let entryId: string | null = null;
      let vendorId: string | null = null;
      const vendorName = `${testPrefix} VendorCorp`;

      try {
        vendorId = await createVendorViaApi(page, { name: vendorName });
        entryId = await createDailyLogEntry(page, testPrefix);

        await editPage.goto(entryId);
        await expect(editPage.heading).toBeVisible();

        // The SearchPicker input (id="daily-log-vendor") should be visible when no vendor is selected
        await expect(editPage.dailyLogVendorSearch).toBeVisible();

        // Focus the input and type the vendor name — SearchPicker shows items on focus,
        // but typing filters to our specific vendor
        await editPage.dailyLogVendorSearch.click();
        await editPage.dailyLogVendorSearch.fill(vendorName);

        // Wait for the portal dropdown to appear and the option to be visible
        const portalDropdown = page.locator('[data-search-picker-dropdown]');
        await expect(portalDropdown).toBeVisible();

        const vendorOption = portalDropdown.getByRole('option', { name: vendorName });
        await expect(vendorOption).toBeVisible();
        await vendorOption.click();

        // After selection: the SearchPicker hides the input and shows selectedDisplay with clear button
        await expect(editPage.dailyLogVendorSearch).not.toBeVisible();
        await expect(editPage.dailyLogVendorClearButton).toBeVisible();

        // Save the entry — PATCH /api/diary-entries/:id
        await editPage.save();

        // Navigate to detail page
        await page.waitForURL(new RegExp(`/diary/${entryId}$`));
        await detailPage.backButton.waitFor({ state: 'visible' });

        // Verify the vendor name appears in the daily_log metadata summary
        await expect(detailPage.dailyLogMetadata).toBeVisible();
        const metadataText = await detailPage.dailyLogMetadata.textContent();
        expect(metadataText).toContain(vendorName);
      } finally {
        if (entryId) await deleteDiaryEntryViaApi(page, entryId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Time entry + duration happy path
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Time entry and duration display (Scenario 2)', () => {
  test(
    'Filling start 08:00 and end 16:30 shows "8.50 h" duration in form; times shown on detail page',
    async ({ page, testPrefix }) => {
      const editPage = new DiaryEntryEditPage(page);
      const detailPage = new DiaryEntryDetailPage(page);
      let entryId: string | null = null;

      try {
        entryId = await createDailyLogEntry(page, testPrefix);

        await editPage.goto(entryId);
        await expect(editPage.heading).toBeVisible();

        // Fill work start and end time
        await editPage.workStartTimeInput.waitFor({ state: 'visible' });
        await editPage.workStartTimeInput.fill('08:00');
        await editPage.workEndTimeInput.fill('16:30');

        // Trigger blur to ensure React state update fires (onFieldBlur is wired for saved entries)
        await editPage.workEndTimeInput.press('Tab');

        // Duration should appear: 16:30 - 08:00 = 510 minutes = 8.5 hours = "8.50 h"
        await expect(editPage.workDurationDisplay).toBeVisible();
        await expect(editPage.workDurationDisplay).not.toHaveText('');
        // Wait for React to commit the duration value (avoids stale-read race on WebKit)
        await expect(editPage.workDurationDisplay).not.toHaveText('0.00 h');
        const durationText = await editPage.workDurationDisplay.textContent();
        expect(durationText?.trim()).toBe('8.50 h');

        // Save the entry
        await editPage.save();

        // Navigate to detail page
        await page.waitForURL(new RegExp(`/diary/${entryId}$`));
        await detailPage.backButton.waitFor({ state: 'visible' });

        // Verify start time, end time, and duration in the metadata summary
        await expect(detailPage.dailyLogMetadata).toBeVisible();
        const metadataText = await detailPage.dailyLogMetadata.textContent();
        expect(metadataText).toContain('08:00');
        expect(metadataText).toContain('16:30');
        expect(metadataText).toContain('8.50 h');
      } finally {
        if (entryId) await deleteDiaryEntryViaApi(page, entryId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: End ≤ start validation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('End-time ≤ start-time validation (Scenario 3)', () => {
  test(
    'Setting end before start shows validation error and does not persist times',
    async ({ page, testPrefix }) => {
      const editPage = new DiaryEntryEditPage(page);
      let entryId: string | null = null;

      try {
        entryId = await createDailyLogEntry(page, testPrefix);

        await editPage.goto(entryId);
        await expect(editPage.heading).toBeVisible();

        // Fill end time ≤ start time
        await editPage.workStartTimeInput.waitFor({ state: 'visible' });
        await editPage.workStartTimeInput.fill('16:00');
        await editPage.workEndTimeInput.fill('08:00');

        // Duration must NOT appear (end < start → computeWorkDuration returns null)
        await expect(editPage.workDurationDisplay).not.toBeVisible();

        // Attempt to save — submit button click should trigger validation
        await editPage.submitButton.click();

        // Validation error should appear
        await expect(editPage.workTimeValidationError).toBeVisible();
        await expect(editPage.workTimeValidationError).toContainText(
          'End time must be after start time',
        );

        // URL should not have changed (still on /edit)
        expect(page.url()).toContain('/edit');

        // Reload the page and confirm times were NOT persisted
        await editPage.goto(entryId);
        await expect(editPage.heading).toBeVisible();
        await editPage.workStartTimeInput.waitFor({ state: 'visible' });

        const startValue = await editPage.workStartTimeInput.inputValue();
        const endValue = await editPage.workEndTimeInput.inputValue();
        expect(startValue).toBe('');
        expect(endValue).toBe('');
      } finally {
        if (entryId) await deleteDiaryEntryViaApi(page, entryId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: All fields then clear vendor (within same edit session)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Clear vendor after selection (Scenario 4)', () => {
  test(
    'Vendor selected in UI can be cleared; after clear and save, vendor no longer appears in summary',
    async ({ page, testPrefix }) => {
      const editPage = new DiaryEntryEditPage(page);
      const detailPage = new DiaryEntryDetailPage(page);
      let entryId: string | null = null;
      let vendorId: string | null = null;
      const vendorName = `${testPrefix} ClearVendor`;

      try {
        vendorId = await createVendorViaApi(page, { name: vendorName });
        entryId = await createDailyLogEntry(page, testPrefix);

        // Open edit page
        await editPage.goto(entryId);
        await expect(editPage.heading).toBeVisible();

        // Select vendor via SearchPicker
        await editPage.dailyLogVendorSearch.click();
        await editPage.dailyLogVendorSearch.fill(vendorName);
        const portalDropdown = page.locator('[data-search-picker-dropdown]');
        await expect(portalDropdown).toBeVisible();
        const vendorOption = portalDropdown.getByRole('option', { name: vendorName });
        await expect(vendorOption).toBeVisible();
        await vendorOption.click();

        // Confirm vendor selected — clear button is visible, search input is hidden
        await expect(editPage.dailyLogVendorClearButton).toBeVisible();
        await expect(editPage.dailyLogVendorSearch).not.toBeVisible();

        // Also fill times to exercise the full set of new fields
        await editPage.workStartTimeInput.fill('09:00');
        await editPage.workEndTimeInput.fill('17:00');

        // Now clear the vendor using the clear (×) button
        await editPage.dailyLogVendorClearButton.click();

        // After clearing: search input is visible again, clear button is gone
        await expect(editPage.dailyLogVendorSearch).toBeVisible();
        await expect(editPage.dailyLogVendorClearButton).not.toBeVisible();

        // Save the entry (vendor should be null, times should be saved)
        await editPage.save();
        await page.waitForURL(new RegExp(`/diary/${entryId}$`));
        await detailPage.backButton.waitFor({ state: 'visible' });

        // Vendor name must NOT appear in summary (vendorId was cleared)
        await expect(detailPage.dailyLogMetadata).toBeVisible();
        const metadataText = await detailPage.dailyLogMetadata.textContent();
        expect(metadataText).not.toContain(vendorName);

        // Times are still present
        expect(metadataText).toContain('09:00');
        expect(metadataText).toContain('17:00');
      } finally {
        if (entryId) await deleteDiaryEntryViaApi(page, entryId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Smoke — bare daily_log entry loads, vendor picker present, no duration
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit page loads for bare daily_log (Scenario 5)', { tag: '@responsive' }, () => {
  test(
    'Bare daily_log entry: edit page loads, vendor SearchPicker is present, no duration shown',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const editPage = new DiaryEntryEditPage(page);
      let entryId: string | null = null;

      try {
        // Create a bare daily_log entry with no metadata (no times, no vendor)
        entryId = await createDailyLogEntry(page, testPrefix);

        await editPage.goto(entryId);
        await expect(editPage.heading).toBeVisible();

        // Vendor SearchPicker input must be present (no vendor selected yet)
        await expect(editPage.dailyLogVendorSearch).toBeVisible();

        // Work time inputs must be present and empty
        await expect(editPage.workStartTimeInput).toBeVisible();
        await expect(editPage.workEndTimeInput).toBeVisible();
        const startVal = await editPage.workStartTimeInput.inputValue();
        const endVal = await editPage.workEndTimeInput.inputValue();
        expect(startVal).toBe('');
        expect(endVal).toBe('');

        // Duration display must NOT be visible (both times absent)
        await expect(editPage.workDurationDisplay).not.toBeVisible();
      } finally {
        if (entryId) await deleteDiaryEntryViaApi(page, entryId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Responsive — time inputs usable, no horizontal overflow
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 6)', { tag: '@responsive' }, () => {
  test(
    'Time inputs are visible and there is no horizontal overflow on the edit page',
    async ({ page, testPrefix }) => {
      const editPage = new DiaryEntryEditPage(page);
      let entryId: string | null = null;

      try {
        entryId = await createDailyLogEntry(page, testPrefix);

        await editPage.goto(entryId);
        await expect(editPage.heading).toBeVisible();

        // Both time inputs must be visible and interactive
        await expect(editPage.workStartTimeInput).toBeVisible();
        await expect(editPage.workEndTimeInput).toBeVisible();

        // Inputs must be enabled (not disabled)
        await expect(editPage.workStartTimeInput).toBeEnabled();
        await expect(editPage.workEndTimeInput).toBeEnabled();

        // No horizontal overflow: scrollWidth should equal clientWidth on <body>
        const hasHorizontalOverflow = await page.evaluate(() => {
          return document.body.scrollWidth > document.body.clientWidth;
        });
        expect(hasHorizontalOverflow).toBe(false);

        // At mobile viewport (≤767px), the two time inputs should be stacked vertically
        // (single column). At wider viewports they may be side-by-side. Either layout is valid;
        // just confirm both are reachable and no clipping occurs.
        const viewportWidth = page.viewportSize()?.width ?? 1440;

        if (viewportWidth <= 767) {
          // On mobile: verify inputs don't overflow their container
          const startBox = await editPage.workStartTimeInput.boundingBox();
          const endBox = await editPage.workEndTimeInput.boundingBox();

          if (startBox && endBox) {
            // Both inputs must fit within the viewport width
            expect(startBox.x + startBox.width).toBeLessThanOrEqual(viewportWidth + 1);
            expect(endBox.x + endBox.width).toBeLessThanOrEqual(viewportWidth + 1);
          }
        }
      } finally {
        if (entryId) await deleteDiaryEntryViaApi(page, entryId);
      }
    },
  );
});
