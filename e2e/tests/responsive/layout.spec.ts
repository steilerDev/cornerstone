/**
 * E2E tests for responsive layout behavior (Story #29)
 */

import { test, expect } from '../../fixtures/auth.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { ROUTES } from '../../fixtures/testData.js';

test.describe('Responsive Layout', { tag: '@responsive' }, () => {
  test('Desktop: sidebar always visible, no hamburger button', async ({ page }) => {
    const viewport = page.viewportSize();

    // Skip this test on mobile/tablet viewports
    if (!viewport || viewport.width < 1024) {
      test.skip();
      return;
    }

    const appShell = new AppShellPage(page);

    // Given: User is on dashboard (desktop viewport >= 1024px)
    await page.goto(ROUTES.home);

    // Then: Sidebar should be visible
    await expect(appShell.sidebar).toBeVisible();

    // And: Hamburger menu button should not be visible
    const menuButton = await appShell.getMenuButton();
    await expect(menuButton).not.toBeVisible();
  });

  test('Mobile/tablet: sidebar hidden, hamburger visible', async ({ page }) => {
    const viewport = page.viewportSize();

    // Skip this test on desktop viewports
    if (!viewport || viewport.width >= 1024) {
      test.skip();
      return;
    }

    const appShell = new AppShellPage(page);

    // Given: User is on dashboard (mobile/tablet viewport < 1024px)
    await page.goto(ROUTES.home);

    // Then: Sidebar should be initially hidden
    const isOpen = await appShell.isSidebarOpen();
    expect(isOpen).toBe(false);

    // And: Hamburger menu button should be visible
    const menuButton = await appShell.getMenuButton();
    await expect(menuButton).toBeVisible();
  });

  test('Hamburger opens/closes sidebar', async ({ page }) => {
    const viewport = page.viewportSize();

    // Skip this test on desktop viewports
    if (!viewport || viewport.width >= 1024) {
      test.skip();
      return;
    }

    const appShell = new AppShellPage(page);

    // Given: User is on dashboard (mobile/tablet viewport)
    await page.goto(ROUTES.home);

    // And: Sidebar is initially closed
    let isOpen = await appShell.isSidebarOpen();
    expect(isOpen).toBe(false);

    // When: User clicks hamburger button to open sidebar
    await appShell.openSidebar();

    // Then: Sidebar should be open
    isOpen = await appShell.isSidebarOpen();
    expect(isOpen).toBe(true);

    // When: User closes the sidebar
    await appShell.closeSidebar();

    // Then: Sidebar should be closed
    isOpen = await appShell.isSidebarOpen();
    expect(isOpen).toBe(false);
  });

  test('Overlay appears when sidebar open on mobile', async ({ page }) => {
    const viewport = page.viewportSize();

    // Skip this test on desktop viewports
    if (!viewport || viewport.width >= 1024) {
      test.skip();
      return;
    }

    const appShell = new AppShellPage(page);

    // Given: User is on dashboard (mobile/tablet viewport)
    await page.goto(ROUTES.home);

    // And: Sidebar is initially closed
    let isOpen = await appShell.isSidebarOpen();
    expect(isOpen).toBe(false);

    // And: Overlay is not visible
    let overlayVisible = await appShell.isOverlayVisible();
    expect(overlayVisible).toBe(false);

    // When: User opens the sidebar
    await appShell.openSidebar();

    // Then: Sidebar should be open
    isOpen = await appShell.isSidebarOpen();
    expect(isOpen).toBe(true);

    // And: Overlay should be visible
    overlayVisible = await appShell.isOverlayVisible();
    expect(overlayVisible).toBe(true);

    // When: User closes the sidebar
    await appShell.closeSidebar();

    // Then: Overlay should not be visible
    overlayVisible = await appShell.isOverlayVisible();
    expect(overlayVisible).toBe(false);
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
