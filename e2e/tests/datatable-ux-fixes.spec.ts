/**
 * E2E tests for DataTable UX bug fixes
 *
 * Covers the interactive UX improvements shipped in this PR:
 * - Date filter auto-chaining: selecting a "from" date auto-focuses the "to" input
 * - Date filter confirmed state: "from" input renders with confirmed visual style once set
 * - Invoice due-date filter: the dueDate column is filterable end-to-end
 * - Column settings SVG icon: gear emoji removed, replaced with inline SVG bars icon
 * - Toolbar height alignment: search input, clear-filters button, and column settings button
 *   all render at 36px height
 * - Column drag uses "move" semantics (effectAllowed = "move", no copy indicator)
 *
 * Desktop viewport only for column settings tests (the button is CSS-hidden on mobile).
 */

import { test, expect } from '../fixtures/auth.js';
import type { Page } from '@playwright/test';

const INVOICES_URL = '/budget/invoices';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the Invoices page and wait for the DataTable to finish loading.
 * "Loaded" is defined as the skeleton disappearing and the table header appearing.
 */
async function gotoInvoicesAndWait(page: Page) {
  await page.goto(INVOICES_URL);
  // Wait for the table header row — the table is always rendered (even when empty)
  await expect(page.getByRole('table')).toBeVisible();
}

