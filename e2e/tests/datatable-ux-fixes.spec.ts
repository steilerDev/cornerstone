/**
 * E2E tests for DataTable UX bug fixes
 *
 * Since #2246 the Users settings page (admin) is the only page that hosts a DataTable (the lists
 * are on the object-list template), so these scenarios run there.
 *
 * Covers the interactive UX improvements:
 * - Column settings SVG icon: gear emoji removed, replaced with inline SVG bars icon
 * - Toolbar height alignment: search input, clear-filters button, and column settings button
 *   all render at 36px height
 * - Column drag uses "move" semantics (effectAllowed = "move", no copy indicator)
 *
 * Removed with #2246 (no page hosts a DataTable date filter any more; the DateRangePicker Jest
 * tests cover the component): the date filter auto-chaining and Target Delivery apply/clear
 * scenarios.
 *
 * Desktop viewport only for column settings tests (the button is CSS-hidden on mobile).
 */

/**
 * Playwright 1.60.0 API availability notes (Issue #1572):
 *
 * ADOPTED in this file:
 * - page.evaluateHandle(() => new DataTransfer()) — used in Scenario 3 (replaces
 *   page.evaluate + elementHandle(); page.createDataTransfer() does not exist in
 *   Playwright 1.60.0 — the correct cross-browser pattern is evaluateHandle)
 * - test.abort()               — used in Scenarios 3 and 4 (broken-precondition guards)
 *
 * NOT ADOPTED (no callsite in current suite):
 * - toHaveCSS({ pseudo: '::before' })  — no ::before/::after CSS assertions exist
 * - locator.drop()                      — DataTable uses HTML5 DragEvent API, not pointer events
 * - getByRole({ description: '...' })   — no same-role disambiguation needed currently
 * - tracing.startHar()                  — adopted in budget-source-move.spec.ts and
 *                                         photoAnnotation.spec.ts (flake HAR capture)
 */

import { test, expect } from '../fixtures/auth.js';
import { routeUrl } from '../../shared/src/routes/index.js';
import type { Page } from '@playwright/test';

const LIST_URL = routeUrl('settingsUsers');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the Users page and wait for the DataTable to finish loading.
 * "Loaded" is defined as the skeleton disappearing and the table header appearing.
 */
async function gotoListAndWait(page: Page) {
  await page.goto(LIST_URL);
  // Wait for the table header row — the table is always rendered (even when empty)
  await expect(page.getByRole('table')).toBeVisible();
  // Wait for all network requests to settle so React doesn't re-render the DataTable
  // (and detach popover DOM nodes) during interaction
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Scenario 1 — Column settings SVG icon: no emoji, yes SVG
// ---------------------------------------------------------------------------
test.describe('Column settings SVG icon', () => {
  test.beforeEach(({ page }) => {
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('column settings button contains an SVG element and no gear emoji', async ({ page }) => {
    // Given: Users page is loaded (any DataTable page works)
    await gotoListAndWait(page);

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
// Scenario 2 — Toolbar height alignment: all toolbar controls are 36px tall
// ---------------------------------------------------------------------------
test.describe('Toolbar height alignment', () => {
  test.beforeEach(({ page }) => {
    // Column settings button is hidden on mobile, so test desktop only
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('search input, column settings button, and clear-filters button are all 36px tall', async ({
    page,
  }) => {
    // Given: Users page is loaded with an active search (to show the clear-filters button)
    await gotoListAndWait(page);
    const searchInput = page.getByRole('searchbox', { name: /search items/i });
    await searchInput.fill('zzz-no-such-user');

    // Then: The search input is 36px tall
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
// Scenario 3 — Column drag: insertion line visible during drag
// ---------------------------------------------------------------------------
test.describe('Column drag-and-drop insertion line', () => {
  test.beforeEach(({ page }) => {
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('dragging a column item over another shows an insertion line indicator', async ({
    page,
  }) => {
    // Given: Users page is loaded and column settings popover is open
    await gotoListAndWait(page);

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
      test.abort(
        `Precondition failed: expected ≥2 draggable column handles but found ${handleCount}. ` +
          `Check that the DataTable renders column drag handles before this test runs.`,
      );
      return;
    }

    // Get the first two draggable items (the parent divs of the drag handle buttons)
    const firstItem = dragHandles.first().locator('xpath=..');
    const secondItem = dragHandles.nth(1).locator('xpath=..');

    // When: dispatch a synthetic dragstart on the first item, then dragover on the second.
    // page.mouse simulation does NOT fire HTML5 drag events (dragstart/dragover/drop).
    // page.evaluateHandle(() => new DataTransfer()) (Playwright 1.60.0 pattern) creates a
    // real browser-side DataTransfer JSHandle that can be passed directly to
    // dispatchEvent() — no page.evaluate() indirection needed. Previously, browsers set
    // dataTransfer to null when Playwright's dispatchEvent() received a plain JS init
    // object. Note: page.createDataTransfer() does not exist in Playwright 1.60.0; the
    // correct cross-browser pattern is page.evaluateHandle(() => new DataTransfer()).
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

    await firstItem.dispatchEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });

    // Fire dragover on the second item — React's onDragOver handler reads clientY
    // to determine 'above'/'below' and sets dragOverState with the target's index.
    // Use locator.boundingBox() to compute clientY without needing evaluate().
    const bbox = await secondItem.boundingBox();
    const clientY = bbox ? bbox.y + bbox.height / 2 : 0;

    await secondItem.dispatchEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
      clientY,
    });

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
// Scenario 4 — Column drag uses "move" semantics (effectAllowed = "move")
// ---------------------------------------------------------------------------
test.describe('Column drag uses move semantics', () => {
  test.beforeEach(({ page }) => {
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('column items (except the first pinned column) have draggable="true" for move semantics', async ({
    page,
  }) => {
    // Given: Column settings popover is open
    await gotoListAndWait(page);

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
      test.abort(
        `Precondition failed: expected ≥1 draggable column handle but found ${handleCount}. ` +
          `Check that the DataTable renders column drag handles before this test runs.`,
      );
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
