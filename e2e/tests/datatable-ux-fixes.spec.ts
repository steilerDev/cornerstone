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

    // And: A "Clear Filters" button appears in the toolbar.
    // Use .first() — when no invoices match, DataTable renders "Clear Filters" in BOTH the
    // toolbar AND the empty state action; .first() always targets the toolbar button.
    const clearFiltersButton = page.getByRole('button', { name: /clear filters/i }).first();
    await expect(clearFiltersButton).toBeVisible();

    // When: I click "Clear Filters"
    await clearFiltersButton.click();

    // Then: The filter button reverts to inactive state
    await expect(dueDateFilterButton).not.toHaveClass(/tableHeaderFilterButtonActive/);

    // And: The "Clear Filters" toolbar button disappears
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

    // And: The clear-filters button (visible due to active search) is 36px tall.
    // Use .first() — DataTable renders "Clear Filters" in both toolbar and empty state
    // when no items match the active search query; .first() targets the toolbar button.
    const clearFiltersButton = page.getByRole('button', { name: /clear filters/i }).first();
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

    // Get the first two draggable items (the parent divs of the drag handle buttons)
    const firstItem = dragHandles.first().locator('xpath=..');
    const secondItem = dragHandles.nth(1).locator('xpath=..');

    // When: dispatch a synthetic dragstart on the first item, then dragover on the second.
    // page.mouse simulation does NOT fire HTML5 drag events (dragstart/dragover/drop).
    // Use page.evaluate() to dispatch DragEvents with a real DataTransfer object, because
    // browsers set dataTransfer to null when using Playwright's dispatchEvent() with a plain
    // object init — and the React handlers access e.dataTransfer without null checks.
    const firstHandle = await firstItem.elementHandle();
    const secondHandle = await secondItem.elementHandle();
    expect(firstHandle).not.toBeNull();
    expect(secondHandle).not.toBeNull();

    await page.evaluate(
      ({ source, target }) => {
        const dataTransfer = new DataTransfer();
        // Fire dragstart on the first item to activate dragging React state
        source.dispatchEvent(
          new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }),
        );
        // Fire dragover on the second item — the React onDragOver handler reads clientY
        // to determine 'above'/'below' and sets dragOverState with the target's index
        target.dispatchEvent(
          new DragEvent('dragover', {
            bubbles: true,
            cancelable: true,
            dataTransfer,
            // clientY at the center of the target triggers 'above' or 'below' logic
            clientY: target.getBoundingClientRect().top + 1,
          }),
        );
      },
      { source: firstHandle!, target: secondHandle! },
    );

    // Then: One of the column items has the drop-above or drop-below CSS class (insertion line)
    // These classes are applied via CSS ::before pseudo-elements using position:absolute.
    // Use expect().toBeVisible() to leverage Playwright's auto-retry mechanism — React's
    // state update from onDragOver runs asynchronously and we need to wait for re-render.
    const dropAboveItem = popover.locator('[class*="columnCheckboxItemDropAbove"]');
    const dropBelowItem = popover.locator('[class*="columnCheckboxItemDropBelow"]');
    // At least one insertion indicator must appear after the dragover event
    await expect(dropAboveItem.or(dropBelowItem).first()).toBeVisible();

    // Cleanup: fire dragend to reset drag state
    await firstItem.dispatchEvent('dragend', { bubbles: true, cancelable: true });
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Column drag uses "move" semantics (effectAllowed = "move")
// ---------------------------------------------------------------------------
test.describe('Column drag uses move semantics', () => {
  test.beforeEach(({ page }) => {
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('column items (except the first pinned column) have draggable="true" for move semantics', async ({
    page,
  }) => {
    // Given: Column settings popover is open
    await gotoInvoicesAndWait(page);

    const columnSettingsButton = page.getByRole('button', { name: /column settings/i });
    await columnSettingsButton.click();

    const popover = page.getByRole('dialog', { name: /visible columns/i });
    await expect(popover).toBeVisible();

    // When: We inspect the column items in the popover
    // The implementation sets draggable={index > 0} — only non-pinned columns are draggable.
    // The drag handles (buttons with aria-label "drag to reorder") only appear for index > 0.
    const dragHandles = popover.getByRole('button', { name: /drag to reorder/i });
    const handleCount = await dragHandles.count();
    if (handleCount < 1) {
      test.skip();
      return;
    }

    // Then: Each draggable item (parent div of drag handle) has draggable="true"
    // This is the DOM attribute that enables HTML5 drag-and-drop with "move" semantics.
    // The effectAllowed = 'move' is set in the onDragStart React handler but cannot be
    // verified via synthetic events (browsers restrict effectAllowed writes to trusted
    // user-initiated drag events only). The draggable attribute is the verifiable proxy.
    const firstDraggableItem = dragHandles.first().locator('xpath=..');
    await expect(firstDraggableItem).toHaveAttribute('draggable', 'true');

    // Verify the first column item (index 0, pinned) does NOT have draggable attribute
    // The implementation sets draggable={index > 0} so the first item has draggable="false"
    const allItems = popover.locator('[class*="columnCheckboxItem"]');
    const firstItemDraggable = await allItems.first().getAttribute('draggable');
    expect(firstItemDraggable).toBe('false');
  });
});
