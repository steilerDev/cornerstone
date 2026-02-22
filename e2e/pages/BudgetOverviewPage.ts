/**
 * Page Object Model for the Budget Overview page (/budget/overview)
 *
 * The page renders:
 * - An h1 "Budget" page title
 * - BudgetSubNav (tab-style nav for the Budget section)
 * - Loading indicator while data is fetched
 * - Error card with a Retry button if the API fails
 * - Empty state when no budget data has been entered
 * - A 4-card summary grid: Total Budget, Financing, Vendors, Subsidies
 * - A Category Breakdown table (may be empty if no categories are assigned)
 */

import type { Page, Locator } from '@playwright/test';

export const BUDGET_OVERVIEW_ROUTE = '/budget/overview';

export class BudgetOverviewPage {
  readonly page: Page;

  // Page heading
  readonly heading: Locator;

  // BudgetSubNav
  readonly subNav: Locator;

  // Loading indicator
  readonly loadingIndicator: Locator;

  // Error state
  readonly errorCard: Locator;
  readonly retryButton: Locator;

  // Empty state
  readonly emptyState: Locator;

  // Summary cards grid
  readonly cardsGrid: Locator;

  // Category breakdown section
  readonly categoryBreakdownHeading: Locator;
  readonly categoryBreakdownTable: Locator;
  readonly categoryBreakdownTableBody: Locator;
  readonly categoryBreakdownTableFooter: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', { level: 1, name: 'Budget', exact: true });

    this.subNav = page.getByRole('navigation', { name: 'Budget section navigation' });

    this.loadingIndicator = page.getByRole('status', { name: 'Loading budget overview' });

    // Error card: role="alert" containing an h2 "Error"
    this.errorCard = page.locator('[role="alert"]').filter({
      has: page.getByRole('heading', { name: 'Error', exact: true }),
    });
    this.retryButton = this.errorCard.getByRole('button', { name: 'Retry', exact: true });

    // Empty state: class `.emptyState` rendered when no budget data exists.
    // Use div[class*="emptyState"] to avoid matching child elements
    // (.emptyStateTitle, .emptyStateDescription) which also contain "emptyState" in
    // their class names and would cause a strict mode violation.
    this.emptyState = page.locator('div[class*="emptyState"]');

    // Summary cards: the grid container
    this.cardsGrid = page.locator('[class*="cardsGrid"]');

    // Category breakdown: the section is identified by its heading id
    this.categoryBreakdownHeading = page.locator('#category-breakdown-heading');
    this.categoryBreakdownTable = page
      .locator('[aria-labelledby="category-breakdown-heading"]')
      .locator('table');
    this.categoryBreakdownTableBody = this.categoryBreakdownTable.locator('tbody');
    this.categoryBreakdownTableFooter = this.categoryBreakdownTable.locator('tfoot');
  }

  async goto(): Promise<void> {
    await this.page.goto(BUDGET_OVERVIEW_ROUTE);
    // Wait for either the heading or loading indicator to appear.
    // No explicit timeout — uses the project-level actionTimeout (15s for WebKit).
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Wait until the page has finished loading data (loading indicator gone,
   * either error card, empty state, or cards grid is visible).
   */
  async waitForLoaded(): Promise<void> {
    // Wait for the loading indicator to disappear
    await this.loadingIndicator.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
      // Loading indicator may never appear if data loads fast — that's fine
    });

    await Promise.race([
      this.errorCard.waitFor({ state: 'visible', timeout: 10000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 10000 }),
      this.cardsGrid.waitFor({ state: 'visible', timeout: 10000 }),
    ]);
  }

  /**
   * Get a summary card section by its title (e.g., "Total Budget", "Financing").
   * Cards are `<section aria-labelledby="card-<slug>">`.
   */
  getSummaryCard(title: string): Locator {
    const slug = title.replace(/\s+/g, '-').toLowerCase();
    return this.page.locator(`section[aria-labelledby="card-${slug}"]`);
  }

  /**
   * Get the displayed value for a given label within a named summary card.
   * Searches for the stat row with the matching label text and returns the
   * value span text.
   *
   * @param cardTitle - e.g., "Total Budget"
   * @param label - e.g., "Planned", "Actual Cost", "Variance"
   */
  async getSummaryCardValue(cardTitle: string, label: string): Promise<string | null> {
    const card = this.getSummaryCard(cardTitle);
    // Each stat row: <div class="statRow"><span class="statLabel">label</span><span>value</span>
    const row = card.locator('[class*="statRow"]').filter({
      has: this.page.locator('[class*="statLabel"]').filter({ hasText: label }),
    });
    try {
      await row.waitFor({ state: 'visible' });
    } catch {
      return null;
    }
    const valueSpan = row.locator('[class*="statValue"]');
    return await valueSpan.textContent();
  }

  /**
   * Get the number of data rows in the Category Breakdown table body.
   * Returns 0 if the table does not exist or has no rows.
   */
  async getTableRowCount(): Promise<number> {
    try {
      await this.categoryBreakdownTableBody.waitFor({ state: 'visible' });
      const rows = await this.categoryBreakdownTableBody.locator('tr').all();
      return rows.length;
    } catch {
      return 0;
    }
  }

  /**
   * Get all row locators in the Category Breakdown table body.
   */
  async getTableRows(): Promise<Locator[]> {
    try {
      await this.categoryBreakdownTableBody.waitFor({ state: 'visible' });
      return await this.categoryBreakdownTableBody.locator('tr').all();
    } catch {
      return [];
    }
  }

  /**
   * Check whether the Budget sub-navigation is visible.
   */
  async isSubNavVisible(): Promise<boolean> {
    return await this.subNav.isVisible();
  }
}
