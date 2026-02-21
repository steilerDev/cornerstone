/**
 * Page Object Model for the Tag Management page (/tags)
 *
 * The page renders:
 * - An h1 "Tag Management" heading
 * - A success banner (role="alert") for successful operations
 * - An error banner (role="alert") for global errors (e.g., load failure, delete error)
 * - A "Create New Tag" card with name input, color input, preview row, and submit button
 * - An "Existing Tags (N)" card with a list of tag rows
 *   - Display mode: TagPill + "Edit" / "Delete" text buttons (no aria-labels)
 *   - Edit mode: Inline form with text/color inputs and "Save" / "Cancel" buttons
 * - A delete confirmation modal (role="dialog" aria-modal="true")
 *   - h2 "Delete Tag"
 *   - "Cancel" and "Delete Tag" buttons
 *
 * Note: The delete modal does NOT use aria-labelledby, so getByRole('dialog', { name })
 * is not usable. The modal is located by [role="dialog"][aria-modal="true"] instead.
 *
 * Note: Edit/Delete buttons in tag rows have no aria-labels — they are plain "Edit" /
 * "Delete" text buttons scoped inside the relevant .tagRow element.
 */

import type { Page, Locator } from '@playwright/test';

export const TAG_MANAGEMENT_ROUTE = '/tags';

export class TagManagementPage {
  readonly page: Page;

  // Page header
  readonly heading: Locator;

  // Global banners (outside create form / modal)
  readonly successBanner: Locator;
  readonly errorBanner: Locator;

  // Create form (always visible on the page)
  readonly createTagNameInput: Locator;
  readonly createTagColorInput: Locator;
  readonly createTagButton: Locator;
  readonly previewRow: Locator;
  readonly createErrorBanner: Locator;

  // Existing tags section
  readonly existingTagsHeading: Locator;
  readonly emptyState: Locator;
  readonly tagsList: Locator;

  // Delete confirmation modal
  readonly deleteModal: Locator;
  readonly deleteModalTitle: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page heading
    this.heading = page.getByRole('heading', { level: 1, name: 'Tag Management', exact: true });

    // Success banner — the top-level success alert that appears between h1 and the cards.
    // Filter by "successfully" to distinguish from create/update error banners.
    this.successBanner = page
      .locator('[role="alert"]')
      .filter({ hasText: /successfully/i })
      .first();

    // Global error banner — appears when a load or delete error occurs.
    // Scoped outside the create section by filtering to top-level alerts.
    // The create form error is a sibling inside the card; the global error is above all cards.
    this.errorBanner = page
      .locator('[role="alert"]')
      .filter({ hasText: /failed to load|failed to delete/i })
      .first();

    // Create form inputs — identified by their id attributes
    this.createTagNameInput = page.locator('#tagName');
    this.createTagColorInput = page.locator('#tagColor');

    // Submit button — text changes between "Create Tag" and "Creating..."
    this.createTagButton = page.getByRole('button', { name: /Create Tag|Creating\.\.\./ });

    // Preview row — always rendered below the form fields
    this.previewRow = page.locator('[class*="previewRow"]');

    // Create error banner — the alert inside the create card (before the form)
    // Using a broad alert filter here; if the create form card is needed we rely on
    // the fact that a duplicate-name error only appears in the create section.
    this.createErrorBanner = page
      .locator('[role="alert"]')
      .filter({ hasText: /already exists|tag name is required|50 characters/i })
      .first();

    // Existing tags section
    this.existingTagsHeading = page.getByRole('heading', { level: 2, name: /Existing Tags/ });
    this.emptyState = page.locator('[class*="emptyState"]');
    this.tagsList = page.locator('[class*="tagsList"]');

