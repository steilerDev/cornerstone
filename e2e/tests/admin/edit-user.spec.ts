/**
 * E2E tests for editing users (Stories #37, #38). The Edit dialog is the same ObjectForm schema
 * as New user, in edit scope (#2256): Display name, Email and Role only, no password.
 */

import { test, expect } from '../../fixtures/auth.js';
import { UserManagementPage } from '../../pages/UserManagementPage.js';
import { ConfirmDialogControl } from '../../pages/components/ConfirmDialogControl.js';
import { TEST_ADMIN } from '../../fixtures/testData.js';

test.describe('Edit User', { lock: 'admin-account' }, () => {
  // The `admin-account` lock (held by edit-user, update-display-name and user-list specs)
  // prevents these from running concurrently across workers and projects; serial mode only
  // orders tests in-project.
  // Serialize tests within this describe block — they all modify the shared admin
  // user record and must not run in parallel with each other.
  test.describe.configure({ mode: 'serial' });
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

  test('Edit shows Display name, Email and Role only (no password, no sign-in method)', async ({
    page,
  }) => {
    const users = new UserManagementPage(page);
    await users.goto();
    await users.openEditModal(TEST_ADMIN.email);

    await expect(users.editModal.getByLabel('Display Name')).toBeVisible();
    await expect(users.editModal.getByLabel('Email')).toBeVisible();
    await expect(users.editModal.getByLabel('Role')).toBeVisible();
    await expect(users.editModal.locator('#password')).toHaveCount(0);
    await expect(users.editModal.locator('#confirmPassword')).toHaveCount(0);
    await expect(users.editModal.locator('#authProvider')).toHaveCount(0);
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
    await expect(userManagementPage.editModal).not.toBeVisible();

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
    await expect(userManagementPage.editModal).not.toBeVisible();
  });

  test('Modal can be closed without saving', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User opens edit modal
    await userManagementPage.goto();
    await userManagementPage.openEditModal(TEST_ADMIN.email);

    // When: User makes changes but clicks Cancel
    await userManagementPage.editDisplayNameInput.fill('Temporary Name');
    await userManagementPage.editCancelButton.click();
    // And: the discard confirm (shared ObjectForm behaviour) is accepted
    await new ConfirmDialogControl(page, 'user-form-discard').confirmAndWaitClosed();

    // Then: Modal should close
    await expect(userManagementPage.editModal).not.toBeVisible();

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
    await expect(userManagementPage.editModal).not.toBeVisible();
  });

  test('Validation: empty display name rejected', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User opens edit modal
    await userManagementPage.goto();
    await userManagementPage.openEditModal(TEST_ADMIN.email);

    // When: User tries to save empty display name
    await userManagementPage.editDisplayNameInput.fill('');
    await userManagementPage.editSaveButton.click();

    // Then: the field shows its error, the dialog stays open and Display name has focus
    await expect(userManagementPage.editDisplayNameError).toBeVisible();
    await expect(userManagementPage.editDisplayNameInput).toBeFocused();
    await expect(userManagementPage.editModal).toBeVisible();
  });

  test('Validation: invalid email rejected', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User opens edit modal
    await userManagementPage.goto();
    await userManagementPage.openEditModal(TEST_ADMIN.email);

    // When: User tries to save invalid email
    await userManagementPage.editEmailInput.fill('not-an-email');
    await userManagementPage.editSaveButton.click();

    // Then: the email field shows its error and the dialog stays open
    await expect(userManagementPage.editEmailError).toBeVisible();
    await expect(userManagementPage.editEmailInput).toBeFocused();
    await expect(userManagementPage.editModal).toBeVisible();
  });

  test('Escape on an untouched dialog returns focus to the row menu button', async ({ page }) => {
    const users = new UserManagementPage(page);
    await users.goto();
    await users.openEditModal(TEST_ADMIN.email);

    await page.keyboard.press('Escape');

    await expect(users.editModal).toBeHidden();
    await expect(users.rowMenuTrigger(TEST_ADMIN.email)).toBeFocused();
  });

  test('Saving without a change sends no request', async ({ page }) => {
    const users = new UserManagementPage(page);
    const writes: string[] = [];
    page.on('request', (request) => {
      if (/\/api\/users\/[^/]+$/.test(request.url()) && request.method() === 'PATCH') {
        writes.push(request.url());
      }
    });
    await users.goto();
    await users.openEditModal(TEST_ADMIN.email);

    await users.editSaveButton.click();

    await expect(users.editModal).toBeHidden();
    expect(writes).toEqual([]);
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
