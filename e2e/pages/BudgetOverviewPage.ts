/**
 * Page Object Model for the Money overview (route `budgetOverview`, /budget/overview).
 * Rebuilt in #2237 (story 4.5, EPIC-21 P4.5).
 *
 * The page renders (top to bottom):
 * - h1 "Money" and a ⋯ "Page actions" menu (Print, Budget overview for the bank). No Add menu.
 * - The Left to spend headline (`MoneyFigure`, `money-headline`): the figure alone in its
 *   `data-figure="left-to-spend"` element, a verdict badge, the range line beneath, and a
 *   "How is this calculated?" disclosure.
 * - The facts strip (`money-summary`): Funding total · Expected cost · Expected grants · Paid ·
 *   Still to pay (Paid and Still to pay link to Invoices and carry `data-figure`).
 * - Funding rows (`money-funding-row-<id>`): "Allocated €x of €y" with a bar.
 * - The Breakdown card (`breakdown-card`): view chips (`?by=`), Payment chips (`?paymentStatus`),
 *   Show estimates at Low · Expected · High (`?estimate`), Show › Grants (`?grants=1`), the
 *   Funding source filter chip (`?deselectedSources`), and the tree down to cost lines as a table
 *   (card width ≥ 768px) or a two-column drill-down list (below). Both surfaces are mounted at the
 *   same time and switched by CSS container queries, so every reader below filters on visibility
 *   or targets one surface explicitly.
 *
 * Row keys: `area:<id>` / `area:none`, `type:work_items` / `type:household_items`,
 * `category:<id|none>`, `source:<id|none>`, `orphans` ("Without a task"), `item:<kind>:<id>`,
 * `line:<id>`, `not-yet-split`.
 */

import type { Locator, Page } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';

export const BUDGET_OVERVIEW_ROUTE = routeUrl('budgetOverview');
export const BUDGET_OVERVIEW_URL_PATTERN = /\/budget\/overview/;

export type BreakdownViewValue = 'area' | 'type' | 'category' | 'source';
export type BreakdownPaymentValue = 'all' | 'paid' | 'outstanding';
export type BreakdownEstimateValue = 'low' | 'expected' | 'high';
export type BreakdownColumnValue =
  'expectedCost' | 'grants' | 'afterGrants' | 'paid' | 'stillToPay' | 'notYetPaid';

