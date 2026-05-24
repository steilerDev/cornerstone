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
 *   - Step 1 body: p with t('autoItemize.pickerSelectTypeLabel') = "Choose item type:"
 *     followed by two buttons in div class*="pickerTypeButtons":
 *       "Work Item" (t('autoItemize.pickerWorkItemType'))
 *       "Household Item" (t('autoItemize.pickerHouseholdItemType'))
 *   - NOTE (story #1564 Round 2): Step 2 (WorkItemPicker search + budget line selection)
 *     is NOT yet rendered in AutoItemizePage.tsx. The picker modal only shows step 1 type
 *     buttons. Step 2 UI must be implemented before Scenario 13 can be fully exercised.
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
  // The budget line picker modal (step 1 only — step 2 not yet implemented):
  //  - pickerModal: role="dialog" with h2 "Assign to Work Item or Household Item"
  //  - pickerWorkItemButton: "Work Item" button inside the picker type selection
  //  - pickerHouseholdItemButton: "Household Item" button inside the picker type selection

  /** Budget line assignment picker modal (step 1: type selection). */
  readonly pickerModal: Locator;

  /** "Work Item" type-selection button inside the picker modal (step 1). */
  readonly pickerWorkItemButton: Locator;

  /** "Household Item" type-selection button inside the picker modal (step 1). */
  readonly pickerHouseholdItemButton: Locator;

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
    // Modal title (step 1): "Assign to Work Item or Household Item"
    // (t('autoItemize.pickerTitle'))
    this.pickerModal = page.locator('[role="dialog"]').filter({
      has: page.locator('h2', { hasText: /Assign to Work Item or Household Item/i }),
    });

    // "Work Item" button inside the picker modal step 1 type-selection div
    this.pickerWorkItemButton = this.pickerModal.getByRole('button', {
      name: /^Work Item$/i,
    });

    // "Household Item" button inside the picker modal step 1 type-selection div
    this.pickerHouseholdItemButton = this.pickerModal.getByRole('button', {
      name: /^Household Item$/i,
    });
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
    return this.page.locator('table tbody tr').filter({ hasNot: this.page.locator('[class*="totalsRow"]') }).nth(index);
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
      .locator('table tbody tr')
      .filter({ hasNot: this.page.locator('[class*="totalsRow"]') })
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
