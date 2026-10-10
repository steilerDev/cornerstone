/**
 * E2E tests for Backup & Restore feature (Issue #1146)
 *
 * Coverage:
 * 1. [smoke] Admin can navigate to Backups page and see the heading
 * 2. Backups view is not offered in the sidebar Settings group for non-admin (member) users
 * 3. Create backup — covered via mocked API responses
 * 4. Delete backup confirmation modal — cancel closes without deleting; delete removes row
 * 5. Restore confirmation modal shows warning text; cancel closes modal
 * 6. Scheduler status section (Issue #1804):
 *    6a. Real (unmocked) environment shows Disabled state with hint (no BACKUP_CADENCE configured)
 *    6b. Mocked enabled + successful last run + two next runs
 *    6c. Mocked enabled + failed last run shows Failed badge
 *    6d. Mocked enabled + lastRun null shows "no runs yet" message
 *    6e. Mocked network failure shows the generic scheduler load-error banner
 *
 * Environment note: BACKUP_DIR defaults to /backups, so the testcontainer always
 * has backups enabled. Scenarios 3–6 use page.route() to mock /api/backups responses.
 */

import { test, expect } from '../../fixtures/auth.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
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
      // We only verify navigation works and the heading renders.
      const backupsPage = new BackupsPage(page);

      // Given: Authenticated admin user
      // When: Admin navigates to /settings/backups
      await page.goto('/settings/backups');

      // Then: "Backups" heading is visible
      await expect(backupsPage.heading).toBeVisible();
    },
  );

  test('Backups view is listed in the sidebar Settings group for admin', async ({ page }) => {
    const shell = new AppShellPage(page);
    // Given: Authenticated admin user on the profile page
    await page.goto('/settings/profile');

    // Then: The "Backups" view is listed in the sidebar Settings group (#2205: no in-page tab row)
    await expect(shell.viewLink('settingsBackups')).toHaveText('Backups');
    await expect(shell.settingsNav.getByRole('link', { name: 'Backups' })).toHaveCount(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Member user is not offered Backups
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Backups view — member access control', () => {
  test('Backups view is not offered in the sidebar for member role', async ({ page }) => {
    const shell = new AppShellPage(page);
    // Mock the /api/auth/me endpoint to return a member role.
    // The sidebar reads the role from AuthContext (which uses /api/auth/me via useAuth),
    // so mocking the auth endpoint is the correct E2E approach for role-based UI tests
    // when no member storage state exists.
    // Mock format: { user: { ... }, setupRequired, oidcEnabled }
    // The flat format ({ id, role, ... }) does NOT work — useAuth() reads response.user.role;
    // a flat response causes the auth context to treat the user as unauthenticated and
    // redirect to /login, making the Profile heading and settings nav unreachable.
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 2,
            email: 'member@e2e-test.local',
            displayName: 'E2E Member',
            role: 'member',
            authProvider: 'local',
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          setupRequired: false,
          oidcEnabled: false,
        }),
      });
    });

    // Given: User navigating settings as a member role
    await page.goto('/settings/profile');

    // Wait for the profile page heading to confirm the page has rendered.
    // Use the page heading rather than the settings nav because the auth mock
    // triggers an AuthContext re-render that can delay nav rendering briefly.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Account', exact: true }),
    ).toBeVisible();

    // Then: The admin-only views are not rendered at all for the member role
    await expect(shell.viewLink('settingsBackups')).toHaveCount(0);
    await expect(shell.viewLink('settingsUsers')).toHaveCount(0);

    // And: The shared view (Account) remains in the Settings group
    await expect(shell.viewLink('settingsProfile')).toHaveText('Account');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 3–5: Mocked backup list and API responses
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Backups page — mocked API responses', () => {
  test.beforeEach(async ({ page }) => {
    // Mock GET /api/backups to return two backup entries (mocked backup list)
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

  // ─── Scenario 3: Create backup ────────────────────────────────────────────

  test('Create backup adds new entry to the list', async ({ page }) => {
    const newBackup = {
      filename: 'cornerstone-backup-2026-03-22T120000Z.tar.gz',
      createdAt: '2026-03-22T12:00:00.000Z',
      sizeBytes: 2097152, // 2 MB
    };

    // Mock POST /api/backups to return a new backup.
    // Use route.fallback() (not route.continue()) for non-POST requests so they
    // fall through to the beforeEach GET mock. route.continue() bypasses all
    // registered handlers and goes to the network directly; route.fallback()
    // passes to the next matching route handler in the stack.
    await page.route(`**${API.backups}`, async (route, request) => {
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ backup: newBackup }),
        });
      } else {
        await route.fallback();
      }
    });

    const backupsPage = new BackupsPage(page);

    // Given: Admin is on the configured Backups page
    await backupsPage.goto();
    await expect(backupsPage.backupTable).toBeVisible();

    // Verify initial state has two rows
    const initialRows = await backupsPage.getBackupRows();
    expect(initialRows).toHaveLength(2);

    // When: Admin clicks Create Backup
    await backupsPage.clickCreateBackup();

    // Then: New backup appears at top of list (3 rows total)
    const updatedRows = await backupsPage.getBackupRows();
    expect(updatedRows).toHaveLength(3);

    // And: The new backup filename is visible in the first row
    const [newestRow] = updatedRows;
    if (!newestRow) throw new Error('Expected a backup row after creating a backup');
    await expect(newestRow).toContainText(newBackup.filename);
  });

  // ─── Scenario 4: Delete backup confirmation modal ─────────────────────────

  test('Delete confirmation modal shows filename and warning', async ({ page }) => {
    const backupsPage = new BackupsPage(page);

    // Given: Admin is on the Backups page with two backups
    await backupsPage.goto();
    await expect(backupsPage.backupTable).toBeVisible();

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
    await expect(backupsPage.backupTable).toBeVisible();
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
    await expect(backupsPage.backupTable).toBeVisible();

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
    const [remainingRow] = rows;
    if (!remainingRow) throw new Error('Expected one remaining backup row');
    await expect(remainingRow).toContainText(MOCK_BACKUP_2.filename);
  });

  // ─── Scenario 5: Restore confirmation modal ───────────────────────────────

  test('Restore confirmation modal shows warning text', async ({ page }) => {
    const backupsPage = new BackupsPage(page);

    // Given: Admin is on the Backups page with two backups
    await backupsPage.goto();
    await expect(backupsPage.backupTable).toBeVisible();

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
    await expect(backupsPage.backupTable).toBeVisible();
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
// Scenario 6: Automatic backup scheduler status section (Issue #1804)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Backups page — scheduler status section', () => {
  // ─── 6a: Real (unmocked) default environment ──────────────────────────────

  test('Scheduler section shows Disabled state by default (no BACKUP_CADENCE configured)', async ({
    page,
  }) => {
    // No mock — exercises the real GET /api/backups/scheduler-status endpoint against
    // the testcontainer, which never has BACKUP_CADENCE set.
    const backupsPage = new BackupsPage(page);

    await backupsPage.goto();
    await backupsPage.waitForSchedulerLoaded();

    await expect(backupsPage.schedulerHeading).toBeVisible();
    await expect(backupsPage.schedulerStatusValue).toContainText('Disabled');
    await expect(backupsPage.schedulerDisabledHint).toBeVisible();

    // The last-run/next-run rows only render when enabled — must not be present
    await expect(backupsPage.schedulerLastRunValue).not.toBeVisible();
    await expect(backupsPage.schedulerNextRunValue).not.toBeVisible();
  });

  // ─── 6b: Mocked enabled state with successful last run and two next runs ──

  test('Scheduler section shows Enabled state with successful last run and both next runs', async ({
    page,
  }) => {
    const backupsPage = new BackupsPage(page);
    await backupsPage.mockSchedulerStatus(200, {
      enabled: true,
      lastRun: { timestamp: '2026-03-22T10:00:00.000Z', success: true },
      nextRuns: ['2026-03-23T02:00:00.000Z', '2026-03-24T02:00:00.000Z'],
    });

    await backupsPage.goto();
    await backupsPage.waitForSchedulerLoaded();

    await expect(backupsPage.schedulerStatusValue).toContainText('Enabled');
    await expect(backupsPage.schedulerDisabledHint).not.toBeVisible();

    // Last run row: succeeded badge + formatted timestamp (assert the year rather than
    // the full locale-formatted string, which depends on the runner's ICU data/timezone)
    await expect(backupsPage.schedulerLastRunValue).toContainText('Succeeded');
    await expect(backupsPage.schedulerLastRunValue).toContainText('2026');

    // Next run row: primary time rendered plus the "then" secondary time
    await expect(backupsPage.schedulerNextRunValue).toContainText('2026');
    await expect(backupsPage.schedulerNextRunValue).toContainText('then');
  });

  // ─── 6c: Mocked failed last run ────────────────────────────────────────────

  test('Scheduler section shows Failed badge when the last scheduled run failed', async ({
    page,
  }) => {
    const backupsPage = new BackupsPage(page);
    await backupsPage.mockSchedulerStatus(200, {
      enabled: true,
      lastRun: { timestamp: '2026-03-22T10:00:00.000Z', success: false },
      nextRuns: ['2026-03-23T02:00:00.000Z'],
    });

    await backupsPage.goto();
    await backupsPage.waitForSchedulerLoaded();

    await expect(backupsPage.schedulerLastRunValue).toContainText('Failed');
  });

  // ─── 6d: Mocked enabled with lastRun null ─────────────────────────────────

  test('Scheduler section shows "no runs yet" message when the scheduler has never run', async ({
    page,
  }) => {
    const backupsPage = new BackupsPage(page);
    await backupsPage.mockSchedulerStatus(200, {
      enabled: true,
      lastRun: null,
      nextRuns: ['2026-03-23T02:00:00.000Z'],
    });

    await backupsPage.goto();
    await backupsPage.waitForSchedulerLoaded();

    await expect(backupsPage.schedulerNoRunsYetText).toBeVisible();
    // The next run row still renders normally
    await expect(backupsPage.schedulerNextRunValue).toContainText('2026');
  });

  // ─── 6e: Network failure shows the generic load-error banner ─────────────

  test('Scheduler section shows load-error banner when the status request fails', async ({
    page,
  }) => {
    // Note: BackupsPage.tsx only falls back to the generic `backups.scheduler.loadError`
    // translation for non-ApiClientError failures (e.g. a genuine network failure). An
    // HTTP error response (4xx/5xx) with a JSON error body is parsed into an ApiClientError
    // and its own `error.message` is shown verbatim instead. route.abort() simulates the
    // network-failure path so the generic loadError string is what actually renders.
    const backupsPage = new BackupsPage(page);
    await page.route('**/api/backups/scheduler-status', (route) => route.abort('failed'));

    await backupsPage.goto();
    await backupsPage.waitForSchedulerLoaded();

    await expect(backupsPage.schedulerErrorBanner).toBeVisible();
    await expect(backupsPage.schedulerErrorBanner).toContainText('Failed to load scheduler status');
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
