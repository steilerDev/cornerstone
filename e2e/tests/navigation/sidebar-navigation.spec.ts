/**
 * E2E tests for sidebar navigation (Story #27)
 */

import { test, expect } from '../../fixtures/auth.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { ROUTES } from '../../fixtures/testData.js';

test.describe('Sidebar Navigation', () => {
  test('Navigate to each section via sidebar links', async ({ page }) => {
    const appShell = new AppShellPage(page);

    // Given: User is on the dashboard
    await page.goto(ROUTES.home);

    // When/Then: Navigate to each section and verify URL
    await appShell.clickNavLink('Work Items');
    await expect(page).toHaveURL(ROUTES.workItems);

    await appShell.clickNavLink('Budget');
    await expect(page).toHaveURL(ROUTES.budget);

    await appShell.clickNavLink('Timeline');
    await expect(page).toHaveURL(ROUTES.timeline);

    await appShell.clickNavLink('Household Items');
    await expect(page).toHaveURL(ROUTES.householdItems);

    await appShell.clickNavLink('Documents');
    await expect(page).toHaveURL(ROUTES.documents);

    await appShell.clickNavLink('Profile');
    await expect(page).toHaveURL(ROUTES.profile);

    await appShell.clickNavLink('User Management');
    await expect(page).toHaveURL(ROUTES.userManagement);

    await appShell.clickNavLink('Dashboard');
    await expect(page).toHaveURL(ROUTES.home);
  });

  test('Active link highlighting', async ({ page }) => {
    const appShell = new AppShellPage(page);

    // Given: User navigates to Work Items page
    await page.goto(ROUTES.workItems);

    // Then: Work Items link should be active
    await expect(async () => {
      const isActive = await appShell.isNavLinkActive('Work Items');
      expect(isActive).toBe(true);
    }).toPass({ timeout: 5000 });

    // When: User navigates to Budget
    await page.goto(ROUTES.budget);

    // Then: Budget link should be active
    await expect(async () => {
      const isActive = await appShell.isNavLinkActive('Budget');
      expect(isActive).toBe(true);
    }).toPass({ timeout: 5000 });

    // And: Work Items link should not be active
    await expect(async () => {
      const isActive = await appShell.isNavLinkActive('Work Items');
      expect(isActive).toBe(false);
    }).toPass({ timeout: 5000 });
  });

  test('All nav links rendered and visible', async ({ page }) => {
    const appShell = new AppShellPage(page);

    // Given: User is on any page
    await page.goto(ROUTES.home);

    // Open sidebar if on mobile/tablet viewport
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 1024) {
      await appShell.openSidebar();
    }

    // Then: All expected navigation links should be present
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

    for (const linkName of expectedLinks) {
      const link = appShell.nav.getByRole('link', { name: linkName });
      await expect(link).toBeVisible();
    }
  });

  test('Logout button is present', async ({ page }) => {
    const appShell = new AppShellPage(page);

    // Given: User is authenticated and on any page
    await page.goto(ROUTES.home);

    // Open sidebar if on mobile/tablet viewport
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 1024) {
      await appShell.openSidebar();
    }

    // Then: Logout button should be visible in the sidebar
    const logoutButton = appShell.nav.getByRole('button', { name: 'Logout' });
    await expect(logoutButton).toBeVisible();
  });
});
