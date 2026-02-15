/**
 * E2E tests for user search functionality (Story #38)
 */

import { test, expect } from '../../fixtures/auth.js';
import { UserManagementPage } from '../../pages/UserManagementPage.js';
import { TEST_ADMIN } from '../../fixtures/testData.js';

test.describe('Search Users', () => {
  test('Search filters by name', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User is on user management page
    await userManagementPage.goto();

    // When: User searches by name
    await userManagementPage.searchUsers('Admin');

    // Then: Only matching users should be shown
    const rows = await userManagementPage.getUserRows();
    expect(rows.length).toBeGreaterThan(0);

    // Verify all visible rows contain "Admin" in name
    for (const row of rows) {
      const nameCell = await row.locator('td').first().textContent();
      expect(nameCell?.toLowerCase()).toContain('admin');
    }
  });

  test('Search filters by email', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User is on user management page
    await userManagementPage.goto();

    // When: User searches by email fragment
    await userManagementPage.searchUsers('e2e-test');

    // Then: Matching users should be shown
    const rows = await userManagementPage.getUserRows();
    expect(rows.length).toBeGreaterThan(0);

    // Verify results contain the search term
    const adminRow = await userManagementPage.getUserRow(TEST_ADMIN.email);
    expect(adminRow).not.toBeNull();
  });

  test('Empty search shows all users', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User has performed a search
    await userManagementPage.goto();
    await userManagementPage.searchUsers('Admin');
    const searchedRows = await userManagementPage.getUserRows();

    // When: User clears the search
    await userManagementPage.searchUsers('');

    // Then: All users should be shown again
    const allRows = await userManagementPage.getUserRows();
    expect(allRows.length).toBeGreaterThanOrEqual(searchedRows.length);
  });

  test('No-results state for non-matching query', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User is on user management page
    await userManagementPage.goto();

    // When: User searches for non-existent user
    await userManagementPage.searchUsers('nonexistent-user-xyz');

    // Then: Empty state message should be shown
    const emptyState = await userManagementPage.getEmptyState();
    expect(emptyState).toBeTruthy();
    expect(emptyState?.toLowerCase()).toContain('no users');
  });

  test('Search is case-insensitive', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User is on user management page
    await userManagementPage.goto();

    // When: User searches with different case
    await userManagementPage.searchUsers('ADMIN');

    // Then: Should still find matching users
    const rows = await userManagementPage.getUserRows();
    expect(rows.length).toBeGreaterThan(0);

    const adminRow = await userManagementPage.getUserRow(TEST_ADMIN.email);
    expect(adminRow).not.toBeNull();
  });

  test('Search updates results dynamically', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User is on user management page
    await userManagementPage.goto();

    // When: User types in search box
    await userManagementPage.searchInput.fill('Ad');
    await page.waitForTimeout(400); // Wait for debounce

    // Then: Results should update
    const partialRows = await userManagementPage.getUserRows();
    expect(partialRows.length).toBeGreaterThan(0);

    // When: User continues typing
    await userManagementPage.searchInput.fill('Admin');
    await page.waitForTimeout(400);

    // Then: Results should update again
    const fullRows = await userManagementPage.getUserRows();
    expect(fullRows.length).toBeGreaterThan(0);
  });
});
