/**
 * Page Object Model for the User Management page (/admin/users)
 */

import type { Page, Locator } from '@playwright/test';
import { ROUTES } from '../fixtures/testData.js';

interface EditUserData {
  displayName?: string;
  email?: string;
  role?: 'admin' | 'member';
}

export class UserManagementPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly table: Locator;
  readonly emptyState: Locator;

  // Edit modal
  readonly editModal: Locator;
  readonly editModalHeading: Locator;
  readonly editModalCloseButton: Locator;
  readonly editDisplayNameInput: Locator;
  readonly editEmailInput: Locator;
  readonly editRoleSelect: Locator;
  readonly editCancelButton: Locator;
  readonly editSaveButton: Locator;
  readonly editModalError: Locator;

  // Deactivate modal
  readonly deactivateModal: Locator;
  readonly deactivateModalHeading: Locator;
  readonly deactivateModalCloseButton: Locator;
  readonly deactivateConfirmationText: Locator;
  readonly deactivateCancelButton: Locator;
  readonly deactivateButton: Locator;
  readonly deactivateModalError: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'User Management' });
    this.searchInput = page.getByPlaceholder('Search by name or email...');
    this.table = page.locator('table');
    this.emptyState = page.getByText(/No users found/);

    // Edit modal (uses role="dialog" with aria-label)
    this.editModal = page.getByRole('dialog', { name: 'Edit User' });
    this.editModalHeading = this.editModal.getByRole('heading', { level: 2, name: 'Edit User' });
    this.editModalCloseButton = this.editModal.getByRole('button', { name: 'Close' });
    this.editDisplayNameInput = page.locator('#editDisplayName');
    this.editEmailInput = page.locator('#editEmail');
    this.editRoleSelect = page.locator('#editRole');
    this.editCancelButton = this.editModal.getByRole('button', { name: 'Cancel' });
    this.editSaveButton = this.editModal.getByRole('button', { name: /Save Changes|Saving/ });
    this.editModalError = this.editModal.locator('[role="alert"]');

    // Deactivate modal (uses role="dialog" with aria-label)
    this.deactivateModal = page.getByRole('dialog', { name: 'Deactivate User' });
    this.deactivateModalHeading = this.deactivateModal.getByRole('heading', {
      level: 2,
      name: 'Deactivate User',
    });
    this.deactivateModalCloseButton = this.deactivateModal.getByRole('button', { name: 'Close' });
    this.deactivateConfirmationText = this.deactivateModal.getByText(/Are you sure/);
    this.deactivateCancelButton = this.deactivateModal.getByRole('button', { name: 'Cancel' });
    this.deactivateButton = this.deactivateModal.getByRole('button', {
      name: /Deactivate|Deactivating/,
    });
    this.deactivateModalError = this.deactivateModal.locator('[role="alert"]');
  }

  async goto(): Promise<void> {
    await this.page.goto(ROUTES.userManagement);
  }

  async searchUsers(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.page.waitForResponse(
      (resp) => resp.url().includes('/api/users') && resp.status() === 200,
    );
  }

  async getUserRows(): Promise<Locator[]> {
    return await this.table.locator('tbody tr').all();
  }

  async getUserRow(email: string): Promise<Locator | null> {
    // Wait for table data to load
    await this.table.locator('tbody tr').first().waitFor({ state: 'visible' });
    const rows = await this.getUserRows();
    for (const row of rows) {
      const rowEmail = await row.locator('td').nth(1).textContent();
      if (rowEmail === email) {
        return row;
      }
    }
    return null;
  }

  async openEditModal(email: string): Promise<void> {
    const row = await this.getUserRow(email);
    if (!row) {
      throw new Error(`User with email ${email} not found`);
    }
    const editButton = row.getByRole('button', { name: 'Edit' });
    await editButton.scrollIntoViewIfNeeded();
    await editButton.click();
    await this.editModalHeading.waitFor({ state: 'visible' });
  }

  async editUser(data: EditUserData): Promise<void> {
    if (data.displayName !== undefined) {
      await this.editDisplayNameInput.fill(data.displayName);
    }
    if (data.email !== undefined) {
      await this.editEmailInput.fill(data.email);
    }
    if (data.role !== undefined) {
      await this.editRoleSelect.selectOption(data.role);
    }
    await this.editSaveButton.click();
  }

  async closeEditModal(): Promise<void> {
    await this.editModalCloseButton.click();
  }

  async openDeactivateModal(email: string): Promise<void> {
    const row = await this.getUserRow(email);
    if (!row) {
      throw new Error(`User with email ${email} not found`);
    }
    const deactivateButton = row.getByRole('button', { name: 'Deactivate' });
    await deactivateButton.scrollIntoViewIfNeeded();
    await deactivateButton.click();
    await this.deactivateModalHeading.waitFor({ state: 'visible' });
  }

  async confirmDeactivate(): Promise<void> {
    await this.deactivateButton.click();
  }

  async closeDeactivateModal(): Promise<void> {
    await this.deactivateModalCloseButton.click();
  }

  async getEmptyState(): Promise<string | null> {
    const isVisible = await this.emptyState.isVisible();
    return isVisible ? await this.emptyState.textContent() : null;
  }

  async getEditModalError(): Promise<string | null> {
    try {
      await this.editModalError.waitFor({ state: 'visible' });
      return await this.editModalError.textContent();
    } catch {
      return null;
    }
  }

  async getDeactivateModalError(): Promise<string | null> {
    try {
      await this.deactivateModalError.waitFor({ state: 'visible' });
      return await this.deactivateModalError.textContent();
    } catch {
      return null;
    }
  }
}
