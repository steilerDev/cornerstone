/**
 * E2E tests for Settings > Integrations (Story #2217 / EPIC-21), admin only.
 *
 * A read-only page of nine cards showing how Cornerstone is connected: Paperless, AI, Single
 * sign-on, Calendar & contacts sync, Automatic backups, History, Currency & VAT, Photo storage,
 * Public address and proxy. Everything is set by environment variables at start-up; the server
 * sends the variable names and never a secret.
 *
 * The E2E container has Paperless off, AI off and single sign-on on (an OIDC mock). Other states
 * are produced by mocking `GET /api/settings/integrations` and `GET /api/paperless/status` with
 * synthetic bodies (`fixtures/integrationsMocks.ts`). The member side lives in
 * `integrations-member.spec.ts`; the "no environment names anywhere else" sweep lives in
 * `navigation/env-names-only-on-integrations.spec.ts`.
 *
 * Scenarios:
 *   1. Real backend: nine cards in order, one h1, chips (SSO On, Paperless Not set up, AI Off),
 *      variable names in <code>, no secret in the API body or the DOM, nothing editable
 *   2. Mocked all-configured and reachable: chips and facts of every card, still no buttons
 *   3. Mocked unreachable: "Can't connect" chip and warning, the probe error never shown; Check
 *      again (aria-disabled while checking, focus, announcements, failure keeps focus)
 *   3b. "Tag not found" notice for a missing Paperless filter tag
 *   4. Load error: focused heading, Try again keeps focus on failure, success focuses Paperless
 *   5. Anchors: #automatic-backups focuses its heading; an unknown anchor does nothing
 *   6. Links: Account (calendar) and Backups pointers, setup-guide links
 *   8. Layout at exact widths 375 / 768 / 1280 (card width, padding, gap, stacked facts, targets)
 *   8b. Dark mode
 *
 * Projects: scenarios 1-6 run on all three; the exact-width layout scenarios (8) run on the
 * desktop project only because they resize the viewport themselves.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { API, ROUTES } from '../../fixtures/testData.js';
import {
  INTEGRATION_ANCHORS,
  INTEGRATION_TITLES,
  IntegrationsPage,
} from '../../pages/IntegrationsPage.js';
import { integrationsBody, PAPERLESS_PROBE } from '../../fixtures/integrationsMocks.js';
import { BackupsPage } from '../../pages/BackupsPage.js';

const CHIP_CARDS = [
  'paperless',
  'ai',
  'single-sign-on',
  'calendar-contacts',
  'automatic-backups',
  'history',
] as const;

/** Cards that name environment variables (Calendar & contacts sync and History need none). */
const CARDS_WITH_ENV = INTEGRATION_ANCHORS.filter(
  (anchor) => anchor !== 'calendar-contacts' && anchor !== 'history',
);

/** Cards with a setup guide link (History is always on and has none, #2223). */
const CARDS_WITH_DOCS = INTEGRATION_ANCHORS.filter((anchor) => anchor !== 'history');

/** Wait until the cards have loaded (the Paperless chip or its skeleton has resolved). */
async function waitForCards(integrations: IntegrationsPage): Promise<void> {
  await expect(integrations.heading).toBeVisible();
  await expect(integrations.chip('paperless')).toBeVisible();
}

async function pageText(page: Page): Promise<string> {
  return page.locator('body').innerText();
}

