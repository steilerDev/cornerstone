/**
 * Page Object Model for the Vendor Detail page (/budget/vendors/:id)
 *
 * The page renders:
 * - A breadcrumb navigation (Vendors / <name>)
 * - A page header with vendor name, specialty subtitle, and Edit/Delete buttons
 * - Stats cards: Total Invoices and Outstanding Balance
 * - An info card (dl/dt/dd list) with all vendor fields — read view
 * - An inline edit form inside the info card when isEditing is true
 * - An Invoices placeholder section ("coming soon")
 * - A delete confirmation modal (role="dialog", aria-labelledby="delete-modal-title")
 */

import type { Page, Locator } from '@playwright/test';

export interface EditVendorData {
  name?: string;
  specialty?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export class VendorDetailPage {
  readonly page: Page;

  // Breadcrumb
  readonly backToVendorsButton: Locator;
  readonly breadcrumbCurrent: Locator;

  // Page header
  readonly pageTitle: Locator;
  readonly editButton: Locator;
  readonly deleteButton: Locator;

  // Stats
  readonly statsGrid: Locator;
  readonly totalInvoicesStat: Locator;
  readonly outstandingBalanceStat: Locator;

  // Info card (read view)
  readonly infoCard: Locator;
  readonly infoList: Locator;

  // Edit form (shown when isEditing = true, inside the info card)
  readonly editNameInput: Locator;
  readonly editSpecialtyInput: Locator;
  readonly editPhoneInput: Locator;
  readonly editEmailInput: Locator;
  readonly editAddressInput: Locator;
  readonly editNotesInput: Locator;
  readonly saveChangesButton: Locator;
  readonly cancelEditButton: Locator;
  readonly editErrorBanner: Locator;

  // Invoices placeholder section
  readonly invoicesSection: Locator;
  readonly comingSoonText: Locator;

  // Error card (shown when vendor not found or load fails)
  readonly errorCard: Locator;

  // Delete modal
  readonly deleteModal: Locator;
  readonly deleteModalTitle: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;
  readonly deleteErrorBanner: Locator;

  constructor(page: Page) {
    this.page = page;

    // Breadcrumb
    this.backToVendorsButton = page.getByRole('button', { name: 'Vendors', exact: true });
    this.breadcrumbCurrent = page.locator('[class*="breadcrumbCurrent"]');

    // Page header
    this.pageTitle = page.getByRole('heading', { level: 1 });
    this.editButton = page.getByRole('button', { name: 'Edit', exact: true });
    this.deleteButton = page.getByRole('button', { name: 'Delete', exact: true });

    // Stats grid
    this.statsGrid = page.locator('[class*="statsGrid"]');
    this.totalInvoicesStat = this.statsGrid
      .locator('[class*="statCard"]')
      .filter({ hasText: /Total Invoices/ });
    this.outstandingBalanceStat = this.statsGrid
      .locator('[class*="statCard"]')
      .filter({ hasText: /Outstanding Balance/ });

    // Info card
    this.infoCard = page
      .getByRole('region')
      .filter({ has: page.getByRole('heading', { name: 'Vendor Information' }) });
    this.infoList = this.infoCard.locator('dl');

    // Edit form inputs (inside the info card's form)
    this.editNameInput = page.locator('#edit-name');
    this.editSpecialtyInput = page.locator('#edit-specialty');
    this.editPhoneInput = page.locator('#edit-phone');
    this.editEmailInput = page.locator('#edit-email');
    this.editAddressInput = page.locator('#edit-address');
    this.editNotesInput = page.locator('#edit-notes');
    this.saveChangesButton = page.getByRole('button', { name: /Save Changes|Saving\.\.\./ });
    this.cancelEditButton = page.getByRole('button', { name: 'Cancel', exact: true });
    this.editErrorBanner = page.locator('[class*="form"]').locator('[role="alert"]');

    // Invoices placeholder
    this.invoicesSection = page.getByRole('region').filter({
      has: page.getByRole('heading', { name: 'Invoices', exact: true }),
    });
    this.comingSoonText = this.invoicesSection.locator('[class*="comingSoon"]');

    // Error card (load failure / not found)
    this.errorCard = page.locator('[class*="errorCard"]', { has: page.locator('[role="alert"]') });

    // Delete modal
    this.deleteModal = page.getByRole('dialog', { name: 'Delete Vendor' });
    this.deleteModalTitle = page.locator('#delete-modal-title');
    this.deleteConfirmButton = this.deleteModal.getByRole('button', {
      name: /Delete Vendor|Deleting\.\.\./,
    });
    this.deleteCancelButton = this.deleteModal.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    this.deleteErrorBanner = this.deleteModal.locator('[role="alert"]');
  }

  async goto(vendorId: string): Promise<void> {
    await this.page.goto(`/budget/vendors/${vendorId}`);
    await this.pageTitle.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Navigate back to the vendors list using the breadcrumb button.
   */
  async goBackToVendors(): Promise<void> {
    await this.backToVendorsButton.click();
    await this.page.waitForURL('/budget/vendors', { timeout: 5000 });
  }

  /**
   * Start editing the vendor by clicking the "Edit" button.
   */
  async startEdit(): Promise<void> {
    await this.editButton.click();
    await this.editNameInput.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Fill the edit form fields. Only provided fields are updated.
   */
  async fillEditForm(data: EditVendorData): Promise<void> {
    if (data.name !== undefined) {
      await this.editNameInput.fill(data.name);
    }
    if (data.specialty !== undefined) {
      await this.editSpecialtyInput.fill(data.specialty);
    }
    if (data.phone !== undefined) {
      await this.editPhoneInput.fill(data.phone);
    }
    if (data.email !== undefined) {
      await this.editEmailInput.fill(data.email);
    }
    if (data.address !== undefined) {
      await this.editAddressInput.fill(data.address);
    }
    if (data.notes !== undefined) {
      await this.editNotesInput.fill(data.notes);
    }
  }

  /**
   * Submit the edit form by clicking "Save Changes".
   * Waits for the edit form to close (editNameInput becomes hidden).
   */
  async saveEdit(): Promise<void> {
    await this.saveChangesButton.click();
    await this.editNameInput.waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Cancel editing without saving.
   */
  async cancelEdit(): Promise<void> {
    await this.cancelEditButton.click();
    await this.editNameInput.waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Open the delete confirmation modal.
   */
  async openDeleteModal(): Promise<void> {
    await this.deleteButton.click();
    await this.deleteModal.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Confirm deletion in the modal. The page navigates away to /budget/vendors on success.
   */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
  }

  /**
   * Cancel the delete modal.
   */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Read all field values from the info card's dl/dt/dd list.
   * Returns an object with the label texts as keys and value texts as values.
   */
  async getInfoFields(): Promise<Record<string, string>> {
    const rows = await this.infoList.locator('[class*="infoRow"]').all();
    const fields: Record<string, string> = {};
    for (const row of rows) {
      const label = await row.locator('dt').textContent();
      const value = await row.locator('dd').textContent();
      if (label) {
        fields[label.trim()] = (value ?? '').trim();
      }
    }
    return fields;
  }

  /**
   * Get the stat value displayed in the Total Invoices stat card.
   */
  async getTotalInvoices(): Promise<string | null> {
    const value = this.totalInvoicesStat.locator('[class*="statValue"]');
    return value.textContent();
  }

  /**
   * Get the stat value displayed in the Outstanding Balance stat card.
   */
  async getOutstandingBalance(): Promise<string | null> {
    const value = this.outstandingBalanceStat.locator('[class*="statValue"]');
    return value.textContent();
  }

  /**
   * Get the delete error banner text from the modal, or null if not visible.
   */
  async getDeleteErrorText(): Promise<string | null> {
    try {
      await this.deleteErrorBanner.waitFor({ state: 'visible', timeout: 5000 });
      return await this.deleteErrorBanner.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Get the edit error banner text from the edit form, or null if not visible.
   */
  async getEditErrorText(): Promise<string | null> {
    try {
      await this.editErrorBanner.waitFor({ state: 'visible', timeout: 5000 });
      return await this.editErrorBanner.textContent();
    } catch {
      return null;
    }
  }
}