export class BudgetOverviewPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly loadingIndicator: Locator;
  readonly errorCard: Locator;
  readonly retryButton: Locator;

  // Headline
  readonly headline: Locator;
  readonly leftToSpendFigure: Locator;
  readonly verdictBadge: Locator;
  readonly range: Locator;
  readonly explainToggle: Locator;
  readonly explainPanel: Locator;

  // Facts strip
  readonly summary: Locator;

  // Funding
  readonly funding: Locator;
  readonly fundingRows: Locator;
  readonly fundingManageLink: Locator;

  // Breakdown card
  readonly breakdownCard: Locator;
  readonly toolbar: Locator;
  readonly grantsChip: Locator;
  readonly sourcesButton: Locator;
  readonly status: Locator;
  readonly table: Locator;
  readonly total: Locator;
  readonly list: Locator;
  readonly listHeading: Locator;
  readonly listHeadingLink: Locator;
  readonly listBack: Locator;

  // Page actions
  readonly pageActions: Locator;
  readonly printAction: Locator;
  readonly bankOverviewAction: Locator;
  readonly printSummary: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', { level: 1, name: 'Money', exact: true });
    this.loadingIndicator = page.getByRole('status', { name: 'Loading Money' });
    this.errorCard = page.locator('[role="alert"]').filter({
      has: page.getByRole('heading', { name: 'Error', exact: true }),
    });
    this.retryButton = this.errorCard.getByRole('button', { name: 'Retry', exact: true });

    this.headline = page.getByTestId('money-headline');
    this.leftToSpendFigure = page.getByTestId('money-headline-figure');
    this.verdictBadge = page.getByTestId('money-headline-verdict-badge');
    this.range = page.getByTestId('money-headline-range');
    this.explainToggle = page.getByTestId('money-headline-explain-toggle');
    this.explainPanel = page.getByTestId('money-headline-explain');

    this.summary = page.getByTestId('money-summary');

    this.funding = page.getByTestId('money-funding');
    this.fundingRows = this.funding.locator('[data-testid^="money-funding-row-"]');
    this.fundingManageLink = page.getByTestId('money-funding-manage');

    this.breakdownCard = page.getByTestId('breakdown-card');
    this.toolbar = page.getByTestId('breakdown-toolbar');
    this.grantsChip = page.getByTestId('breakdown-show-grants');
    this.sourcesButton = page.getByTestId('breakdown-sources-button');
    this.status = page.getByTestId('breakdown-status');
    this.table = page.getByTestId('breakdown-table');
    this.total = page.getByTestId('breakdown-total');
    this.list = page.getByTestId('breakdown-list');
    this.listHeading = page.getByTestId('breakdown-list-heading');
    this.listHeadingLink = page.getByTestId('breakdown-list-heading-link');
    this.listBack = page.getByTestId('breakdown-list-back');

    this.pageActions = page.getByTestId('money-page-actions');
    this.printAction = page.getByTestId('money-action-print');
    this.bankOverviewAction = page.getByTestId('money-action-bank-overview');
    this.printSummary = page.getByTestId('money-print-summary');
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  /** Open the overview (optionally with a query string, e.g. `?by=type`). */
  async goto(query = ''): Promise<void> {
    await this.page.goto(`${BUDGET_OVERVIEW_ROUTE}${query}`);
    await this.heading.waitFor({ state: 'visible' });
  }

  /** Wait until the loading skeleton is gone and the headline or the error card shows. */
  async waitForLoaded(): Promise<void> {
    await this.headline.or(this.errorCard).waitFor({ state: 'visible' });
  }

  /** Wait until the breakdown card has rendered its toolbar (the breakdown response arrived). */
  async waitForBreakdown(): Promise<void> {
    await this.toolbar.waitFor({ state: 'visible' });
  }

  // ── Facts ─────────────────────────────────────────────────────────────────

  /** A fact of the strip: funding-total, expected-cost, expected-grants, paid, still-to-pay. */
  fact(id: string): Locator {
    return this.page.getByTestId(`money-fact-${id}`);
  }

  // ── Funding ───────────────────────────────────────────────────────────────

  fundingRow(sourceId: string): Locator {
    return this.page.getByTestId(`money-funding-row-${sourceId}`);
  }

  // ── Breakdown settings ────────────────────────────────────────────────────

  viewChip(view: BreakdownViewValue): Locator {
    return this.page.getByTestId(`breakdown-view-${view}`);
  }

  paymentChip(payment: BreakdownPaymentValue): Locator {
    return this.page.getByTestId(`breakdown-payment-${payment}`);
  }

  estimateChip(estimate: BreakdownEstimateValue): Locator {
    return this.page.getByTestId(`breakdown-estimate-${estimate}`);
  }

  /** The "Funding source" filter panel: an anchored dialog (≥ 768px) or a bottom sheet. */
  get sourcesPanel(): Locator {
    return this.page.getByTestId('breakdown-sources-panel').or(this.sourcesSheet);
  }

  get sourcesSheet(): Locator {
    return this.page.getByTestId('breakdown-sources-sheet');
  }

  sourceCheckbox(key: string): Locator {
    return this.page.getByTestId(`breakdown-source-${key}`);
  }

  get sourcesSelectAll(): Locator {
    return this.page
      .getByTestId('breakdown-sources-panel-clear')
      .or(this.page.getByTestId('breakdown-sources-sheet-clear'));
  }

  get sourcesDone(): Locator {
    return this.page
      .getByTestId('breakdown-sources-panel-done')
      .or(this.page.getByTestId('breakdown-sources-done'));
  }

  async openSources(): Promise<void> {
    await this.sourcesButton.click();
    await this.sourcesPanel.waitFor({ state: 'visible' });
  }

  // ── Table surface ─────────────────────────────────────────────────────────

  row(key: string): Locator {
    return this.page.getByTestId(`breakdown-row-${key}`);
  }

  cell(key: string, column: BreakdownColumnValue): Locator {
    return this.page.getByTestId(`breakdown-cell-${key}-${column}`);
  }

  toggle(key: string): Locator {
    return this.page.getByTestId(`breakdown-toggle-${key}`);
  }

  totalCell(column: BreakdownColumnValue): Locator {
    return this.page.getByTestId(`breakdown-total-${column}`);
  }

  /** The column header texts of the table, in order (first is "Name"). */
  columnHeaders(): Locator {
    return this.table.locator('thead th');
  }

  /** Every row of the table whose name cell is at depth 0, in DOM order. */
  topLevelRows(): Locator {
    return this.table.locator('tbody tr:has(th[data-depth="0"])');
  }

  /** The row keys of the top level rows (`breakdown-row-` stripped). */
  async topLevelKeys(): Promise<string[]> {
    const ids = await this.topLevelRows().evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-testid') ?? ''),
    );
    return ids.map((id) => id.replace(/^breakdown-row-/, ''));
  }

  /** Expand a row of the table if it is collapsed. */
  async expand(key: string): Promise<void> {
    const toggle = this.toggle(key);
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
    await this.page.waitForFunction(
      (id) =>
        document.querySelector(`[data-testid="${id}"]`)?.getAttribute('aria-expanded') === 'true',
      `breakdown-toggle-${key}`,
    );
  }

  // ── Drill-down list surface (phone) ───────────────────────────────────────

  listRow(key: string): Locator {
    return this.page.getByTestId(`breakdown-list-row-${key}`);
  }

  // ── Print helpers ─────────────────────────────────────────────────────────

  /** Dispatch `beforeprint` and switch Playwright media to print. */
  async startPrint(): Promise<void> {
    await this.page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await this.page.emulateMedia({ media: 'print' });
  }

  /** Dispatch `afterprint` and restore screen media. */
  async endPrint(): Promise<void> {
    await this.page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await this.page.emulateMedia({ media: 'screen' });
  }

  // ── Page actions ──────────────────────────────────────────────────────────

  async openPageActions(): Promise<void> {
    await this.pageActions.click();
    await this.page.getByRole('menu').waitFor({ state: 'visible' });
  }
}
