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
    const clickSidebarLink = async (name: string) => {
      if (isMobile) {
        await appShell.openSidebar();
      }
      // Use sidebar locator (not nav) since Settings is in the footer, outside <nav>
      await appShell.sidebar.getByRole('link', { name }).click();
    };

    // Given: User is on the project overview
    await page.goto(ROUTES.home);

    // When/Then: Navigate to each section and verify URL (use regex to allow query params)
    await clickSidebarLink('Project');
    await expect(page).toHaveURL(new RegExp(`/project(\\?.*)?$`));

    await clickSidebarLink('Budget');
    await expect(page).toHaveURL(new RegExp(`${ROUTES.budget}(\\?.*)?$`));

    await clickSidebarLink('Schedule');
    await expect(page).toHaveURL(new RegExp(`${ROUTES.timeline}(\\?.*)?$`));

    await clickSidebarLink('Settings');
    await expect(page).toHaveURL(new RegExp(`/settings(\\?.*)?$`));
  });

  test('Active link highlighting', async ({ page }) => {
    const appShell = new AppShellPage(page);

    // Given: User navigates to Project section (work items)
    await page.goto(ROUTES.workItems);

    // Then: Project link should be active.
    const projectLink = appShell.nav.getByRole('link', { name: 'Project' });
    await expect(projectLink).toHaveAttribute('aria-current', 'page');

    // When: User navigates to Schedule
    await page.goto(ROUTES.timeline);

    // Then: Schedule link should be active
    const scheduleLink = appShell.nav.getByRole('link', { name: 'Schedule' });
    await expect(scheduleLink).toHaveAttribute('aria-current', 'page');

    // And: Project link should not be active (aria-current absent or not 'page')
    await expect(projectLink).not.toHaveAttribute('aria-current', 'page');
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
    // Main nav: Project, Budget, Schedule — Footer nav: Settings
    const expectedLinks = ['Project', 'Budget', 'Schedule', 'Settings'];

    for (const linkName of expectedLinks) {
      const link = appShell.sidebar.getByRole('link', { name: linkName });
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
