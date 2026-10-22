/**
 * Page Object Model for Home (`/`, #2230, EPIC-21 P3.3). Replaces the old dashboard POM.
 *
 * The page renders (DOM order, one column):
 * - h1 "Home" in every state; a subtitle "‹house name› · ‹long date›"; the page ⋯ menu
 *   (`home-page-menu`, trigger "Page actions") with "Customize…" and "What moved where"
 * - phone and tablet only (below 1024px): `home-where` ("Where are you?" h2, area chips
 *   `where-chip-<areaId|other>`, the last-log link `home-last-log`)
 * - the one-time notice `home-moved-notice` (dismiss `home-moved-notice-dismiss`)
 * - EITHER the set-up checklist `home-setup` (rows `home-setup-row-<step>`, step control
 *   `home-setup-step-<step>`, `home-setup-skip`) OR the sections:
 *   `home-needs-attention` (catch-up line `home-catch-up-line`, rows `li` in the list
 *   `needs-attention-list`, `needs-attention-show-all`, the hidden-for-now line),
 *   `home-tidy-up` (collapsible, toggle `home-tidy-up-toggle`, list `tidy-up-list`),
 *   `home-this-week` (critical line `home-critical-line`, day groups `home-week-day-<date>`,
 *   items `home-week-item-<kind>:<type>:<id>`, `home-week-next`, `home-week-schedule`),
 *   `home-pulse` (tiles `home-pulse-left-to-spend|still-to-pay|progress`),
 *   `home-latest` (DiaryEntryFeedRow `diary-entry-<id>`, `home-latest-more`)
 * - the footer link `home-footer-history`
 *
 * Attention rows: `li[data-testid="<prefix>-row-<key>"]` with `<key>` = `<rule>:<type>:<id>`;
 * sub-elements share the prefix (`-tier`, `-link`, `-actions`, `-not-now`, `-mark_done`, `-start`,
 * `-reschedule`, `-group-toggle`, `-item-<id>`), so rows are always selected as direct children of
 * the list `ul` or by their exact id. The prefixes: `needs-attention`, `tidy-up`, `catch-up`.
 */

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { StatusMenuControl } from './components/StatusMenuControl.js';

export const HOME_ROUTE = routeUrl('home');

export type AttentionListPrefix = 'needs-attention' | 'tidy-up' | 'catch-up';

export class HomePage {
  readonly page: Page;

  readonly root: Locator;
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly pageMenuButton: Locator;
  readonly customizeItem: Locator;
  readonly whatMovedLink: Locator;

  readonly needsAttention: Locator;
  readonly showAllButton: Locator;
  readonly catchUpLine: Locator;
  readonly reviewAllButton: Locator;
  readonly catchUpDialog: Locator;
  readonly catchUpClose: Locator;
  readonly hiddenLine: Locator;
  readonly hiddenToggle: Locator;

  readonly tidyUp: Locator;
  readonly tidyToggle: Locator;

  readonly thisWeek: Locator;
  readonly criticalLine: Locator;
  readonly next14Button: Locator;
  readonly openScheduleLink: Locator;

  readonly pulse: Locator;
  readonly latest: Locator;
  readonly latestMoreLink: Locator;
  readonly footerHistoryLink: Locator;

  readonly where: Locator;
  readonly lastLogLink: Locator;

  readonly setup: Locator;
  readonly skipSetupButton: Locator;

  readonly notice: Locator;
  readonly noticeDismiss: Locator;
  readonly noticeLink: Locator;

  readonly customizeDialog: Locator;
  readonly customizeDone: Locator;

  constructor(page: Page) {
    this.page = page;

    this.root = page.getByTestId('home-page');
    this.heading = page.getByRole('heading', { level: 1, name: 'Home', exact: true });
    this.subtitle = this.root.locator('p').filter({ hasText: / · / }).first();
    this.pageMenuButton = page.getByRole('button', { name: 'Page actions', exact: true });
    this.customizeItem = page.getByTestId('home-menu-customize');
    this.whatMovedLink = page.getByTestId('home-menu-what-moved');

    this.needsAttention = page.getByTestId('home-needs-attention');
    this.showAllButton = page.getByTestId('needs-attention-show-all');
    this.catchUpLine = page.getByTestId('home-catch-up-line');
    this.reviewAllButton = page.getByTestId('home-catch-up-review');
    this.catchUpDialog = page.getByRole('dialog', { name: /^Late tasks/ });
    this.catchUpClose = page.getByTestId('home-catch-up-close');
    this.hiddenLine = page.getByTestId('home-attention-hidden');
    this.hiddenToggle = page.getByTestId('home-attention-hidden-toggle');

    this.tidyUp = page.getByTestId('home-tidy-up');
    this.tidyToggle = page.getByTestId('home-tidy-up-toggle');

    this.thisWeek = page.getByTestId('home-this-week');
    this.criticalLine = page.getByTestId('home-critical-line');
    this.next14Button = page.getByTestId('home-week-next');
    this.openScheduleLink = page.getByTestId('home-week-schedule');

    this.pulse = page.getByTestId('home-pulse');
    this.latest = page.getByTestId('home-latest');
    this.latestMoreLink = page.getByTestId('home-latest-more');
    this.footerHistoryLink = page.getByTestId('home-footer-history');

    this.where = page.getByTestId('home-where');
    this.lastLogLink = page.getByTestId('home-last-log');

    this.setup = page.getByTestId('home-setup');
    this.skipSetupButton = page.getByTestId('home-setup-skip');

    this.notice = page.getByTestId('home-moved-notice');
    this.noticeDismiss = page.getByTestId('home-moved-notice-dismiss');
    this.noticeLink = this.notice.getByRole('link', { name: /What moved where/ });

    this.customizeDialog = page.getByRole('dialog', { name: 'Customize Home' });
    this.customizeDone = page.getByTestId('home-customize-done');
  }

