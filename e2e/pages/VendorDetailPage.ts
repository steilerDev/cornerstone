/**
 * Page Object Model for the Vendor Detail page (/settings/vendors/:id)
 *
 * Vendors moved from Budget section to Settings section in Story #1283.
 * Legacy route /budget/vendors/:id redirects to /settings/vendors/:id via React Router.
 *
 * The page renders:
 * - A back button navigation ("← Back to Vendors")
 * - A page header with vendor name, trade subtitle (EPIC-18), and Edit/Delete buttons
 * - Stats cards: Total Invoices and Outstanding Balance
 * - An info card (dl/dt/dd list) with all vendor fields — read view
 * - An inline edit form inside the info card when isEditing is true
 * - A Contacts section with add/edit/delete contact modals
 * - An Invoices placeholder section ("coming soon")
 * - A delete confirmation modal (role="dialog", aria-labelledby="delete-modal-title")
 */

import type { Page, Locator } from '@playwright/test';

export interface EditVendorData {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export class VendorDetailPage {
  readonly page: Page;

  // Navigation
  readonly backToVendorsButton: Locator;

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
  readonly editPhoneInput: Locator;
  readonly editEmailInput: Locator;
  readonly editAddressInput: Locator;
  readonly editNotesInput: Locator;
  readonly saveChangesButton: Locator;
  readonly cancelEditButton: Locator;
  readonly editErrorBanner: Locator;

  // Contacts section
  readonly contactsSection: Locator;
  readonly addContactButton: Locator;
  readonly contactsList: Locator;
  readonly contactsEmptyState: Locator;

  // Contact create modal
  readonly createContactModal: Locator;
  readonly createContactFirstNameInput: Locator;
  readonly createContactLastNameInput: Locator;
  readonly createContactRoleInput: Locator;
  readonly createContactPhoneInput: Locator;
  readonly createContactEmailInput: Locator;
  readonly createContactNotesInput: Locator;
  readonly createContactSubmitButton: Locator;
  readonly createContactCancelButton: Locator;
  readonly createContactErrorBanner: Locator;

  // Contact edit modal
  readonly editContactModal: Locator;
  readonly editContactFirstNameInput: Locator;
  readonly editContactLastNameInput: Locator;
  readonly editContactRoleInput: Locator;
  readonly editContactPhoneInput: Locator;
  readonly editContactEmailInput: Locator;
  readonly editContactNotesInput: Locator;
  readonly editContactSubmitButton: Locator;
  readonly editContactCancelButton: Locator;
  readonly editContactErrorBanner: Locator;

  // Invoices section
  readonly invoicesSection: Locator;
  readonly invoicesEmptyState: Locator;

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

    // Navigation — back button replaces breadcrumb
    this.backToVendorsButton = page.getByRole('button', { name: /back to vendors/i });

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

    // Info card — <section> without aria-label has no implicit 'region' role,
    // so we use locator('section').filter() instead of getByRole('region')
    this.infoCard = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Vendor Information' }) });
    this.infoList = this.infoCard.locator('dl');

    // Edit form inputs (inside the info card's form)
    this.editNameInput = page.locator('#edit-name');
    this.editPhoneInput = page.locator('#edit-phone');
    this.editEmailInput = page.locator('#edit-email');
    this.editAddressInput = page.locator('#edit-address');
    this.editNotesInput = page.locator('#edit-notes');
    this.saveChangesButton = page.getByRole('button', { name: /Save Changes|Saving\.\.\./ });
    this.cancelEditButton = page.getByRole('button', { name: 'Cancel', exact: true });
    this.editErrorBanner = page.locator('[class*="form"]').locator('[role="alert"]');