// ---------------------------------------------------------------------------
// Scenario 1 — Date filter auto-chaining (calendar-based)
// ---------------------------------------------------------------------------
test.describe('Date filter auto-chaining', () => {
  // Desktop only: column settings and filter popovers require the full table layout
  test.beforeEach(({ page }) => {
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('opening the date filter shows "Select start date" phase label', async ({ page }) => {
    // Given: Invoices page is loaded with the DataTable visible
    await gotoInvoicesAndWait(page);

    // When: I open the filter popover on the "Due Date" column header
    const dueDateFilterButton = page.getByRole('button', {
      name: /filter by due date/i,
    });
    await dueDateFilterButton.waitFor({ state: 'visible', timeout: 15000 });
    await dueDateFilterButton.click();

    // Then: The date filter popover appears with the calendar in "Select start date" phase
    const filterPopover = page.getByRole('dialog', { name: /filter by due date/i });
    await expect(filterPopover).toBeVisible();

    // And: The phase label reads "Select start date"
    await expect(filterPopover).toContainText('Select start date');

    // And: A calendar grid is rendered (no native date inputs)
    const grid = filterPopover.locator('[role="grid"]');
    await expect(grid).toBeVisible();
  });

  test('selecting a start date auto-advances the phase label to "Select end date"', async ({
    page,
  }) => {
    // Given: The date filter popover is open on the Due Date column
    await gotoInvoicesAndWait(page);

    const dueDateFilterButton = page.getByRole('button', {
      name: /filter by due date/i,
    });
    await dueDateFilterButton.waitFor({ state: 'visible', timeout: 15000 });
    await dueDateFilterButton.click();

    const filterPopover = page.getByRole('dialog', { name: /filter by due date/i });
    await expect(filterPopover).toBeVisible();
    await expect(filterPopover).toContainText('Select start date');

    // When: I click any day button in the calendar grid
    const firstDayButton = filterPopover.locator('[role="gridcell"] button').first();
    await firstDayButton.click();

    // Then: The phase label automatically advances to "Select end date" (auto-chaining)
    await expect(filterPopover).toContainText('Select end date');

    // And: The clicked day button has aria-pressed="true" (confirmed selected state)
    await expect(firstDayButton).toHaveAttribute('aria-pressed', 'true');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Invoice due-date filter: apply and clear
// ---------------------------------------------------------------------------
test.describe('Invoice due-date filter — apply and clear', () => {
  test.beforeEach(({ page }) => {
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('can open, apply, and clear the dueDate date filter', async ({ page }) => {
    // Given: Invoices page is loaded
    await gotoInvoicesAndWait(page);

    // Then: The "Due Date" column header has a filter button
    const dueDateFilterButton = page.getByRole('button', {
      name: /filter by due date/i,
    });
    await dueDateFilterButton.waitFor({ state: 'visible', timeout: 15000 });

    // When: I click it, a date filter popover with a calendar grid appears
    await dueDateFilterButton.click();
    const filterPopover = page.getByRole('dialog', { name: /filter by due date/i });
    await expect(filterPopover).toBeVisible();

    // And: The popover shows the calendar in "Select start date" phase
    await expect(filterPopover).toContainText('Select start date');
    const grid = filterPopover.locator('[role="grid"]');
    await expect(grid).toBeVisible();

    // When: I click two day buttons to set a start and end date range
    const dayButtons = filterPopover.locator('[role="gridcell"] button');
    await dayButtons.nth(4).click(); // start date — 5th day button

    // Phase advances to "Select end date" automatically
    await expect(filterPopover).toContainText('Select end date');

    await dayButtons.nth(9).click(); // end date — 10th day button

    // Then: The filter button becomes active (visually highlighted)
    await expect(dueDateFilterButton).toHaveClass(/tableHeaderFilterButtonActive/);

    // And: A "Clear Filters" button appears in the toolbar
    const clearFiltersButton = page.getByRole('button', { name: /clear filters/i });
    await expect(clearFiltersButton).toBeVisible();

    // When: I click "Clear Filters"
    await clearFiltersButton.click();

    // Then: The filter button reverts to inactive state
    await expect(dueDateFilterButton).not.toHaveClass(/tableHeaderFilterButtonActive/);

    // And: The "Clear Filters" button disappears
    await expect(clearFiltersButton).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Column settings SVG icon: no emoji, yes SVG
// ---------------------------------------------------------------------------
test.describe('Column settings SVG icon', () => {
  test.beforeEach(({ page }) => {
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('column settings button contains an SVG element and no gear emoji', async ({ page }) => {
    // Given: Invoices page is loaded (any DataTable page works)
    await gotoInvoicesAndWait(page);

    // When: I locate the column settings trigger button
    const columnSettingsButton = page.getByRole('button', {
      name: /column settings/i,
    });
    await expect(columnSettingsButton).toBeVisible();

    // Then: The button contains an SVG element (the inline bars icon)
    const svgIcon = columnSettingsButton.locator('svg');
    await expect(svgIcon).toBeVisible();

    // And: The button text content does NOT contain the gear emoji
    const buttonText = await columnSettingsButton.textContent();
    expect(buttonText).not.toContain('⚙️');
    expect(buttonText).not.toContain('⚙'); // both the emoji and the plain gear character
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Toolbar height alignment: all toolbar controls are 36px tall
// ---------------------------------------------------------------------------
test.describe('Toolbar height alignment', () => {
  test.beforeEach(({ page }) => {
    // Column settings button is hidden on mobile, so test desktop only
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('search input, column settings button, and clear-filters button are all 36px tall', async ({
    page,
  }) => {
    // Given: Invoices page is loaded with an active filter (to show the clear-filters button)
    await page.goto(`${INVOICES_URL}?q=test`);
    await expect(page.getByRole('table')).toBeVisible();

    // Then: The search input is 36px tall
    const searchInput = page.getByRole('searchbox', { name: /search items/i });
    await expect(searchInput).toBeVisible();
    const searchBox = await searchInput.boundingBox();
    expect(searchBox).not.toBeNull();
    expect(searchBox!.height).toBe(36);

    // And: The column settings button is 36px tall
    const columnSettingsButton = page.getByRole('button', { name: /column settings/i });
    await expect(columnSettingsButton).toBeVisible();
    const settingsBox = await columnSettingsButton.boundingBox();
    expect(settingsBox).not.toBeNull();
    expect(settingsBox!.height).toBe(36);

    // And: The clear-filters button (visible due to active search) is 36px tall
    const clearFiltersButton = page.getByRole('button', { name: /clear filters/i });
    await expect(clearFiltersButton).toBeVisible();
    const clearBox = await clearFiltersButton.boundingBox();
    expect(clearBox).not.toBeNull();
    expect(clearBox!.height).toBe(36);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Column drag: insertion line visible during drag
// ---------------------------------------------------------------------------
test.describe('Column drag-and-drop insertion line', () => {
  test.beforeEach(({ page }) => {
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('dragging a column item over another shows an insertion line indicator', async ({
    page,
  }) => {
    // Given: Invoices page is loaded and column settings popover is open
    await gotoInvoicesAndWait(page);

    const columnSettingsButton = page.getByRole('button', { name: /column settings/i });
    await columnSettingsButton.click();

    const popover = page.getByRole('dialog', { name: /visible columns/i });
    await expect(popover).toBeVisible();

    // Get the draggable column items (index > 0 per implementation: first col is pinned)
    // The items have a drag handle button inside them
    const dragHandles = popover.getByRole('button', { name: /drag to reorder/i });
    const handleCount = await dragHandles.count();

    // Need at least 2 draggable items for a drag operation
    if (handleCount < 2) {
      test.skip();
      return;
    }

    // Get bounding boxes of the first two draggable items (the parent divs)
    // The parent div contains the drag handle button
    const firstItem = dragHandles.first().locator('xpath=..');
    const secondItem = dragHandles.nth(1).locator('xpath=..');

    const firstBox = await firstItem.boundingBox();
    const secondBox = await secondItem.boundingBox();
    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();

    // When: I perform a drag from the first item to the second item
    // Use mouse drag: mousedown on source, move to target, hover over target
    await page.mouse.move(firstBox!.x + firstBox!.width / 2, firstBox!.y + firstBox!.height / 2);
    await page.mouse.down();
    // Move partway toward the target
    await page.mouse.move(
      secondBox!.x + secondBox!.width / 2,
      secondBox!.y + secondBox!.height / 2,
      { steps: 5 },
    );

    // Then: One of the column items has the drop-above or drop-below CSS class (insertion line)
    // These classes are applied via CSS ::before pseudo-elements using position:absolute
    const dropAboveItem = popover.locator('[class*="columnCheckboxItemDropAbove"]');
    const dropBelowItem = popover.locator('[class*="columnCheckboxItemDropBelow"]');
    const hasInsertionIndicator =
      (await dropAboveItem.count()) > 0 || (await dropBelowItem.count()) > 0;
    expect(hasInsertionIndicator).toBe(true);

    // Cleanup: release mouse
    await page.mouse.up();
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Column drag uses "move" semantics (effectAllowed = "move")
// ---------------------------------------------------------------------------
test.describe('Column drag uses move semantics', () => {
  test.beforeEach(({ page }) => {
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('column item sets effectAllowed to "move" on drag start', async ({ page }) => {
    // Given: Column settings popover is open
    await gotoInvoicesAndWait(page);

    const columnSettingsButton = page.getByRole('button', { name: /column settings/i });
    await columnSettingsButton.click();

    const popover = page.getByRole('dialog', { name: /visible columns/i });
    await expect(popover).toBeVisible();

    // Get the first draggable item container (index > 0, has drag handle)
    const dragHandles = popover.getByRole('button', { name: /drag to reorder/i });
    const handleCount = await dragHandles.count();
    if (handleCount < 1) {
      test.skip();
      return;
    }

    // Register the dragstart listener in the page BEFORE triggering the drag.
    // page.evaluate() returns a Promise that resolves when the in-page Promise resolves,
    // so we start evaluating (registers listener) then trigger the drag, then await.
    const effectAllowedPromise = page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const handler = (e: Event) => {
            const dragEvent = e as DragEvent;
            // effectAllowed is set synchronously in the React onDragStart handler
            resolve(dragEvent.dataTransfer?.effectAllowed ?? 'none');
            document.removeEventListener('dragstart', handler, true);
          };
          document.addEventListener('dragstart', handler, true);
        }),
    );

    // Trigger the drag on the first draggable item
    const firstDraggableItem = dragHandles.first().locator('xpath=..');
    const box = await firstDraggableItem.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 10, box!.y + box!.height / 2 + 10);

    // Await the captured effectAllowed value from the page
    const effectAllowed = await effectAllowedPromise;
    expect(effectAllowed).toBe('move');

    await page.mouse.up();
  });
});