  /** `/` with the h1 awaited (the h1 renders in every state). */
  async goto(): Promise<void> {
    await this.page.goto(HOME_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }

  // ── Sections ──────────────────────────────────────────────────────────────

  /** A section's h2 (the heading text includes the "(n)" detail where there is one). */
  sectionHeading(name: string | RegExp): Locator {
    return this.page.getByRole('heading', { level: 2, name });
  }

  /** The direct-child rows of an attention list (group items are not rows). */
  rows(prefix: AttentionListPrefix = 'needs-attention'): Locator {
    return this.page.getByTestId(`${prefix}-list`).locator(':scope > li');
  }

  /** One attention row by its key (`N1:work_item:<id>`). */
  row(key: string, prefix: AttentionListPrefix = 'needs-attention'): Locator {
    return this.page.getByTestId(`${prefix}-row-${key}`);
  }

  rowLink(key: string, prefix: AttentionListPrefix = 'needs-attention'): Locator {
    return this.page.getByTestId(`${prefix}-row-${key}-link`);
  }

  rowNotNow(key: string, prefix: AttentionListPrefix = 'needs-attention'): Locator {
    return this.page.getByTestId(`${prefix}-row-${key}-not-now`);
  }

  rowReschedule(key: string, prefix: AttentionListPrefix = 'needs-attention'): Locator {
    return this.page.getByTestId(`${prefix}-row-${key}-reschedule`);
  }

  /** The Mark done / Start status control of a row (`StatusMenu`, action appearance). */
  rowStatus(
    key: string,
    action: 'mark_done' | 'start' | 'mark_paid' | 'mark_delivered',
    prefix: AttentionListPrefix = 'needs-attention',
  ): StatusMenuControl {
    return new StatusMenuControl(this.page, `${prefix}-row-${key}-${action}`);
  }

  /** The Tidy up body (hidden while collapsed), found through the toggle's `aria-controls`. */
  async tidyBodyId(): Promise<string> {
    const id = await this.tidyToggle.getAttribute('aria-controls');
    if (!id) throw new Error('the Tidy up toggle has no aria-controls');
    return id;
  }

  weekDay(date: string): Locator {
    return this.page.getByTestId(`home-week-day-${date}`);
  }

  weekItem(key: string): Locator {
    return this.page.getByTestId(`home-week-item-${key}`);
  }

  /** Every agenda item row of This week (an `li`; sub-elements share the prefix). */
  weekItems(): Locator {
    return this.thisWeek.locator('li[data-testid^="home-week-item-"]');
  }

  pulseTile(id: 'left-to-spend' | 'still-to-pay' | 'progress'): Locator {
    return this.page.getByTestId(`home-pulse-${id}`);
  }

  pulseTiles(): Locator {
    return this.pulse.locator('li');
  }

  latestRows(): Locator {
    return this.latest.locator('li[data-testid^="diary-entry-"]');
  }

  whereChips(): Locator {
    return this.where.locator('a[data-testid^="where-chip-"]');
  }

  whereChip(value: string): Locator {
    return this.page.getByTestId(`where-chip-${value}`);
  }

  setupRows(): Locator {
    return this.setup.locator('li[data-testid^="home-setup-row-"]');
  }

  setupStep(step: string): Locator {
    return this.page.getByTestId(`home-setup-step-${step}`);
  }

  customizeCheckbox(section: string): Locator {
    return this.page.getByTestId(`home-customize-${section}`);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async openPageMenu(): Promise<void> {
    await this.pageMenuButton.click();
    await this.customizeItem.waitFor({ state: 'visible' });
  }

  async openCustomize(): Promise<void> {
    await this.openPageMenu();
    await this.customizeItem.click();
    await this.customizeDialog.waitFor({ state: 'visible' });
  }

  /** Waits until no section shows a loading skeleton (`aria-busy`). */
  async waitForSectionsLoaded(): Promise<void> {
    await expect(this.page.locator('[aria-busy="true"]')).toHaveCount(0);
  }

  /** The page has no sideways scroll (the D-04 check). */
  async hasHorizontalOverflow(): Promise<boolean> {
    return this.page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
  }
}
