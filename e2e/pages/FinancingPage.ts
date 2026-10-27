/**
 * Page Object Model for Money › Financing (/budget/financing), #2242 (EPIC-21 P4.10).
 *
 * The page renders (test ids):
 * - h1 "Financing" with ONE primary, `financing-prepare-bank-report` (a link to /budget/reports),
 *   and the page ⋯ menu (`financing-page-actions`, Print `financing-action-print`).
 * - A toolbar with `financing-add-source` ("Add funding source") and `financing-add-grant`
 *   ("Add grant"); both open an ObjectForm dialog in place (see FinancingFormDialog).
 * - Two groups, `#sources` ("Loans & own funds (n)", `sources-heading`) and `#grants` ("Grants (n)",
 *   `grants-heading`). A `#sources` / `#grants` hash focuses the group heading.
 * - Source cards `financing-source-<id>`: name link to the source page, type and status badges,
 *   rate, the figures Amount · Allocated · Paid (`[data-figure="paid"]`) · Submitted · Unallocated
 *   (`financing-source-unallocated-<id>`), the allocation bar (an over-allocated card shows the
 *   `budget-bar-overflow-note`), loan cards only: ⋯ (`financing-source-menu-<id>`, item
 *   `financing-source-bank-report-<id>`) and "Ready to submit n · €x" (count
 *   `financing-source-ready-count-<id>`, amount `[data-figure="ready-to-submit"]`), and the
 *   Documents (n) button `financing-source-docs-<id>` with a `-link` sibling (Paperless on).
 * - Grant cards `financing-grant-<id>`: name link, status badge, rate chip
 *   `financing-grant-rate-<id>`, cap, Expected `financing-grant-expected-<id>`, Covered items link
 *   `financing-grant-covered-<id>` (to the Work tab), deadline `financing-grant-deadline-<id>`
 *   (+ "Overdue"), Documents `financing-grant-docs-<id>`.
 * - Load failure: an alert and `financing-retry`.
 */

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';

export const FINANCING_ROUTE = routeUrl('financing');

export type CardFigure = 'paid' | 'ready-to-submit';

export class FinancingPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly root: Locator;
  readonly prepareBankReport: Locator;
  readonly pageActions: Locator;
  readonly printAction: Locator;
  readonly addSource: Locator;
  readonly addGrant: Locator;
  readonly sourcesSection: Locator;
  readonly grantsSection: Locator;
  readonly sourcesHeading: Locator;
  readonly grantsHeading: Locator;
  readonly retry: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'Financing', exact: true });
    this.root = page.getByTestId('financing-page');
    this.prepareBankReport = page.getByTestId('financing-prepare-bank-report');
    this.pageActions = page.getByTestId('financing-page-actions');
    this.printAction = page.getByTestId('financing-action-print');
    this.addSource = page.getByTestId('financing-add-source');
    this.addGrant = page.getByTestId('financing-add-grant');
    this.sourcesSection = page.locator('section#sources');
    this.grantsSection = page.locator('section#grants');
    this.sourcesHeading = page.locator('#sources-heading');
    this.grantsHeading = page.locator('#grants-heading');
    this.retry = page.getByTestId('financing-retry');
    this.errorAlert = this.root.getByRole('alert');
  }

  async goto(): Promise<void> {
    await this.page.goto(FINANCING_ROUTE);
    await this.waitForLoaded();
  }

  /** The heading is visible and neither group shows its loading skeleton any more. */
  async waitForLoaded(): Promise<void> {
    await this.heading.waitFor({ state: 'visible' });
    // The count "(n)" is rendered only once the data arrived
    await expect(this.sourcesHeading.locator('span')).toBeVisible();
    await expect(this.grantsHeading.locator('span')).toBeVisible();
  }

  sourceCard(id: string): Locator {
    return this.page.getByTestId(`financing-source-${id}`);
  }

  grantCard(id: string): Locator {
    return this.page.getByTestId(`financing-grant-${id}`);
  }

  /** A source card by its name (cards link to their page with the name). */
  sourceCardNamed(name: string): Locator {
    return this.sourcesSection.locator('article').filter({ hasText: name });
  }

  grantCardNamed(name: string): Locator {
    return this.grantsSection.locator('article').filter({ hasText: name });
  }

  sourceLink(id: string): Locator {
    return this.sourceCard(id).getByRole('heading', { level: 3 }).getByRole('link');
  }

  grantLink(id: string): Locator {
    return this.grantCard(id).getByRole('heading', { level: 3 }).getByRole('link');
  }

  /** The `[data-figure=…]` amount span of a source card (Paid, or Ready to submit on loans). */
  cardFigure(id: string, kind: CardFigure): Locator {
    return this.sourceCard(id).locator(`[data-figure="${kind}"]`);
  }

  readyCount(id: string): Locator {
    return this.page.getByTestId(`financing-source-ready-count-${id}`);
  }

  readyAmount(id: string): Locator {
    return this.cardFigure(id, 'ready-to-submit');
  }

  unallocated(id: string): Locator {
    return this.page.getByTestId(`financing-source-unallocated-${id}`);
  }

  cardMenu(id: string): Locator {
    return this.page.getByTestId(`financing-source-menu-${id}`);
  }

  cardMenuBankReport(id: string): Locator {
    return this.page.getByTestId(`financing-source-bank-report-${id}`);
  }

  /** The source card's Documents (n) button (absent with Paperless off and nothing linked). */
  docsButton(id: string): Locator {
    return this.page.getByTestId(`financing-source-docs-${id}`);
  }

  docsLink(id: string): Locator {
    return this.page.getByTestId(`financing-source-docs-${id}-link`);
  }

  grantDocsButton(id: string): Locator {
    return this.page.getByTestId(`financing-grant-docs-${id}`);
  }

  grantDocsLink(id: string): Locator {
    return this.page.getByTestId(`financing-grant-docs-${id}-link`);
  }

  grantRate(id: string): Locator {
    return this.page.getByTestId(`financing-grant-rate-${id}`);
  }

  grantExpected(id: string): Locator {
    return this.page.getByTestId(`financing-grant-expected-${id}`);
  }

  grantCovered(id: string): Locator {
    return this.page.getByTestId(`financing-grant-covered-${id}`);
  }

  grantDeadline(id: string): Locator {
    return this.page.getByTestId(`financing-grant-deadline-${id}`);
  }

  /** The over-allocation note under a source card's bar. */
  overAllocatedNote(id: string): Locator {
    return this.sourceCard(id).getByTestId('budget-bar-overflow-note');
  }

  /** The bar (role=img) of a source card. */
  bar(id: string): Locator {
    return this.sourceCard(id).getByRole('img').first();
  }

  /** The striped overflow segment inside a card's bar. */
  overflowSegment(id: string): Locator {
    return this.bar(id).locator('[class*="overflow"]');
  }

  /** The card's own state of a 44 px ⋯ (cards of loans only). */
  async openCardMenu(id: string): Promise<void> {
    await this.cardMenu(id).click();
    await this.cardMenuBankReport(id).waitFor({ state: 'visible' });
  }
}