test.describe('Integrations page (Story #2217)', { tag: '@responsive' }, () => {
  test('Real backend: nine cards in order with the right chips, names only, nothing editable', async ({
    page,
  }) => {
    const integrations = new IntegrationsPage(page);

    await integrations.goto();
    await waitForCards(integrations);

    // One h1, the intro, nine h2 in the documented order
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(integrations.intro).toContainText("You can't change these settings here");
    await expect(page.locator('main h2')).toHaveText(
      INTEGRATION_ANCHORS.map((anchor) => INTEGRATION_TITLES[anchor]),
    );
    await expect(integrations.cards).toHaveCount(9);

    // Chips: single sign-on is on in the container; Paperless and AI are not set up
    await expect(integrations.chip('single-sign-on')).toHaveText('On');
    await expect(integrations.chip('paperless')).toHaveText('Not set up');
    await expect(integrations.chip('ai')).toHaveText('Off');
    await expect(integrations.chip('calendar-contacts')).toHaveText('On');
    await expect(integrations.chip('automatic-backups')).toHaveText('Off');
    await expect(integrations.chip('history')).toHaveText('On');
    // A not-set-up Paperless is not probed: no second chip, no notice, no Check again
    await expect(integrations.recheck).toHaveCount(0);

    // Single sign-on facts: the issuer host and the redirect address (no credentials, no path)
    await expect(integrations.fact('single-sign-on', 'sign-in-service')).toContainText(
      'oidc-server:8080',
    );
    await expect(integrations.fact('single-sign-on', 'redirect-address')).toContainText(
      '/api/auth/oidc/callback',
    );

    // Every card with variables names them in <code>; Calendar & contacts needs none
    for (const anchor of CARDS_WITH_ENV) {
      await expect(integrations.envList(anchor).locator('code').first()).toBeVisible();
    }
    await expect(integrations.card('calendar-contacts')).toContainText(
      'No setup needed on the server.',
    );

    // History (#2223): always on, nothing to set up, no setup guide
    await expect(integrations.card('history')).toContainText(
      "History is always on. It can't be turned off.",
    );
    await expect(integrations.card('history')).toContainText('No setup needed on the server.');
    await expect(integrations.envList('history')).toHaveCount(0);
    await expect(integrations.docsLink('history')).toHaveCount(0);
    await expect(integrations.card('history')).not.toContainText('Read the setup guide');
    await expect(integrations.card('history')).not.toContainText('DIARY_AUTO_EVENTS');

    // No secret anywhere: neither in the API body nor on the page
    const response = await page.request.get(API.integrations);
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    const text = await pageText(page);
    for (const secret of ['e2e-secret', 'cornerstone-e2e']) {
      expect(body).not.toContain(secret);
      expect(text).not.toContain(secret);
    }

    // Read-only: no form, input, dialog, tab list or button on the page
    for (const selector of [
      'form',
      'input',
      'textarea',
      'select',
      '[role=dialog]',
      '[role=tablist]',
    ]) {
      await expect(page.locator(`main ${selector}`)).toHaveCount(0);
    }
    // (the phone and tablet title menu in the h1 is shell chrome, so look inside the cards)
    await expect(integrations.cards.getByRole('button')).toHaveCount(0);
  });

  test('All configured and reachable: every chip and fact', async ({ page }) => {
    const integrations = new IntegrationsPage(page);
    await integrations.mockStatus();
    await integrations.mockProbe(PAPERLESS_PROBE.reachable);

    await integrations.goto();
    await waitForCards(integrations);

    await expect(integrations.chip('paperless')).toHaveText('Connected');
    for (const anchor of CHIP_CARDS.filter((a) => a !== 'paperless')) {
      await expect(integrations.chip(anchor)).toHaveText('On');
    }

    await expect(integrations.fact('paperless', 'address')).toContainText('paperless.example.test');
    await expect(integrations.fact('paperless', 'filter-tag')).toContainText('cornerstone');
    await expect(integrations.fact('ai', 'provider')).toContainText('OpenAI');
    await expect(integrations.fact('ai', 'model')).toContainText('example-model-1');
    await expect(integrations.fact('ai', 'address')).toContainText('llm.example.test');
    await expect(integrations.fact('single-sign-on', 'sign-in-service')).toContainText(
      'login.example.test',
    );
    await expect(integrations.fact('single-sign-on', 'new-accounts')).toContainText(
      'Only people who already have an account',
    );
    await expect(integrations.fact('single-sign-on', 'redirect-address')).toContainText(
      'https://house.example.test/api/auth/oidc/callback',
    );
    await expect(integrations.fact('calendar-contacts', 'server-address')).toContainText(
      'https://house.example.test/dav/',
    );
    await expect(integrations.fact('automatic-backups', 'schedule')).toContainText('0 2 * * *');
    await expect(integrations.fact('automatic-backups', 'keeps')).toContainText(
      'The latest 7 backups',
    );
    await expect(integrations.fact('automatic-backups', 'last-run')).toContainText('Succeeded');
    await expect(integrations.fact('automatic-backups', 'next-run')).toContainText('2026');
    await expect(integrations.fact('currency-vat', 'currency')).toContainText('EUR');
    await expect(integrations.fact('currency-vat', 'vat-rate')).toContainText('19');
    await expect(integrations.fact('photos', 'folder')).toContainText('/app/data/photos');
    await expect(integrations.fact('photos', 'largest-photo')).toContainText('20');
    await expect(integrations.fact('public-address', 'public-address')).toContainText(
      'https://house.example.test',
    );
    await expect(integrations.fact('public-address', 'behind-proxy')).toContainText('Yes');
    await expect(integrations.fact('public-address', 'secure-cookies')).toContainText(
      'Yes, HTTPS only',
    );

    // Configured or not, the page stays read-only and shows only names
    await expect(integrations.recheck).toHaveCount(0);
    await expect(integrations.tagNotice).toHaveCount(0);
    // (the phone and tablet title menu in the h1 is shell chrome, so look inside the cards)
    await expect(integrations.cards.getByRole('button')).toHaveCount(0);
  });

  test('History shows On even when the server reports it disabled', async ({ page }) => {
    const integrations = new IntegrationsPage(page);
    await integrations.mockStatus(
      integrationsBody({ diaryEvents: { enabled: false, env: { required: [], optional: [] } } }),
    );
    await integrations.mockProbe(PAPERLESS_PROBE.reachable);

    await integrations.goto();
    await waitForCards(integrations);

    await expect(integrations.chip('history')).toHaveText('On');
    await expect(integrations.chip('history')).not.toHaveText('Off');
    await expect(integrations.card('history')).toContainText(
      "History is always on. It can't be turned off.",
    );
  });

  test('An invalid backup schedule shows the Off chip, the schedule and a warning', async ({
    page,
  }) => {
    const integrations = new IntegrationsPage(page);
    await integrations.mockStatus(
      integrationsBody({
        backups: { enabled: false, cadence: 'not a schedule', retention: null, lastRun: null },
      }),
    );
    await integrations.mockProbe(PAPERLESS_PROBE.reachable);

    await integrations.goto();
    await waitForCards(integrations);

    await expect(integrations.chip('automatic-backups')).toHaveText('Off');
    await expect(integrations.fact('automatic-backups', 'schedule')).toContainText(
      'not a schedule',
    );
    await expect(integrations.card('automatic-backups')).toContainText(
      "This schedule isn't valid, so automatic backups are off.",
    );
  });

  test('Unreachable Paperless: chip, warning and Check again; the probe error never shows', async ({
    page,
  }) => {
    const integrations = new IntegrationsPage(page);
    await integrations.mockStatus();
    await integrations.mockProbe(PAPERLESS_PROBE.unreachable);

    await integrations.goto();
    await waitForCards(integrations);

    await expect(integrations.chip('paperless')).toHaveText("Can't connect");
    await expect(integrations.card('paperless')).toContainText(
      "Cornerstone can't connect to Paperless right now.",
    );
    await expect(integrations.recheck).toBeVisible();
    await expect(integrations.recheck).toHaveText('Check again');

    // The raw probe error and the Paperless address from the probe are never rendered
    const text = await pageText(page);
    expect(text).not.toContain('secret-ish-detail');
    expect(text).not.toContain('paperless.example.test:8000');
  });

  test('Check again: aria-disabled while checking; success removes the warning and focuses the card', async ({
    page,
  }) => {
    const integrations = new IntegrationsPage(page);
    await integrations.mockStatus();

    // The first check fails; the second is held until released, then succeeds
    let probes = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/paperless/status', async (route) => {
      probes += 1;
      if (probes === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(PAPERLESS_PROBE.unreachable),
        });
        return;
      }
      await gate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PAPERLESS_PROBE.reachable),
      });
    });

    await integrations.goto();
    await waitForCards(integrations);
    await expect(integrations.recheck).toBeVisible();

    await integrations.recheck.focus();
    await page.keyboard.press('Enter');

    // Checking: never natively disabled, focus stays on the button
    await expect(integrations.recheck).toHaveText('Checking…');
    await expect(integrations.recheck).toHaveAttribute('aria-disabled', 'true');
    await expect(integrations.recheck).not.toHaveAttribute('disabled');
    await expect(integrations.recheck).toBeFocused();

    release();

    await expect(integrations.chip('paperless')).toHaveText('Connected');
    await expect(integrations.recheck).toHaveCount(0);
    await expect(integrations.card('paperless')).not.toContainText("can't connect");
    await expect(integrations.cardHeading('paperless')).toBeFocused();
    await expect(integrations.status).toHaveText('Paperless is connected.');
  });

  test('Check again: a failed check keeps focus on the button and says so', async ({ page }) => {
    const integrations = new IntegrationsPage(page);
    await integrations.mockStatus();
    await integrations.mockProbe(PAPERLESS_PROBE.unreachable);

    await integrations.goto();
    await waitForCards(integrations);

    await integrations.recheck.focus();
    await page.keyboard.press('Enter');

    await expect(integrations.status).toHaveText("Still can't connect to Paperless.");
    await expect(integrations.recheck).toBeFocused();
    await expect(integrations.recheck).toHaveText('Check again');
    await expect(integrations.recheck).not.toHaveAttribute('aria-disabled', 'true');
    await expect(integrations.chip('paperless')).toHaveText("Can't connect");
  });

  test('A probe request that fails outright reads as unreachable', async ({ page }) => {
    const integrations = new IntegrationsPage(page);
    await integrations.mockStatus();
    await integrations.mockProbe('abort');

    await integrations.goto();
    await waitForCards(integrations);

    await expect(integrations.chip('paperless')).toHaveText("Can't connect");
    await expect(integrations.recheck).toBeVisible();
  });

  test('Filter tag not found: a notice names the tag; a found tag shows none', async ({ page }) => {
    const integrations = new IntegrationsPage(page);
    await integrations.mockStatus();
    await integrations.mockProbe(PAPERLESS_PROBE.tagMissing);

    await integrations.goto();
    await waitForCards(integrations);

    await expect(integrations.chip('paperless')).toHaveText('Connected');
    await expect(integrations.tagNotice).toContainText(
      "Cornerstone can't find the filter tag “cornerstone” in Paperless, so no documents are shown until the tag exists.",
    );
    // No Check again for this: the connection itself is fine
    await expect(integrations.recheck).toHaveCount(0);

    await page.unroute('**/api/paperless/status');
    await integrations.mockProbe(PAPERLESS_PROBE.reachable);
    await page.reload();
    await waitForCards(integrations);
    await expect(integrations.chip('paperless')).toHaveText('Connected');
    await expect(integrations.tagNotice).toHaveCount(0);
  });

  test('Load error: the heading takes focus, a failed retry keeps it, success focuses Paperless', async ({
    page,
  }) => {
    const integrations = new IntegrationsPage(page);
    let outage = true;
    await page.route(`**${API.integrations}`, async (route) => {
      if (outage) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Synthetic failure' } }),
        });
        return;
      }
      await route.continue();
    });

    await integrations.goto();

    await expect(integrations.loadErrorHeading).toBeVisible();
    await expect(integrations.loadErrorHeading).toBeFocused();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(integrations.cards).toHaveCount(0);

    // A retry that fails again: the button keeps focus and is never natively disabled
    await integrations.retry.focus();
    await page.keyboard.press('Enter');
    await expect(integrations.status).toHaveText('Still not working. Try again in a moment.');
    await expect(integrations.retry).toBeFocused();
    await expect(integrations.retry).not.toHaveAttribute('disabled');

    // A retry that works: the cards appear and focus lands on the first heading, never <body>
    outage = false;
    await page.keyboard.press('Enter');
    await expect(integrations.cards).toHaveCount(9);
    await expect(integrations.cardHeading('paperless')).toBeFocused();
    await expect(integrations.loadErrorHeading).toHaveCount(0);
  });

  test('Anchors: #automatic-backups focuses and shows its heading; an unknown anchor does nothing', async ({
    page,
  }) => {
    const integrations = new IntegrationsPage(page);

    await integrations.goto('#automatic-backups');
    await expect(integrations.chip('automatic-backups')).toBeVisible();

    await expect(integrations.cardHeading('automatic-backups')).toBeFocused();
    await expect(integrations.cardHeading('automatic-backups')).toBeInViewport();
    expect(new URL(page.url()).hash).toBe('#automatic-backups');

    await page.goto('about:blank');
    await integrations.goto('#nope');
    await waitForCards(integrations);
    expect(new URL(page.url()).hash).toBe('#nope');
    await expect(page.locator('main h2:focus')).toHaveCount(0);
  });

  test('Links: Account and Backups pointers and a setup guide link on every card but History', async ({
    page,
  }) => {
    const integrations = new IntegrationsPage(page);
    await integrations.goto();
    await waitForCards(integrations);

    // Setup guides open in a new tab on the documentation site (History has none)
    for (const anchor of CARDS_WITH_DOCS) {
      const link = integrations.docsLink(anchor);
      await expect(link).toHaveAttribute('href', /^https:\/\/cornerstone\.steiler\.dev\//);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
    }

    // The calendar card points to the token section of Account
    const calendarLink = page.getByTestId('integration-calendar-contacts-link');
    await expect(calendarLink).toHaveAttribute('href', `${ROUTES.profile}#calendar-sync`);
    await calendarLink.click();
    await expect(page).toHaveURL(`${ROUTES.profile}#calendar-sync`);
    await expect(page.locator('#calendar-sync')).toBeFocused();

    // The backups card points to the Backups page
    await integrations.goto();
    await waitForCards(integrations);
    const backupsLink = page.getByTestId('integration-automatic-backups-link');
    await expect(backupsLink).toHaveAttribute('href', ROUTES.backups);
    await backupsLink.click();
    await expect(page).toHaveURL(ROUTES.backups);
    await expect(new BackupsPage(page).heading).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: exact widths 375 / 768 / 1280 (UX spec section 10) and dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Integrations page: layout (Story #2217)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'resizes the viewport itself');
  });

  const WIDTHS = [
    { width: 375, card: 343, padding: 16, stacked: true },
    { width: 768, card: 640, padding: 24, stacked: false },
    { width: 1280, card: 640, padding: 24, stacked: false },
  ] as const;

  for (const { width, card, padding, stacked } of WIDTHS) {
    test(`Layout at ${width}px: card ${card}px wide, padding ${padding}px, 24px gap`, async ({
      page,
    }) => {
      const integrations = new IntegrationsPage(page);
      await integrations.mockStatus();
      await integrations.mockProbe(PAPERLESS_PROBE.reachable);
      await page.setViewportSize({ width, height: 900 });

      await integrations.goto();
      await waitForCards(integrations);
      await expect(integrations.fact('single-sign-on', 'sign-in-service')).toBeVisible();

      const first = await integrations.card('paperless').boundingBox();
      const second = await integrations.card('ai').boundingBox();
      if (!first || !second) throw new Error('cards have no box');
      expect(Math.round(first.width)).toBe(card);
      expect(Math.round(second.y - (first.y + first.height))).toBe(24);

      const paddingLeft = await integrations
        .card('paperless')
        .evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
      expect(paddingLeft).toBe(padding);

      // Facts: label above value on a phone, side by side from 768px
      const row = integrations.fact('single-sign-on', 'sign-in-service');
      const label = await row.locator('dt').boundingBox();
      const value = await row.locator('dd').boundingBox();
      if (!label || !value) throw new Error('fact has no box');
      if (stacked) {
        expect(value.y).toBeGreaterThanOrEqual(label.y + label.height - 1);
      } else {
        expect(Math.abs(value.y - label.y)).toBeLessThan(label.height);
        expect(value.x).toBeGreaterThan(label.x + label.width - 1);
      }

      if (width === 375) {
        // Touch targets: setup guide links and in-app pointers are at least 44px tall
        for (const target of [
          integrations.docsLink('paperless'),
          page.getByTestId('integration-calendar-contacts-link'),
          page.getByTestId('integration-automatic-backups-link'),
        ]) {
          const box = await target.boundingBox();
          if (!box) throw new Error('link has no box');
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    });
  }

  for (const width of [320, 375]) {
    test(`No horizontal overflow at ${width}px, even with long values`, async ({ page }) => {
      const integrations = new IntegrationsPage(page);
      await integrations.mockStatus(
        integrationsBody({
          singleSignOn: {
            redirectUri:
              'https://a-very-long-synthetic-house-address-for-layout.example.test/api/auth/oidc/callback',
          },
          photos: {
            storagePath: '/synthetic/very/long/path/to/the/photo/storage/folder/for/layout',
          },
        }),
      );
      await integrations.mockProbe(PAPERLESS_PROBE.reachable);
      await page.setViewportSize({ width, height: 800 });

      await integrations.goto();
      await waitForCards(integrations);
      await expect(integrations.fact('photos', 'folder')).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow).toBe(false);
    });
  }

  test('Dark mode: cards and chips render, nothing overflows', async ({ page }) => {
    const integrations = new IntegrationsPage(page);
    await integrations.mockStatus();
    await integrations.mockProbe(PAPERLESS_PROBE.unreachable);

    await integrations.goto();
    await waitForCards(integrations);
    const lightBackground = await integrations
      .card('paperless')
      .evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

    await expect(integrations.chip('paperless')).toBeVisible();
    await expect(integrations.recheck).toBeVisible();
    await expect(integrations.heading).toBeVisible();
    const darkBackground = await integrations
      .card('paperless')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(darkBackground).not.toBe(lightBackground);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
});
