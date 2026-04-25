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
 * - Cost Breakdown table (CostBreakdownTable) with area hierarchy expand/collapse
 */

import type { Page, Locator } from '@playwright/test';

export const BUDGET_OVERVIEW_ROUTE = '/budget/overview';
export const BUDGET_OVERVIEW_URL_PATTERN = /\/budget\/overview/;

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

  // Cost Breakdown table (CostBreakdownTable, area hierarchy)
  readonly costBreakdownCard: Locator;

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

    // Cost Breakdown table: <section aria-labelledby="breakdown-heading">
    this.costBreakdownCard = page.locator('section[aria-labelledby="breakdown-heading"]');
  }

  /**
   * Return the row inside the Cost Breakdown table that contains the given area name text.
   */
  breakdownAreaRow(name: string): Locator {
    return this.costBreakdownCard.getByRole('row').filter({ hasText: name });
  }

  /**
   * Return the expand/collapse toggle button for the given area name inside the Cost Breakdown table.
   * The aria-label is either "Expand <name>" or "Collapse <name>" depending on state,
   * so the regex matches both.
   */
  breakdownAreaToggle(name: string): Locator {
    return this.costBreakdownCard.getByRole('button', {
      name: new RegExp(`(?:expand|collapse) ${name}`, 'i'),
    });
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

  // ── Print helpers ─────────────────────────────────────────────────────────

  /**
   * Dispatch the `beforeprint` window event and switch Playwright media to 'print'.
   * Use this to simulate the browser print dialog opening.
   */
  async startPrint(): Promise<void> {
    await this.page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await this.page.emulateMedia({ media: 'print' });
  }

  /**
   * Dispatch the `afterprint` window event and restore Playwright media to 'screen'.
   * Use this to simulate the browser print dialog closing.
   */
  async endPrint(): Promise<void> {
    await this.page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await this.page.emulateMedia({ media: 'screen' });
  }

  /**
   * The sidebar `<aside>` element.
   */
  get sidebar(): Locator {
    return this.page.locator('aside');
  }

  /**
   * The Add dropdown button (budget-overview-add-button).
   */
  get addButton(): Locator {
    return this.page.getByTestId('budget-overview-add-button');
  }

  // ── Source filter helpers ─────────────────────────────────────────────────

  /**
   * The source filter chip toolbar.
   * i18n label: "Filter by source"
   */
  filterToolbar(): Locator {
    return this.costBreakdownCard.getByRole('toolbar', { name: 'Filter by source' });
  }

  /**
   * A specific chip by source name (uses regex for partial match).
   * Chips are <button aria-pressed> inside the filter toolbar.
   */
  sourceChip(name: string): Locator {
    return this.filterToolbar().getByRole('button', { name: new RegExp(name) });
  }

  /**
   * The "All sources" clear filter button.
   * aria-label: "Clear source filter — show all sources"
   */
  clearFiltersButton(): Locator {
    return this.filterToolbar().getByRole('button', {
      name: /Clear source filter/i,
    });
  }

  /**
   * The screen-reader live region for filter count announcements (role="status").
   * Note: the element is visually hidden (sr-only) but still in the DOM.
   */
  filterAnnouncement(): Locator {
    return this.costBreakdownCard.locator('[role="status"]');
  }

  /**
   * The Available Funds expand/collapse button.
   * aria-label: "Expand available funds sources"
   */
  availableFundsButton(): Locator {
    return this.costBreakdownCard.getByRole('button', {
      name: /Expand available funds sources/i,
    });
  }

  /**
   * Source detail row for a given source name (expanded under Available Funds).
   */
  sourceDetailRow(name: string): Locator {
    return this.costBreakdownCard.getByRole('row').filter({
      has: this.page.getByText(name, { exact: true }),
    });
  }
}
