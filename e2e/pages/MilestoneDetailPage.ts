/**
 * Page Object Model for the Milestone Detail page (/project/milestones/:id)
 *
 * The page renders two modes:
 *
 * **View mode** (default, isEditing = false):
 * - h1 with milestone title (class pageTitle)
 * - "← Back to Milestones" button (class backButton) — <button> calling navigate()
 * - "To Schedule" secondary nav button
 * - View card (.viewCard) containing:
 *   - h2 = milestone.title (class milestoneTitle)
 *   - Status badge: "Completed" or "Pending"
 *   - Edit button: data-testid="edit-milestone-button"
 *   - Fields: Target Date, Description (conditional), Completed At (conditional)
 *   - Linked Items section (list + search input: data-testid="item-search-input")
 *   - Dependent Work Items section (data-testid="dependent-items-section")
 *   - Delete button: data-testid="delete-milestone-button", text t('milestones.detail.deleteButton') = "Delete Milestone"
 *
 * **Edit mode** (isEditing = true, after clicking Edit button):
 * - Form card (.editCard) with h2 "Edit Milestone" (t('milestones.detail.form.title'))
 * - Form fields:
 *   - #title — data-testid="milestone-title-input"
 *   - #targetDate — data-testid="milestone-target-date-input"
 *   - #description — data-testid="milestone-description-input"
 *   - #isCompleted checkbox — data-testid="milestone-completed-checkbox"
 * - Save button: data-testid="save-milestone-button", text "Save Changes" / "Saving..."
 * - Cancel button: class cancelButton, text "Cancel"
 *
 * **Delete confirmation modal** (role="dialog", aria-modal="true"):
 * - h2: t('milestones.detail.deleteConfirm') = "Delete Milestone"
 * - Cancel: class modalCancelButton
 * - Confirm: data-testid="confirm-delete-milestone", class modalDeleteButton
 *   text: "Delete Milestone" / "Deleting..."
 *
 * **Not found state** (is404 = true):
 * - div.notFound with h2 t('milestones.detail.notFound') = "Milestone not found"
 * - Link "Back to Milestones"
 *
 * **Error banner** (role="alert", class errorBanner) — shown for API errors
 *
 * Key DOM observations from source code:
 * - Back button is a <button> calling navigate('/project/milestones'), NOT an <a>
 * - Delete modal uses role="dialog" with aria-modal="true" (own implementation, not shared Modal)
 * - Edit button and save button use data-testid for stable selection
 * - The page h1 = milestone.title (not a fixed string)
 */

import type { Page, Locator } from '@playwright/test';

export class MilestoneDetailPage {
  readonly page: Page;

  // Header — shown in BOTH view and edit modes
  readonly backButton: Locator; // "← Back to Milestones"
  readonly toScheduleButton: Locator; // "To Schedule"
  readonly heading: Locator; // h1 = milestone.title

  // View mode elements
  readonly editButton: Locator; // data-testid="edit-milestone-button"
  readonly deleteButton: Locator; // data-testid="delete-milestone-button"
  readonly viewCard: Locator;
  readonly statusBadge: Locator;

  // Edit mode elements
  readonly titleInput: Locator; // data-testid="milestone-title-input"
  readonly targetDateInput: Locator; // data-testid="milestone-target-date-input"
  readonly descriptionInput: Locator; // data-testid="milestone-description-input"
  readonly isCompletedCheckbox: Locator; // data-testid="milestone-completed-checkbox"
  readonly saveButton: Locator; // data-testid="save-milestone-button"
  readonly cancelEditButton: Locator; // "Cancel" in edit mode (class cancelButton)

  // Linked items
  readonly itemSearchInput: Locator; // data-testid="item-search-input"
  readonly depSearchInput: Locator; // data-testid="dep-search-input"
  readonly dependentItemsSection: Locator; // data-testid="dependent-items-section"

  // Delete confirmation modal (own role="dialog" implementation, not shared Modal)
  readonly deleteModal: Locator;
  readonly deleteConfirmButton: Locator; // data-testid="confirm-delete-milestone"
  readonly deleteCancelButton: Locator; // class modalCancelButton

  // Error / not-found states
  readonly errorBanner: Locator; // role="alert", class errorBanner
  readonly notFoundState: Locator; // div.notFound

