/**
 * E2E tests for Backup & Restore feature (Issue #1146)
 *
 * Coverage:
 * 1. [smoke] Admin can navigate to Backups page and see the heading
 * 2. Backups tab is not visible in SettingsSubNav for non-admin (member) users
 * 3. Not-configured empty state shown when BACKUP_DIR is not set (default in E2E env)
 * 4. Create backup — requires BACKUP_DIR configured; covered via API mock
 * 5. Delete backup confirmation modal — cancel closes without deleting; delete removes row
 * 6. Restore confirmation modal shows warning text; cancel closes modal
 *
 * Environment note: The E2E testcontainer does NOT set BACKUP_DIR, so
 * scenarios 3–6 use page.route() to mock /api/backups responses.
 * This allows full modal interaction testing without a real backup directory.
 */

import { test, expect } from '../../fixtures/auth.js';
import { BackupsPage } from '../../pages/BackupsPage.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock backup data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_BACKUP_1 = {
  filename: 'cornerstone-backup-2026-03-22T100000Z.tar.gz',
  createdAt: '2026-03-22T10:00:00.000Z',
  sizeBytes: 1048576, // 1 MB
};

const MOCK_BACKUP_2 = {
  filename: 'cornerstone-backup-2026-03-21T083000Z.tar.gz',
  createdAt: '2026-03-21T08:30:00.000Z',
  sizeBytes: 512000, // 500 KB
};

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Admin navigation and page heading [smoke]
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Backups page — admin access', () => {
  test(
    '[smoke] Admin can navigate to Backups page and sees heading',
    { tag: '@smoke' },
    async ({ page }) => {
      // The real E2E environment returns 503 BACKUP_NOT_CONFIGURED — that is fine.
      // We only verify navigation works and the heading renders.
      const backupsPage = new BackupsPage(page);

      // Given: Authenticated admin user
      // When: Admin navigates to /settings/backups
      await page.goto('/settings/backups');

      // Then: "Backup & Restore" heading is visible
      await expect(backupsPage.heading).toBeVisible();
    },
  );

  test('Backups nav tab is visible in SettingsSubNav for admin', async ({ page }) => {
    // Given: Authenticated admin user on the profile page
    await page.goto('/settings/profile');

    // Then: The "Backups" tab link is visible in the sub-nav
    const backupsTab = page.getByRole('link', { name: 'Backups', exact: true });
    await expect(backupsTab).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Member user cannot see Backups tab
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Backups tab — member access control', () => {
  test('Backups tab is not visible in SettingsSubNav for member role', async ({ page }) => {
    // Mock the /api/auth/me endpoint to return a member role.
    // The SettingsSubNav reads from AuthContext (which uses /api/auth/me via useAuth),
    // so mocking the auth endpoint is the correct E2E approach for role-based UI tests
    // when no member storage state exists.
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 2,
          email: 'member@e2e-test.local',
          displayName: 'E2E Member',
          role: 'member',
          authProvider: 'local',
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      });
    });

    // Given: User navigating settings as a member role
    await page.goto('/settings/profile');

    // Wait for the nav to render
    const subNav = page.getByRole('navigation', { name: 'Settings section navigation' });
    await subNav.waitFor({ state: 'visible' });

    // Then: The "Backups" tab link is NOT visible (admin-only)
    const backupsTab = page.getByRole('link', { name: 'Backups', exact: true });
    await expect(backupsTab).not.toBeVisible();

    // And: The "User Management" tab is also not visible for members
    const usersTab = page.getByRole('link', { name: 'User Management', exact: true });
    await expect(usersTab).not.toBeVisible();

    // And: The shared tabs (Profile, Manage) remain visible
    await expect(page.getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Not-configured state (default in E2E environment)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Backups page — not-configured state', () => {
  test('Shows not-configured message when BACKUP_DIR is not set', async ({ page }) => {
    const backupsPage = new BackupsPage(page);

    // Given: BACKUP_DIR is not configured (real E2E server returns 503)
    // No mocking needed — the testcontainer has no BACKUP_DIR set

    // When: Admin navigates to /settings/backups
    await backupsPage.goto();
    await backupsPage.waitForLoaded();

    // Then: "Backup is not configured" empty state is visible
    await expect(backupsPage.notConfiguredState).toBeVisible();

    // And: The page describes how to enable backups
    await expect(
      page.getByText('BACKUP_DIR', { exact: false }),
    ).toBeVisible();

    // And: Create Backup button is NOT visible (feature not available)
    await expect(backupsPage.createBackupButton).not.toBeVisible();

    // And: No backup table is visible
    await expect(backupsPage.backupTable).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 4–6: Mocked configured state (BACKUP_DIR set)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Backups page — configured state (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    // Mock GET /api/backups to return two backup entries (simulates BACKUP_DIR configured)
    await page.route(`**${API.backups}`, async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ backups: [MOCK_BACKUP_1, MOCK_BACKUP_2] }),
        });
      } else {
        await route.continue();
      }
    });
  });

  // ─── Scenario 4: Create backup ────────────────────────────────────────────

  test('Create backup adds new entry to the list', async ({ page }) => {
    const newBackup = {
      filename: 'cornerstone-backup-2026-03-22T120000Z.tar.gz',
      createdAt: '2026-03-22T12:00:00.000Z',
      sizeBytes: 2097152, // 2 MB
    };

    // Mock POST /api/backups to return a new backup
    await page.route(`**${API.backups}`, async (route, request) => {
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ backup: newBackup }),
        });
      } else {
        await route.continue();
      }
    });

    const backupsPage = new BackupsPage(page);

    // Given: Admin is on the configured Backups page
    await backupsPage.goto();
    await backupsPage.backupTable.waitFor({ state: 'visible' });

    // Verify initial state has two rows
    const initialRows = await backupsPage.getBackupRows();
    expect(initialRows).toHaveLength(2);

    // When: Admin clicks Create Backup
    await backupsPage.clickCreateBackup();

    // Then: New backup appears at top of list (3 rows total)
    const updatedRows = await backupsPage.getBackupRows();
    expect(updatedRows).toHaveLength(3);

    // And: The new backup filename is visible in the first row
    await expect(updatedRows[0]).toContainText(newBackup.filename);
  });

  // ─── Scenario 5: Delete backup confirmation modal ─────────────────────────

  test('Delete confirmation modal shows filename and warning', async ({ page }) => {
    const backupsPage = new BackupsPage(page);

    // Given: Admin is on the Backups page with two backups
    await backupsPage.goto();
    await backupsPage.backupTable.waitFor({ state: 'visible' });

    // When: Admin clicks Delete for the first backup row
    await backupsPage.clickDeleteForRow(0);

    // Then: Delete modal is visible
    await expect(backupsPage.deleteModal).toBeVisible();

    // And: The filename of the backup to delete is shown in the modal
    await expect(backupsPage.deleteFilenameText).toContainText(MOCK_BACKUP_1.filename);

    // And: Warning text is visible
    await expect(backupsPage.deleteWarningText).toBeVisible();
  });

  test('Cancel on delete modal closes without deleting', async ({ page }) => {
    const backupsPage = new BackupsPage(page);

    // Given: Admin has the delete modal open for the first backup
    await backupsPage.goto();
    await backupsPage.backupTable.waitFor({ state: 'visible' });
    await backupsPage.clickDeleteForRow(0);
    await expect(backupsPage.deleteModal).toBeVisible();

    // When: Admin clicks Cancel
    await backupsPage.deleteCancelButton.click();

    // Then: Modal closes
    await expect(backupsPage.deleteModal).not.toBeVisible();

    // And: Both backups are still listed
    const rows = await backupsPage.getBackupRows();
    expect(rows).toHaveLength(2);
  });

  test('Confirming delete removes backup from list', async ({ page }) => {
    // Track which backups to return after the delete
    let deletedFilename: string | null = null;

    // Override GET mock to exclude the deleted backup after deletion
    await page.route(`**${API.backups}`, async (route, request) => {
      if (request.method() === 'GET') {
        const remaining = [MOCK_BACKUP_1, MOCK_BACKUP_2].filter(
          (b) => b.filename !== deletedFilename,
        );
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ backups: remaining }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock DELETE /api/backups/:filename
    await page.route(`**${API.backups}/**`, async (route, request) => {
      if (request.method() === 'DELETE') {
        // Extract filename from URL
        const url = new URL(request.url());
        deletedFilename = url.pathname.split('/').pop() ?? null;
        await route.fulfill({ status: 204, body: '' });
      } else {
        await route.continue();
      }
    });

    const backupsPage = new BackupsPage(page);

    // Given: Admin is on the Backups page with two backups
    await backupsPage.goto();
    await backupsPage.backupTable.waitFor({ state: 'visible' });

    // Verify initial count
    let rows = await backupsPage.getBackupRows();
    expect(rows).toHaveLength(2);

    // When: Admin opens delete modal for the first backup and confirms
    await backupsPage.clickDeleteForRow(0);
    await expect(backupsPage.deleteModal).toBeVisible();
    await backupsPage.confirmDelete();

    // Then: Modal closes
    await expect(backupsPage.deleteModal).not.toBeVisible();

    // And: Only one backup remains
    rows = await backupsPage.getBackupRows();
    expect(rows).toHaveLength(1);

    // And: The remaining backup is MOCK_BACKUP_2
    await expect(rows[0]).toContainText(MOCK_BACKUP_2.filename);
  });

  // ─── Scenario 6: Restore confirmation modal ───────────────────────────────

  test('Restore confirmation modal shows warning text', async ({ page }) => {
    const backupsPage = new BackupsPage(page);

    // Given: Admin is on the Backups page with two backups
    await backupsPage.goto();
    await backupsPage.backupTable.waitFor({ state: 'visible' });

    // When: Admin clicks Restore for the first backup row
    await backupsPage.clickRestoreForRow(0);

    // Then: Restore modal is visible
    await expect(backupsPage.restoreModal).toBeVisible();

    // And: Warning text about permanent data replacement is visible
    await expect(backupsPage.restoreWarningText).toBeVisible();

    // And: The backup filename being restored is shown
    await expect(backupsPage.restoreModal).toContainText(MOCK_BACKUP_1.filename);
  });

  test('Cancel on restore modal closes without restoring', async ({ page }) => {
    const backupsPage = new BackupsPage(page);

    // Given: Admin has the restore modal open
    await backupsPage.goto();
    await backupsPage.backupTable.waitFor({ state: 'visible' });
    await backupsPage.clickRestoreForRow(0);
    await expect(backupsPage.restoreModal).toBeVisible();

    // When: Admin clicks Cancel
    await backupsPage.restoreCancelButton.click();

    // Then: Modal closes
    await expect(backupsPage.restoreModal).not.toBeVisible();

    // And: Both backups are still listed (no restore was triggered)
    const rows = await backupsPage.getBackupRows();
    expect(rows).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Responsive layout tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Backups page — responsive layout', () => {
  test(
    'Backups page renders heading at all viewports',
    { tag: '@responsive' },
    async ({ page }) => {
      const backupsPage = new BackupsPage(page);

      // Given: Authenticated admin navigates to Backups page
      await page.goto('/settings/backups');

      // Then: Heading is visible regardless of viewport
      await expect(backupsPage.heading).toBeVisible();
    },
  );
});
