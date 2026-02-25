/**
 * Page Object Model for the Work Item Detail page (/work-items/:id)
 *
 * The page renders:
 * - An error state (class `error`) if the work item cannot be loaded (404, etc.)
 * - A back button ("← Back to Work Items", a <button> not a <Link>)
 * - An inline-editable h1 title (click to edit, or press "e" shortcut)
 * - A status select dropdown
 * - Left column sections:
 *   - h2 "Description" (click body to inline-edit)
 *   - h2 "Schedule" (Start Date, End Date inputs)
 *   - h2 "Assignment" (Assigned To select)
 *   - h2 "Tags" (TagPicker)
 *   - h2 "Budget":
 *     - "+ Add Line" button (aria-label="Add budget line") in section header
 *     - Budget lines list with per-line Edit/Delete buttons
 *     - Inline form for adding/editing budget lines (planned amount, confidence,
 *       description, category, source, vendor)
 *     - h3 "Subsidies" — linked subsidy list, subsidy picker select
 *       (aria-label="Select subsidy program to link"), "Add Subsidy" button
 * - Right column sections:
 *   - h2 "Notes" — textarea (placeholder "Add a note..."), "Add Note" submit button, notes list
 *   - h2 "Subtasks" — text input (placeholder "Add a subtask..."), "Add" submit button
 *   - h2 "Constraints" — combined section with subsections:
 *     - h3 "Duration" (Duration (days) input)
 *     - h3 "Date Constraints" (Start After, Start Before inputs)
 *     - h3 "Dependencies" — DependencySentenceDisplay + DependencySentenceBuilder
 *     - h3 "Required Milestones" — milestone dependency picker
 *     - h3 "Linked Milestones" — milestones this item is linked to
 * - Footer: timestamps, "Delete Work Item" button (class deleteWorkItemButton)
 * - Delete confirmation modal (role=none, [class*="modal"]):
 *   - h2 "Delete Work Item?"
 *   - Cancel button (class modalCancelButton)
 *   - Confirm button (class modalDeleteButton): text "Delete" / "Deleting..."
 * - Inline error banner (role="alert", class errorBanner) for inline failures
 *
 * Key DOM observations from source code:
 * - Back button is a <button> calling navigate('/work-items'), NOT an <a>
 * - Delete modal uses a plain div[class*="modal"] — no role="dialog", no aria-labelledby
 *   The h2 inside is "Delete Work Item?" (with question mark)
 * - Error state uses class `error` (div.error with a "Back to Work Items" button inside)
 * - Vendors are now assigned per budget line (no separate vendor picker)
 * - Subsidy picker only renders when availableSubsidies.length > 0
 */

import type { Page, Locator } from '@playwright/test';

export class WorkItemDetailPage {
  readonly page: Page;

  // Header
  readonly backButton: Locator;
  readonly heading: Locator; // h1 (work item title)
  readonly statusSelect: Locator;

  // Sections (left column)
  readonly descriptionSection: Locator;
  readonly scheduleSection: Locator;
  readonly assignmentSection: Locator;
  readonly tagsSection: Locator;
  readonly budgetSection: Locator;

  // Budget lines
  readonly addBudgetLineButton: Locator;

  // Subsidy linking
  readonly subsidyPicker: Locator;
  readonly addSubsidyButton: Locator;

  // Sections (right column)
  readonly notesSection: Locator;
  readonly subtasksSection: Locator;
  readonly constraintsSection: Locator; // right-column combined section (h2 "Constraints")

  // Duration input (inside Constraints section, h3 "Duration")
  readonly durationInput: Locator;

  // Notes
  readonly noteTextarea: Locator;
  readonly addNoteButton: Locator;

  // Subtasks
  readonly subtaskInput: Locator;
  readonly addSubtaskButton: Locator;

  // Footer
  readonly deleteButton: Locator; // "Delete Work Item" in footer

  // Delete confirmation modal
  // Note: the modal is a plain div (not role="dialog") in this component
  readonly deleteModal: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  // Error states
  readonly errorBanner: Locator; // inline error (role="alert")
  readonly errorState: Locator; // load failure / 404 state (class "error")

