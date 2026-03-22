/**
 * E2E tests for the DateRangePicker calendar component in the DataTable date filter.
 *
 * The DateRangePicker replaced native `<input type="date">` elements with an interactive
 * calendar grid supporting two-phase range selection (start → end), month navigation,
 * keyboard accessibility, and responsive touch targets.
 *
 * All tests use the Invoices page (Due Date column) as the host DataTable with a date
 * filter.  The same DateRangePicker is shared by any DataTable date column, so these
 * scenarios are representative of the full feature.
 *
 * Desktop/tablet/mobile matrix notes:
 *  - Filter popovers are only reachable when the table renders column headers — tests that
 *    rely on the filter button skip on mobile (< 768 px) where the layout collapses.
 *  - Mobile-only test (Scenario 6) explicitly skips on wider viewports.
 *  - Keyboard test (Scenario 5) is desktop-only: virtual keyboard on tablet/mobile
 *    interactions would require native touch-keyboard handling beyond Playwright's scope.
 */

import { test, expect } from '../fixtures/auth.js';
import type { Page } from '@playwright/test';

const INVOICES_URL = '/budget/invoices';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the Invoices page and wait for the DataTable to finish loading.
 * "Loaded" means the table element is visible (it renders unconditionally, even
 * when the invoice list is empty).
 */
async function gotoInvoicesAndWait(page: Page) {
  await page.goto(INVOICES_URL);
  await expect(page.getByRole('table')).toBeVisible();
  // Wait for all network requests to settle so React doesn't re-render
  // the DataTable (and detach popover DOM nodes) during interaction
  await page.waitForLoadState('networkidle');
}

/**
 * Open the Due Date column filter popover.
 * Returns the popover dialog locator after confirming it is visible.
 */
async function openDueDateFilter(page: Page) {
  const dueDateFilterButton = page.getByRole('button', {
    name: /filter by due date/i,
  });
  await dueDateFilterButton.waitFor({ state: 'visible', timeout: 15000 });
  await dueDateFilterButton.click();

  const filterPopover = page.getByRole('dialog', { name: /filter by due date/i });
  await expect(filterPopover).toBeVisible();
  return filterPopover;
}

/**
 * Click two day buttons to select a start and end date range.
 *
 * Uses simple nth-child indexing on all day buttons in the grid.
 * After clicking start (5th button), the component transitions to
 * "selecting-end" phase. We then click a later button (15th) as the end date.
 * The two-step interaction is sequential to avoid locator re-evaluation issues
 * with disabled-state changes between clicks.
 */
async function selectStartAndEndDays(filterPopover: ReturnType<Page['getByRole']>) {
  // Ensure the calendar grid is fully rendered before interacting
  const grid = filterPopover.locator('[role="grid"]');
  await grid.waitFor({ state: 'visible' });

  // Click the 5th day button as start date
  const startButton = filterPopover.locator('[role="gridcell"] button').nth(4);
  await startButton.waitFor({ state: 'visible' });
  await startButton.click();

  // Wait for phase to advance to "Select end date"
  await expect(filterPopover.getByText('Select end date')).toBeVisible({ timeout: 10000 });

  // Click the 15th day button as end date (well after start, avoids disabled buttons)
  const endButton = filterPopover.locator('[role="gridcell"] button').nth(14);
  await endButton.waitFor({ state: 'visible', timeout: 10000 });
  await endButton.click();
}

