/**
 * E2E tests for updating display name (Story #36)
 */

import { test, expect } from '../../fixtures/auth.js';
import { ProfilePage } from '../../pages/ProfilePage.js';
import { TEST_ADMIN } from '../../fixtures/testData.js';

test.describe('Update Display Name', () => {
  // Serialize tests within this describe block — they all modify the shared admin
  // user's display name and must not run in parallel with each other.
  test.describe.configure({ mode: 'serial' });
  test('Update display name successfully', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is on profile page
    await profilePage.goto();

    // When: User changes display name and saves
    const newName = 'Updated Admin';
    await profilePage.updateDisplayName(newName);

    // Then: Success banner should appear
    const successBanner = await profilePage.getDisplayNameSuccessBanner();
    expect(successBanner).toBeTruthy();
    expect(successBanner?.toLowerCase()).toContain('success');

    // And: Display name input should show new value
    await expect(profilePage.displayNameInput).toHaveValue(newName);

    // Restore original name for subsequent tests
    await profilePage.updateDisplayName(TEST_ADMIN.displayName);
  });

  test('Success banner appears after save', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is on profile page
    await profilePage.goto();

    // When: User updates display name
    await profilePage.updateDisplayName('Test Name');

    // Then: Success banner should be visible
    await expect(profilePage.displayNameSuccessBanner).toBeVisible({ timeout: 5000 });

    // Restore original name
    await profilePage.updateDisplayName(TEST_ADMIN.displayName);
  });

  test('Validation: empty name rejected', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is on profile page
    await profilePage.goto();

    // When: User tries to save empty display name
    await profilePage.displayNameInput.fill('');
    await profilePage.saveDisplayNameButton.click();

    // Then: Should show validation error or button should be disabled
    const isDisabled = await profilePage.saveDisplayNameButton.isDisabled();
    const errorBanner = await profilePage.getDisplayNameErrorBanner();

    // Either client-side validation prevents submit OR server returns error
    expect(isDisabled || errorBanner).toBeTruthy();
  });

  test('Display name persists after page reload', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User updates display name
    await profilePage.goto();
    const testName = 'Persistent Test Name';
    await profilePage.updateDisplayName(testName);
    await expect(profilePage.displayNameSuccessBanner).toBeVisible({ timeout: 5000 });

    // When: User reloads the page
    await page.reload();

    // Then: New display name should still be shown
    await expect(profilePage.displayNameInput).toHaveValue(testName);

    // Restore original name
    await profilePage.updateDisplayName(TEST_ADMIN.displayName);
  });
});
