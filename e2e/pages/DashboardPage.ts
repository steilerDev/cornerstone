/**
 * Page Object Model for the Project Overview / Dashboard page (/project/overview)
 *
 * The Dashboard page displays a grid of cards showing budget, timeline,
 * invoice, and subsidy information with card hide/show customization.
 */

import type { Page, Locator } from '@playwright/test';

export const DASHBOARD_ROUTE = '/project/overview';

/** Card IDs as used in data-testid attributes. These match the DashboardCardId type in shared. */
export type DashboardCardId =
  | 'budget-summary'
  | 'budget-alerts'
  | 'source-utilization'
  | 'upcoming-milestones'
  | 'work-item-progress'
  | 'critical-path'
  | 'mini-gantt'
  | 'invoice-pipeline'
  | 'subsidy-pipeline'
  | 'quick-actions';

/** Expected visible card titles in order. */
export const CARD_TITLES = [
  'Budget Summary',
  'Budget Alerts',
  'Source Utilization',
  'Upcoming Milestones',
  'Work Item Progress',
  'Critical Path',
  'Mini Gantt',
  'Invoice Pipeline',
  'Subsidy Pipeline',
  'Quick Actions',
] as const;

export class DashboardPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly cardGrid: Locator;
  readonly mobileSections: Locator;
  readonly customizeButton: Locator;
  readonly customizeDropdown: Locator;
  readonly projectSubNav: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', {
      level: 1,
      name: 'Project',
      exact: true,
    });

    // Desktop/tablet grid — role="region" labeled "Dashboard overview"
    this.cardGrid = page.getByRole('region', { name: 'Dashboard overview' }).first();

    // Mobile sections container (data-testid on the component)
    this.mobileSections = page.getByTestId('dashboard-mobile-sections');

    // Customize button (only visible when cards are hidden)
    this.customizeButton = page.getByRole('button', { name: 'Customize' });

    // Customize dropdown menu
    this.customizeDropdown = page.getByRole('menu');

    // Project sub-navigation
    this.projectSubNav = page.getByRole('navigation', { name: 'Project section navigation' });
  }

  async goto(): Promise<void> {
    await this.page.goto(DASHBOARD_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Waits for all card loading skeletons to disappear, indicating data has loaded.
   * Uses aria-busy on the loading skeleton elements.
   */
  async waitForCardsLoaded(): Promise<void> {
    // Wait for all busy status elements to disappear
    const skeletons = this.page.locator('[aria-busy="true"]');
    await skeletons
      .first()
      .waitFor({ state: 'hidden' })
      .catch(() => {
        // If no skeleton was ever visible, that's fine — cards loaded instantly or were empty
      });
  }

  /**
   * Returns the article element for a specific card by its card title.
   */
  card(title: string): Locator {
    return this.page
      .getByRole('article')
      .filter({ has: this.page.getByRole('heading', { name: title, level: 2 }) });
  }

  /**
   * Returns the dismiss button for a specific card.
   */
  dismissButton(title: string): Locator {
    return this.card(title).getByRole('button', { name: `Hide ${title} card` });
  }

  /**
   * Dismisses a card by clicking its hide button and waiting for it to disappear.
   */
  async dismissCard(title: string): Promise<void> {
    const btn = this.dismissButton(title);
    await btn.waitFor({ state: 'visible' });
    await btn.click();
    // Wait for the card to disappear from DOM
    await this.card(title).waitFor({ state: 'detached' });
  }

  /**
   * Opens the Customize dropdown (only available when cards are hidden).
   */
  async openCustomizeDropdown(): Promise<void> {
    await this.customizeButton.waitFor({ state: 'visible' });
    await this.customizeButton.click();
    await this.customizeDropdown.waitFor({ state: 'visible' });
  }

  /**
   * Re-enables a previously dismissed card via the Customize dropdown.
   */
  async reEnableCard(title: string): Promise<void> {
    await this.openCustomizeDropdown();
    const menuItem = this.customizeDropdown.getByRole('menuitem', { name: `Show ${title}` });
    await menuItem.waitFor({ state: 'visible' });
    await menuItem.click();
    // Wait for card to be back in DOM
    await this.card(title).waitFor({ state: 'visible' });
  }

  /**
   * Checks whether the mobile collapsible "Timeline" section is present on page.
   */
  timelineSection(): Locator {
    return this.mobileSections.locator('details').filter({
      has: this.page.locator('summary').filter({ hasText: 'Timeline' }),
    });
  }

  /**
   * Checks whether the mobile collapsible "Budget Details" section is present on page.
   */
  budgetDetailsSection(): Locator {
    return this.mobileSections.locator('details').filter({
      has: this.page.locator('summary').filter({ hasText: 'Budget Details' }),
    });
  }

  /**
   * Returns the Mini Gantt card container (the clickable region button).
   */
  miniGanttContainer(): Locator {
    return this.card('Mini Gantt').getByRole('button', { name: 'View full schedule' });
  }
}