    // Contacts section — <section> rendered by VendorContactsSection
    this.contactsSection = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Contacts', exact: true }),
    });
    this.addContactButton = this.contactsSection.getByRole('button', {
      name: 'Add Contact',
      exact: true,
    });
    this.contactsList = this.contactsSection.locator('[class*="contactsList"]');
    // EmptyState uses a shared CSS module class; use text match for robustness
    this.contactsEmptyState = this.contactsSection.getByText('No contacts added yet.');

    // Contact create modal — opened via "Add Contact" button
    this.createContactModal = page.getByRole('dialog', { name: 'Add Contact' });
    this.createContactFirstNameInput = page.locator('#create-firstName');
    this.createContactLastNameInput = page.locator('#create-lastName');
    this.createContactRoleInput = page.locator('#create-role');
    this.createContactPhoneInput = page.locator('#create-phone');
    this.createContactEmailInput = page.locator('#create-email');
    this.createContactNotesInput = page.locator('#create-notes');
    this.createContactSubmitButton = page.getByRole('button', {
      name: /Create Contact|Creating\.\.\./,
    });
    this.createContactCancelButton = this.createContactModal.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    this.createContactErrorBanner = this.createContactModal.locator('[role="alert"]');

    // Contact edit modal — opened via "Edit Contact" button on a contact card
    this.editContactModal = page.getByRole('dialog', { name: 'Edit Contact' });
    this.editContactFirstNameInput = page.locator('#edit-firstName');
    this.editContactLastNameInput = page.locator('#edit-lastName');
    this.editContactRoleInput = page.locator('#edit-role');
    this.editContactPhoneInput = page.locator('#edit-phone');
    this.editContactEmailInput = page.locator('#edit-email');
    this.editContactNotesInput = page.locator('#edit-notes');
    this.editContactSubmitButton = page.getByRole('button', {
      name: /Save Changes|Saving\.\.\./,
    });
    this.editContactCancelButton = this.editContactModal.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    this.editContactErrorBanner = this.editContactModal.locator('[role="alert"]');

    // Invoices section — <section> without aria-label has no implicit 'region' role
    this.invoicesSection = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Invoices', exact: true }),
    });
    this.invoicesEmptyState = this.invoicesSection.getByText('No invoices yet.');

    // Error card (load failure / not found) — role="alert" is on the element itself,
    // not a descendant, so use a combined CSS selector instead of { has: ... }
    this.errorCard = page.locator('[class*="errorCard"][role="alert"]');

    // Delete modal
    this.deleteModal = page.getByRole('dialog', { name: 'Delete Vendor' });
    this.deleteModalTitle = page.locator('#delete-modal-title');
    // The delete button text is hardcoded "Delete Vendor" / "Deleting..." in VendorDetailPage.tsx
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
    await this.page.goto(`/settings/vendors/${vendorId}`);
    await this.pageTitle.waitFor({ state: 'visible' });
  }

  /**
   * Navigate back to the vendors list using the back button.
   */
  async goBackToVendors(): Promise<void> {
    await this.backToVendorsButton.click();
    await this.page.waitForURL('**/settings/vendors');
  }

  /**
   * Start editing the vendor by clicking the "Edit" button.
   */
  async startEdit(): Promise<void> {
    await this.editButton.click();
    await this.editNameInput.waitFor({ state: 'visible' });
  }

  /**
   * Fill the edit form fields. Only provided fields are updated.
   */
  async fillEditForm(data: EditVendorData): Promise<void> {
    if (data.name !== undefined) {
      await this.editNameInput.fill(data.name);
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
    await this.editNameInput.waitFor({ state: 'hidden' });
  }

  /**
   * Cancel editing without saving.
   */
  async cancelEdit(): Promise<void> {
    await this.cancelEditButton.click();
    await this.editNameInput.waitFor({ state: 'hidden' });
  }

  /**
   * Open the delete confirmation modal.
   */
  async openDeleteModal(): Promise<void> {
    await this.deleteButton.click();
    await this.deleteModal.waitFor({ state: 'visible' });
  }

  /**
   * Confirm deletion in the modal. The page navigates away to /settings/vendors on success.
   */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
  }

  /**
   * Cancel the delete modal.
   */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden' });
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
      await this.deleteErrorBanner.waitFor({ state: 'visible' });
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
      await this.editErrorBanner.waitFor({ state: 'visible' });
      return await this.editErrorBanner.textContent();
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Contacts helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns all contact cards currently visible in the contacts list.
   * Each entry contains the name text and optional role text.
   */
  async getContactItems(): Promise<{ name: string; role: string | null }[]> {
    const cards = await this.contactsList.locator('[class*="contactCard"]').all();
    const results: { name: string; role: string | null }[] = [];
    for (const card of cards) {
      const name = (await card.locator('[class*="contactName"]').textContent()) ?? '';
      const roleLocator = card.locator('[class*="contactRole"]');
      const roleVisible = await roleLocator.isVisible();
      const role = roleVisible ? ((await roleLocator.textContent()) ?? null) : null;
      results.push({ name: name.trim(), role: role?.trim() ?? null });
    }
    return results;
  }

  /**
   * Open the "Add Contact" modal by clicking the "Add Contact" button.
   * Waits for the modal to be visible.
   */
  async openAddContactModal(): Promise<void> {
    await this.addContactButton.click();
    await this.createContactModal.waitFor({ state: 'visible' });
  }

  /**
   * Fill the contact create/edit form. Only provided fields are written.
   * Uses the create-* IDs when the create modal is open; callers must ensure
   * the correct modal is visible before calling.
   */
  async fillCreateContactForm(data: {
    firstName?: string;
    lastName?: string;
    role?: string;
    phone?: string;
    email?: string;
    notes?: string;
  }): Promise<void> {
    if (data.firstName !== undefined) {
      await this.createContactFirstNameInput.fill(data.firstName);
    }
    if (data.lastName !== undefined) {
      await this.createContactLastNameInput.fill(data.lastName);
    }
    if (data.role !== undefined) {
      await this.createContactRoleInput.fill(data.role);
    }
    if (data.phone !== undefined) {
      await this.createContactPhoneInput.fill(data.phone);
    }
    if (data.email !== undefined) {
      await this.createContactEmailInput.fill(data.email);
    }
    if (data.notes !== undefined) {
      await this.createContactNotesInput.fill(data.notes);
    }
  }

  /**
   * Submit the create contact form and wait for the modal to close.
   * Registers a waitForResponse on POST /api/vendors/.../contacts before clicking.
   */
  async submitCreateContact(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/contacts') && r.request().method() === 'POST',
    );
    await this.createContactSubmitButton.click();
    await responsePromise;
    await this.createContactModal.waitFor({ state: 'hidden' });
  }

  /**
   * Open the edit modal for the contact with the given name.
   * Clicks the "Edit Contact" button on the matching contact card.
   */
  async openEditContactModal(contactName: string): Promise<void> {
    const card = this.contactsList
      .locator('[class*="contactCard"]')
      .filter({ has: this.page.locator('[class*="contactName"]', { hasText: contactName }) });
    // aria-label is "Edit Contact <name>" (includes contact name), so omit exact:true
    await card.getByRole('button', { name: 'Edit Contact' }).click();
    await this.editContactModal.waitFor({ state: 'visible' });
  }

  /**
   * Fill the edit contact form fields. Only provided fields are written.
   */
  async fillEditContactForm(data: {
    firstName?: string;
    lastName?: string;
    role?: string;
    phone?: string;
    email?: string;
    notes?: string;
  }): Promise<void> {
    if (data.firstName !== undefined) {
      await this.editContactFirstNameInput.clear();
      await this.editContactFirstNameInput.fill(data.firstName);
    }
    if (data.lastName !== undefined) {
      await this.editContactLastNameInput.clear();
      await this.editContactLastNameInput.fill(data.lastName);
    }
    if (data.role !== undefined) {
      await this.editContactRoleInput.fill(data.role);
    }
    if (data.phone !== undefined) {
      await this.editContactPhoneInput.fill(data.phone);
    }
    if (data.email !== undefined) {
      await this.editContactEmailInput.fill(data.email);
    }
    if (data.notes !== undefined) {
      await this.editContactNotesInput.fill(data.notes);
    }
  }

  /**
   * Submit the edit contact form. Registers a waitForResponse on PATCH before clicking.
   */
  async submitEditContact(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/contacts/') && r.request().method() === 'PATCH',
    );
    await this.editContactSubmitButton.click();
    await responsePromise;
    await this.editContactModal.waitFor({ state: 'hidden' });
  }

  /**
   * Delete the contact with the given name by clicking its "Delete Contact" button
   * and confirming the browser dialog.
   */
  async deleteContactByName(contactName: string): Promise<void> {
    const card = this.contactsList
      .locator('[class*="contactCard"]')
      .filter({ has: this.page.locator('[class*="contactName"]', { hasText: contactName }) });

    // The delete uses window.confirm — accept it before clicking
    this.page.once('dialog', (dialog) => void dialog.accept());
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/contacts/') && r.request().method() === 'DELETE',
    );
    // aria-label is "Delete Contact <name>" (includes contact name), so omit exact:true
    await card.getByRole('button', { name: 'Delete Contact' }).click();
    await responsePromise;
  }
}
