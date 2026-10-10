/**
 * E2E tests for keyboard accessibility (Story #27)
 */

import { test, expect } from '../../fixtures/auth.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { ROUTES } from '../../fixtures/testData.js';

test.describe('Keyboard Accessibility', { tag: '@responsive' }, () => {
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
    // (#2205: the primary entries of the sidebar built from NavConfig)
    const expectedLinks = [
      'Home',
      'Tasks',
      'Purchases',
      'Site diary',
      'Photos',
      'Money',
      'Companies',
    ];

    const foundLinks = new Set<string>();
    for (let i = 0; i < 20; i++) {
      // Tab up to 20 times to traverse the nav
      await page.keyboard.press('Tab');
      focusedElement = await page.evaluate(() => document.activeElement?.textContent?.trim());

      if (focusedElement && expectedLinks.includes(focusedElement)) {
        foundLinks.add(focusedElement);
      }
    }

    // Verify every primary entry was reached by keyboard
    expect([...foundLinks].sort()).toEqual([...expectedLinks].sort());
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
