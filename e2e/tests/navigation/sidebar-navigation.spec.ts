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
      // Settings is a button (not a link), other nav items are links
      // Use exact: true to avoid matching the logo link (aria-label contains "project")
      if (name === 'Settings') {
        await appShell.sidebar.getByRole('button', { name, exact: true }).click();
      } else {
        await appShell.sidebar.getByRole('link', { name, exact: true }).click();
      }
    };

    // Given: User is on the project overview
    await page.goto(ROUTES.home);

    // When/Then: Navigate to each section and verify URL (use regex to allow query params)
    await clickSidebarLink('Project');
    await expect(page).toHaveURL(/\/project/);

    await clickSidebarLink('Budget');
    await expect(page).toHaveURL(/\/budget/);

    await clickSidebarLink('Schedule');
    await expect(page).toHaveURL(/\/schedule/);

    await clickSidebarLink('Settings');
    await expect(page).toHaveURL(/\/settings/);
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

    // Then: All expected navigation items should be present
    // Main nav: Project, Budget, Schedule (links) — Footer: Settings (button)
    const expectedLinks = ['Project', 'Budget', 'Schedule'];

    for (const linkName of expectedLinks) {
      const link = appShell.sidebar.getByRole('link', { name: linkName, exact: true });
      await expect(link).toBeVisible();
    }

    // Settings is a button, not a link
    const settingsButton = appShell.sidebar.getByRole('button', { name: 'Settings', exact: true });
    await expect(settingsButton).toBeVisible();
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
