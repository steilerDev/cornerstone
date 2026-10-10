/**
 * E2E tests for 404 Not Found page (Story #27)
 */

import { test, expect } from '../../fixtures/auth.js';
import { NotFoundPage } from '../../pages/NotFoundPage.js';
import { ROUTES } from '../../fixtures/testData.js';

test.describe('404 Not Found Page', () => {
  test('Unrecognized route shows 404 page', async ({ page }) => {
    const notFoundPage = new NotFoundPage(page);

    // Given/When: User navigates to an unrecognized route
    await page.goto('/this-does-not-exist');

    // Then: 404 heading should be visible
    await expect(notFoundPage.heading).toBeVisible();
    const headingText = await notFoundPage.getHeading();
    expect(headingText).toBe('Page not found');
  });

  test('Description text is displayed', async ({ page }) => {
    const notFoundPage = new NotFoundPage(page);

    // Given: User is on a 404 page
    await page.goto('/non-existent-path');

    // Then: Description text should be visible
    await expect(notFoundPage.description).toBeVisible();
    const descriptionText = await notFoundPage.getDescription();
    expect(descriptionText).toBe('The page you are looking for does not exist or has been moved.');
  });

  test('"Go to Home" link navigates to the Home page', async ({ page }) => {
    const notFoundPage = new NotFoundPage(page);

    // Given: User is on a 404 page
    await page.goto('/invalid-route');
    await expect(notFoundPage.heading).toBeVisible();

    // The link points at the root URL itself (no /project hop in the href)
    await expect(notFoundPage.dashboardLink).toHaveAttribute('href', '/');

    // When: User clicks the "Go to Home" link
    await notFoundPage.clickDashboardLink();

    // Then: User should be redirected to project overview
    await expect(page).toHaveURL(ROUTES.home);
    await expect(page.getByRole('heading', { level: 1, name: 'Project' })).toBeVisible();
  });
});
