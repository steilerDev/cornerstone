/**
 * Page Object Model for the Diary Entry Edit page (/diary/:id/edit)
 *
 * The page renders:
 * - A loading state while fetching the entry
 * - A not-found / error card when the entry cannot be loaded
 * - The edit form when the entry is successfully loaded:
 *   - "← Back to Entry" button (navigates to /diary/:id or /diary for drafts)
 *   - h1 "Edit Diary Entry"
 *   - DiaryEntryTypeBadge (md size)
 *   - For draft entries: Badge with data-testid="draft-status-badge", label "Draft"
 *   - Auto-save indicator: data-testid="autosave-status" (visible when saveStatus !== 'idle')
 *   - Error banner (class styles.errorBanner) for server errors
 *   - DiaryEntryForm (same field structure as the create form — all pre-populated):
 *     Common:  #entry-date, #title, #body
 *     daily_log: #weather, #temperature, #workers
 *     site_visit: #inspector-name, #inspection-outcome
 *     delivery: #vendor, #delivery-confirmed, material-input
 *     issue: #severity, #resolution-status
 *   - Form actions row for SAVED entries:
 *     - "Delete Entry" button — opens delete modal
 *     - "Cancel" button — navigates to /diary/:id
 *     - "Save Changes" / "Saving..." submit button (type="submit")
 *   - Form actions row for DRAFT entries:
 *     - "Discard Draft" button (btnDanger) — opens discard confirmation modal
 *     - "Cancel" button — navigates to /diary
 *     - "Save" / "Saving..." submit button — promotes draft (type="submit")
 *   - Delete confirmation modal (role="dialog", aria-labelledby="delete-modal-title"):
 *     - "Delete Diary Entry" heading (#delete-modal-title)
 *     - Optional error banner if delete fails
 *     - "Cancel" button (closes modal)
 *     - "Delete Entry" / "Deleting..." confirm button (hidden when deleteError is set)
 *   - Discard draft confirmation modal (role="dialog", aria-labelledby="discard-modal-title"):
 *     - "Discard Draft" heading (#discard-modal-title)
 *     - "Keep Draft" / "Discard Draft" buttons
 *
 * Key DOM observations from source code:
 * - "← Back to Entry" is a <button> with onClick; for drafts navigates to /diary
 * - Draft badge: data-testid="draft-status-badge"
 * - Auto-save indicator: data-testid="autosave-status" — only visible when saveStatus !== 'idle'
 * - "Discard Draft" button is type="button" with text from t('editPage.discardDraftButton')
 * - Promote (Save) button is type="submit" in draft mode
 * - Discard modal: aria-labelledby="discard-modal-title", confirm = "Discard Draft", cancel = "Keep Draft"
 * - Delete modal cancel button text: t('editPage.deleteCancel') = "Cancel"
 * - Confirm delete button: class styles.confirmDeleteButton
 * - On successful promote: navigates to /diary/:id (detail)
 * - On successful discard: navigates to /diary (list)
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

  // Draft-specific UI elements
  readonly draftBadge: Locator;
  readonly autoSaveIndicator: Locator;
  readonly discardDraftButton: Locator;

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
  // For saved entries: "Save Changes" / "Saving..."
  // For draft entries: "Save" / "Saving..." (promote button)
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly deleteButton: Locator;

  // Error banner (server errors during save)
  readonly errorBanner: Locator;

  // Delete confirmation modal (aria-labelledby="delete-modal-title")
  readonly deleteModal: Locator;
  readonly confirmDeleteButton: Locator;
  readonly cancelDeleteButton: Locator;

  // Discard draft confirmation modal (aria-labelledby="discard-modal-title")
  readonly discardModal: Locator;
  readonly discardModalConfirm: Locator;
  readonly discardModalCancel: Locator;

  constructor(page: Page) {
    this.page = page;

    // Heading
    this.heading = page.getByRole('heading', { level: 1, name: 'Edit Diary Entry', exact: true });

    // "← Back to Entry" button — a <button> with onClick navigate(`/diary/:id` or `/diary`)
    this.backToEntryButton = page.getByRole('button', { name: /← Back to Entry/i });

    // Draft badge: data-testid="draft-status-badge"
    this.draftBadge = page.getByTestId('draft-status-badge');

    // Auto-save indicator: data-testid="autosave-status" — conditionally rendered
    this.autoSaveIndicator = page.getByTestId('autosave-status');

    // "Discard Draft" button — type="button", text from t('editPage.discardDraftButton') = "Discard Draft"
    this.discardDraftButton = page.getByRole('button', { name: 'Discard Draft', exact: true });

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

    // Form actions — "Save Changes" / "Saving..." (saved) OR "Save" / "Saving..." (draft promote)
    // Both modes render a type="submit" button; text differs by status.
    this.submitButton = page.getByRole('button', { name: /^Save$|^Save Changes$|Saving\.\.\./i });
    // "Cancel" in the form actions (navigates to /diary/:id or /diary) — NOT the modal cancel
    this.cancelButton = page.locator('[class*="cancelButton"]').first();
    // "Delete Entry" button — opens the delete modal (only for saved entries)
    this.deleteButton = page.getByRole('button', { name: 'Delete Entry', exact: true });

    // Server error banner
    this.errorBanner = page.locator('[class*="errorBanner"]').first();

    // Delete modal — aria-labelledby="delete-modal-title"
    this.deleteModal = page.locator('[role="dialog"][aria-labelledby="delete-modal-title"]');
    // Confirm delete inside the modal: text "Delete Entry" / "Deleting..."
    this.confirmDeleteButton = this.deleteModal.getByRole('button', {
      name: /Delete Entry|Deleting\.\.\./i,
    });
    // Cancel inside the delete modal: "Cancel"
    this.cancelDeleteButton = this.deleteModal.getByRole('button', { name: 'Cancel', exact: true });

    // Discard draft modal — aria-labelledby="discard-modal-title"
    this.discardModal = page.locator('[role="dialog"][aria-labelledby="discard-modal-title"]');
    // "Discard Draft" confirm button inside discard modal
    this.discardModalConfirm = this.discardModal.getByRole('button', {
      name: /Discard Draft|Discarding\.\.\./i,
    });
    // "Keep Draft" cancel button inside discard modal
    this.discardModalCancel = this.discardModal.getByRole('button', {
      name: 'Keep Draft',
      exact: true,
    });
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
   * Save (or promote) the form by clicking the submit button.
   * For saved entries: sends PATCH /api/diary-entries/:id.
   * For draft entries: sends POST /api/diary-entries/:id/promote.
   * Waits for the API response before returning.
   * No explicit timeout — uses project-level navigationTimeout.
   */
  async save(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/diary-entries/') &&
        (resp.request().method() === 'PATCH' || resp.request().method() === 'POST'),
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
   * Open the discard draft confirmation modal by clicking "Discard Draft".
   * Waits for the modal to become visible.
   * Only valid when viewing a draft entry.
   */
  async openDiscardModal(): Promise<void> {
    await this.discardDraftButton.click();
    await this.discardModal.waitFor({ state: 'visible' });
  }

  /**
   * Confirm discarding the draft inside the discard modal.
   * Waits for the API DELETE response before returning.
   */
  async confirmDiscard(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/diary-entries/') && resp.request().method() === 'DELETE',
    );
    await this.discardModalConfirm.click();
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
