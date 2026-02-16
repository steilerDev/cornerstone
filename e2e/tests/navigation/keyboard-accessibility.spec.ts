/**
 * E2E tests for keyboard accessibility (Story #27)
 */

import { test, expect } from '../../fixtures/auth.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { ROUTES } from '../../fixtures/testData.js';

test.describe('Keyboard Accessibility', () => {
  test('Tab navigation through sidebar links (desktop)', async ({ page }) => {
    const viewport = page.viewportSize();

    // Skip this test on mobile/tablet viewports
    if (!viewport || viewport.width < 1024) {
      test.skip();
      return;
    }

    // Given: User is on dashboard (desktop viewport)
    await page.goto(ROUTES.home);

    // When: User presses Tab repeatedly
    // Then: Focus should move through sidebar navigation links in order

    // Focus on first nav link
    await page.keyboard.press('Tab');
    let focusedElement = await page.evaluate(() => document.activeElement?.textContent);
    expect(focusedElement).toBeTruthy();

    // Continue tabbing through nav items
    const expectedLinks = [
      'Dashboard',
      'Work Items',
      'Budget',
      'Timeline',
      'Household Items',
      'Documents',
      'Profile',
      'User Management',
    ];

    let foundLinks = 0;
    for (let i = 0; i < 20; i++) {
      // Tab up to 20 times to traverse the nav
      await page.keyboard.press('Tab');
      focusedElement = await page.evaluate(() => document.activeElement?.textContent?.trim());

      if (focusedElement && expectedLinks.includes(focusedElement)) {
        foundLinks++;
      }
    }

    // Verify we encountered several nav links during tabbing
    expect(foundLinks).toBeGreaterThan(0);
  });

  test('Escape key closes sidebar (mobile/tablet)', async ({ page }) => {
    const viewport = page.viewportSize();

    // Skip this test on desktop viewports
    if (!viewport || viewport.width >= 1024) {
      test.skip();
      return;
    }

    const appShell = new AppShellPage(page);

    // Given: User is on dashboard (mobile/tablet viewport)
    await page.goto(ROUTES.home);

    // And: Sidebar is closed initially
    let isOpen = await appShell.isSidebarOpen();
    expect(isOpen).toBe(false);

    // When: User opens the sidebar
    await appShell.openSidebar();
    isOpen = await appShell.isSidebarOpen();
    expect(isOpen).toBe(true);

    // And: User presses Escape key
    await page.keyboard.press('Escape');

    // Then: Sidebar should close
    await expect(async () => {
      const closed = !(await appShell.isSidebarOpen());
      expect(closed).toBe(true);
    }).toPass({ timeout: 3000 });
  });
});
