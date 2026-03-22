/**
 * Page Object Model for the Backups page (/settings/backups)
 */

import type { Page, Locator } from '@playwright/test';
import { ROUTES } from '../fixtures/testData.js';

export class BackupsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly createBackupButton: Locator;
  readonly backupTable: Locator;
  readonly emptyState: Locator;
  readonly notConfiguredState: Locator;
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

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'Backup & Restore' });
    this.createBackupButton = page.getByRole('button', { name: /Create Backup|Creating backup/i });
    this.backupTable = page.locator('table');
    this.emptyState = page.getByText('No backups yet', { exact: false });
    this.notConfiguredState = page.getByText('Backup is not configured', { exact: false });
    this.errorBanner = page.locator('[role="alert"]');

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
   * Wait for the page to finish loading (not-configured state, empty state, or table visible).
   * Races between the three possible loaded states.
   */
  async waitForLoaded(): Promise<void> {
    await Promise.race([
      this.notConfiguredState.waitFor({ state: 'visible' }),
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
    await rows[index].getByRole('button', { name: 'Delete' }).click();
    await this.deleteModal.waitFor({ state: 'visible' });
  }

  async clickRestoreForRow(index: number): Promise<void> {
    const rows = await this.getBackupRows();
    await rows[index].getByRole('button', { name: 'Restore' }).click();
    await this.restoreModal.waitFor({ state: 'visible' });
  }

  async confirmDelete(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/api/backups/') && r.request().method() === 'DELETE',
    );
    await this.deleteConfirmButton.click();
    await responsePromise;
  }
}
