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
    expect(headingText).toBe('404 - Page Not Found');
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

  test('"Go back to Dashboard" link navigates to /', async ({ page }) => {
    const notFoundPage = new NotFoundPage(page);

    // Given: User is on a 404 page
    await page.goto('/invalid-route');
    await expect(notFoundPage.heading).toBeVisible();

    // When: User clicks "Go back to Dashboard" link
    await notFoundPage.clickDashboardLink();

    // Then: User should be redirected to dashboard
    await expect(page).toHaveURL(ROUTES.home);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  });
});
