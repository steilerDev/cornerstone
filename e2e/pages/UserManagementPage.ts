/**
 * Page Object Model for the User Management page (/settings/users)
 */

import type { Page, Locator } from '@playwright/test';
import { ROUTES } from '../fixtures/testData.js';

interface EditUserData {
  displayName?: string;
  email?: string;
  role?: 'admin' | 'member';
}

interface CreateUserData {
  email: string;
  displayName: string;
  role?: 'admin' | 'member';
  /** Check the "Single sign-on only" box (password fields are then not rendered). */
  ssoOnly?: boolean;
  /** Used for both Password and Confirm Password when not ssoOnly. */
  password?: string;
}

export class UserManagementPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly table: Locator;
  readonly emptyState: Locator;

  // Add User button + create modal
  readonly addUserButton: Locator;
  readonly createModal: Locator;
  readonly createEmailInput: Locator;
  readonly createDisplayNameInput: Locator;
  readonly createRoleSelect: Locator;
  readonly createSsoOnlyCheckbox: Locator;
  readonly createSsoOnlyRow: Locator;
  readonly createPasswordInput: Locator;
  readonly createConfirmPasswordInput: Locator;
  readonly createSubmitButton: Locator;
  readonly createModalError: Locator;
  readonly createEmailError: Locator;
  readonly createPasswordError: Locator;
  readonly createConfirmPasswordError: Locator;

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
    // DataTable renders a search input with aria-label="Search items" and placeholder="Search..."
    this.searchInput = page.getByLabel('Search items');
    this.table = page.locator('table');
    // DataTable EmptyState has two possible messages:
    // 1. No search active: t('userManagement.emptyState') = "No users found."
    // 2. Search active (hasActiveFilters): t('dataTable.empty.filteredMessage') = "No items match the current filters"
    // Use .first() on the EmptyState component container to avoid strict mode with child elements.
    this.emptyState = page.locator('[class*="emptyState"]').first();

    // Add User button + create modal (role="dialog" labelled "Add User")
    this.addUserButton = page.getByTestId('add-user-button');
    this.createModal = page.getByRole('dialog', { name: 'Add User' });
    this.createEmailInput = page.locator('#createEmail');
    this.createDisplayNameInput = page.locator('#createDisplayName');
    this.createRoleSelect = page.locator('#createRole');
    this.createSsoOnlyCheckbox = page.locator('#createSsoOnly');
    // The checkbox is wrapped in a <label> row (44px min-height on mobile)
    this.createSsoOnlyRow = this.createSsoOnlyCheckbox.locator('xpath=ancestor::label');
    this.createPasswordInput = page.locator('#createPassword');
    this.createConfirmPasswordInput = page.locator('#createConfirmPassword');
    this.createSubmitButton = page.getByTestId('create-user-submit');
    this.createModalError = this.createModal.locator('[role="alert"]');
    this.createEmailError = page.locator('#createEmail-error');
    this.createPasswordError = page.locator('#createPassword-error');
    this.createConfirmPasswordError = page.locator('#createConfirmPassword-error');

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
    // Wait for heading and search input — on tablet the input may take longer to render
    await this.heading.waitFor({ state: 'visible' });
    await this.searchInput.waitFor({ state: 'visible' });
  }

  async openCreateModal(): Promise<void> {
    await this.addUserButton.click();
    await this.createModal.waitFor({ state: 'visible' });
  }

  /** Fills the open create modal without submitting. */
  async fillCreateForm(data: CreateUserData): Promise<void> {
    await this.createEmailInput.fill(data.email);
    await this.createDisplayNameInput.fill(data.displayName);
    if (data.role !== undefined) {
      await this.createRoleSelect.selectOption(data.role);
    }
    if (data.ssoOnly) {
      await this.createSsoOnlyCheckbox.check();
    } else if (data.password !== undefined) {
      await this.createPasswordInput.fill(data.password);
      await this.createConfirmPasswordInput.fill(data.password);
    }
  }

  /** Opens the modal, fills it, submits, and waits for the POST response and the dialog to close. */
  async createUser(data: CreateUserData): Promise<void> {
    await this.openCreateModal();
    await this.fillCreateForm(data);
    const responsePromise = this.page.waitForResponse(
      (res) => res.url().endsWith('/api/users') && res.request().method() === 'POST',
    );
    await this.createSubmitButton.click();
    await responsePromise;
    await this.createModal.waitFor({ state: 'hidden' });
  }

  /** Cell for the row with this email, in the column whose header text contains `header`. */
  async getCellByHeader(email: string, header: string): Promise<Locator> {
    await this.table.locator('thead th').first().waitFor({ state: 'visible' });
    const headers = await this.table.locator('thead th').allTextContents();
    const index = headers.findIndex((h) => h.includes(header));
    if (index === -1) {
      throw new Error(`"${header}" column is not visible`);
    }
    return this.table
      .locator('tbody tr')
      .filter({ has: this.page.getByRole('cell', { name: email, exact: true }) })
      .locator('td')
      .nth(index);
  }

  /** Auth Provider cell for the row with this email; the column is located by its header text. */
  async getAuthProviderCell(email: string): Promise<Locator> {
    return this.getCellByHeader(email, 'Auth Provider');
  }

  /** Status cell for the row with this email; the column is located by its header text. */
  async getStatusCell(email: string): Promise<Locator> {
    return this.getCellByHeader(email, 'Status');
  }

  async searchUsers(query: string): Promise<void> {
    await this.searchInput.waitFor({ state: 'visible' });
    await this.searchInput.scrollIntoViewIfNeeded();
    await this.searchInput.fill(query);
    // Search is client-side — wait for debounce to settle
    await this.page.waitForTimeout(400);
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
    // DataTable: actions are behind a ⋮ menu — open it first
    const menuButton = row.getByTestId(/^user-menu-button-/);
    await menuButton.scrollIntoViewIfNeeded();
    await menuButton.click();
    const editButton = row.getByTestId(/^user-edit-/);
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
    // DataTable: actions are behind a ⋮ menu — open it first
    const menuButton = row.getByTestId(/^user-menu-button-/);
    await menuButton.scrollIntoViewIfNeeded();
    await menuButton.click();
    const deactivateButton = row.getByTestId(/^user-deactivate-/);
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
