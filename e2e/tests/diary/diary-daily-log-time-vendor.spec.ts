/**
 * E2E tests for the daily_log company + work start/end time + computed duration feature
 *
 * Story #1672: Daily log — vendor selector, work start/end time, computed duration
 * Story #2221: on the capture screen the vendor is the Company chip group (suggestions plus
 * "Other company…" which opens the company picker) and the times are Start/End chips
 * (Now · Other time).
 *
 * Scenarios covered:
 * 1. [smoke] Company selection happy path: create vendor + entry, open the edit URL, pick the
 *            company through "Other company…", Save changes, verify the vendor name appears in
 *            the detail page metadata summary.
 * 2. Time entry + duration: set start 08:00 and end 16:30 with Other time, verify the duration in
 *            the form, save, verify times and duration on the detail page.
 * 3. End ≤ start validation: start 16:00, end 08:00, attempt save, verify the inline error
 *            "End must be after start." and that the times are NOT persisted after reload.
 * 4. All fields then clear company: add company + times via UI, tap the pressed company chip
 *            to clear it, save, verify the vendor no longer appears in the summary.
 * 5. [smoke] Smoke: bare daily_log entry loads on the edit URL, company chips are present and
 *            none pressed, no duration display shown when both times absent.
 * 6. [responsive] Responsive: at current viewport, time chips are usable and no horizontal overflow.
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';
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

/** Tap "Other company…" and pick `name` in the company picker (sheet or modal). */
async function pickCompany(capture: DiaryCapturePage, name: string): Promise<void> {
  await capture.openCompanyPicker();
  await capture.companyPicker.pick(name);
  capture.taps += 1;
  await expect(capture.companyPicker.input).toHaveCount(0);
}

