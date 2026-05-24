/**
 * Page Object Model for the Auto-Itemize Page
 * Route: /budget/invoices/:id/auto-itemize/:documentId
 *
 * Added in story #1564 (auto-itemize UX redesign).
 * Replaces the old AutoItemizePreviewModal / DocumentPickerModal flow.
 *
 * DOM observations from AutoItemizePage.tsx:
 * - pageTitle: h1 with t('autoItemize.title') = "Auto-Itemize Invoice"
 * - breadcrumb: <a> with t('autoItemize.backToInvoice') = "Back to Invoice"
 * - analyzingCaption: <p class="analyzingCaption"> with t('autoItemize.analyzing')
 * - skeleton: Skeleton component (lines=5)
 * - errorBanner: FormError with variant="banner" → role="alert"
 * - retryButton: button with t('autoItemize.retry') = "Retry"
 * - saveButton: button with t('autoItemize.save') / t('autoItemize.saving')
 * - cancelButton: button with t('autoItemize.cancel') = "Cancel"
 * - totalAmountInput: <input id="amount" type="number">
 * - invoiceDateInput: <input id="date" type="date">
 * - dueDateInput: <input id="due-date" type="date">
 * - notesInput: <textarea id="notes">
 * - SuggestionBadge: <span class="badge"> with apply button aria-label including t('autoItemize.apply')
 * - line rows: <tr> in <tbody>
 * - line checkbox: <input type="checkbox"> in each <tr>
 * - Per-row "Assign To" column (added in Round 2, story #1564):
 *   - assignButtonInTable: <button class*="assignButtonInTable"> text="Assign…"
 *     (rendered when !line.assignedBudgetLineId && !line.inlineCreatedBudgetLineDraft)
 *   - assignedBadge: <div class*="assignedBadge"> when assignment is made
 *     contains <span> with description and <button class*="clearAssignButton" aria-label="Clear budget line assignment">
 * - Budget line picker modal (opened by "Assign…" button):
 *   - Modal title (step 1): t('autoItemize.pickerTitle') = "Assign to Work Item or Household Item"
 *   - Modal title (step 2): t('autoItemize.pickerStep2Title', { itemTitle }) =
 *       "Select Budget Line for {itemTitle}"
 *   - Step 1 body: two tabs rendered side-by-side inside div class*="tabsContainer":
 *       Left tab  — div class*="tab" with h3 "Work Item" (t('invoiceDetail.budgetLines.picker.workItemTab'))
 *                   + WorkItemPicker search input: plain <input type="text"> with
 *                     placeholder="Search work items..." (hardcoded prop in AutoItemizePage.tsx)
 *       Separator — div class*="separator" text "or"
 *       Right tab — div class*="tab" with h3 "Household Item" + HouseholdItemPicker:
 *                   plain <input type="text"> placeholder="Search household items..."
 *       Selecting a work item via WorkItemPicker.onSelectItem calls picker.handleSelectItem(id, 'work_item', title)
 *       which sets pickerState.step=2 and fetches budget lines for the selected item.
 *   - Step 2 body (after item selected):
 *       Budget line list: buttons class*="pickerBudgetLineRow" (one per unlinked budget line)
 *       Empty state: "No unlinked budget lines for this item." + "Create Budget Line" button
 *       Back button: "← Back" (t('invoiceDetail.budgetLines.picker.backButton')) — returns to step 1
 *       Inline create form: BudgetLineForm inside fieldset class*="createBudgetLineFieldset"
 *         (shown when showCreateForm=true; triggered by "Create Budget Line" button)
 * - Cancel modal (Discard Changes?): rendered via Modal component
 *   title: t('autoItemize.cancelConfirmTitle') = "Discard Changes?"
 *   discard button: t('autoItemize.discardChanges') = "Discard Changes"
 *   keep editing button: t('autoItemize.keepEditing') = "Keep Editing"
 * - live region: role="status" aria-atomic="true" (class="srOnly")
 * - layout columns: .formColumn and .previewColumn
 *   breakpoint: @media (max-width: 860px) → single column, form first (order:1), preview second (order:2)
 */

import type { Page, Locator } from '@playwright/test';

export class AutoItemizePage {
  readonly page: Page;

  // Header
  readonly pageTitle: Locator;
  readonly breadcrumb: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  // Loading state
  readonly skeleton: Locator;
  readonly analyzingCaption: Locator;

  // Error state
  readonly errorBanner: Locator;
  readonly retryButton: Locator;

  // Metadata form inputs
  readonly totalAmountInput: Locator;
  readonly invoiceDateInput: Locator;
  readonly dueDateInput: Locator;
  readonly notesInput: Locator;

  // Cancel confirmation modal
  readonly cancelModal: Locator;
  readonly discardButton: Locator;
  readonly keepEditingButton: Locator;

