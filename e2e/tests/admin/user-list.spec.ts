/**
 * E2E tests for user list display (Story #38)
 */

import { test, expect } from '../../fixtures/auth.js';
import { UserManagementPage } from '../../pages/UserManagementPage.js';
import { TEST_ADMIN } from '../../fixtures/testData.js';

test.describe('User List Display', () => {
  test('Admin sees user list table', { tag: '@smoke' }, async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User is an admin

    // When: User navigates to user management page
    await userManagementPage.goto();

    // Then: User management heading should be visible
    await expect(userManagementPage.heading).toBeVisible();

    // And: User table should be visible
    await expect(userManagementPage.table).toBeVisible();
  });

  test('All expected columns visible', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User is on user management page
    await userManagementPage.goto();

    // Then: All expected column headers should be visible
    // Note: 'Auth Provider' column has defaultVisible: false — it is hidden by default.
    const expectedColumns = ['Name', 'Email', 'Role', 'Member Since', 'Status'];

    for (const columnName of expectedColumns) {
      const columnHeader = page.locator('table thead th').filter({ hasText: columnName });
      await expect(columnHeader).toBeVisible();
    }
  });

  test('Admin user is listed', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User is on user management page
    await userManagementPage.goto();

    // When: User views the table
    const adminRow = await userManagementPage.getUserRow(TEST_ADMIN.email);

    // Then: Admin user should be in the list
    expect(adminRow).not.toBeNull();

    // And: Admin row should show correct data
    if (adminRow) {
      const cells = await adminRow.locator('td').allTextContents();
      expect(cells[0]).toContain(TEST_ADMIN.displayName); // Name (index 0)
      expect(cells[1]).toBe(TEST_ADMIN.email); // Email (index 1)
      expect(cells[2]).toBe('Administrator'); // Role (index 2)
      // cells[3] = Member Since (date) — not asserted (format varies by locale)
      expect(cells[4]).toBe('Active'); // Status (index 4)
      // Note: Auth Provider column (defaultVisible: false) is not rendered in the table
    }
  });

  test('Table shows action menu for each user', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User is on user management page
    await userManagementPage.goto();

    // When: User views the table
    const adminRow = await userManagementPage.getUserRow(TEST_ADMIN.email);

    // Then: The ⋮ action menu button should be visible (DataTable action menu)
    if (adminRow) {
      const menuButton = adminRow.getByTestId(/^user-menu-button-/);
      await expect(menuButton).toBeVisible();
    }
  });

  test('Search input is visible', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User is on user management page
    await userManagementPage.goto();

    // Then: Search input should be visible
    await expect(userManagementPage.searchInput).toBeVisible();
    await expect(userManagementPage.searchInput).toHaveAttribute('placeholder', /search/i);
  });
});