  constructor(page: Page) {
    this.page = page;

    // Header
    this.backButton = page.getByRole('button', { name: /← Back to Work Items/i });
    this.heading = page.getByRole('heading', { level: 1 });
    this.statusSelect = page.locator('[class*="statusSelect"]');

    // Left column sections — scoped by h2 heading text
    this.descriptionSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Description', exact: true }) });
    this.scheduleSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Schedule', exact: true }) });
    this.assignmentSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Assignment', exact: true }) });
    this.tagsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Tags', exact: true }) });
    this.budgetSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Budget', exact: true }) });

    // Budget lines
    this.addBudgetLineButton = page.getByRole('button', { name: 'Add budget line' });

    // Subsidy picker (only present when unlinked subsidies exist)
    this.subsidyPicker = page.getByLabel('Select subsidy program to link');
    this.addSubsidyButton = page.getByRole('button', { name: /Add Subsidy|Linking\.\.\./i });

    // Right column sections
    this.notesSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Notes', exact: true }) });
    this.subtasksSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Subtasks', exact: true }) });
    // Combined constraints section (right column): h2 "Constraints" containing subsections
    // Date Constraints, Dependencies, Required Milestones, Linked Milestones
    this.constraintsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Constraints', exact: true }) });

    // Duration input lives inside Constraints section (h3 "Duration")
    this.durationInput = this.constraintsSection.locator('input[type="number"]').first();

    // Notes form
    this.noteTextarea = this.notesSection.locator('textarea[placeholder="Add a note..."]');
    this.addNoteButton = this.notesSection.getByRole('button', { name: /Add Note|Adding\.\.\./i });

    // Subtasks form
    this.subtaskInput = this.subtasksSection.locator('input[placeholder="Add a subtask..."]');
    this.addSubtaskButton = this.subtasksSection.getByRole('button', {
      name: /^Add$|Adding\.\.\./i,
    });

    // Footer delete button
    this.deleteButton = page.getByRole('button', { name: 'Delete Work Item', exact: true });

    // Delete modal — plain div (not role="dialog") using [class*="modal"]
    // Scoped to the outermost modal wrapper that contains the "Delete Work Item?" heading
    this.deleteModal = page
      .locator('[class*="modal"]')
      .filter({ has: page.getByRole('heading', { name: /Delete Work Item\?/i }) });
    this.deleteConfirmButton = this.deleteModal.locator('[class*="modalDeleteButton"]');
    this.deleteCancelButton = this.deleteModal.locator('[class*="modalCancelButton"]');

    // Error states
    this.errorBanner = page.locator('[role="alert"][class*="errorBanner"]');
    this.errorState = page.locator('[class*="error"]').filter({ has: page.getByRole('button') });
  }

  /**
   * Navigate directly to the work item detail page by ID.
   * Waits for the h1 heading to appear (page loaded successfully) OR
   * the error state to appear (load failure / 404).
   */
  async goto(id: string): Promise<void> {
    await this.page.goto(`/work-items/${id}`);
    // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
    await Promise.race([
      this.heading.waitFor({ state: 'visible' }),
      this.errorState.waitFor({ state: 'visible' }),
    ]);
  }

  /**
   * Get the work item title from the h1 heading.
   */
  async getTitle(): Promise<string> {
    return (await this.heading.textContent()) ?? '';
  }

  /**
   * Add a note to the work item.
   * Fills the note textarea, submits, and waits for the note to appear in the list.
   */
  async addNote(text: string): Promise<void> {
    await this.noteTextarea.fill(text);
    await this.addNoteButton.click();
    // Wait for the note to appear in the notes list.
    // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
    await this.notesSection
      .locator('[class*="noteContent"]')
      .filter({ hasText: text })
      .waitFor({ state: 'visible' });
  }

