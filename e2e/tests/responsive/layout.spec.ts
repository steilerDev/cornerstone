/**
 * E2E tests for responsive layout behavior (Story #29, shell rewritten in #2207)
 *
 * - >= 1024px: sidebar, no bottom bar, no More sheet.
 * - < 1024px (phones and tablets): no sidebar, no floating menu button; a bottom bar with a
 *   More button that opens a sheet over a backdrop.
 *
 * The phone and tablet shell itself (slots, sheet content, title menu) is covered in
 * navigation/phone-tablet-shell.spec.ts.
 */

import { test, expect } from '../../fixtures/auth.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { ROUTES } from '../../fixtures/testData.js';

test.describe('Responsive Layout', { tag: '@responsive' }, () => {
  test('Desktop: sidebar always visible, no bottom bar', async ({ page }) => {
    const viewport = page.viewportSize();

    // Skip this test on mobile/tablet viewports
    if (!viewport || viewport.width < 1024) {
      test.skip();
      return;
    }

    const appShell = new AppShellPage(page);

    // Given: User is on dashboard (desktop viewport >= 1024px)
    await page.goto(ROUTES.home);

    // Then: the sidebar is visible
    await expect(appShell.sidebar).toBeVisible();

    // And: neither the bottom bar nor the More sheet exist
    await expect(appShell.bottomBar).toHaveCount(0);
    await expect(appShell.moreSheet).toHaveCount(0);
    await expect(page.getByTestId('menu-fab')).toHaveCount(0);
  });

  test('Mobile/tablet: no sidebar, bottom bar visible, no floating menu button', async ({
    page,
  }) => {
    const viewport = page.viewportSize();

    // Skip this test on desktop viewports
    if (!viewport || viewport.width >= 1024) {
      test.skip();
      return;
    }

    const appShell = new AppShellPage(page);

    // Given: User is on dashboard (mobile/tablet viewport < 1024px)
    await page.goto(ROUTES.home);

    // Then: no sidebar is rendered, and the bottom bar is the main navigation
    await expect(appShell.bottomBar).toBeVisible();
    await expect(page.locator('aside')).toHaveCount(0);
    await expect(appShell.nav).toHaveCount(1);

    // And: the old floating menu button and overlay are gone
    await expect(page.getByTestId('menu-fab')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-overlay')).toHaveCount(0);

    // And: the More sheet is closed
    expect(await appShell.isSidebarOpen()).toBe(false);
  });

  test('More opens and closes the sheet', async ({ page }) => {
    const viewport = page.viewportSize();

    // Skip this test on desktop viewports
    if (!viewport || viewport.width >= 1024) {
      test.skip();
      return;
    }

    const appShell = new AppShellPage(page);

    // Given: User is on dashboard (mobile/tablet viewport) and the sheet is closed
    await page.goto(ROUTES.home);
    await expect(appShell.bottomBar).toBeVisible();
    await expect(appShell.moreSheet).toHaveAttribute('data-open', 'false');

    // When: User taps More
    await appShell.openMoreSheet();

    // Then: the sheet is open and is a dialog while open
    expect(await appShell.isSidebarOpen()).toBe(true);
    await expect(appShell.moreSheet).toHaveAttribute('role', 'dialog');

    // When: User closes the sheet
    await appShell.closeMoreSheet();

    // Then: the sheet is closed again and loses its dialog role
    expect(await appShell.isSidebarOpen()).toBe(false);
    await expect(appShell.moreSheet).not.toHaveAttribute('role', 'dialog');
  });

  test('Backdrop appears while the More sheet is open', async ({ page }) => {
    const viewport = page.viewportSize();

    // Skip this test on desktop viewports
    if (!viewport || viewport.width >= 1024) {
      test.skip();
      return;
    }

    const appShell = new AppShellPage(page);

    // Given: User is on dashboard (mobile/tablet viewport) and the backdrop is not visible
    await page.goto(ROUTES.home);
    await expect(appShell.bottomBar).toBeVisible();
    await expect(appShell.moreSheetBackdrop).toBeHidden();

    // When: User opens the sheet
    await appShell.openMoreSheet();

    // Then: the backdrop is visible
    await expect(appShell.moreSheetBackdrop).toBeVisible();

    // When: User closes the sheet
    await appShell.closeMoreSheet();

    // Then: the backdrop is hidden again
    await expect(appShell.moreSheetBackdrop).toBeHidden();
  });

  test('No horizontal scroll on any viewport', async ({ page }) => {
    // Given: User is on dashboard
    await page.goto(ROUTES.home);

    // Then: Document should not have horizontal scrollbar
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);

    // Verify on other pages as well
    await page.goto(ROUTES.workItems);
    const hasScrollWorkItems = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasScrollWorkItems).toBe(false);

    await page.goto(ROUTES.profile);
    const hasScrollProfile = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasScrollProfile).toBe(false);
  });
});
