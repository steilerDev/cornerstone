/**
 * Page Object Model for Settings > Integrations (/settings/integrations), admin only (#2217).
 *
 * Nine read-only cards, each `section#<anchor>` with `h2#<anchor>-heading`. Test ids:
 * `integration-<anchor>` (card), `-status` (chip), `-fact-<name>` (fact row), `-env` (variable
 * names), `-docs` (setup guide link). The only buttons are "Check again" and "Try again".
 */

import type { Locator, Page, Route } from '@playwright/test';
import { API, ROUTES } from '../fixtures/testData.js';
import { integrationsBody } from '../fixtures/integrationsMocks.js';

/** Card anchors in page order. */
export const INTEGRATION_ANCHORS = [
  'paperless',
  'ai',
  'single-sign-on',
  'calendar-contacts',
  'automatic-backups',
  'history',
  'currency-vat',
  'photos',
  'public-address',
] as const;
export type IntegrationAnchor = (typeof INTEGRATION_ANCHORS)[number];

/** The h2 of each card, in page order. */
export const INTEGRATION_TITLES: Record<IntegrationAnchor, string> = {
  paperless: 'Paperless',
  ai: 'AI',
  'single-sign-on': 'Single sign-on',
  'calendar-contacts': 'Calendar & contacts sync',
  'automatic-backups': 'Automatic backups',
  history: 'History',
  'currency-vat': 'Currency & VAT',
  photos: 'Photo storage',
  'public-address': 'Public address and proxy',
};

export class IntegrationsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly intro: Locator;
  /** The polite live region (check results, retry results). */
  readonly status: Locator;
  readonly cards: Locator;
  readonly recheck: Locator;
  readonly retry: Locator;
  readonly loadErrorHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'Integrations', exact: true });
    this.intro = page.getByTestId('integrations-intro');
    this.status = page.getByTestId('integrations-status');
    this.cards = page.locator('section[data-testid^="integration-"]');
    this.recheck = page.getByTestId('integration-paperless-recheck');
    this.retry = page.getByRole('button', { name: 'Try again' });
    this.loadErrorHeading = page.getByRole('heading', {
      level: 2,
      name: "Couldn't load the integrations",
    });
  }

  async goto(hash = ''): Promise<void> {
    await this.page.goto(`${ROUTES.integrations}${hash}`);
  }

  card(anchor: IntegrationAnchor): Locator {
    return this.page.getByTestId(`integration-${anchor}`);
  }

  cardHeading(anchor: IntegrationAnchor): Locator {
    return this.page.locator(`#${anchor}-heading`);
  }

  /** The status chip of a card (Paperless, AI, Single sign-on, Calendar, Backups, History). */
  chip(anchor: IntegrationAnchor): Locator {
    return this.page.getByTestId(`integration-${anchor}-status`);
  }

  /** A fact row by name, e.g. `fact('single-sign-on', 'sign-in-service')`. */
  fact(anchor: IntegrationAnchor, name: string): Locator {
    return this.page.getByTestId(`integration-${anchor}-fact-${name}`);
  }

  /** The "How to set it up" variable list of a card (absent for cards without variables). */
  envList(anchor: IntegrationAnchor): Locator {
    return this.page.getByTestId(`integration-${anchor}-env`);
  }

  docsLink(anchor: IntegrationAnchor): Locator {
    return this.page.getByTestId(`integration-${anchor}-docs`);
  }

  /** The Paperless "tag not found" notice. */
  get tagNotice(): Locator {
    return this.page.getByTestId('integration-paperless-tag-notice');
  }

  /** Mock `GET /api/settings/integrations`: a body (default: all configured) or an HTTP error. */
  async mockStatus(
    body: ReturnType<typeof integrationsBody> | { error: number } = integrationsBody(),
  ): Promise<void> {
    await this.page.route(`**${API.integrations}`, async (route: Route) => {
      if ('error' in body) {
        await route.fulfill({
          status: body.error,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Synthetic failure' } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
  }

  /** Mock `GET /api/paperless/status` with a body, or abort the request. */
  async mockProbe(body: object | 'abort'): Promise<void> {
    await this.page.route('**/api/paperless/status', async (route: Route) => {
      if (body === 'abort') {
        await route.abort('failed');
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
  }

  /** Replace every earlier mock of the Paperless status (later routes win in Playwright). */
  async remockProbe(body: object | 'abort'): Promise<void> {
    await this.mockProbe(body);
  }
}
