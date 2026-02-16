/**
 * E2E tests for deactivating users (Stories #37, #38)
 */

import { test, expect } from '../../fixtures/auth.js';
import { UserManagementPage } from '../../pages/UserManagementPage.js';
import { TEST_ADMIN } from '../../fixtures/testData.js';

test.describe('Deactivate User', () => {
  test('Deactivate confirmation modal appears', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User is on user management page
    await userManagementPage.goto();

    // When: User clicks Deactivate on a user (try the admin as a test)
    // Note: This will show error for self-deactivation, but modal should open
    await userManagementPage.openDeactivateModal(TEST_ADMIN.email);

    // Then: Deactivate modal should be visible
    await expect(userManagementPage.deactivateModal).toBeVisible();
    await expect(userManagementPage.deactivateModalHeading).toBeVisible();

    // And: Confirmation text should mention the user
    const confirmText = await userManagementPage.deactivateConfirmationText.textContent();
    expect(confirmText).toBeTruthy();
    expect(confirmText?.toLowerCase()).toContain('sure');
  });

  test('Cannot deactivate self', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User is on user management page as admin
    await userManagementPage.goto();

    // When: User tries to deactivate their own account
    await userManagementPage.openDeactivateModal(TEST_ADMIN.email);
    await userManagementPage.confirmDeactivate();

    // Then: Should show error about self-deactivation
    const error = await userManagementPage.getDeactivateModalError();
    expect(error).toBeTruthy();
    expect(error?.toLowerCase()).toContain('cannot');

    // And: Modal should remain open (not successful)
    await expect(userManagementPage.deactivateModal).toBeVisible();
  });

  test('Modal can be closed without deactivating', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User opens deactivate modal
    await userManagementPage.goto();
    await userManagementPage.openDeactivateModal(TEST_ADMIN.email);

    // When: User clicks Cancel
    await userManagementPage.deactivateCancelButton.click();

    // Then: Modal should close
    await expect(userManagementPage.deactivateModal).not.toBeVisible({
      timeout: 5000,
    });

    // And: User should still be active
    const adminRow = await userManagementPage.getUserRow(TEST_ADMIN.email);
    expect(adminRow).not.toBeNull();
  });

  test('Modal close button works', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User opens deactivate modal
    await userManagementPage.goto();
    await userManagementPage.openDeactivateModal(TEST_ADMIN.email);

    // When: User clicks close button (X)
    await userManagementPage.closeDeactivateModal();

    // Then: Modal should close
    await expect(userManagementPage.deactivateModal).not.toBeVisible({
      timeout: 5000,
    });
  });

  /**
   * TODO: Full deactivation test requires a second user (member).
   * This will be testable after OIDC tests create a member user.
   *
   * Expected test:
   * - Open deactivate modal for member user
   * - Confirm deactivation
   * - Modal closes
   * - User's status changes to "Inactive" in table
   * - User can be reactivated (if implemented)
   */
});