  constructor(page: Page) {
    this.page = page;

    // Navigation buttons — <button> elements (NOT anchors)
    this.backButton = page.getByRole('button', { name: /← Back to Milestones/i });
    this.toScheduleButton = page.getByRole('button', { name: 'To Schedule', exact: true });
    // h1 = milestone.title (dynamic — matched by level only, caller checks text)
    this.heading = page.getByRole('heading', { level: 1 });

    // View mode
    this.editButton = page.getByTestId('edit-milestone-button');
    this.deleteButton = page.getByTestId('delete-milestone-button');
    this.viewCard = page.locator('[class*="viewCard"]');
    // Status badge uses class statusBadge + statusCompleted or statusPending
    this.statusBadge = page.locator('[class*="statusBadge"]');

    // Edit mode form fields — same data-testids used in both create and edit forms
    this.titleInput = page.getByTestId('milestone-title-input');
    this.targetDateInput = page.getByTestId('milestone-target-date-input');
    this.descriptionInput = page.getByTestId('milestone-description-input');
    this.isCompletedCheckbox = page.getByTestId('milestone-completed-checkbox');
    this.saveButton = page.getByTestId('save-milestone-button');
    // Cancel edit button: class cancelButton (in editActions div)
    this.cancelEditButton = page.locator('[class*="cancelButton"]').filter({ hasText: 'Cancel' });

    // Linked items search inputs
    this.itemSearchInput = page.getByTestId('item-search-input');
    this.depSearchInput = page.getByTestId('dep-search-input');
    this.dependentItemsSection = page.getByTestId('dependent-items-section');

    // Delete confirmation modal: own implementation with role="dialog" aria-modal="true"
    // Scoped by role="dialog" to avoid matching the shared Modal if it exists
    this.deleteModal = page.locator('[role="dialog"][aria-modal="true"]');
    // Confirm button uses data-testid="confirm-delete-milestone"
    this.deleteConfirmButton = page.getByTestId('confirm-delete-milestone');
    // Cancel button uses class modalCancelButton (CSS Modules hashed)
    this.deleteCancelButton = this.deleteModal.locator('[class*="modalCancelButton"]');

    // Error / load states
    this.errorBanner = page.locator('[role="alert"][class*="errorBanner"]');
    this.notFoundState = page.locator('[class*="notFound"]');
  }

  /**
   * Navigate directly to a milestone detail page by ID.
   * Waits for either:
   *   - h1 heading to appear (successful load)
   *   - notFound state to appear (404)
   * No explicit timeout — uses project-level actionTimeout.
   */
  async goto(id: number | string): Promise<void> {
    await this.page.goto(`/project/milestones/${id}`);
    await Promise.race([
      this.heading.waitFor({ state: 'visible' }),
      this.notFoundState.waitFor({ state: 'visible' }),
    ]);
  }

  /**
   * Get the milestone title from the h1 heading.
   */
  async getTitle(): Promise<string> {
    return (await this.heading.textContent()) ?? '';
  }

  /**
   * Switch to edit mode by clicking the Edit button.
   * Waits for the save button to be visible (edit form is rendered).
   */
  async startEditing(): Promise<void> {
    await this.editButton.click();
    await this.saveButton.waitFor({ state: 'visible' });
  }

  /**
   * Save changes in edit mode.
   * Registers the PATCH response listener BEFORE clicking save to avoid missing
   * the response on fast runners.
   * Waits for: PATCH 200 response, then the edit form to disappear.
   */
  async saveChanges(): Promise<void> {
    const saveResponsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/milestones') &&
        resp.request().method() === 'PATCH' &&
        resp.status() === 200,
    );
    await this.saveButton.click();
    await saveResponsePromise;
    // Wait for edit form to close (saveButton disappears)
    await this.saveButton.waitFor({ state: 'hidden' });
  }

  /**
   * Cancel edit mode by clicking "Cancel".
   * Waits for the saveButton to disappear.
   */
  async cancelEditing(): Promise<void> {
    await this.cancelEditButton.click();
    await this.saveButton.waitFor({ state: 'hidden' });
  }

  /**
   * Open the delete confirmation modal.
   * Clicks the "Delete Milestone" button in the view footer.
   */
  async openDeleteModal(): Promise<void> {
    await this.deleteButton.click();
    await this.deleteModal.waitFor({ state: 'visible' });
  }

  /**
   * Confirm the deletion.
   * Waits for the DELETE API response then navigation to /project/milestones.
   */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
    await this.page.waitForURL('**/project/milestones');
  }

  /**
   * Cancel the delete modal without deleting.
   */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  /**
   * Delete the milestone via the modal flow (open + confirm).
   */
  async deleteMilestone(): Promise<void> {
    await this.openDeleteModal();
    await this.confirmDelete();
  }

  /**
   * Check if the page is in the not-found state (404).
   * Uses a short probe timeout since this is an optional check.
   */
  async isInNotFoundState(): Promise<boolean> {
    try {
      await this.notFoundState.waitFor({ state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Return the list item element for a linked work item by its title.
   *
   * The linked work items list renders <li class*="linkedWorkItem"> elements.
   * Each item contains: itemTypeBadge, workItemTitleCell (link + AreaBreadcrumb compact), unlinkButton.
   * This locator scopes assertions to a specific WI row in the linked items list.
   */
  linkedWorkItemRow(title: string): Locator {
    return this.page
      .locator('li[class*="linkedWorkItem"]')
      .filter({ hasText: title });
  }

  /**
   * Get the error banner text, or null if not visible.
   * Uses a short probe timeout.
   */
  async getErrorBannerText(): Promise<string | null> {
    try {
      await this.errorBanner.waitFor({ state: 'visible', timeout: 3000 });
      return await this.errorBanner.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Get the status badge text (e.g., "Completed" or "Pending").
   */
  async getStatusText(): Promise<string> {
    return (await this.statusBadge.textContent()) ?? '';
  }
}
