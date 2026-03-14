/**
 * Page Object Model for the Diary Entry Edit page (/diary/:id/edit)
 *
 * The page renders:
 * - A loading state while fetching the entry
 * - A not-found / error card when the entry cannot be loaded
 * - The edit form when the entry is successfully loaded:
 *   - "← Back to Entry" button (navigates to /diary/:id)
 *   - h1 "Edit Diary Entry"
 *   - DiaryEntryTypeBadge (md size)
 *   - Error banner (class styles.errorBanner) for server errors
 *   - DiaryEntryForm (same field structure as the create form — all pre-populated):
 *     Common:  #entry-date, #title, #body
 *     daily_log: #weather, #temperature, #workers
 *     site_visit: #inspector-name, #inspection-outcome
 *     delivery: #vendor, #delivery-confirmed, material-input
 *     issue: #severity, #resolution-status
 *   - Form actions row:
 *     - "Delete Entry" button (class styles.deleteButton) — opens delete modal
 *     - "Cancel" button — navigates to /diary/:id
 *     - "Save Changes" / "Saving..." submit button (type="submit")
 *   - Delete confirmation modal (role="dialog", aria-labelledby="delete-modal-title"):
 *     - "Delete Diary Entry" heading (#delete-modal-title)
 *     - Confirmation text
 *     - Optional error banner if delete fails
 *     - "Cancel" button (closes modal)
 *     - "Delete Entry" / "Deleting..." confirm button (hidden when deleteError is set)
 *
 * Key DOM observations from source code:
 * - "← Back to Entry" is a <button> with onClick navigate(`/diary/${entry.id}`)
 * - "Delete Entry" opens the modal (does NOT submit the form)
 * - "Save Changes" is type="submit" — submits the form via handleSubmit
 * - Delete modal cancel button has class styles.cancelButton — same as the form cancel button;
 *   use getByRole + filter inside the modal for disambiguation
 * - The confirm delete button has class styles.confirmDeleteButton
 * - On successful save: navigates to /diary/:id
 * - On successful delete: navigates to /diary
 * - The modal is conditionally rendered: {showDeleteModal && (...)}
 * - Confirm delete button is NOT rendered when deleteError is set
 */

import type { Page, Locator } from '@playwright/test';

export const DIARY_EDIT_ROUTE = '/diary';

export class DiaryEntryEditPage {
  readonly page: Page;

  // Header
  readonly heading: Locator;
  readonly backToEntryButton: Locator;

  // Common form fields (same ids as DiaryEntryForm)
  readonly entryDateInput: Locator;
  readonly titleInput: Locator;
  readonly bodyTextarea: Locator;

  // daily_log-specific fields
  readonly weatherSelect: Locator;
  readonly temperatureInput: Locator;
  readonly workersInput: Locator;

  // site_visit-specific fields
  readonly inspectorNameInput: Locator;
  readonly outcomeSelect: Locator;

  // issue-specific fields
  readonly severitySelect: Locator;
  readonly resolutionStatusSelect: Locator;

  // Form actions
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly deleteButton: Locator;

  // Error banner (server errors during save)
  readonly errorBanner: Locator;

  // Delete confirmation modal
  readonly deleteModal: Locator;
  readonly confirmDeleteButton: Locator;
  readonly cancelDeleteButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Heading
    this.heading = page.getByRole('heading', { level: 1, name: 'Edit Diary Entry', exact: true });

    // "← Back to Entry" button — a <button> with onClick navigate(`/diary/:id`)
    this.backToEntryButton = page.getByRole('button', { name: /← Back to Entry/i });

    // Common form fields
    this.entryDateInput = page.locator('#entry-date');
    this.titleInput = page.locator('#title');
    this.bodyTextarea = page.locator('#body');

    // daily_log fields
    this.weatherSelect = page.locator('#weather');
    this.temperatureInput = page.locator('#temperature');
    this.workersInput = page.locator('#workers');

    // site_visit fields
    this.inspectorNameInput = page.locator('#inspector-name');
    this.outcomeSelect = page.locator('#inspection-outcome');

    // issue fields
    this.severitySelect = page.locator('#severity');
    this.resolutionStatusSelect = page.locator('#resolution-status');

    // Form actions — "Save Changes" / "Saving..."
    this.submitButton = page.getByRole('button', { name: /Save Changes|Saving\.\.\./i });
    // "Cancel" in the form actions (navigates to /diary/:id) — NOT the modal cancel
    // Use getByRole but filter to be outside the modal
    this.cancelButton = page.locator('[class*="cancelButton"]').first();
    // "Delete Entry" button — opens the delete modal
    this.deleteButton = page.getByRole('button', { name: 'Delete Entry', exact: true });

    // Server error banner
    this.errorBanner = page.locator('[class*="errorBanner"]').first();

    // Delete modal — role="dialog"
    this.deleteModal = page.getByRole('dialog');
    // Confirm delete inside the modal: text "Delete Entry" / "Deleting..."
    // Use the modal's locator scope to avoid matching the "Delete Entry" button outside
    this.confirmDeleteButton = this.deleteModal.getByRole('button', {
      name: /Delete Entry|Deleting\.\.\./i,
    });
    // Cancel inside the modal
    this.cancelDeleteButton = this.deleteModal.getByRole('button', { name: 'Cancel', exact: true });
  }

  /**
   * Navigate to the edit page for the given diary entry ID.
   * Waits for either the page heading (success) or an error indicator.
   * No explicit timeout — uses project-level actionTimeout.
   */
  async goto(id: string): Promise<void> {
    await this.page.goto(`${DIARY_EDIT_ROUTE}/${id}/edit`);
    await Promise.race([
      this.heading.waitFor({ state: 'visible' }),
      // Error card shown for not-found — heading is "Entry Not Found"
      this.page
        .getByRole('heading', { level: 2, name: /Entry Not Found|Error Loading Entry/i })
        .waitFor({ state: 'visible' }),
    ]);
  }

  /**
   * Save the form by clicking "Save Changes".
   * Waits for the API PATCH response before returning so callers can
   * then assert navigation or UI state.
   * No explicit timeout — uses project-level actionTimeout.
   */
  async save(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/diary-entries/') && resp.request().method() === 'PATCH',
    );
    await this.submitButton.click();
    await responsePromise;
  }

  /**
   * Open the delete confirmation modal by clicking "Delete Entry".
   * Waits for the modal to become visible.
   */
  async openDeleteModal(): Promise<void> {
    await this.deleteButton.click();
    await this.deleteModal.waitFor({ state: 'visible' });
  }

  /**
   * Confirm the deletion inside the modal.
   * Waits for the API DELETE response before returning.
   */
  async confirmDelete(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/diary-entries/') && resp.request().method() === 'DELETE',
    );
    await this.confirmDeleteButton.click();
    await responsePromise;
  }

  /**
   * Get all validation error texts currently rendered (role="alert").
   * Returns an array of visible error message strings.
   */
  async getValidationErrors(): Promise<string[]> {
    const alerts = this.page.locator('[role="alert"]');
    const count = await alerts.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await alerts.nth(i).textContent();
      if (text) texts.push(text.trim());
    }
    return texts;
  }
}
