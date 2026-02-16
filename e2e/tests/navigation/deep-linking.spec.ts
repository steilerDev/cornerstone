/**
 * E2E tests for deep linking / direct URL navigation (Story #27)
 */

import { test, expect } from '../../fixtures/auth.js';
import { ROUTES } from '../../fixtures/testData.js';

test.describe('Deep Linking', () => {
  test('Direct URL for each route loads correct page', async ({ page }) => {
    // Given/When/Then: Navigate to each route and verify correct page heading

    // Dashboard (/)
    await page.goto(ROUTES.home);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    expect(page.url()).toMatch(new RegExp(`${ROUTES.home}$`));

    // Work Items
    await page.goto(ROUTES.workItems);
    await expect(page.getByRole('heading', { level: 1, name: 'Work Items' })).toBeVisible();
    expect(page.url()).toContain(ROUTES.workItems);

    // Budget
    await page.goto(ROUTES.budget);
    await expect(page.getByRole('heading', { level: 1, name: 'Budget' })).toBeVisible();
    expect(page.url()).toContain(ROUTES.budget);

    // Timeline
    await page.goto(ROUTES.timeline);
    await expect(page.getByRole('heading', { level: 1, name: 'Timeline' })).toBeVisible();
    expect(page.url()).toContain(ROUTES.timeline);

    // Household Items
    await page.goto(ROUTES.householdItems);
    await expect(page.getByRole('heading', { level: 1, name: 'Household Items' })).toBeVisible();
    expect(page.url()).toContain(ROUTES.householdItems);

    // Documents
    await page.goto(ROUTES.documents);
    await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
    expect(page.url()).toContain(ROUTES.documents);

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

    // Then: URL should match /work-items
    expect(page.url()).toContain(ROUTES.workItems);

    // When: User navigates to Budget
    await page.goto(ROUTES.budget);

    // Then: URL should match /budget
    expect(page.url()).toContain(ROUTES.budget);
  });
});