/** Set a time with its "Other time" chip and the native input. */
async function setTime(
  capture: DiaryCapturePage,
  which: 'start' | 'end',
  value: string,
): Promise<void> {
  if (which === 'start') {
    await capture.tap(capture.startOther);
    await capture.startInput.fill(value);
  } else {
    await capture.tap(capture.endChip('Other time'));
    await capture.endInput.fill(value);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Company selection happy path (@smoke)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Company selection happy path (Scenario 1)', () => {
  test(
    'User can pick a company on the daily_log edit URL; vendor name appears in summary',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const capture = new DiaryCapturePage(page);
      const detailPage = new DiaryEntryDetailPage(page);
      let entryId: string | null = null;
      let vendorId: string | null = null;
      const vendorName = `${testPrefix} VendorCorp`;

      try {
        vendorId = await createVendorViaApi(page, { name: vendorName });
        entryId = await createDailyLogEntry(page, testPrefix);

        await capture.gotoEdit(entryId);
        await expect(capture.heading).toContainText('Edit entry · ');

        // No company is chosen yet
        await expect(capture.otherCompanyChip).toBeVisible();
        await expect(capture.companyChip(vendorName)).toHaveCount(0);

        await pickCompany(capture, vendorName);

        // After picking: the company shows as a pressed chip
        await expect(capture.companyChip(vendorName)).toHaveAttribute('aria-pressed', 'true');

        // Save the entry — PATCH /api/diary-entries/:id
        await capture.saveChanges();

        // Navigate to detail page
        await page.waitForURL(new RegExp(`/diary/${entryId}$`));
        await detailPage.loaded.waitFor({ state: 'visible' });

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
  test('Setting start 08:00 and end 16:30 shows the duration in the form; times shown on detail page', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
    const detailPage = new DiaryEntryDetailPage(page);
    let entryId: string | null = null;

    try {
      entryId = await createDailyLogEntry(page, testPrefix);

      await capture.gotoEdit(entryId);
      await expect(capture.heading).toContainText('Edit entry · ');

      // Set work start and end time
      await setTime(capture, 'start', '08:00');
      await setTime(capture, 'end', '16:30');

      // Duration should appear: 16:30 - 08:00 = 510 minutes = 8.5 hours
      await expect(capture.duration).toBeVisible();
      await expect(capture.duration).toContainText('Duration:');
      await expect(capture.duration).toContainText('8.50 h');

      // Save the entry
      await capture.saveChanges();

      // Navigate to detail page
      await page.waitForURL(new RegExp(`/diary/${entryId}$`));
      await detailPage.loaded.waitFor({ state: 'visible' });

      // Verify start time, end time, and duration in the metadata summary
      await expect(detailPage.dailyLogMetadata).toBeVisible();
      const metadataText = await detailPage.dailyLogMetadata.textContent();
      // Site details shows locale-formatted clock times ("8:00 AM")
      expect(metadataText).toMatch(/8:00\s?AM/);
      expect(metadataText).toMatch(/4:30\s?PM/);
      expect(metadataText).toContain('8.50 h');
    } finally {
      if (entryId) await deleteDiaryEntryViaApi(page, entryId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: End ≤ start validation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('End-time ≤ start-time validation (Scenario 3)', () => {
  test('Setting end before start shows validation error and does not persist times', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
    let entryId: string | null = null;

    try {
      entryId = await createDailyLogEntry(page, testPrefix);

      await capture.gotoEdit(entryId);
      await expect(capture.heading).toContainText('Edit entry · ');

      // Set an end time ≤ start time
      await setTime(capture, 'start', '16:00');
      await setTime(capture, 'end', '08:00');

      // The error shows at once and no duration appears (end < start)
      await expect(page.getByText('End must be after start.')).toBeVisible();
      await expect(capture.duration).toHaveCount(0);

      // Attempt to save — the form must not leave the edit URL
      await capture.tap(capture.saveButton);
      await expect(page.getByText('End must be after start.')).toBeVisible();
      expect(page.url()).toContain('/edit');

      // Reload the page and confirm times were NOT persisted
      await capture.gotoEdit(entryId);
      await expect(capture.startOther).toHaveAttribute('aria-expanded', 'false');
      await expect(capture.endChip('Other time')).toHaveAttribute('aria-expanded', 'false');
      await expect(capture.startInput).toHaveValue('');
      await expect(capture.endInput).toHaveValue('');
    } finally {
      if (entryId) await deleteDiaryEntryViaApi(page, entryId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: All fields then clear the company (within the same edit session)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Clear company after selection (Scenario 4)', () => {
  test('Company chosen in UI can be cleared; after clear and save, vendor no longer appears in summary', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
    const detailPage = new DiaryEntryDetailPage(page);
    let entryId: string | null = null;
    let vendorId: string | null = null;
    const vendorName = `${testPrefix} ClearVendor`;

    try {
      vendorId = await createVendorViaApi(page, { name: vendorName });
      entryId = await createDailyLogEntry(page, testPrefix);

      await capture.gotoEdit(entryId);
      await expect(capture.heading).toContainText('Edit entry · ');

      // Choose the company via the picker
      await pickCompany(capture, vendorName);
      await expect(capture.companyChip(vendorName)).toHaveAttribute('aria-pressed', 'true');

      // Also set times to exercise the full set of fields
      await setTime(capture, 'start', '09:00');
      await setTime(capture, 'end', '17:00');

      // Clear the company by tapping its pressed chip
      await capture.tap(capture.companyChip(vendorName));
      await expect(capture.companyChip(vendorName)).toHaveCount(0);

      // Save the entry (vendor should be null, times should be saved)
      await capture.saveChanges();
      await page.waitForURL(new RegExp(`/diary/${entryId}$`));
      await detailPage.loaded.waitFor({ state: 'visible' });

      // Vendor name must NOT appear in summary (vendorId was cleared)
      await expect(detailPage.dailyLogMetadata).toBeVisible();
      const metadataText = await detailPage.dailyLogMetadata.textContent();
      expect(metadataText).not.toContain(vendorName);

      // Times are still present
      expect(metadataText).toMatch(/9:00\s?AM/);
      expect(metadataText).toMatch(/5:00\s?PM/);
    } finally {
      if (entryId) await deleteDiaryEntryViaApi(page, entryId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Smoke — bare daily_log entry loads, company chips present, no duration
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit page loads for bare daily_log (Scenario 5)', { tag: '@responsive' }, () => {
  test(
    'Bare daily_log entry: edit URL loads, company chips are present, no duration shown',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const capture = new DiaryCapturePage(page);
      let entryId: string | null = null;

      try {
        // Create a bare daily_log entry with no metadata (no times, no vendor)
        entryId = await createDailyLogEntry(page, testPrefix);

        await capture.gotoEdit(entryId);
        await expect(capture.heading).toContainText('Edit entry · ');

        // The company group offers "Other company…" and no chip is pressed
        await expect(capture.otherCompanyChip).toBeVisible();
        await expect(
          page.getByTestId('capture-company').locator('button[aria-pressed="true"]'),
        ).toHaveCount(0);

        // Start and End chips are present and unset
        await expect(capture.startNow).toBeVisible();
        await expect(capture.startOther).toBeVisible();
        await expect(capture.endNow).toBeVisible();
        await expect(capture.startOther).toHaveAttribute('aria-expanded', 'false');
        await expect(capture.endChip('Other time')).toHaveAttribute('aria-expanded', 'false');

        // Duration display must NOT be visible (both times absent)
        await expect(capture.duration).toHaveCount(0);
      } finally {
        if (entryId) await deleteDiaryEntryViaApi(page, entryId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Responsive — time chips usable, no horizontal overflow
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 6)', { tag: '@responsive' }, () => {
  test('Time inputs are usable and there is no horizontal overflow on the edit page', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
    let entryId: string | null = null;

    try {
      entryId = await createDailyLogEntry(page, testPrefix);

      await capture.gotoEdit(entryId);
      await expect(capture.heading).toContainText('Edit entry · ');

      // Both time inputs open from their "Other time" chip and are enabled
      await setTime(capture, 'start', '08:00');
      await setTime(capture, 'end', '12:00');
      await expect(capture.startInput).toBeVisible();
      await expect(capture.endInput).toBeVisible();
      await expect(capture.startInput).toBeEnabled();
      await expect(capture.endInput).toBeEnabled();

      // No horizontal overflow: scrollWidth should equal clientWidth on <body>
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > document.body.clientWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);

      // At mobile viewport (≤767px) the inputs must fit within the viewport width
      const viewportWidth = page.viewportSize()?.width ?? 1440;

      if (viewportWidth <= 767) {
        const startBox = await capture.startInput.boundingBox();
        const endBox = await capture.endInput.boundingBox();

        if (startBox && endBox) {
          expect(startBox.x + startBox.width).toBeLessThanOrEqual(viewportWidth + 1);
          expect(endBox.x + endBox.width).toBeLessThanOrEqual(viewportWidth + 1);
        }
      }
    } finally {
      if (entryId) await deleteDiaryEntryViaApi(page, entryId);
    }
  });
});
