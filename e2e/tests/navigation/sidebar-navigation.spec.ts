/**
 * E2E tests for sidebar navigation (Story #27)
 */

import { test, expect } from '../../fixtures/auth.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { ROUTES } from '../../fixtures/testData.js';

test.describe('Sidebar Navigation', { tag: '@responsive' }, () => {
  test('Navigate to each section via sidebar links', { tag: '@smoke' }, async ({ page }) => {
    const appShell = new AppShellPage(page);
    const viewport = page.viewportSize();
    const isMobile = viewport !== null && viewport.width < 1024;

    // Helper: open sidebar on mobile/tablet before each click
    const clickNav = async (name: string) => {
      if (isMobile) {
        await appShell.openSidebar();
      }
      await appShell.clickNavLink(name);
    };

    // Given: User is on the dashboard
    await page.goto(ROUTES.home);

    // When/Then: Navigate to each section and verify URL (use regex to allow query params)
    await clickNav('Work Items');
    await expect(page).toHaveURL(new RegExp(`${ROUTES.workItems}(\\?.*)?$`));

    await clickNav('Budget');
    await expect(page).toHaveURL(new RegExp(`${ROUTES.budget}(\\?.*)?$`));

    await clickNav('Timeline');
    await expect(page).toHaveURL(new RegExp(`${ROUTES.timeline}(\\?.*)?$`));

    await clickNav('Household Items');
    await expect(page).toHaveURL(new RegExp(`${ROUTES.householdItems}(\\?.*)?$`));

    await clickNav('Profile');
    await expect(page).toHaveURL(new RegExp(`${ROUTES.profile}(\\?.*)?$`));

    await clickNav('User Management');
    await expect(page).toHaveURL(new RegExp(`${ROUTES.userManagement}(\\?.*)?$`));

    await clickNav('Dashboard');
    await expect(page).toHaveURL(ROUTES.home);
  });

  test('Active link highlighting', async ({ page }) => {
    const appShell = new AppShellPage(page);

    // Given: User navigates to Work Items page
    await page.goto(ROUTES.workItems);

    // Then: Work Items link should be active.
    // Use expect().toHaveAttribute() directly — Playwright auto-retries within expect.timeout
    // (7s desktop / 15s WebKit). The toPass() pattern consumed the entire test timeout (15s)
    // as its retry window and caused the test to time out on slow CI runners.
    const workItemsLink = appShell.nav.getByRole('link', { name: 'Work Items' });
    await expect(workItemsLink).toHaveAttribute('aria-current', 'page');

    // When: User navigates to Household Items
    // NOTE: The Budget NavLink has the `end` prop (only active at exactly "/budget"),
    // so navigating to ROUTES.budget (/budget/overview) never activates the Budget link.
    // Use Household Items instead — its NavLink has no `end` prop and activates for all
    // /household-items/* routes.
    await page.goto(ROUTES.householdItems);

    // Then: Household Items link should be active
    const householdItemsLink = appShell.nav.getByRole('link', { name: 'Household Items' });
    await expect(householdItemsLink).toHaveAttribute('aria-current', 'page');

    // And: Work Items link should not be active (aria-current absent or not 'page')
    await expect(workItemsLink).not.toHaveAttribute('aria-current', 'page');
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
    const logoutButton = appShell.sidebar.getByRole('button', { name: 'Logout' });
    await expect(logoutButton).toBeVisible();
  });
});
