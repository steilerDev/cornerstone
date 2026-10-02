/**
 * Page Object Model for the Backups page (/settings/backups)
 */

import type { Page, Locator, Route } from '@playwright/test';
import { ROUTES } from '../fixtures/testData.js';
import type { BackupSchedulerStatus } from '@cornerstone/shared';

export class BackupsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly createBackupButton: Locator;
  readonly backupTable: Locator;
  readonly emptyState: Locator;
  readonly errorBanner: Locator;

  // Delete modal (conditionally rendered — use .not.toBeVisible() for absent checks)
  readonly deleteModal: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;
  readonly deleteFilenameText: Locator;
  readonly deleteWarningText: Locator;

  // Restore modal (conditionally rendered — use .not.toBeVisible() for absent checks)
  readonly restoreModal: Locator;
  readonly restoreConfirmButton: Locator;
  readonly restoreCancelButton: Locator;
  readonly restoreWarningText: Locator;

  // Scheduler status section (Scoped via aria-labelledby to avoid collisions with other
  // page content.)
  readonly schedulerSection: Locator;
  readonly schedulerHeading: Locator;
  readonly schedulerErrorBanner: Locator;
  readonly schedulerDisabledHint: Locator;
  readonly schedulerNoRunsYetText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'Backup & Restore' });
    this.createBackupButton = page.getByRole('button', { name: /Create Backup|Creating backup/i });
    this.backupTable = page.locator('table');
    this.emptyState = page.getByText('No backups yet', { exact: false });
    this.errorBanner = page.locator('[role="alert"]');

    this.schedulerSection = page.locator('section[aria-labelledby="scheduler-status-heading"]');
    this.schedulerHeading = page.locator('#scheduler-status-heading');
    this.schedulerErrorBanner = this.schedulerSection.locator('[role="alert"]');
    this.schedulerDisabledHint = this.schedulerSection.getByText(
      'Set the BACKUP_CADENCE environment variable',
      { exact: false },
    );
    this.schedulerNoRunsYetText = this.schedulerSection.getByText(
      'No automatic backups have run yet',
      { exact: false },
    );

    // Delete modal — scoped to dialog to avoid button name collisions
    this.deleteModal = page.getByRole('dialog', { name: 'Delete Backup' });
    this.deleteConfirmButton = this.deleteModal.getByRole('button', { name: /^Delete$|Deleting/i });
    this.deleteCancelButton = this.deleteModal.getByRole('button', { name: 'Cancel' });
    this.deleteFilenameText = this.deleteModal.locator('strong');
    this.deleteWarningText = this.deleteModal.getByText('This action cannot be undone', {
      exact: false,
    });

    // Restore modal — scoped to dialog
    this.restoreModal = page.getByRole('dialog', { name: 'Restore Backup' });
    this.restoreConfirmButton = this.restoreModal.getByRole('button', {
      name: /Restore & Restart|Restoring/i,
    });
    this.restoreCancelButton = this.restoreModal.getByRole('button', { name: 'Cancel' });
    this.restoreWarningText = this.restoreModal.getByText(
      'permanently replace all current application data',
      { exact: false },
    );
  }

  async goto(): Promise<void> {
    await this.page.goto(ROUTES.backups);
    // Wait for heading to confirm navigation completed and page rendered
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Wait for the page to finish loading (empty state, table, or error banner visible).
   * Races between the possible loaded states.
   */
  async waitForLoaded(): Promise<void> {
    await Promise.race([
      this.emptyState.waitFor({ state: 'visible' }),
      this.backupTable.waitFor({ state: 'visible' }),
      this.errorBanner.waitFor({ state: 'visible' }),
    ]);
  }

  async clickCreateBackup(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/api/backups') && r.request().method() === 'POST',
    );
    await this.createBackupButton.click();
    await responsePromise;
  }

  async getBackupRows(): Promise<Locator[]> {
    return this.backupTable.locator('tbody tr').all();
  }

  async clickDeleteForRow(index: number): Promise<void> {
    const rows = await this.getBackupRows();
    const row = rows[index];
    if (!row) throw new Error(`No backup row at index ${index}`);
    await row.getByRole('button', { name: 'Delete' }).click();
    await this.deleteModal.waitFor({ state: 'visible' });
  }

  async clickRestoreForRow(index: number): Promise<void> {
    const rows = await this.getBackupRows();
    const row = rows[index];
    if (!row) throw new Error(`No backup row at index ${index}`);
    await row.getByRole('button', { name: 'Restore' }).click();
    await this.restoreModal.waitFor({ state: 'visible' });
  }

  async confirmDelete(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/api/backups/') && r.request().method() === 'DELETE',
    );
    await this.deleteConfirmButton.click();
    await responsePromise;
  }

  /**
   * Locate the <dd> value cell for a scheduler status row, matched by its <dt> label text.
   * The dt/dd pair are siblings inside a single `.schedulerStatusRow` wrapper div.
   */
  private schedulerRowValue(dtLabel: string): Locator {
    return this.schedulerSection
      .locator('dt', { hasText: dtLabel })
      .locator('xpath=following-sibling::dd[1]');
  }

  /** The "Automatic backups" row value — contains the Enabled/Disabled badge. */
  get schedulerStatusValue(): Locator {
    return this.schedulerRowValue('Automatic backups');
  }

  /** The "Last scheduled run" row value — contains the timestamp + Succeeded/Failed badge,
   * or the "No automatic backups have run yet" muted text. */
  get schedulerLastRunValue(): Locator {
    return this.schedulerRowValue('Last scheduled run');
  }

  /** The "Next scheduled run" row value — contains the primary time and optional "then" text. */
  get schedulerNextRunValue(): Locator {
    return this.schedulerRowValue('Next scheduled run');
  }

  /**
   * Wait for the scheduler status section to finish loading — races between the possible
   * terminal states (status rendered or error banner).
   */
  async waitForSchedulerLoaded(): Promise<void> {
    await Promise.race([
      this.schedulerStatusValue.waitFor({ state: 'visible' }),
      this.schedulerErrorBanner.waitFor({ state: 'visible' }),
    ]);
  }

  /**
   * Mock GET /api/backups/scheduler-status.
   *
   * @param status - HTTP status code to return (200 for a normal payload, 500/503 for errors)
   * @param body - Response body. For status 200, pass a `BackupSchedulerStatus` object (it will
   *   be wrapped in `{ scheduler: ... }`). For error statuses, pass the raw error envelope.
   */
  async mockSchedulerStatus(
    status: number,
    body: BackupSchedulerStatus | { error: { code: string; message: string } },
  ): Promise<void> {
    await this.page.route('**/api/backups/scheduler-status', async (route: Route) => {
      const responseBody = status === 200 ? { scheduler: body } : body;
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(responseBody),
      });
    });
  }
}
