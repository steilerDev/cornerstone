/**
 * E2E tests for deep linking / direct URL navigation (Story #27)
 */

import { test, expect } from '../../fixtures/auth.js';
import { ROUTES } from '../../fixtures/testData.js';

// WebKit on tablet occasionally crashes with internal errors during rapid
// sequential navigations. Retrying handles transient browser-level failures.
test.describe('Deep Linking', () => {
  test.describe.configure({ retries: 2 });
  test('Direct URL for each route loads correct page', async ({ page }) => {
    // Given/When/Then: Navigate to each route and verify correct page heading

    // Project Overview (/ redirects to /project/overview)
    await page.goto(ROUTES.home);
    await expect(page.getByRole('heading', { level: 1, name: 'Project' })).toBeVisible();
    expect(page.url()).toContain('/project/overview');

    // Work Items
    await page.goto(ROUTES.workItems);
    await expect(page.getByRole('heading', { level: 1, name: 'Project' })).toBeVisible();
    expect(page.url()).toContain(ROUTES.workItems);

    // Budget
    await page.goto(ROUTES.budget);
    await expect(page.getByRole('heading', { level: 1, name: 'Budget' })).toBeVisible();
    expect(page.url()).toContain(ROUTES.budget);

    // Schedule
    await page.goto(ROUTES.timeline);
    await expect(page.getByRole('heading', { level: 1, name: 'Schedule' })).toBeVisible();
    expect(page.url()).toContain(ROUTES.timeline);

    // Household Items
    await page.goto(ROUTES.householdItems);
    await expect(page.getByRole('heading', { level: 1, name: 'Project' })).toBeVisible();
    expect(page.url()).toContain(ROUTES.householdItems);

    // Profile
    await page.goto(ROUTES.profile);
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
    expect(page.url()).toContain(ROUTES.profile);

    // User Management
    await page.goto(ROUTES.userManagement);
    await expect(page.getByRole('heading', { level: 1, name: 'User Management' })).toBeVisible();
    expect(page.url()).toContain(ROUTES.userManagement);
  });

  test('Browser URL matches expected path after navigation', async ({ page }) => {
    // Given: User is on dashboard
    await page.goto(ROUTES.home);

    // When: User navigates to Work Items
    await page.goto(ROUTES.workItems);

    // Then: URL should match /project/work-items
    expect(page.url()).toContain(ROUTES.workItems);

    // When: User navigates to Budget
    await page.goto(ROUTES.budget);

    // Then: URL should match /budget
    expect(page.url()).toContain(ROUTES.budget);
  });
});
