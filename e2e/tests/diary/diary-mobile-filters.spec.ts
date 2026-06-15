/**
 * E2E tests for the DiaryFilterBar mobile filter panel (Bug #1688)
 *
 * Bug #1688: On mobile, the `.filterBar` lacked `position: relative` so the
 * absolutely-positioned `.filters` panel (top: 100%) anchored to an ancestor
 * instead of the filter bar wrapper, causing the panel to render off-screen.
 * The fix adds `position: relative; overflow: visible` to `.filterBar` on
 * mobile so the panel drops directly beneath the "Filters" toggle button.
 *
 * Scenarios covered:
 * 1. [mobile] Toggle reveals the filter panel within the viewport
 * 2. [mobile] Mode chips reachable after opening
 * 3. [mobile] Search input accepts input after panel opens
 * 4. [mobile] Second tap closes the panel
 * 5. [mobile] Toggle aria-expanded transitions false → true → false
 * 6. [desktop/tablet] Filter panel visible inline without toggle
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryPage, DIARY_ROUTE } from '../../pages/DiaryPage.js';

// Mobile breakpoint: the CSS applies `display: block` to .mobileToggle at max-width: 767px.
// iPhone 13 Playwright device viewport is 390px wide — well within this range.
// iPad Gen 7 Playwright device viewport is 810px wide — outside this range (desktop CSS applies).
const MOBILE_MAX_WIDTH = 767;

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Toggle reveals the filter panel within the viewport
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Mobile filter toggle reveals panel within viewport (Scenario 1)',
  {
    tag: '@responsive',
  },
  () => {
    test('Clicking the toggle shows the search input inside the viewport', async ({ page }) => {
      const viewportWidth = page.viewportSize()?.width ?? 1920;
      if (viewportWidth > MOBILE_MAX_WIDTH) test.skip();

      const diaryPage = new DiaryPage(page);
      await diaryPage.goto();

      // Before opening: toggle is visible, search input is hidden
      await expect(diaryPage.mobileFilterToggle).toBeVisible();
      await expect(diaryPage.searchInput).toBeHidden();

      // Open the panel
      await diaryPage.mobileFilterToggle.click();

      // Search input must become visible
      await expect(diaryPage.searchInput).toBeVisible();

      // The bounding box must be within the viewport — x >= 0 and y within viewport height
      const viewportHeight = page.viewportSize()?.height ?? 664;
      const box = await diaryPage.searchInput.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeLessThan(viewportHeight);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Mode chips reachable after opening
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Mode chips visible after mobile panel opens (Scenario 2)',
  {
    tag: '@responsive',
  },
  () => {
    test('mode-filter-all, mode-filter-manual, mode-filter-automatic all visible after toggle', async ({
      page,
    }) => {
      const viewportWidth = page.viewportSize()?.width ?? 1920;
      if (viewportWidth > MOBILE_MAX_WIDTH) test.skip();

      const diaryPage = new DiaryPage(page);
      await diaryPage.goto();

      await diaryPage.mobileFilterToggle.click();
      await expect(diaryPage.searchInput).toBeVisible();

      await expect(page.getByTestId('mode-filter-all')).toBeVisible();
      await expect(page.getByTestId('mode-filter-manual')).toBeVisible();
      await expect(page.getByTestId('mode-filter-automatic')).toBeVisible();
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Search input accepts input after panel opens
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Search input accepts typed text after mobile panel opens (Scenario 3)',
  {
    tag: '@responsive',
  },
  () => {
    test('Filling the search input reflects the typed value', async ({ page }) => {
      const viewportWidth = page.viewportSize()?.width ?? 1920;
      if (viewportWidth > MOBILE_MAX_WIDTH) test.skip();

      const diaryPage = new DiaryPage(page);
      await diaryPage.goto();

      await diaryPage.mobileFilterToggle.click();
      await expect(diaryPage.searchInput).toBeVisible();

      await diaryPage.searchInput.fill('test query');
      await expect(diaryPage.searchInput).toHaveValue('test query');
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Second tap closes the panel
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Second toggle tap closes the mobile filter panel (Scenario 4)',
  {
    tag: '@responsive',
  },
  () => {
    test('Search input becomes hidden after second tap on the toggle', async ({ page }) => {
      const viewportWidth = page.viewportSize()?.width ?? 1920;
      if (viewportWidth > MOBILE_MAX_WIDTH) test.skip();

      const diaryPage = new DiaryPage(page);
      await diaryPage.goto();

      // First tap: open
      await diaryPage.mobileFilterToggle.click();
      await expect(diaryPage.searchInput).toBeVisible();

      // Second tap: close
      await diaryPage.mobileFilterToggle.click();
      await expect(diaryPage.searchInput).toBeHidden();
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Toggle aria-expanded transitions correctly
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Toggle aria-expanded transitions false → true → false (Scenario 5)',
  {
    tag: '@responsive',
  },
  () => {
    test('aria-expanded on the toggle button reflects panel open/closed state', async ({
      page,
    }) => {
      const viewportWidth = page.viewportSize()?.width ?? 1920;
      if (viewportWidth > MOBILE_MAX_WIDTH) test.skip();

      const diaryPage = new DiaryPage(page);
      await diaryPage.goto();

      // Initially closed
      await expect(diaryPage.mobileFilterToggle).toHaveAttribute('aria-expanded', 'false');

      // First tap: open
      await diaryPage.mobileFilterToggle.click();
      await expect(diaryPage.mobileFilterToggle).toHaveAttribute('aria-expanded', 'true');

      // Second tap: close
      await diaryPage.mobileFilterToggle.click();
      await expect(diaryPage.mobileFilterToggle).toHaveAttribute('aria-expanded', 'false');
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Desktop/tablet — filter panel inline, toggle hidden
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Desktop/tablet — filter panel visible inline without toggle (Scenario 6)',
  {
    tag: '@responsive',
  },
  () => {
    test('Search input is visible without toggling and the mobile toggle is hidden', async ({
      page,
    }) => {
      // This scenario validates desktop/tablet inline layout — skip on mobile
      const viewportWidth = page.viewportSize()?.width ?? 1920;
      if (viewportWidth <= MOBILE_MAX_WIDTH) test.skip();

      await page.goto(DIARY_ROUTE);

      const diaryPage = new DiaryPage(page);
      await diaryPage.heading.waitFor({ state: 'visible' });

      // Search input is directly visible — no toggle needed
      await expect(diaryPage.searchInput).toBeVisible();

      // The mobile toggle button is not visible on desktop/tablet
      await expect(diaryPage.mobileFilterToggle).toBeHidden();
    });
  },
);