// ---------------------------------------------------------------------------
// Scenario 1 — Full range selection (happy path)
// ---------------------------------------------------------------------------
test.describe('DateRangePicker — full range selection (happy path)', () => {
  test.beforeEach(({ page }) => {
    // Filter popovers require the full table layout; skip on mobile
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('calendar grid is visible and no native date inputs exist in the popover', async ({
    page,
  }) => {
    // Given: Invoices page is loaded
    await gotoInvoicesAndWait(page);

    // When: I open the Due Date filter popover
    const filterPopover = await openDueDateFilter(page);

    // Then: A calendar grid is rendered
    const grid = filterPopover.locator('[role="grid"]');
    await expect(grid).toBeVisible();

    // And: There are NO native <input type="date"> elements in the popover
    const nativeDateInputs = filterPopover.locator('input[type="date"]');
    await expect(nativeDateInputs).toHaveCount(0);
  });

  test('phase label shows "Select start date" before any selection', async ({ page }) => {
    // Given: Invoices page loaded, filter popover open
    await gotoInvoicesAndWait(page);
    const filterPopover = await openDueDateFilter(page);

    // Then: The phase label says "Select start date"
    await expect(filterPopover).toContainText('Select start date');
  });

  test('clicking a start day advances the phase label to "Select end date"', async ({ page }) => {
    // Given: Filter popover is open, showing "Select start date"
    await gotoInvoicesAndWait(page);
    const filterPopover = await openDueDateFilter(page);
    await expect(filterPopover).toContainText('Select start date');

    // When: I click a day button
    const firstEnabledDay = filterPopover.locator('[role="gridcell"] button').first();
    await firstEnabledDay.click();

    // Then: The phase label advances to "Select end date"
    await expect(filterPopover).toContainText('Select end date');
  });

  test('selecting start then end date applies the filter and shows Clear Filters', async ({
    page,
  }) => {
    // Given: Invoices page loaded, filter popover open
    await gotoInvoicesAndWait(page);
    const filterPopover = await openDueDateFilter(page);

    const dueDateFilterButton = page.getByRole('button', {
      name: /filter by due date/i,
    });

    // When: I select a start and end date
    await selectStartAndEndDays(filterPopover);

    // Then: The filter button has the active CSS class (filter is applied)
    await expect(dueDateFilterButton).toHaveClass(/tableHeaderFilterButtonActive/);

    // And: "Clear Filters" button is visible in the toolbar
    const clearFiltersButton = page.getByRole('button', { name: /clear filters/i });
    await expect(clearFiltersButton).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Clear Filters resets the picker
// ---------------------------------------------------------------------------
test.describe('DateRangePicker — Clear Filters resets picker state', () => {
  test.beforeEach(({ page }) => {
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('after clearing filters, reopening the popover shows "Select start date"', async ({
    page,
  }) => {
    // Given: A date range filter has been applied
    await gotoInvoicesAndWait(page);
    const filterPopover = await openDueDateFilter(page);
    await selectStartAndEndDays(filterPopover);

    const clearFiltersButton = page.getByRole('button', { name: /clear filters/i });
    await expect(clearFiltersButton).toBeVisible();

    // When: I click "Clear Filters"
    await clearFiltersButton.click();

    // Then: The clear button disappears
    await expect(clearFiltersButton).not.toBeVisible();

    // When: I reopen the Due Date filter popover
    const reopenedPopover = await openDueDateFilter(page);

    // Then: A calendar grid is shown and the phase label is back to "Select start date"
    await expect(reopenedPopover.locator('[role="grid"]')).toBeVisible();
    await expect(reopenedPopover).toContainText('Select start date');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Month navigation
// ---------------------------------------------------------------------------
test.describe('DateRangePicker — month navigation', () => {
  test.beforeEach(({ page }) => {
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('previous month button navigates backwards, next month button navigates forwards', async ({
    page,
  }) => {
    // Given: Filter popover is open
    await gotoInvoicesAndWait(page);
    const filterPopover = await openDueDateFilter(page);

    // Capture the initial month label text
    const monthLabel = filterPopover.locator('[class*="monthLabel"]');
    await expect(monthLabel).toBeVisible();
    const originalMonthText = await monthLabel.textContent();
    expect(originalMonthText).toBeTruthy();

    // When: I click the previous month button
    const prevButton = filterPopover.getByRole('button', { name: /previous month/i });
    await prevButton.click();

    // Then: The month label has changed (we are now on a different month)
    const afterPrevText = await monthLabel.textContent();
    expect(afterPrevText).not.toBe(originalMonthText);

    // When: I click next month twice
    const nextButton = filterPopover.getByRole('button', { name: /next month/i });
    await nextButton.click();
    await nextButton.click();

    // Then: The month label shows something different from the post-previous state
    // (two forwards from one-back = one month ahead of original)
    const afterTwoNextText = await monthLabel.textContent();
    expect(afterTwoNextText).not.toBe(afterPrevText);
    expect(afterTwoNextText).not.toBe(originalMonthText);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Clicking before start date resets to new start
// ---------------------------------------------------------------------------
test.describe('DateRangePicker — clicking before start resets to new start', () => {
  test.beforeEach(({ page }) => {
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('clicking a day before the selected start sets it as the new start date', async ({
    page,
  }) => {
    // Given: Filter popover is open and I have selected a start date in the middle of the month
    await gotoInvoicesAndWait(page);
    const filterPopover = await openDueDateFilter(page);

    // Select the 10th available day button as the start date
    const dayButtons = filterPopover.locator('[role="gridcell"] button');
    const startButton = dayButtons.nth(9); // 10th button (0-indexed)
    await startButton.click();

    // Confirm phase advanced to "Select end date"
    await expect(filterPopover).toContainText('Select end date');

    // Capture the start button's aria-label before we reset it
    const originalStartAriaLabel = await startButton.getAttribute('aria-label');

    // When: I click the 2nd available day button — which is BEFORE the selected start
    const earlierButton = dayButtons.nth(1); // 2nd button — earlier date
    const earlierAriaLabel = await earlierButton.getAttribute('aria-label');
    await earlierButton.click();

    // Then: The earlier day is now selected (aria-pressed = true)
    await expect(earlierButton).toHaveAttribute('aria-pressed', 'true');

    // And: The original start button is no longer selected
    await expect(startButton).not.toHaveAttribute('aria-pressed', 'true');

    // And: The phase label still shows "Select end date" (we're waiting for the end)
    await expect(filterPopover).toContainText('Select end date');

    // Sanity-check the aria-labels are actually different dates
    expect(earlierAriaLabel).not.toBe(originalStartAriaLabel);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Keyboard navigation and selection (desktop only)
// ---------------------------------------------------------------------------
test.describe('DateRangePicker — keyboard navigation (desktop only)', () => {
  test.beforeEach(({ page }) => {
    // Keyboard tests only make sense on desktop — tablet/mobile rely on touch
    if ((page.viewportSize()?.width ?? 1280) < 1200) test.skip();
  });

  test('ArrowRight moves focus and Enter selects start and end dates via keyboard', async ({
    page,
  }) => {
    // Given: Filter popover is open
    await gotoInvoicesAndWait(page);
    const filterPopover = await openDueDateFilter(page);

    const grid = filterPopover.locator('[role="grid"]');
    await expect(grid).toBeVisible();

    // When: I Tab into the calendar grid (focus lands on the first focusable day button)
    // The component sets tabIndex=0 on the focusedDate button and -1 on others
    const focusedDayButton = filterPopover.locator('[role="gridcell"] button[tabindex="0"]');
    await focusedDayButton.focus();
    await expect(focusedDayButton).toBeFocused();

    // Capture the initial focused date
    const initialFocusLabel = await focusedDayButton.getAttribute('aria-label');

    // When: I press ArrowRight to move to the next day
    await page.keyboard.press('ArrowRight');

    // Then: A different button now has tabindex=0 (the focused day advanced)
    const newFocusedButton = filterPopover.locator('[role="gridcell"] button[tabindex="0"]');
    const newFocusLabel = await newFocusedButton.getAttribute('aria-label');
    expect(newFocusLabel).not.toBe(initialFocusLabel);

    // When: I press Enter to select this day as the start date
    await page.keyboard.press('Enter');

    // Then: The phase label shows "Select end date"
    await expect(filterPopover).toContainText('Select end date');

    // And: That day button has aria-pressed="true"
    await expect(newFocusedButton).toHaveAttribute('aria-pressed', 'true');

    // When: I press ArrowRight 3 more times and then Enter to select the end date
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');

    // Then: The filter is now active (the filter button has the active class)
    const dueDateFilterButton = page.getByRole('button', {
      name: /filter by due date/i,
    });
    await expect(dueDateFilterButton).toHaveClass(/tableHeaderFilterButtonActive/);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Mobile touch interaction (mobile viewport only)
// ---------------------------------------------------------------------------
test.describe('DateRangePicker — mobile touch interaction (mobile only)', () => {
  test.beforeEach(({ page }) => {
    // Only run on mobile viewport — skip on tablet and desktop
    const width = page.viewportSize()?.width ?? 1280;
    if (width >= 768) test.skip();
  });

  test('calendar is visible on mobile and tapping start then end applies the filter', async ({
    page,
  }) => {
    // Given: We are on mobile and have navigated to the Invoices page
    await gotoInvoicesAndWait(page);

    // On mobile the table header filter buttons may be hidden; the DataTable
    // collapses to a card layout. Verify the filter button exists in the DOM
    // (even if not visible as a column header), and skip gracefully if the
    // mobile layout does not expose date filter at all.
    const dueDateFilterButton = page.getByRole('button', {
      name: /filter by due date/i,
    });
    const filterButtonVisible = await dueDateFilterButton.isVisible();
    if (!filterButtonVisible) {
      // Mobile layout does not expose the column filter button — skip
      test.skip();
      return;
    }

    // When: I open the date filter
    await dueDateFilterButton.click();
    const filterPopover = page.getByRole('dialog', { name: /filter by due date/i });
    await expect(filterPopover).toBeVisible();

    // Then: The calendar grid renders with appropriately sized touch targets
    const grid = filterPopover.locator('[role="grid"]');
    await expect(grid).toBeVisible();

    // Verify touch target size: day buttons should be at least 40px on mobile
    // (CSS applies 40px min-height/min-width at max-width: 767px)
    const firstDayButton = filterPopover.locator('[role="gridcell"] button').first();
    await expect(firstDayButton).toBeVisible();
    const buttonBox = await firstDayButton.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.height).toBeGreaterThanOrEqual(40);
    expect(buttonBox!.width).toBeGreaterThanOrEqual(40);

    // When: I tap a start date, then an end date
    const dayButtons = filterPopover.locator('[role="gridcell"] button');
    await dayButtons.nth(2).tap();

    // Phase label advances to "Select end date"
    await expect(filterPopover).toContainText('Select end date');

    await dayButtons.nth(7).tap();

    // Then: The filter becomes active
    await expect(dueDateFilterButton).toHaveClass(/tableHeaderFilterButtonActive/);
  });
});
