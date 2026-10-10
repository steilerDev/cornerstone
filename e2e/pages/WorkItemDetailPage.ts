/**
 * Page Object Model for the Work Item Detail page (/project/work-items/:id)
 *
 * The page renders:
 * - An error state (class `error`) if the work item cannot be loaded (404, etc.)
 * - Breadcrumbs (Story #2202): `breadcrumbs` POM = "You are here" trail + origin-aware "Back to ..." link
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
 * - Header status chip: StatusMenu (data-testid="work-item-status") - Start / Mark done with
 *   date chips; Back to "...". The old status <select> is gone (#2209).
 * - Delete confirmation: the shared ConfirmDialog (role="alertdialog", #2209):
 *   - h2 "Delete <title>?", Cancel (work-item-delete-cancel), Confirm (work-item-delete-confirm)
 *   - Notes (note-delete), subtasks (subtask-delete), dependencies (dependency-remove) and cost
 *     lines (cost-line-delete) use the same component with their own testid prefix
 * - Inline error banner (role="alert", class errorBanner) for inline failures
 *
 * Key DOM observations from source code:
 * - Delete modal uses a plain div[class*="modal"] — no role="dialog", no aria-labelledby
 *   The h2 inside is "Delete Work Item?" (with question mark)
 * - Error state uses class `error` (errorCard with a "Back to Tasks" button inside)
 * - Vendors are now assigned per budget line (no separate vendor picker)
 * - Subsidy picker only renders when availableSubsidies.length > 0
 */

import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { BreadcrumbsBar } from './BreadcrumbsBar.js';
import { StatusMenuControl } from './components/StatusMenuControl.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';

export class WorkItemDetailPage {
  readonly page: Page;

  // Header
  readonly breadcrumbs: BreadcrumbsBar;
  readonly heading: Locator; // h1 (work item title)
  /** Header StatusMenu chip (data-testid="work-item-status"). */
  readonly statusMenu: StatusMenuControl;

  // Area breadcrumb nav locator (kept for negative assertions after fix/1278)
  // fix/1278: the breadcrumb has been REMOVED from the WorkItemDetailPage header entirely.
  // areaBreadcrumbNav is retained so Scenario 2 and 5 tests can assert not.toBeVisible().
  readonly areaBreadcrumbNav: Locator;

  // Sections (left column)
  readonly descriptionSection: Locator;
  readonly scheduleSection: Locator;
  /** Late / Held up chip in the page header (#2199); absent when neither applies. */
  readonly headerScheduleSignal: Locator;
  /** Secondary "Planned: …" line, rendered only when the plan differs from the forecast. */
  readonly plannedDates: Locator;
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
  /** Add button of the dependency sentence builder (sibling of the "Successor verb" select). */
  readonly dependencyAddButton: Locator;

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

  // Delete confirmation (ConfirmDialog, role="alertdialog")
  readonly deleteModal: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  // Other ConfirmDialogs on the page (#2209)
  readonly noteDeleteDialog: ConfirmDialogControl;
  readonly subtaskDeleteDialog: ConfirmDialogControl;
  readonly dependencyRemoveDialog: ConfirmDialogControl;
  readonly costLineDeleteDialog: ConfirmDialogControl;

  // Error states
  readonly errorBanner: Locator; // inline error (role="alert")
  readonly errorState: Locator; // load failure / 404 state (class "error")

  constructor(page: Page) {
    this.page = page;

    // Header
    this.breadcrumbs = new BreadcrumbsBar(page);
    this.heading = page.getByRole('heading', { level: 1 });
    this.statusMenu = new StatusMenuControl(page, 'work-item-status');

    // fix/1278: breadcrumb removed from WorkItemDetailPage header.
    // areaBreadcrumbNav retained for negative assertions (must NOT be visible).
    this.areaBreadcrumbNav = page.getByRole('navigation', { name: /area path/i });

    // Left column sections — scoped by h2 heading text
    this.descriptionSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Description', exact: true }) });
    this.scheduleSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Schedule', exact: true }) });
    this.headerScheduleSignal = page.getByTestId('work-item-schedule-signal');
    this.plannedDates = page.getByTestId('work-item-planned-dates');
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

    // The sentence builder has no testid; its Add button directly follows the successor-verb
    // select. Scoping this way avoids strict-mode clashes with other "Add" buttons in Constraints.
    this.dependencyAddButton = this.constraintsSection
      .getByLabel('Successor verb', { exact: true })
      .locator('xpath=following-sibling::button');

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

    // Delete dialog: the shared ConfirmDialog (role="alertdialog", testid prefix work-item-delete)
    this.deleteModal = page
      .getByRole('alertdialog')
      .filter({ has: page.getByTestId('work-item-delete-cancel') });
    this.deleteConfirmButton = this.deleteModal.getByTestId('work-item-delete-confirm');
    this.deleteCancelButton = this.deleteModal.getByTestId('work-item-delete-cancel');
    this.noteDeleteDialog = new ConfirmDialogControl(page, 'note-delete');
    this.subtaskDeleteDialog = new ConfirmDialogControl(page, 'subtask-delete');
    this.dependencyRemoveDialog = new ConfirmDialogControl(page, 'dependency-remove');
    this.costLineDeleteDialog = new ConfirmDialogControl(page, 'cost-line-delete');

    // Error states
    this.errorBanner = page.locator('[role="alert"][class*="errorBanner"]');
    this.errorState = page.locator('[class*="errorCard"]');
  }

  /**
   * Navigate directly to the work item detail page by ID.
   * Waits for the h1 heading to appear (page loaded successfully) OR
   * the error state to appear (load failure / 404).
   */
  async goto(id: string): Promise<void> {
    await this.page.goto(routeUrl('workItem', { id }));
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
   * Confirm deletion in the modal. The page navigates to /project/work-items on success.
   */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
    // No explicit timeout — uses project-level navigationTimeout (15s for WebKit).
    await this.page.waitForURL('**/project/work-items');
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

  // ─── Money truth (#2194): Link to Invoice modal ───────────────────────────

  /** "Link to Invoice" button on an unlinked budget line (only one exists before the modal opens). */
  get linkToInvoiceButton(): Locator {
    return this.budgetSection.getByRole('button', { name: 'Link to Invoice', exact: true }).first();
  }

  /** The Link to Invoice modal. */
  get invoiceLinkModal(): Locator {
    return this.page.getByRole('dialog', { name: 'Link to Invoice' });
  }

  /** Invoice option row in the modal's dropdown (testid invoice-link-option-<id>). */
  invoiceLinkOption(invoiceId: string): Locator {
    return this.page.getByTestId(`invoice-link-option-${invoiceId}`);
  }
}
