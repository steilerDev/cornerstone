/**
 * Page Object Model for the Budget Overview page (/budget/overview)
 *
 * The page renders:
 * - An h1 "Budget" page title
 * - BudgetSubNav (tab-style nav for the Budget section)
 * - Loading indicator while data is fetched
 * - Error card with a Retry button if the API fails
 * - Empty state when no budget data has been entered (all-zero response)
 * - Budget overview hero card containing:
 *   - A key metrics row: Available Funds, Projected Cost Range, Remaining
 *   - A BudgetBar stacked bar chart (role="img")
 *   - A footer showing subsidies and sources info
 * - Area Breakdown tree (role="treegrid") with expand/collapse controls
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

  // Budget overview hero card
  readonly heroCard: Locator;
  readonly budgetBar: Locator;

  // Area Breakdown tree
  readonly areaTreeCard: Locator;
  readonly expandAllButton: Locator;
  readonly collapseAllButton: Locator;

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

    // Empty state: the outermost container with a CSS-module class beginning "emptyState".
    // Use .first() to avoid strict mode: there can be a second div (e.g. chart empty state)
    // whose class also starts with "emptyState", causing "resolved to 2 elements" errors.
    this.emptyState = page.locator('div[class*="emptyState"]').first();

    // Budget overview hero card: <section aria-label="Budget overview">
    this.heroCard = page.locator('section[aria-label="Budget overview"]');

    // Budget bar: BudgetBar stacked bar chart with role="img"
    this.budgetBar = page.getByRole('img').filter({ has: page.locator('[class*="bar"]') });

    // Area Breakdown tree: the treegrid element's immediate ancestor card container
    this.areaTreeCard = page.locator('[role="treegrid"]').locator('xpath=ancestor::*[1]');

    // Expand All / Collapse All buttons within the area breakdown section
    this.expandAllButton = page.getByRole('button', { name: /expand all/i });
    this.collapseAllButton = page.getByRole('button', { name: /collapse all/i });
  }

  /**
   * Return the treegrid row that contains the given area name text.
   */
  areaRow(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  /**
   * Return the expand/collapse toggle button for the given area name.
   * The aria-label alternates between "Expand <name>" and "Collapse <name>" as the
   * row is toggled, so the regex matches both states.
   */
  areaToggleButton(name: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`(?:expand|collapse) ${name}`, 'i') });
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
