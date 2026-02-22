/**
 * Page Object Model for the Budget Overview page (/budget/overview)
 *
 * The page renders:
 * - An h1 "Budget" page title
 * - BudgetSubNav (tab-style nav for the Budget section)
 * - Loading indicator while data is fetched
 * - Error card with a Retry button if the API fails
 * - Empty state when no budget data has been entered (all-zero response)
 * - Budget Health Hero card containing:
 *   - An h2 "Budget Health" heading
 *   - A BudgetHealthIndicator badge (role="status") showing "On Budget" / "At Risk" / "Over Budget"
 *   - A key metrics row: Available Funds, Projected Cost Range, Remaining
 *   - A BudgetBar stacked bar chart (role="img")
 *   - A footer showing subsidies and sources info
 *   - A category filter dropdown button
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

  // Budget Health Hero card
  readonly heroCard: Locator;
  readonly heroTitle: Locator;
  readonly healthBadge: Locator;
  readonly budgetBar: Locator;
  readonly categoryFilterButton: Locator;

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

    // Budget Health Hero card: <section aria-labelledby="budget-health-heading">
    this.heroCard = page.locator('[aria-labelledby="budget-health-heading"]');

    // Hero title: <h2 id="budget-health-heading">Budget Health</h2>
    this.heroTitle = page.locator('#budget-health-heading');

    // Health badge: BudgetHealthIndicator with role="status" inside the hero card
    this.healthBadge = this.heroCard.getByRole('status');

    // Budget bar: BudgetBar stacked bar chart with role="img"
    this.budgetBar = page.getByRole('img').filter({ has: page.locator('[class*="bar"]') });

    // Category filter dropdown button
    this.categoryFilterButton = page.getByRole('button', { name: /categories/i });
  }

  async goto(): Promise<void> {
    await this.page.goto(BUDGET_OVERVIEW_ROUTE);
    // Wait for either the heading or loading indicator to appear.
    // No explicit timeout — uses the project-level actionTimeout (15s for WebKit).
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Wait until the page has finished loading data (loading indicator gone,
   * either error card, empty state, or hero card is visible).
   */
  async waitForLoaded(): Promise<void> {
    // Wait for the loading indicator to disappear
    await this.loadingIndicator.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
      // Loading indicator may never appear if data loads fast — that's fine
    });

    await Promise.race([
      this.errorCard.waitFor({ state: 'visible', timeout: 10000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 10000 }),
      this.heroCard.waitFor({ state: 'visible', timeout: 10000 }),
    ]);
  }

  /**
   * Check whether the Budget sub-navigation is visible.
   */
  async isSubNavVisible(): Promise<boolean> {
    return await this.subNav.isVisible();
  }
}
