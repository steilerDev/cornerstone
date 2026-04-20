/**
 * Page Object Model for the Budget Sources page (/budget/sources)
 *
 * The page renders:
 * - An h1 "Budget" page title
 * - BudgetSubNav
 * - An "Add Source" button (no h2 "Sources" section heading — removed in visual cleanup #1185)
 * - An inline create form (h2 "New Budget Source") toggled by "Add Source"
 * - A sources list (class `.sourcesList`) with inline edit forms per row
 * - A delete confirmation modal (role="dialog", aria-labelledby="delete-modal-title")
 * - Success/error banners (role="alert")
 */

import type { Page, Locator } from '@playwright/test';

export const BUDGET_SOURCES_ROUTE = '/budget/sources';

export interface CreateBudgetSourceData {
  name: string;
  sourceType?: 'bank_loan' | 'credit_line' | 'savings' | 'other';
  status?: 'active' | 'exhausted' | 'closed';
  totalAmount: number | string;
  interestRate?: number | string;
  terms?: string;
  notes?: string;
}

export class BudgetSourcesPage {
  readonly page: Page;

  // Page heading
  readonly heading: Locator;

  /**
   * @deprecated The h2 "Sources" section heading was removed in visual cleanup #1185.
   * This locator will not match any element. Tests should not assert on it.
   * Kept so TypeScript callers compile without changes.
   */
  readonly sectionTitle: Locator;
  readonly addSourceButton: Locator;

  // Create form (only visible after clicking "Add Source")
  readonly createForm: Locator;
  readonly createFormHeading: Locator;
  readonly createNameInput: Locator;
  readonly createTypeSelect: Locator;
  readonly createStatusSelect: Locator;
  readonly createTotalAmountInput: Locator;
  readonly createInterestRateInput: Locator;
  readonly createTermsInput: Locator;
  readonly createNotesInput: Locator;
  readonly createSubmitButton: Locator;
  readonly createCancelButton: Locator;
  readonly createErrorBanner: Locator;

  // Sources list
  readonly sourcesList: Locator;
  readonly emptyState: Locator;

  // Global banners
  readonly successBanner: Locator;
  readonly errorBanner: Locator;

  // Delete modal
  readonly deleteModal: Locator;
  readonly deleteModalTitle: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;
  readonly deleteErrorBanner: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', { level: 1, name: 'Budget', exact: true });

    // Visual cleanup #1185: the h2 "Sources" section heading was removed.
    // This locator is kept for TypeScript compatibility but will not match any element.
    this.sectionTitle = page.getByRole('heading', { level: 2, name: 'Sources', exact: true });
    this.addSourceButton = page.getByRole('button', { name: 'Add Source', exact: true });

    // Create form — identified by its h2 heading "New Budget Source"
    this.createFormHeading = page.getByRole('heading', {
      level: 2,
      name: 'New Budget Source',
      exact: true,
    });
    // The form is inside the same card section as the heading
    this.createForm = page
      .getByRole('heading', { level: 2, name: 'New Budget Source', exact: true })
      .locator('..'); // parent section.card

    this.createNameInput = page.locator('#sourceName');
    this.createTypeSelect = page.locator('#sourceType');
    this.createStatusSelect = page.locator('#sourceStatus');
    this.createTotalAmountInput = page.locator('#sourceTotalAmount');
    this.createInterestRateInput = page.locator('#sourceInterestRate');
    this.createTermsInput = page.locator('#sourceTerms');
    this.createNotesInput = page.locator('#sourceNotes');
    this.createSubmitButton = page.getByRole('button', { name: /Create Source|Creating\.\.\./ });
    // The Cancel button inside the create form — scope it to the form heading's ancestor
    this.createCancelButton = this.createForm.getByRole('button', { name: 'Cancel', exact: true });
    this.createErrorBanner = this.createForm.locator('[role="alert"]');

    // Sources list section and empty state
    this.sourcesList = page.locator('[class*="sourcesList"]');
    this.emptyState = page.locator('p[class*="emptyState"]');

    // Global banners — the success/error banners in the main content area
    this.successBanner = page
      .locator('[role="alert"]')
      .filter({ hasText: /successfully/i })
      .first();
    this.errorBanner = page
      .locator('[role="alert"]')
      .filter({ hasText: /failed|error/i })
      .first();

