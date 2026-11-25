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
  /** Choose Sign-in method "Single sign-on" (password fields are then not rendered). */
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

  // New user button + create dialog (ObjectForm over `useUserFormSchema`, #2256)
  readonly addUserButton: Locator;
  readonly createModal: Locator;
  readonly createEmailInput: Locator;
  readonly createDisplayNameInput: Locator;
  readonly createRoleSelect: Locator;
  /** "Sign-in method" select (Password / Single sign-on); only rendered when OIDC is on. */
  readonly createAuthProviderSelect: Locator;
  readonly createPasswordInput: Locator;
  readonly createConfirmPasswordInput: Locator;
  readonly createSubmitButton: Locator;
  readonly createCancelButton: Locator;
  readonly createModalError: Locator;
  readonly createDisplayNameError: Locator;
  readonly createEmailError: Locator;
  readonly createPasswordError: Locator;
  readonly createConfirmPasswordError: Locator;

  // Edit dialog (same form, edit scope: Display name, Email, Role)
  readonly editModal: Locator;
  readonly editModalHeading: Locator;
  readonly editModalCloseButton: Locator;
  readonly editDisplayNameInput: Locator;
  readonly editEmailInput: Locator;
  readonly editRoleSelect: Locator;
  readonly editCancelButton: Locator;
  readonly editSaveButton: Locator;
  readonly editModalError: Locator;
  readonly editDisplayNameError: Locator;
  readonly editEmailError: Locator;

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
    this.heading = page.getByRole('heading', { level: 1, name: 'Users', exact: true });
    // DataTable renders a search input with aria-label="Search items" and placeholder="Search..."
    this.searchInput = page.getByLabel('Search this list');
    this.table = page.locator('table');
    // DataTable EmptyState has two possible messages:
    // 1. No search active: t('userManagement.emptyState') = "No users found."
    // 2. Search active (hasActiveFilters): t('dataTable.empty.filteredMessage') = "Nothing matches the current filters"
    // Use .first() on the EmptyState component container to avoid strict mode with child elements.
    this.emptyState = page.locator('[class*="emptyState"]').first();

    // New user button + create dialog (role="dialog" named by its title). The form root carries
    // `user-form`; field ids are the API field names; errors are `#<name>-error`.
    this.addUserButton = page.getByTestId('add-user-button');
    this.createModal = page.getByRole('dialog', { name: 'New user', exact: true });
    this.createEmailInput = this.createModal.locator('#email');
    this.createDisplayNameInput = this.createModal.locator('#displayName');
    this.createRoleSelect = this.createModal.locator('#role');
    this.createAuthProviderSelect = this.createModal.locator('#authProvider');
    this.createPasswordInput = this.createModal.locator('#password');
    this.createConfirmPasswordInput = this.createModal.locator('#confirmPassword');
    this.createSubmitButton = this.createModal.getByTestId('user-form-save');
    this.createCancelButton = this.createModal.getByTestId('user-form-cancel');
    this.createModalError = this.createModal.getByRole('alert');
    this.createDisplayNameError = this.createModal.locator('#displayName-error');
    this.createEmailError = this.createModal.locator('#email-error');
    this.createPasswordError = this.createModal.locator('#password-error');
    this.createConfirmPasswordError = this.createModal.locator('#confirmPassword-error');

    this.editModal = page.getByRole('dialog', { name: 'Edit user', exact: true });
    this.editModalHeading = this.editModal.getByRole('heading', { level: 2, name: 'Edit user' });
    this.editModalCloseButton = this.editModal.getByRole('button', { name: 'Close dialog' });
    this.editDisplayNameInput = this.editModal.locator('#displayName');
    this.editEmailInput = this.editModal.locator('#email');
    this.editRoleSelect = this.editModal.locator('#role');
    this.editCancelButton = this.editModal.getByTestId('user-form-cancel');
    this.editSaveButton = this.editModal.getByTestId('user-form-save');
    this.editModalError = this.editModal.getByRole('alert');
    this.editDisplayNameError = this.editModal.locator('#displayName-error');
    this.editEmailError = this.editModal.locator('#email-error');

    // Deactivate dialog: the shared ConfirmDialog (role="alertdialog", #2209),
    // title "Deactivate <name>?", testid prefix user-deactivate
    this.deactivateModal = page
      .getByRole('alertdialog')
      .filter({ has: page.getByTestId('user-deactivate-cancel') });
    this.deactivateModalHeading = this.deactivateModal.getByRole('heading', { level: 2 });
    this.deactivateModalCloseButton = this.deactivateModal.getByRole('button', { name: 'Close' });
    this.deactivateConfirmationText = this.deactivateModal.getByText(/sessions are terminated/);
    this.deactivateCancelButton = this.deactivateModal.getByTestId('user-deactivate-cancel');
    this.deactivateButton = this.deactivateModal.getByTestId('user-deactivate-confirm');
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
      await this.createAuthProviderSelect.selectOption('oidc');
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

  /**
   * The visible rendering of this user: the table row (>= 768px) or the mobile card. DataTable
   * mounts both and hides one with CSS, so the scope keeps only the visible one.
   */
  rowScope(email: string): Locator {
    const tableRow = this.table.locator('tbody tr').filter({ hasText: email });
    const card = this.page.locator('[class*="cardHeader"]').filter({ hasText: email });
    return tableRow.or(card).filter({ visible: true });
  }

  /** The row menu trigger ("Actions for ‹name›") of the visible rendering. */
  rowMenuTrigger(email: string): Locator {
    return this.rowScope(email).getByTestId(/^user-menu-button-/);
  }

  /** The open row menu. OverflowMenu portals it to <body>, so it is never inside the row. */
  get rowMenu(): Locator {
    return this.page.getByRole('menu');
  }

  /** An item of the open row menu, by its visible name. */
  menuItem(name: string): Locator {
    return this.rowMenu.getByRole('menuitem', { name, exact: true });
  }

  /** Opens the row menu with a click and waits for it. */
  async openRowMenu(email: string): Promise<void> {
    const trigger = this.rowMenuTrigger(email);
    await trigger.waitFor({ state: 'visible' });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await this.rowMenu.waitFor({ state: 'visible' });
  }

  /** Status cell of the visible rendering (table cell, or the card's Status row). */
  statusCell(email: string): Locator {
    // Status is the last data column; the actions menu column follows it
    const tableCell = this.table
      .locator('tbody tr')
      .filter({ hasText: email })
      .locator('td:nth-last-child(2)');
    const cardValue = this.page
      .locator('[class*="cardHeader"]')
      .filter({ hasText: email })
      .locator('[class*="cardRow"]')
      .filter({ hasText: 'Status' })
      .locator('[class*="cardValue"]');
    return tableCell.or(cardValue).filter({ visible: true });
  }

  /** The "Until …" line under a locked badge. */
  lockedUntilText(email: string): Locator {
    return this.statusCell(email).getByText(/^Until /);
  }

  /**
   * Status column filter (table only; the phone card list has no column headers): opens the
   * popover, ticks `label` and closes it again.
   */
  async filterStatus(label: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Filter by Status' }).click();
    const option = this.page.getByRole('checkbox', { name: label, exact: true });
    await option.waitFor({ state: 'visible' });
    await option.check();
    await this.page.keyboard.press('Escape');
    await option.waitFor({ state: 'hidden' });
  }

  /** Sorts by the Status column (table only). */
  async sortByStatus(): Promise<void> {
    await this.table.locator('thead th').filter({ hasText: 'Status' }).click();
  }

  /** Opens the row menu and clicks Unlock (the caller asserts the toast). */
  async unlock(email: string): Promise<void> {
    await this.openRowMenu(email);
    await this.menuItem('Unlock').click();
  }

  async openEditModal(email: string): Promise<void> {
    await this.openRowMenu(email);
    await this.menuItem('Edit').click();
    await this.editModalHeading.waitFor({ state: 'visible' });
  }

  /** Fills the open edit dialog and clicks Save (the caller asserts the outcome). */
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
    await this.openRowMenu(email);
    await this.menuItem('Deactivate').click();
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
