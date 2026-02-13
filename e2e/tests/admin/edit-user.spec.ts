/**
 * E2E tests for editing users (Stories #37, #38)
 */

import { test, expect } from '../../fixtures/auth.js';
import { UserManagementPage } from '../../pages/UserManagementPage.js';
import { TEST_ADMIN } from '../../fixtures/testData.js';

test.describe('Edit User', () => {
  test('Edit modal opens with pre-filled data', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User is on user management page
    await userManagementPage.goto();

    // When: User clicks Edit on a user
    await userManagementPage.openEditModal(TEST_ADMIN.email);

    // Then: Edit modal should be visible
    await expect(userManagementPage.editModal).toBeVisible();
    await expect(userManagementPage.editModalHeading).toBeVisible();

    // And: Form should be pre-filled with current values
    await expect(userManagementPage.editDisplayNameInput).toHaveValue(TEST_ADMIN.displayName);
    await expect(userManagementPage.editEmailInput).toHaveValue(TEST_ADMIN.email);
    await expect(userManagementPage.editRoleSelect).toHaveValue('admin');
  });

  test('Change display name, save, verify in list', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User opens edit modal
    await userManagementPage.goto();
    await userManagementPage.openEditModal(TEST_ADMIN.email);

    // When: User changes display name and saves
    const newName = 'Modified Admin Name';
    await userManagementPage.editUser({ displayName: newName });

    // Wait for modal to close
    await expect(userManagementPage.editModal).not.toBeVisible({ timeout: 5000 });

    // Then: Table should reflect the change
    const adminRow = await userManagementPage.getUserRow(TEST_ADMIN.email);
    expect(adminRow).not.toBeNull();
    if (adminRow) {
      const nameCell = await adminRow.locator('td').first().textContent();
      expect(nameCell).toBe(newName);
    }

    // Restore original name
    await userManagementPage.openEditModal(TEST_ADMIN.email);
    await userManagementPage.editUser({ displayName: TEST_ADMIN.displayName });
    await expect(userManagementPage.editModal).not.toBeVisible({ timeout: 5000 });
  });

  test('Modal can be closed without saving', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User opens edit modal
    await userManagementPage.goto();
    await userManagementPage.openEditModal(TEST_ADMIN.email);

    // When: User makes changes but clicks Cancel
    await userManagementPage.editDisplayNameInput.fill('Temporary Name');
    await userManagementPage.editCancelButton.click();

    // Then: Modal should close
    await expect(userManagementPage.editModal).not.toBeVisible({ timeout: 5000 });

    // And: Changes should not be saved
    const adminRow = await userManagementPage.getUserRow(TEST_ADMIN.email);
    expect(adminRow).not.toBeNull();
    if (adminRow) {
      const nameCell = await adminRow.locator('td').first().textContent();
      expect(nameCell).toBe(TEST_ADMIN.displayName);
    }
  });

  test('Modal close button works', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User opens edit modal
    await userManagementPage.goto();
    await userManagementPage.openEditModal(TEST_ADMIN.email);

    // When: User clicks close button (X)
    await userManagementPage.closeEditModal();

    // Then: Modal should close
    await expect(userManagementPage.editModal).not.toBeVisible({ timeout: 5000 });
  });

  test('Validation: empty display name rejected', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User opens edit modal
    await userManagementPage.goto();
    await userManagementPage.openEditModal(TEST_ADMIN.email);

    // When: User tries to save empty display name
    await userManagementPage.editDisplayNameInput.fill('');
    await userManagementPage.editSaveButton.click();

    // Then: Should show error or button disabled
    const isDisabled = await userManagementPage.editSaveButton.isDisabled();
    const error = await userManagementPage.getEditModalError();

    expect(isDisabled || error).toBeTruthy();
  });

  test('Validation: invalid email rejected', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User opens edit modal
    await userManagementPage.goto();
    await userManagementPage.openEditModal(TEST_ADMIN.email);

    // When: User tries to save invalid email
    await userManagementPage.editEmailInput.fill('not-an-email');
    await userManagementPage.editSaveButton.click();

    // Then: Should show error or button disabled
    const isDisabled = await userManagementPage.editSaveButton.isDisabled();
    const error = await userManagementPage.getEditModalError();

    expect(isDisabled || error).toBeTruthy();
  });

  /**
   * TODO: Role change test requires a member user.
   * This will be testable after OIDC tests create a member user.
   *
   * Expected test:
   * - Open edit modal for member user
   * - Change role from member to admin
   * - Save and verify table shows "Administrator"
   * - Change back to member
   */
});
