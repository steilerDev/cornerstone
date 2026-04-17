/**
 * Page Object Model for the Milestones list page (/project/milestones)
 *
 * The page renders:
 * - A PageLayout with h1 "Project" (schedule namespace: milestones.page.title = "Project")
 *   and a "New Milestone" button (data-testid="new-milestone-button")
 * - A SubNav with tabs including "Milestones" (active)
 * - A DataTable with search input (aria-label="Search items") and per-column filter buttons
 * - Filter buttons: "Filter by Status", "Filter by Target Date", "Filter by Linked Items"
 * - Table columns: Title, Target Date, Status (Badge), Linked Items, Description
 * - An actions menu per row (aria-label="Actions menu" = t('milestones.menu.actions') = "Actions menu")
 *   with Edit and Delete options (data-testid="milestone-edit-{id}", "milestone-delete-{id}")
 * - An empty state when no milestones exist (DataTable EmptyState component)
 * - A delete confirmation Modal (role="dialog") using sharedStyles.btnConfirmDelete
 * - An error display rendered by DataTable when load fails
 *
 * Key DOM observations from source code:
 * - "New Milestone" is a <button> with data-testid="new-milestone-button" calling navigate()
 * - The delete modal is the shared Modal component (role="dialog") with:
 *   - title = t('milestones.delete.confirm') = "Delete Milestone"
 *   - Cancel: sharedStyles.btnSecondary, text "Cancel"
 *   - Confirm: sharedStyles.btnConfirmDelete, text "Delete Milestone" / "Deleting..."
 * - Actions menu button has aria-label="Actions menu" (from t('milestones.menu.actions'))
 * - Edit menu item: t('milestones.menu.edit') = "Edit"
 * - Delete menu item: t('milestones.menu.delete') = "Delete"
 * - Client-side filtering: search, status filter (enum), targetDate filter (date range)
 * - Search is client-side (no URL param), so no waitForResponse needed — filter is synchronous
 */

import type { Page, Locator } from '@playwright/test';

export const MILESTONES_ROUTE = '/project/milestones';
export const MILESTONES_NEW_ROUTE = '/project/milestones/new';

export class MilestonesPage {
  readonly page: Page;

  // Page header
  readonly heading: Locator;
  readonly newMilestoneButton: Locator;

  // Search and filter controls (DataTable)
  readonly searchInput: Locator;
  readonly statusFilter: Locator;
  readonly targetDateFilter: Locator;

  // Table (desktop view)
  readonly tableContainer: Locator;
  readonly tableBody: Locator;

  // Cards (mobile view)
  readonly cardsContainer: Locator;

  // Empty state
  readonly emptyState: Locator;

  // Error banner (DataTable renders this when load fails)
  readonly errorBanner: Locator;

  // Delete confirmation modal (shared Modal component, role="dialog")
  readonly deleteModal: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // PageLayout renders h1 with t('milestones.page.title') = "Project"
    this.heading = page.getByRole('heading', { level: 1, name: 'Project', exact: true });
    // New Milestone button uses data-testid for stable selection
    this.newMilestoneButton = page.getByTestId('new-milestone-button');

    // DataTable search input (aria-label="Search items" for all DataTable pages)
    this.searchInput = page.getByLabel('Search items');
    // Column filter buttons (DataTable renders "Filter by {column label}")
    this.statusFilter = page.getByRole('button', { name: 'Filter by Status' });
    this.targetDateFilter = page.getByRole('button', { name: 'Filter by Target Date' });

    // Table (desktop) — [class*="tableContainer"] is the DataTable table wrapper
    this.tableContainer = page.locator('[class*="tableContainer"]');
    this.tableBody = this.tableContainer.locator('tbody');

    // Mobile cards container
    this.cardsContainer = page.locator('[class*="cardsContainer"]');

    // Empty state — use .first() to avoid strict mode: child elements (emptyStateTitle,
    // emptyStateDescription) also have "emptyState" in their class names.
    this.emptyState = page.locator('[class*="emptyState"]').first();

    // Error banner from DataTable
    this.errorBanner = page.locator('[role="alert"]');

