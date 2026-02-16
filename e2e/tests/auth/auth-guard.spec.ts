/**
 * E2E tests for authentication guard (Story #32)
 */

import { test, expect } from '@playwright/test';
import { test as authTest } from '../../fixtures/auth.js';
import { ROUTES } from '../../fixtures/testData.js';

test.describe('Authentication Guard - Unauthenticated', () => {
  // Clear auth state for these tests
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Unauthenticated access to / redirects to /login', async ({ page }) => {
    // Given: User is not authenticated

    // When: User tries to access dashboard
    await page.goto(ROUTES.home);

    // Then: Should redirect to login
    await expect(page).toHaveURL(ROUTES.login);
  });

  test('Unauthenticated access to /profile redirects to /login', async ({ page }) => {
    // Given: User is not authenticated

    // When: User tries to access profile
    await page.goto(ROUTES.profile);

    // Then: Should redirect to login
    await expect(page).toHaveURL(ROUTES.login);
  });

  test('Unauthenticated access to /admin/users redirects to /login', async ({ page }) => {
    // Given: User is not authenticated

    // When: User tries to access user management
    await page.goto(ROUTES.userManagement);

    // Then: Should redirect to login
    await expect(page).toHaveURL(ROUTES.login);
  });

  test('/login accessible without auth', async ({ page }) => {
    // Given: User is not authenticated

    // When: User navigates to /login
    await page.goto(ROUTES.login);

    // Then: Login page should load
    await expect(page).toHaveURL(ROUTES.login);
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  });
});

test.describe('Authentication Guard - Authenticated', () => {
  // Use authenticated fixture
  authTest('Already-authenticated user on /login redirects to /', async ({ page }) => {
    // Given: User is already authenticated

    // When: User tries to access login page
    await page.goto(ROUTES.login);

    // Then: Should redirect to dashboard
    await expect(page).toHaveURL(ROUTES.home);
  });
});
