/**
 * E2E tests for user search functionality (Story #38)
 */

import { test, expect } from '../../fixtures/auth.js';
import { UserManagementPage } from '../../pages/UserManagementPage.js';
import { TEST_ADMIN } from '../../fixtures/testData.js';
import { createLocalUserViaApi, deleteUserViaApi } from '../../fixtures/apiHelpers.js';

test.describe('Search Users', () => {
  test('Search filters by name', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User is on user management page
    await userManagementPage.goto();

    // When: User searches by name
    await userManagementPage.searchUsers('Admin');

    // Then: Only matching users should be shown
    const rows = await userManagementPage.getUserRows();
    // AC4 audit: the for-loop below verifies every visible row contains 'admin' — the
    // > 0 guard is required for that loop to be meaningful. No separate negative
    // assertion is needed because any non-admin row would fail the loop body.
    expect(rows.length).toBeGreaterThan(0);

    // Verify all visible rows contain "Admin" in name
    for (const row of rows) {
      const nameCell = await row.locator('td').first().textContent();
      expect(nameCell?.toLowerCase()).toContain('admin');
    }
  });

  test('Search filters by email', async ({ page, testPrefix }) => {
    // AC1: use testPrefix (unique per worker) as the search term so this test does not
    // collide with accumulated suite users that share "e2e-test".
    // AC2: assert filtering actually worked — matchUser IS present, noMatchUser IS absent.
    // AC3: both seed users are deactivated (soft delete) in the finally block regardless of failure.
    // Use Date.now() suffix so the email is unique even if a prior run left a deactivated row
    // with the same address (POST /api/users 409s on deactivated emails too).
    const matchEmail = `${testPrefix}-${Date.now()}@e2e-test.local`;
    const noMatchEmail = `no-match-${Date.now()}@e2e-test.local`;
    let matchUserId: string | null = null;
    let noMatchUserId: string | null = null;

    try {
      const matchUser = await createLocalUserViaApi(page, {
        email: matchEmail,
        displayName: 'Match User',
        password: 'P@ssword1234!',
      });
      matchUserId = matchUser.id;

      const noMatchUser = await createLocalUserViaApi(page, {
        email: noMatchEmail,
        displayName: 'No Match User',
        password: 'P@ssword1234!',
      });
      noMatchUserId = noMatchUser.id;

      const userManagementPage = new UserManagementPage(page);
      await userManagementPage.goto();

      // When: User searches by a fragment unique to this test run
      await userManagementPage.searchUsers(testPrefix);

      // Then: at least one row is present (sanity guard before membership checks)
      const rows = await userManagementPage.getUserRows();
      expect(rows.length).toBeGreaterThan(0);

      // matchUser MUST appear in results
      const matchRow = await userManagementPage.getUserRow(matchEmail);
      expect(
        matchRow,
        `Expected ${matchEmail} in search results for "${testPrefix}"`,
      ).not.toBeNull();

      // noMatchUser MUST NOT appear in results
      const noMatchRow = await userManagementPage.getUserRow(noMatchEmail);
      expect(
        noMatchRow,
        `Expected ${noMatchEmail} to be absent from search results for "${testPrefix}"`,
      ).toBeNull();
    } finally {
      if (matchUserId) await deleteUserViaApi(page, matchUserId);
      if (noMatchUserId) await deleteUserViaApi(page, noMatchUserId);
    }
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
    // When search is active, DataTable shows t('dataTable.empty.filteredMessage') =
    // "No items match the current filters" (not the page-specific "No users found." message)
    const emptyState = await userManagementPage.getEmptyState();
    expect(emptyState).toBeTruthy();
    expect(emptyState?.toLowerCase()).toMatch(/no users|no items match/);
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

    // Universal negative: every rendered row must match — checks both name and email cells
    // because UserManagementPage.tsx filters on `displayName || email` (a name-only check
    // would false-fail rows that matched by email).
    for (const row of rows) {
      const cells = await row.locator('td').allTextContents();
      expect(`${cells[0]} ${cells[1]}`.toLowerCase()).toContain('admin');
    }

    const adminRow = await userManagementPage.getUserRow(TEST_ADMIN.email);
    expect(adminRow).not.toBeNull();
  });

  test('Search updates results dynamically', async ({ page }) => {
    const userManagementPage = new UserManagementPage(page);

    // Given: User is on user management page
    await userManagementPage.goto();

    // When: User types in search box
    await userManagementPage.searchInput.waitFor({ state: 'visible' });
    await userManagementPage.searchInput.scrollIntoViewIfNeeded();
    await userManagementPage.searchInput.fill('Ad');
    await page.waitForTimeout(400); // Wait for debounce

    // Then: Results should update
    const partialRows = await userManagementPage.getUserRows();
    expect(partialRows.length).toBeGreaterThan(0);

    // Universal negative: every row must contain 'ad' in name or email
    for (const row of partialRows) {
      const cells = await row.locator('td').allTextContents();
      expect(`${cells[0]} ${cells[1]}`.toLowerCase()).toContain('ad');
    }

    const adminRowPartial = await userManagementPage.getUserRow(TEST_ADMIN.email);
    expect(adminRowPartial, `Expected ${TEST_ADMIN.email} in results for "Ad"`).not.toBeNull();

    // When: User continues typing
    await userManagementPage.searchInput.fill('Admin');
    await page.waitForTimeout(400);

    // Then: Results should update again (narrower query → no more rows than before)
    const fullRows = await userManagementPage.getUserRows();
    expect(fullRows.length).toBeGreaterThan(0);
    expect(fullRows.length).toBeLessThanOrEqual(partialRows.length);

    // Universal negative: every row must contain 'admin' in name or email
    for (const row of fullRows) {
      const cells = await row.locator('td').allTextContents();
      expect(`${cells[0]} ${cells[1]}`.toLowerCase()).toContain('admin');
    }

    const adminRowFull = await userManagementPage.getUserRow(TEST_ADMIN.email);
    expect(adminRowFull, `Expected ${TEST_ADMIN.email} in results for "Admin"`).not.toBeNull();
  });
});