  /**
   * Add a subtask to the work item.
   * Fills the subtask input, submits, and waits for the subtask to appear in the list.
   */
  async addSubtask(text: string): Promise<void> {
    await this.subtaskInput.fill(text);
    await this.addSubtaskButton.click();
    // Wait for the subtask to appear in the subtask list.
    // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
    await this.subtasksSection
      .locator('[class*="subtaskTitle"]')
      .filter({ hasText: text })
      .waitFor({ state: 'visible' });
  }

  /**
   * Link a subsidy program to the work item by name.
   * Selects the subsidy in the picker dropdown and clicks "Add Subsidy".
   */
  async linkSubsidy(subsidyName: string): Promise<void> {
    await this.subsidyPicker.selectOption({ label: subsidyName });
    await this.addSubsidyButton.click();
    // Wait for the subsidy to appear in the linked list.
    // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
    await this.budgetSection
      .locator('[class*="linkedItemName"]')
      .filter({ hasText: subsidyName })
      .waitFor({ state: 'visible' });
  }

  /**
   * Open the delete confirmation modal by clicking "Delete Work Item" in the footer.
   */
  async openDeleteModal(): Promise<void> {
    await this.deleteButton.click();
    // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
    await this.deleteConfirmButton.waitFor({ state: 'visible' });
  }

  /**
   * Confirm deletion in the modal. The page navigates to /work-items on success.
   */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
    // No explicit timeout — uses project-level navigationTimeout (15s for WebKit).
    await this.page.waitForURL('**/work-items');
  }

  /**
   * Cancel the delete modal without deleting.
   */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
    await this.deleteConfirmButton.waitFor({ state: 'hidden' });
  }

  /**
   * Delete the work item via the modal flow (open + confirm).
   * Convenience method combining openDeleteModal + confirmDelete.
   */
  async deleteWorkItem(): Promise<void> {
    await this.openDeleteModal();
    await this.confirmDelete();
  }

  /**
   * Check whether the page loaded in the error state (404 or load failure).
   */
  async isInErrorState(): Promise<boolean> {
    try {
      // Use a short timeout since we are probing for an optional state.
      // 3000ms is intentionally short — we don't want to wait long for an error state.
      await this.errorState.waitFor({ state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start inline editing of the description by clicking the description body.
   * Uses a specific selector that only matches the display-mode .description div
   * (not .descriptionEdit / .descriptionTextarea / .descriptionEditActions).
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async startEditingDescription(): Promise<void> {
    // Use a scoped selector that excludes the edit-mode variants:
    // .descriptionEdit, .descriptionTextarea, .descriptionEditActions all
    // contain "description" as a substring, but only .description div
    // is present in display mode.  The :not() chain prevents strict-mode
    // violations if the edit state briefly overlaps.
    const descriptionBody = this.descriptionSection.locator(
      'div[class*="description"]:not([class*="descriptionEdit"]):not([class*="descriptionTextarea"]):not([class*="descriptionEditActions"])',
    );
    await descriptionBody.click();
    // Wait for the textarea to appear
    await this.descriptionSection
      .locator('[class*="descriptionTextarea"]')
      .waitFor({ state: 'visible' });
  }

  /**
   * Save the current inline description edit.
   * Clicks Save and waits for the textarea to disappear (edit mode exits)
   * so the caller can immediately assert on the display-mode description text.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async saveDescription(): Promise<void> {
    await this.descriptionSection.getByRole('button', { name: 'Save', exact: true }).click();
    // Wait for the textarea to disappear so assertions after this call don't
    // encounter a mixed edit+display state (strict-mode violation on
    // [class*="description"] which matches 3 elements in edit mode).
    await this.descriptionSection
      .locator('[class*="descriptionTextarea"]')
      .waitFor({ state: 'hidden' });
  }

  /**
   * Get the inline error banner text, or null if not visible.
   * Uses a short timeout (3000ms) since we are probing for an optional state.
   */
  async getInlineErrorText(): Promise<string | null> {
    try {
      await this.errorBanner.waitFor({ state: 'visible', timeout: 3000 });
      return await this.errorBanner.textContent();
    } catch {
      return null;
    }
  }
}