    // Delete confirmation modal: the shared Modal component renders role="dialog"
    // The modal title = "Delete Milestone" (t('milestones.delete.confirm'))
    this.deleteModal = page.getByRole('dialog', { name: 'Delete Milestone' });
    // Confirm button uses sharedStyles.btnConfirmDelete (class hashed by CSS Modules)
    this.deleteConfirmButton = this.deleteModal.locator('[class*="btnConfirmDelete"]');
    // Cancel button uses sharedStyles.btnSecondary, text "Cancel"
    this.deleteCancelButton = this.deleteModal.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
  }

  /**
   * Navigate to the milestones list page.
   * No explicit timeout — uses project-level actionTimeout.
   */
  async goto(): Promise<void> {
    await this.page.goto(MILESTONES_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Wait for the milestones list to finish loading.
   * Races: table rows visible, mobile cards visible, or empty state visible.
   */
  async waitForLoaded(): Promise<void> {
    await Promise.race([
      this.tableBody.locator('tr').first().waitFor({ state: 'visible' }),
      this.cardsContainer.locator('[class*="card"]').first().waitFor({ state: 'visible' }),
      this.emptyState.waitFor({ state: 'visible' }),
    ]);
  }

  /**
   * Get the titles of all milestones currently shown.
   * Uses table rows on desktop/tablet, card view on mobile.
   *
   * Milestones page uses DataTable with a 'title' column — the title cell
   * does NOT use a special CSS class (it's a plain string render, not a <Link>).
   * We read text from the first column cells in tbody.
   */
  async getMilestoneTitles(): Promise<string[]> {
    const tableVisible = await this.tableContainer.isVisible();

    if (tableVisible) {
      // Desktop/tablet: read first column (Title) from each row.
      // DataTable renders td cells; the title column is first.
      const rows = await this.tableBody.locator('tr').all();
      const titles: string[] = [];
      for (const row of rows) {
        // First td in each row is the Title column
        const titleCell = row.locator('td').first();
        const text = await titleCell.textContent();
        if (text) titles.push(text.trim());
      }
      return titles;
    }

    // Mobile fallback: DataTableCard renders cards with first column as header.
    // `.cardsContainer` holds direct `.card` children; use `[class^="card_"]` so the
    // CSS-module-hashed `card_abc123` class is matched without greedy sub-string
    // matches picking up `cardHeader_/cardRow_/cardValue_` etc.
    const cards = await this.cardsContainer.locator('[class^="card_"]').all();
    const titles: string[] = [];
    for (const card of cards) {
      // First cardValue in the card is the Title column value
      const titleEl = card.locator('[class*="cardValue"]').first();
      const text = await titleEl.textContent();
      if (text) titles.push(text.trim());
    }
    return titles;
  }

  /**
   * Search the milestones list.
   * Search is client-side (no debounce + API round-trip), so we only
   * fill the input and wait for the DOM to update synchronously.
   */
  async search(query: string): Promise<void> {
    await this.searchInput.waitFor({ state: 'visible' });
    await this.searchInput.scrollIntoViewIfNeeded();
    await this.searchInput.fill(query);
  }

  /**
   * Clear the search input.
   */
  async clearSearch(): Promise<void> {
    await this.searchInput.clear();
  }

  /**
   * Open the actions menu for the milestone with the given title.
   * Clicks the "Actions menu" button (⋮) in the table row or card.
   */
  async openActionsMenu(title: string): Promise<void> {
    const tableVisible = await this.tableContainer.isVisible();

    if (tableVisible) {
      const rows = await this.tableBody.locator('tr').all();
      for (const row of rows) {
        const rowText = await row.textContent();
        if (rowText?.includes(title)) {
          await row.locator('[aria-label="Actions menu"]').click();
          return;
        }
      }
    }

    // Mobile fallback: search in cards
    const cards = await this.cardsContainer.locator('[class*="card"]').all();
    for (const card of cards) {
      const cardText = await card.textContent();
      if (cardText?.includes(title)) {
        await card.locator('[aria-label="Actions menu"]').click();
        return;
      }
    }

    throw new Error(`Milestone with title "${title}" not found in list`);
  }

  /**
   * Open the delete modal for the milestone with the given title.
   * Opens the actions menu then clicks "Delete".
   */
  async openDeleteModal(title: string): Promise<void> {
    const tableVisible = await this.tableContainer.isVisible();

    if (tableVisible) {
      const rows = await this.tableBody.locator('tr').all();
      for (const row of rows) {
        const rowText = await row.textContent();
        if (rowText?.includes(title)) {
          await row.locator('[aria-label="Actions menu"]').click();
          // The menu dropdown renders buttons: "Edit" and "Delete"
          await this.page.getByRole('button', { name: 'Delete', exact: true }).click();
          await this.deleteModal.waitFor({ state: 'visible' });
          return;
        }
      }
    }

    // Mobile fallback
    const cards = await this.cardsContainer.locator('[class*="card"]').all();
    for (const card of cards) {
      const cardText = await card.textContent();
      if (cardText?.includes(title)) {
        await card.locator('[aria-label="Actions menu"]').click();
        await this.page.getByRole('button', { name: 'Delete', exact: true }).click();
        await this.deleteModal.waitFor({ state: 'visible' });
        return;
      }
    }

    throw new Error(`Milestone with title "${title}" not found in list`);
  }

  /**
   * Confirm the deletion in the delete modal.
   * Waits for the DELETE API response and modal to hide.
   */
  async confirmDelete(): Promise<void> {
    const deleteResponsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/milestones') &&
        resp.request().method() === 'DELETE' &&
        resp.status() === 204,
    );
    await this.deleteConfirmButton.click();
    await deleteResponsePromise;
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  /**
   * Cancel the delete modal without deleting.
   */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  /**
   * Click a table row by title to navigate to the milestone detail page.
   */
  async clickMilestoneRow(title: string): Promise<void> {
    const tableVisible = await this.tableContainer.isVisible();

    if (tableVisible) {
      const rows = await this.tableBody.locator('tr').all();
      for (const row of rows) {
        const rowText = await row.textContent();
        if (rowText?.includes(title)) {
          await row.click();
          return;
        }
      }
    }

    // Mobile fallback: click card
    const cards = await this.cardsContainer.locator('[class*="card"]').all();
    for (const card of cards) {
      const cardText = await card.textContent();
      if (cardText?.includes(title)) {
        await card.click();
        return;
      }
    }

    throw new Error(`Milestone with title "${title}" not found in list`);
  }
}