    // Delete modal
    this.deleteModal = page.getByRole('dialog', { name: 'Delete Budget Source' });
    this.deleteModalTitle = page.locator('#delete-modal-title');
    this.deleteConfirmButton = this.deleteModal.getByRole('button', {
      name: /Delete Source|Deleting\.\.\./,
    });
    this.deleteCancelButton = this.deleteModal.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    this.deleteErrorBanner = this.deleteModal.locator('[role="alert"]');
  }

  async goto(): Promise<void> {
    await this.page.goto(BUDGET_SOURCES_ROUTE);
    // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Open the create form by clicking "Add Source".
   */
  async openCreateForm(): Promise<void> {
    await this.addSourceButton.click();
    // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
    await this.createFormHeading.waitFor({ state: 'visible' });
  }

  /**
   * Fill and submit the create source form.
   * `name` and `totalAmount` are required; other fields are optional.
   */
  async createSource(data: CreateBudgetSourceData): Promise<void> {
    await this.createNameInput.fill(data.name);
    if (data.sourceType !== undefined) {
      await this.createTypeSelect.selectOption(data.sourceType);
    }
    if (data.status !== undefined) {
      await this.createStatusSelect.selectOption(data.status);
    }
    await this.createTotalAmountInput.fill(String(data.totalAmount));
    if (data.interestRate !== undefined) {
      await this.createInterestRateInput.fill(String(data.interestRate));
    }
    if (data.terms !== undefined) {
      await this.createTermsInput.fill(data.terms);
    }
    if (data.notes !== undefined) {
      await this.createNotesInput.fill(data.notes);
    }
    await this.createSubmitButton.click();
  }

  /**
   * Wait for the sources list to be in a settled state — either at least one
   * source row is visible, or the empty state paragraph is visible.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async waitForSourcesLoaded(): Promise<void> {
    await Promise.race([
      this.sourcesList.locator('[class*="sourceRow_"]').first().waitFor({ state: 'visible' }),
      this.emptyState.waitFor({ state: 'visible' }),
    ]);
  }

  /**
   * Get all source row locators from the sources list.
   */
  async getSourceRows(): Promise<Locator[]> {
    return await this.page.locator('[class*="sourceRow_"]').all();
  }

  /**
   * Get the display name text of every source currently shown in the list.
   * Reads from the `.sourceName` span within each non-editing row.
   */
  async getSourceNames(): Promise<string[]> {
    const nameLocators = await this.page.locator('[class*="sourceName"]').all();
    const names: string[] = [];
    for (const loc of nameLocators) {
      const text = await loc.textContent();
      if (text) names.push(text.trim());
    }
    return names;
  }

  /**
   * Find the source row that contains the given source name.
   * Returns null if not found.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async getSourceRow(name: string): Promise<Locator | null> {
    try {
      await this.page.locator('[class*="sourceRow_"]').first().waitFor({ state: 'visible' });
    } catch {
      return null;
    }
    const rows = await this.getSourceRows();
    for (const row of rows) {
      const nameEl = row.locator('[class*="sourceName"]');
      const count = await nameEl.count();
      if (count === 0) continue; // row is in edit mode — no sourceName span
      const text = await nameEl.textContent();
      if (text?.trim() === name) return row;
    }
    return null;
  }

  /**
   * Click the Edit button for the named source to enter inline edit mode.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async startEdit(name: string): Promise<void> {
    await this.page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
    // Wait for the edit form (identified by its aria-label)
    await this.page.getByRole('form', { name: `Edit ${name}` }).waitFor({ state: 'visible' });
  }

  /**
   * Get the inline edit form locator for the source currently being edited.
   */
  getEditForm(name: string): Locator {
    return this.page.getByRole('form', { name: `Edit ${name}` });
  }

  /**
   * Click the Save button within the active edit form for the named source.
   */
  async saveEdit(name: string): Promise<void> {
    const form = this.getEditForm(name);
    await form.getByRole('button', { name: /^Save$|^Saving\.\.\.$/ }).click();
  }

  /**
   * Click the Cancel button within the active edit form for the named source.
   */
  async cancelEdit(name: string): Promise<void> {
    const form = this.getEditForm(name);
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  }

  /**
   * Open the delete confirmation modal for the source with the given name.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async openDeleteModal(name: string): Promise<void> {
    await this.page
      .getByRole('button', { name: `Delete ${name}`, exact: true })
      .first()
      .click();
    await this.deleteModal.waitFor({ state: 'visible' });
  }

  /**
   * Confirm deletion by clicking "Delete Source" in the modal.
   */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
  }

  /**
   * Cancel deletion — click "Cancel" and wait for the modal to close.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  /**
   * Get the visible success banner text, or null if not present.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async getSuccessBannerText(): Promise<string | null> {
    try {
      await this.successBanner.waitFor({ state: 'visible' });
      return await this.successBanner.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Get the create form error banner text, or null if not visible.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async getCreateErrorText(): Promise<string | null> {
    try {
      await this.createErrorBanner.waitFor({ state: 'visible' });
      return await this.createErrorBanner.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Get the delete modal error banner text, or null if not visible.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
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
   * Find the source row that contains the given source name, scoped to non-editing display rows.
   * The row must be visible and not in edit mode.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  getSourceRowByName(name: string): import('@playwright/test').Locator {
    return this.page.locator('[class*="sourceRow_"]').filter({ hasText: name });
  }

  /**
   * Get the "System" badge within the named source row.
   * Returns null if the source is not found or has no system badge.
   */
  getSystemBadge(sourceName: string): import('@playwright/test').Locator {
    return this.getSourceRowByName(sourceName).locator('[class*="systemBadge"]');
  }

  /**
   * Get the inline edit type select for the source currently being edited (by source id).
   */
  getEditTypeSelect(sourceId: string): import('@playwright/test').Locator {
    return this.page.locator(`#edit-type-${sourceId}`);
  }

  /**
   * Get all summary label spans within a source row (the SourceBarChart summary table labels).
   * After the bar chart rework (#1319), the summary table uses `summaryLabel` CSS module class.
   * Each label corresponds to one row: Projected, Paid, Claimed (in that order).
   *
   * @deprecated `barLegendLabel` no longer exists after PR #1319. Use `getSummaryLabels()` instead.
   */
  getAmountLabelsInRow(sourceName: string): import('@playwright/test').Locator {
    return this.getSummaryLabels(sourceName);
  }

  /**
   * Get the total badge span within the source row header.
   * Renders as: <span class="totalBadge">Total: €100,000.00</span>
   * (class name contains "totalBadge" after CSS Modules transformation)
   */
  getTotalBadge(sourceName: string): import('@playwright/test').Locator {
    return this.getSourceRowByName(sourceName).locator('[class*="totalBadge"]');
  }

  /**
   * Get all summary label spans within a source row.
   * Three labels render in order: Projected, Paid, Claimed.
   * Each label is a <span class="summaryLabel"> inside the summary table.
   */
  getSummaryLabels(sourceName: string): import('@playwright/test').Locator {
    return this.getSourceRowByName(sourceName).locator('[class*="summaryLabel"]:not([class*="summaryLabelDot"])');
  }

  /**
   * Get the interest rate subtitle paragraph within the source row.
   * Renders as: <p class="sourceInterestRate">Rate X.X%</p>
   * Only present when the source has a non-null interestRate.
   */
  getInterestRateSubtitle(sourceName: string): import('@playwright/test').Locator {
    return this.getSourceRowByName(sourceName).locator('[class*="sourceInterestRate"]');
  }

  // ─── Budget Lines Expansion helpers (Story #1247) ────────────────────────────

  /**
   * Get the expand/collapse toggle button for the named source row.
   * The button has aria-label "Expand budget lines for <name>" or
   * "Collapse budget lines for <name>".
   */
  getExpandToggle(sourceName: string): import('@playwright/test').Locator {
    return this.getSourceRowByName(sourceName).getByRole('button', {
      name: new RegExp(
        `(Expand|Collapse) budget lines for ${sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i',
      ),
    });
  }

  /**
   * Get the lines panel region for a specific source by its ID.
   * The panel renders as: <div id="source-lines-{sourceId}" role="region">
   */
  getLinesPanelById(sourceId: string): import('@playwright/test').Locator {
    return this.page.locator(`[id="source-lines-${sourceId}"]`);
  }

  /**
   * Click the expand toggle for the named source and wait for the panel to appear.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async expandSourceLines(sourceName: string): Promise<void> {
    const toggle = this.getExpandToggle(sourceName);
    await toggle.waitFor({ state: 'visible' });
    await toggle.click();
  }

  /**
   * Click the collapse toggle for the named source and wait for the panel to be hidden.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async collapseSourceLines(sourceName: string): Promise<void> {
    const toggle = this.getExpandToggle(sourceName);
    await toggle.waitFor({ state: 'visible' });
    await toggle.click();
  }

  // ─── Multi-select + Mass-Move helpers (Story #1248) ──────────────────────────

  /**
   * Get the per-line checkbox inside a lines panel for the given source.
   * The checkbox has aria-label "Select {description}".
   *
   * @param sourceId    The numeric source ID used to scope to the correct panel.
   * @param lineDescription  The line's description text (used in the aria-label).
   */
  getLineCheckbox(sourceId: string, lineDescription: string): import('@playwright/test').Locator {
    return this.getLinesPanelById(sourceId).getByRole('checkbox', {
      name: `Select ${lineDescription}`,
    });
  }

  /**
   * Get the area group tri-state checkbox inside a lines panel.
   * The checkbox has aria-label "Select all in {areaName}".
   *
   * @param sourceId  The numeric source ID used to scope to the correct panel.
   * @param areaName  The area name displayed in the group header (or the i18n "No Area" label).
   */
  getAreaGroupCheckbox(sourceId: string, areaName: string): import('@playwright/test').Locator {
    return this.getLinesPanelById(sourceId).getByRole('checkbox', {
      name: `Select all in ${areaName}`,
    });
  }

  /**
   * Get the sticky floating action bar inside the lines panel.
   * The bar renders inside the panel when ≥1 line is selected.
   * It contains the "N lines selected" count and the "Move to another source…" button.
   *
   * The selector excludes `.actionBarCount` and `.actionBarButton` children which also
   * contain "actionBar" in their CSS module class names, avoiding a strict-mode violation.
   */
  getActionBar(sourceId: string): import('@playwright/test').Locator {
    return this.getLinesPanelById(sourceId).locator(
      '[class*="actionBar"]:not([class*="actionBarCount"]):not([class*="actionBarButton"])',
    );
  }

  /**
   * Get the "Move to another source…" button inside the action bar.
   */
  getMoveButton(sourceId: string): import('@playwright/test').Locator {
    return this.getActionBar(sourceId).getByRole('button', {
      name: 'Move to another source\u2026',
    });
  }

  // ─── Move modal locators ──────────────────────────────────────────────────────

  /**
   * The mass-move modal dialog. Title: "Move lines to another source".
   * Uses Modal component which sets role="dialog" + aria-labelledby on the h2 title.
   */
  get moveModal(): import('@playwright/test').Locator {
    return this.page.getByRole('dialog', { name: 'Move lines to another source' });
  }

  /**
   * The SearchPicker input inside the move modal.
   * The input has id="target-source".
   */
  get moveModalSearchInput(): import('@playwright/test').Locator {
    return this.moveModal.locator('#target-source');
  }

  /**
   * The "Move lines" confirm button inside the move modal footer.
   */
  get moveModalConfirmButton(): import('@playwright/test').Locator {
    return this.moveModal.getByRole('button', { name: /Move lines|Loading/i });
  }

  /**
   * The Cancel button inside the move modal footer.
   */
  get moveModalCancelButton(): import('@playwright/test').Locator {
    return this.moveModal.getByRole('button', { name: 'Cancel', exact: true });
  }

  /**
   * The claimed invoice warning block inside the move modal.
   * Renders as role="alert" only when claimedCount > 0.
   */
  get moveModalWarningBlock(): import('@playwright/test').Locator {
    return this.moveModal.locator('[role="alert"]');
  }

  /**
   * The "I understand" checkbox inside the claimed warning block.
   */
  get moveModalUnderstoodCheckbox(): import('@playwright/test').Locator {
    return this.moveModal.getByRole('checkbox', {
      name: 'I understand this will reassign lines with a claimed invoice',
    });
  }

  /**
   * The FormError banner inside the move modal (shown on API error).
   * FormError renders a div with the CSS module class "banner" and role="alert".
   * Differentiated from the claimed-invoice warning block via the CSS class name.
   */
  get moveModalFormError(): import('@playwright/test').Locator {
    // FormError uses its own CSS module: styles.banner → [class*="banner"]
    // The warning block uses MassMoveModal's styles.warningBlock → [class*="warningBlock"]
    // These are distinct CSS module classes so the selector is unambiguous.
    return this.moveModal.locator('[class*="banner"]');
  }

  // ─── Move modal actions ───────────────────────────────────────────────────────

  /**
   * Click the "Move to another source…" button to open the mass-move modal.
   * Waits for the modal to be visible.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async openMoveModal(sourceId: string): Promise<void> {
    await this.getMoveButton(sourceId).click();
    await this.moveModal.waitFor({ state: 'visible' });
  }

  /**
   * Type into the SearchPicker inside the move modal and click the result
   * that matches `targetName`.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async selectMoveTarget(targetName: string): Promise<void> {
    // Focus the search input to trigger initial results load (showItemsOnFocus=true).
    const input = this.moveModalSearchInput;
    await input.waitFor({ state: 'visible' });
    await input.click();
    // Type enough of the name to filter results.
    await input.fill(targetName);
    // Wait for the dropdown option to appear and click it.
    await this.moveModal.getByRole('option', { name: targetName }).click();
  }

  /**
   * Click the "Move lines" confirm button.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async confirmMove(): Promise<void> {
    await this.moveModalConfirmButton.click();
  }
}