  // Live region for a11y announcements
  readonly liveRegion: Locator;

  // Layout columns (for responsive checks)
  readonly formColumn: Locator;
  readonly previewColumn: Locator;

  // ─── Per-row assignment (story #1564 Round 2) ─────────────────────────────
  //
  // The "Assign To" column in the extracted lines table renders one of:
  //  a) An "Assign…" button (class*="assignButtonInTable") — no assignment yet
  //  b) An assigned badge (class*="assignedBadge") — assignment is made
  //     containing a description <span> and a "Clear" button (class*="clearAssignButton")
  //
  // The budget line picker modal has two steps:
  //  Step 1: Two side-by-side pickers (WorkItemPicker + HouseholdItemPicker) with h3 headings.
  //    - pickerModal: role="dialog" filtered by h2 "Assign to Work Item or Household Item"
  //    - pickerWorkItemSearchInput: plain <input type="text"> inside the Work Item tab
  //      (placeholder="Search work items..." — hardcoded prop in AutoItemizePage.tsx)
  //    - pickerHouseholdItemSearchInput: plain <input type="text"> inside the Household Item tab
  //      (placeholder="Search household items..." — hardcoded prop in AutoItemizePage.tsx)
  //  Step 2: Budget line list for the selected item (modal title changes to step-2 title).
  //    - pickerBudgetLineRows: buttons class*="pickerBudgetLineRow"
  //    - pickerBackButton: "← Back" button
  //    - pickerCreateBudgetLineButton: "Create Budget Line" button (empty-state or below list)
  //    - pickerCreateBudgetLineFieldset: fieldset class*="createBudgetLineFieldset" (inline form)

  /** Budget line assignment picker modal (step 1 OR step 2). */
  readonly pickerModal: Locator;

  /**
   * Search input for Work Items in step 1 of the picker modal.
   * Rendered by WorkItemPicker → SearchPicker as a plain <input type="text">
   * with placeholder "Search work items..." (hardcoded in AutoItemizePage.tsx).
   */
  readonly pickerWorkItemSearchInput: Locator;

  /**
   * Search input for Household Items in step 1 of the picker modal.
   * Rendered by HouseholdItemPicker → SearchPicker as a plain <input type="text">
   * with placeholder "Search household items..." (hardcoded in AutoItemizePage.tsx).
   */
  readonly pickerHouseholdItemSearchInput: Locator;

  /**
   * "← Back" button in step 2 of the picker modal.
   * Returns to step 1 (resets budgetLines and step to 1).
   * Text: t('invoiceDetail.budgetLines.picker.backButton') = "← Back"
   */
  readonly pickerBackButton: Locator;

  /**
   * "Create Budget Line" button in step 2 of the picker modal (empty-state or below list).
   * Text: t('invoiceDetail.budgetLines.picker.createLine') = "Create Budget Line"
   */
  readonly pickerCreateBudgetLineButton: Locator;

  /**
   * Fieldset wrapping the inline BudgetLineForm in step 2.
   * Only rendered when pickerState.showCreateForm=true.
   * class*="createBudgetLineFieldset"
   */
  readonly pickerCreateBudgetLineFieldset: Locator;

