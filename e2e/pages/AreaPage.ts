/**
 * Page Object Model for the Area page (`/areas/:id`, #2251, EPIC-21 P5.7).
 *
 * One scrolling page on the detail template, no tabs, no edit controls:
 * - `breadcrumbs` (Areas > ancestors; optional origin Back) and the header (`area-header`): h1 =
 *   the area name, ONE primary "Log here" (`area-primary-log`, href `/diary/new?areaId=<id>`)
 * - room chips (`FilterChipGroup` navigate variant, group "Sub-areas of <area>", chip testid
 *   `area-chip-<childId>`), present only when the area has direct children
 * - `summary` (`area-summary`, landmark "Area summary"): facts `tasks`, `cost`, `photos`,
 *   `companies` (always four). The Paid remark of the cost fact is
 *   `[data-figure="paid"]` (`area-paid-figure`). The Companies and Expected cost facts jump to a
 *   section on the page (`#area-companies`, `#area-cost`) and move focus to its h2
 * - sections: Now & next here (`section-area-now`: rows `area-now-<work_item|household_item>-<id>`,
 *   links `area-now-all-tasks` / `area-now-all-purchases`, ancestor context list `area-context`
 *   with rows `area-context-<ancestorId>`), Latest from the site (`section-area-site`: links
 *   `area-site-all-entries`, `area-site-photos`), Companies here (RelatedList `area-companies`),
 *   Rooms / Sub-areas (RelatedList `area-rooms`, only with children), Cost (`section-area-cost`:
 *   a read-only `CostLineTable` with prefix `area-cost-lines`, link `area-cost-overview`)
 * - states: Skeleton while loading; unknown id renders the h1 "Area not found" and a
 *   "Back to Areas" button in the error card (role="alert")
 *
 * RelatedList headings carry the count ("Companies here (2)"): match them with a regex.
 */

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { BreadcrumbsBar } from './BreadcrumbsBar.js';
import { CostLinesPanel } from './components/CostLinesPanel.js';
import { RelatedListControl } from './components/RelatedListControl.js';
import { SummaryStripControl } from './components/SummaryStripControl.js';

export type AreaSectionId = 'now' | 'site' | 'companies' | 'rooms' | 'cost';

export class AreaPage {
  readonly page: Page;
  readonly breadcrumbs: BreadcrumbsBar;
  readonly header: Locator;
  readonly heading: Locator;
  readonly logHere: Locator;
  readonly summary: SummaryStripControl;
  readonly companies: RelatedListControl;
  readonly rooms: RelatedListControl;
  /** The read-only cost-line list (rows, gross amounts, net tip). */
  readonly costTable: CostLinesPanel;
  readonly context: Locator;
  readonly allTasksLink: Locator;
  readonly allPurchasesLink: Locator;
  readonly allEntriesLink: Locator;
  readonly photosLink: Locator;
  readonly costOverviewLink: Locator;
  readonly errorState: Locator;
  readonly backToAreas: Locator;

  constructor(page: Page) {
    this.page = page;
    this.breadcrumbs = new BreadcrumbsBar(page);
    this.header = page.getByTestId('area-header');
    this.heading = page.getByRole('heading', { level: 1 });
    this.logHere = page.getByTestId('area-primary-log');
    this.summary = new SummaryStripControl(page, 'area-summary');
    this.companies = new RelatedListControl(page, 'area-companies');
    this.rooms = new RelatedListControl(page, 'area-rooms');
    this.costTable = new CostLinesPanel(page, 'area-cost-lines');
    this.context = page.getByTestId('area-context');
    this.allTasksLink = page.getByTestId('area-now-all-tasks');
    this.allPurchasesLink = page.getByTestId('area-now-all-purchases');
    this.allEntriesLink = page.getByTestId('area-site-all-entries');
    this.photosLink = page.getByTestId('area-site-photos');
    this.costOverviewLink = page.getByTestId('area-cost-overview');
    this.errorState = page.getByRole('alert');
    this.backToAreas = this.errorState.getByRole('button', { name: 'Back to Areas' });
  }

  /** Open the page and wait until the header (not the skeleton) is up. */
  async goto(id: string): Promise<void> {
    await this.page.goto(routeUrl('area', { id }));
    await this.waitForLoaded();
  }

  async waitForLoaded(): Promise<void> {
    await this.header.waitFor({ state: 'visible' });
    await this.summary.root.waitFor({ state: 'visible' });
  }

  /** A section card by id (`now`, `site`, `cost` are SectionCards; the lists are RelatedLists). */
  section(id: AreaSectionId): Locator {
    switch (id) {
      case 'companies':
        return this.companies.root;
      case 'rooms':
        return this.rooms.root;
      default:
        return this.page.getByTestId(`section-area-${id}`);
    }
  }

  /** The h2 of a section. */
  sectionHeading(id: AreaSectionId): Locator {
    return this.section(id).getByRole('heading', { level: 2 });
  }

  /** Room chip (a link) by child area id. */
  chip(childId: string): Locator {
    return this.page.getByTestId(`area-chip-${childId}`);
  }

  chipGroup(areaName: string): Locator {
    return this.page.getByRole('group', { name: `Sub-areas of ${areaName}` });
  }

  /** A Now & next row by item type and id. */
  nowRow(type: 'work_item' | 'household_item', id: string): Locator {
    return this.page.getByTestId(`area-now-${type}-${id}`);
  }

  /** Ancestor context row (a link) by the ancestor's area id. */
  contextRow(ancestorId: string): Locator {
    return this.page.getByTestId(`area-context-${ancestorId}`);
  }

  companyRow(companyId: string): Locator {
    return this.companies.row(companyId);
  }

  /** The Call link of a company row. */
  callLink(companyId: string): Locator {
    return this.page.getByTestId(`area-companies-call-${companyId}`);
  }

  roomRow(childId: string): Locator {
    return this.rooms.row(childId);
  }

  /** The visible group heading (owner link) of the cost table for an owner title. */
  costGroupLink(ownerTitle: string): Locator {
    return this.page
      .locator('[data-testid^="area-cost-lines-group-"]')
      .filter({ visible: true })
      .getByRole('link', { name: ownerTitle });
  }

  /** True when the document scrolls sideways. */
  async hasHorizontalOverflow(): Promise<boolean> {
    return this.page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
  }

  /** Assert the strip reads as the four facts, in order. */
  async expectFactOrder(): Promise<void> {
    expect(await this.summary.factIds()).toEqual(['tasks', 'cost', 'photos', 'companies']);
  }
}
