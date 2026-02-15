/**
 * E2E tests for setup flow (Story #30)
 *
 * IMPORTANT: The auth-setup project runs before these tests and creates an admin user.
 * Therefore, these tests verify the redirect behavior when setup is already complete.
 */

import { test, expect } from '@playwright/test';
import { SetupPage } from '../../pages/SetupPage.js';
import { ROUTES } from '../../fixtures/testData.js';

test.describe('Setup Flow', () => {
  // Clear auth state for these tests
  test.use({ storageState: { cookies: [], origins: [] } });

  test('After setup complete, /setup redirects to /login', async ({ page }) => {
    // Given: Admin user already exists (created by auth-setup)
    const setupPage = new SetupPage(page);

    // When: User navigates to /setup
    await setupPage.goto();

    // Then: Should redirect to /login since setup is already complete
    await expect(page).toHaveURL(ROUTES.login);
  });

  /**
   * TODO: Full setup flow tests require a fresh container with no admin user.
   * Since auth-setup runs first and creates an admin, we cannot test the actual setup form.
   *
   * Expected client-side validations (to be tested when infrastructure supports it):
   * - Email required
   * - Password minimum 12 characters
   * - Passwords must match
   * - Display name required
   */
});