  constructor(page: Page) {
    this.page = page;

    // The h1 title: "Auto-Itemize Invoice"
    this.pageTitle = page.getByRole('heading', { level: 1 });

    // Breadcrumb back link: "Back to Invoice"
    this.breadcrumb = page.getByRole('link', { name: /Back to Invoice/i });

    // Save button: "Save" / "Saving..."
    this.saveButton = page.getByRole('button', { name: /^Save$|^Saving\.\.\.$/i });

    // Cancel button in the form actions area
    // We scope to the pageContainer to avoid matching the "Keep Editing" or "Discard" buttons
    this.cancelButton = page.locator('[class*="actions"]').getByRole('button', {
      name: /^Cancel$/i,
      exact: true,
    });

    // Skeleton (Playwright: .sr-only sibling or the Skeleton lines wrapper)
    // The Skeleton component renders divs with animated lines
    this.skeleton = page.locator('[class*="skeleton"], [class*="Skeleton"]').first();

    // "Analyzing document..." caption below the skeleton
    this.analyzingCaption = page.locator('[class*="analyzingCaption"]');

    // Error banner (FormError variant="banner" → role="alert")
    this.errorBanner = page.locator('[role="alert"]').first();

    // Retry button: "Retry"
    this.retryButton = page.getByRole('button', { name: /^Retry$/i });

    // Metadata inputs
    this.totalAmountInput = page.locator('#amount');
    this.invoiceDateInput = page.locator('#date');
    this.dueDateInput = page.locator('#due-date');
    this.notesInput = page.locator('#notes');

    // Cancel confirmation modal (Modal component renders with role="dialog")
    // Title: "Discard Changes?"
    this.cancelModal = page.locator('[role="dialog"]').filter({
      has: page.locator('h2', { hasText: /Discard Changes/i }),
    });

    // Discard button inside the cancel modal
    this.discardButton = this.cancelModal.getByRole('button', { name: /Discard Changes/i });

    // Keep Editing button inside the cancel modal
    this.keepEditingButton = this.cancelModal.getByRole('button', { name: /Keep Editing/i });

    // Live region for a11y announcements (role="status" aria-atomic="true")
    this.liveRegion = page.locator('[role="status"][aria-atomic="true"]');

    // Layout columns
    this.formColumn = page.locator('[class*="formColumn"]');
    this.previewColumn = page.locator('[class*="previewColumn"]');

    // ─── Per-row assignment picker modal (story #1564 Round 2) ─────────────
    // The Modal uses useId() for aria-labelledby — NOT accessible name on the dialog itself.
    // Filter by the h2 text to scope to the correct dialog.
    // Step 1 title: "Assign to Work Item or Household Item" (t('autoItemize.pickerTitle'))
    // Step 2 title: "Select Budget Line for {itemTitle}" (t('autoItemize.pickerStep2Title'))
    // We scope pickerModal only to step 1 here; use pickerStep2Modal() method for step 2.
    this.pickerModal = page.locator('[role="dialog"]').filter({
      has: page.locator('h2', { hasText: /Assign to Work Item or Household Item/i }),
    });

    // Step 1 — Work Item search input (WorkItemPicker → SearchPicker plain <input type="text">)
    // Scoped to the left tab (div class*="tab" containing h3 "Work Item")
    this.pickerWorkItemSearchInput = this.pickerModal.getByPlaceholder('Search work items...');

    // Step 1 — Household Item search input (HouseholdItemPicker → SearchPicker plain <input type="text">)
    // Scoped to the right tab (div class*="tab" containing h3 "Household Item")
    this.pickerHouseholdItemSearchInput = this.pickerModal.getByPlaceholder('Search household items...');

    // Step 2 — "← Back" button: returns to step 1
    // The modal title changes to "Select Budget Line for …" in step 2.
    // We scope the back button to the dialog element (which stays open during step transitions).
    // Use a broader dialog scope that matches both step titles.
    const anyPickerModal = page.locator('[role="dialog"]').filter({
      has: page.locator('h2', { hasText: /Assign to Work Item or Household Item|Select Budget Line/i }),
    });
    this.pickerBackButton = anyPickerModal.getByRole('button', { name: /← Back/i });

    // Step 2 — "Create Budget Line" button (shown in empty state and below existing lines)
    this.pickerCreateBudgetLineButton = anyPickerModal.getByRole('button', {
      name: /Create Budget Line/i,
    });

    // Step 2 — Inline BudgetLineForm fieldset (class*="createBudgetLineFieldset")
    this.pickerCreateBudgetLineFieldset = anyPickerModal.locator('[class*="createBudgetLineFieldset"]');
  }

  /**
   * Navigate directly to the AutoItemizePage.
   * In real usage this page is reached via InvoiceDetailPage → Itemize button.
   */
  async goto(invoiceId: string, documentId: number): Promise<void> {
    await this.page.goto(`/budget/invoices/${invoiceId}/auto-itemize/${documentId}`);
    await this.pageTitle.waitFor({ state: 'visible' });
  }

  /**
   * Returns the picker modal when it is in step 2 (budget line list).
   * The modal title in step 2 changes to "Select Budget Line for {itemTitle}".
   * Use this locator to scope step-2 assertions.
   */
  pickerStep2Modal(): Locator {
    return this.page.locator('[role="dialog"]').filter({
      has: this.page.locator('h2', { hasText: /Select Budget Line/i }),
    });
  }

  /**
   * Returns a budget line row button in step 2 of the picker modal.
   * Each unlinked budget line is rendered as a <button class*="pickerBudgetLineRow">.
   * @param nameOrIndex - 0-based row index OR a string/RegExp to match by visible text
   */
  pickerBudgetLineRow(nameOrIndex: number | string | RegExp): Locator {
    const step2 = this.pickerStep2Modal();
    if (typeof nameOrIndex === 'number') {
      return step2.locator('[class*="pickerBudgetLineRow"]').nth(nameOrIndex);
    }
    return step2.locator('[class*="pickerBudgetLineRow"]').filter({
      hasText: nameOrIndex,
    });
  }