    // Delete modal — the modal has role="dialog" aria-modal="true" but no aria-labelledby.
    // Locate by attribute selector.
    this.deleteModal = page.locator('[role="dialog"][aria-modal="true"]');
    this.deleteModalTitle = this.deleteModal.getByRole('heading', {
      level: 2,
      name: 'Delete Tag',
      exact: true,
    });
    // Confirm button text alternates between "Delete Tag" and "Deleting..."
    this.deleteConfirmButton = this.deleteModal.getByRole('button', {
      name: /Delete Tag|Deleting\.\.\./,
    });
    this.deleteCancelButton = this.deleteModal.getByRole('button', { name: 'Cancel', exact: true });
  }

  /**
   * Navigate to the Tag Management page and wait for the heading to be visible.
   */
  async goto(): Promise<void> {
    await this.page.goto(TAG_MANAGEMENT_ROUTE);
    await this.heading.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Fill the create tag form and submit it.
   * If color is omitted the default blue (#3b82f6) is used.
   */
  async createTag(name: string, color?: string): Promise<void> {
    await this.createTagNameInput.fill(name);
    if (color !== undefined) {
      await this.createTagColorInput.fill(color);
    }
    await this.createTagButton.click();
  }

  /**
   * Get all tag names currently displayed in the existing tags list.
   * Returns names in display order (alphabetical, as sorted by the component).
   */
  async getTagNames(): Promise<string[]> {
    // Each tag row in display mode contains a TagPill element whose text is the tag name.
    // The TagPill renders as a <span> with the name text inside a .tagRow.
    // We read the text from each .tagRow and strip button labels ("Edit", "Delete").
    const rows = await this.tagsList.locator('[class*="tagRow"]').all();
    const names: string[] = [];
    for (const row of rows) {
      // In display mode the tag name is inside a <span> within the TagPill component.
      // TagPill renders as: <span class="...pill..."><span class="...dot..."></span>name</span>
      // Use the tagInfo div to get only the display-mode name, not edit inputs.
      const tagInfo = row.locator('[class*="tagInfo"]');
      const infoCount = await tagInfo.count();
      if (infoCount > 0) {
        const text = await tagInfo.textContent();
        if (text?.trim()) names.push(text.trim());
      }
    }
    return names;
  }

  /**
   * Find the tag row element for a tag with the given name.
   * Returns null if no such row is found in display mode.
   */
  async getTagRow(tagName: string): Promise<Locator | null> {
    try {
      await this.tagsList
        .locator('[class*="tagRow"]')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      return null;
    }
    const rows = await this.tagsList.locator('[class*="tagRow"]').all();
    for (const row of rows) {
      const tagInfo = row.locator('[class*="tagInfo"]');
      const infoCount = await tagInfo.count();
      if (infoCount === 0) continue; // skip edit-mode rows
      const text = await tagInfo.textContent();
      if (text?.trim() === tagName) {
        return row;
      }
    }
    return null;
  }

  /**
   * Click the "Delete" button for the named tag to open the delete modal.
   * The Delete button has no aria-label — it is scoped to the tag row.
   */
  async openDeleteModal(tagName: string): Promise<void> {
    const row = await this.getTagRow(tagName);
    if (!row) {
      throw new Error(`Tag "${tagName}" not found in list`);
    }
    const deleteButton = row.getByRole('button', { name: 'Delete', exact: true });
    await deleteButton.click();
    await this.deleteModal.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Click the "Delete Tag" confirm button inside the delete modal.
   */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
  }

  /**
   * Click the "Cancel" button inside the delete modal and wait for it to close.
   */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Click the "Edit" button for the named tag to enter inline edit mode.
   * The Edit button has no aria-label — it is scoped to the tag row.
   */
  async startEdit(tagName: string): Promise<void> {
    const row = await this.getTagRow(tagName);
    if (!row) {
      throw new Error(`Tag "${tagName}" not found in list`);
    }
    const editButton = row.getByRole('button', { name: 'Edit', exact: true });
    await editButton.click();
    // Wait for the edit form inputs to appear in the row
    await row.locator('input[type="text"]').waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Get the tag row that is currently in edit mode.
   * In edit mode the row has an input[type="text"] directly (no .tagInfo child).
   */
  getEditModeRow(): Locator {
    return this.tagsList
      .locator('[class*="tagRow"]')
      .filter({ has: this.page.locator('input[type="text"]') })
      .first();
  }

  /**
   * Get the Save button inside the currently active edit form.
   * Useful for asserting disabled state without calling saveEdit().
   */
  get editSaveButton(): Locator {
    return this.getEditModeRow().getByRole('button', { name: /^Save$|^Saving\.\.\.$/ });
  }

  /**
   * Get the text input inside the currently active edit form.
   */
  get editNameInput(): Locator {
    return this.getEditModeRow().locator('input[type="text"]');
  }

  /**
   * Get the color input inside the currently active edit form.
   */
  get editColorInput(): Locator {
    return this.getEditModeRow().locator('input[type="color"]');
  }

  /**
   * Click the "Save" button in the active inline edit form.
   */
  async saveEdit(): Promise<void> {
    const row = this.getEditModeRow();
    const saveButton = row.getByRole('button', { name: /^Save$|^Saving\.\.\.$/ });
    await saveButton.click();
    // Wait for the edit form to close (edit inputs disappear)
    await this.page
      .locator('[class*="tagRow"] input[type="text"]')
      .waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Click the "Cancel" button in the active inline edit form.
   */
  async cancelEdit(): Promise<void> {
    const row = this.getEditModeRow();
    const cancelButton = row.getByRole('button', { name: 'Cancel', exact: true });
    await cancelButton.click();
    // Wait for the edit form to close
    await this.page
      .locator('[class*="tagRow"] input[type="text"]')
      .waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Get the success banner text, or null if no success banner is visible.
   */
  async getSuccessBannerText(): Promise<string | null> {
    try {
      await this.successBanner.waitFor({ state: 'visible', timeout: 5000 });
      return await this.successBanner.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Get the create form error banner text, or null if no error is visible.
   * The create error banner appears inside the create card when a validation
   * or duplicate-name error occurs.
   */
  async getCreateErrorText(): Promise<string | null> {
    try {
      await this.createErrorBanner.waitFor({ state: 'visible', timeout: 5000 });
      return await this.createErrorBanner.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Parse and return the tag count from the "Existing Tags (N)" heading.
   * Returns 0 if the heading text cannot be parsed.
   */
  async getTagCount(): Promise<number> {
    const headingText = await this.existingTagsHeading.textContent();
    const match = headingText?.match(/\((\d+)\)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Wait for the tag list to be loaded.
   * Resolves when at least one tag row is visible OR the empty state is visible.
   */
  async waitForTagsLoaded(): Promise<void> {
    await Promise.race([
      this.tagsList
        .locator('[class*="tagRow"]')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 5000 }),
    ]);
  }
}