  /**
   * Returns the SuggestionBadge container for a given field.
   * The badge is rendered as <span class="badge"> adjacent to the field's input.
   * We use the input's id to scope to the right field row.
   *
   * Supported fields:
   *   'amount'  → scoped to the #amount row's parent
   *   'date'    → scoped to the #date row's parent
   *   'dueDate' → scoped to the #due-date row's parent
   */
  suggestionBadge(field: 'amount' | 'date' | 'dueDate'): Locator {
    const inputId = field === 'dueDate' ? 'due-date' : field;
    // The badge is a sibling of the input, inside a field-control div or the field row
    return this.page.locator(`#${inputId}`).locator('xpath=ancestor::div').locator('[class*="badge"]').first();
  }

  /**
   * Returns the Apply button inside a SuggestionBadge for a given field.
   * Uses the aria-label pattern: t('autoItemize.applySuggestion', { field, value })
   */
  applyBadgeButton(field: 'amount' | 'date' | 'dueDate'): Locator {
    // Scope to the badge adjacent to the field input
    const inputId = field === 'dueDate' ? 'due-date' : field;
    return this.page
      .locator(`#${inputId}`)
      .locator('xpath=ancestor::div[contains(@class,"fieldRow") or contains(@class,"field")]')
      .first()
      .getByRole('button', { name: /Apply/i });
  }

  /**
   * Returns the <tr> at the given 0-based index in the extracted lines tbody.
   */
  lineRow(index: number): Locator {
    return this.page.locator('table tbody tr:not([class*="totalsRow"])').nth(index);
  }

  /**
   * Returns the include checkbox for the line at the given 0-based index.
   * The include checkbox is always the FIRST <input type="checkbox"> in the row.
   */
  lineCheckbox(index: number): Locator {
    return this.lineRow(index).locator('input[type="checkbox"]').first();
  }

  /**
   * Returns the description text cell of the line at the given 0-based index.
   * The description column renders as a plain <td> (no input).
   */
  lineDescription(index: number): Locator {
    // Column order: Include, Description(1), Quantity(2), UnitPrice(3), Amount(4), AssignTo(5)
    return this.lineRow(index).locator('td').nth(1);
  }

  /**
   * Returns the total amount cell of the line at the given 0-based index.
   */
  lineTotal(index: number): Locator {
    return this.lineRow(index).locator('td').nth(4);
  }

  // ─── Per-row assignment helpers (story #1564 Round 2) ──────────────────────

  /**
   * Returns the "Assign…" button in the "Assign To" cell of the row at the given
   * 0-based index. Only present when the row has no assignedBudgetLineId.
   * Button class: class*="assignButtonInTable", text: "Assign…"
   */
  lineAssignButton(index: number): Locator {
    return this.lineRow(index).locator('[class*="assignButtonInTable"]');
  }

  /**
   * Returns the assigned badge container for the row at the given 0-based index.
   * Present when line.assignedBudgetLineId is set.
   * class*="assignedBadge"
   */
  lineAssignedBadge(index: number): Locator {
    return this.lineRow(index).locator('[class*="assignedBadge"]');
  }

  /**
   * Returns the description text inside the assigned badge for the row.
   * This is the <span> containing the budget line description.
   */
  lineAssignedDescription(index: number): Locator {
    return this.lineAssignedBadge(index).locator('span').first();
  }

  /**
   * Returns the "Clear" button inside the assigned badge for the row.
   * aria-label: "Clear budget line assignment" (t('autoItemize.clearAssignmentAriaLabel'))
   */
  lineClearAssignButton(index: number): Locator {
    return this.lineAssignedBadge(index).locator('[class*="clearAssignButton"]');
  }

  /**
   * Waits for the analyzing skeleton to disappear and lines to be rendered.
   * Succeeds when at least one <tr> (non-totals) appears in tbody.
   */
  async waitForAnalyzingDone(): Promise<void> {
    // Wait for analyzing caption to disappear (set when loading state ends)
    await this.analyzingCaption.waitFor({ state: 'hidden' });
    // Then wait for at least one data row to appear
    await this.page
      .locator('table tbody tr:not([class*="totalsRow"])')
      .first()
      .waitFor({ state: 'visible' });
  }

  /**
   * Clicks Save and waits for navigation back to the invoice detail page.
   */
  async save(): Promise<void> {
    await this.saveButton.click();
    await this.page.waitForURL(/\/budget\/invoices\/[^/]+$/);
  }

  /**
   * Clicks Cancel.
   * If expectModal=true, waits for the discard confirmation modal to appear.
   * If expectModal=false (default), expects immediate navigation back.
   */
  async cancel(expectModal = false): Promise<void> {
    await this.cancelButton.click();
    if (expectModal) {
      await this.cancelModal.waitFor({ state: 'visible' });
    } else {
      await this.page.waitForURL(/\/budget\/invoices\/[^/]+$/);
    }
  }
}
