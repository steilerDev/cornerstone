/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { IntegrationsStatusResponse, PaperlessStatusResponse } from '@cornerstone/shared';
import type * as IntegrationsApiTypes from '../../lib/integrationsApi.js';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';
import type * as PageTypes from './IntegrationsPage.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';

const mockGetIntegrationsStatus = jest.fn<typeof IntegrationsApiTypes.getIntegrationsStatus>();
const mockGetPaperlessStatus = jest.fn<typeof PaperlessApiTypes.getPaperlessStatus>();

jest.unstable_mockModule('../../lib/integrationsApi.js', () => ({
  getIntegrationsStatus: mockGetIntegrationsStatus,
}));
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
}));

let mockLocale = 'en';
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
  useLocale: () => ({
    locale: mockLocale,
    resolvedLocale: mockLocale,
    currency: 'EUR',
    vatRate: 0.19,
  }),
}));

const SECTION_ORDER = [
  ['paperless', 'Paperless'],
  ['ai', 'AI'],
  ['single-sign-on', 'Single sign-on'],
  ['calendar-contacts', 'Calendar & contacts sync'],
  ['automatic-backups', 'Automatic backups'],
  ['history', 'History'],
  ['currency-vat', 'Currency & VAT'],
  ['photos', 'Photo storage'],
  ['public-address', 'Public address and proxy'],
] as const;

function envOf(name: string) {
  return { required: [`FAKE_${name}_REQ`], optional: [`FAKE_${name}_OPT`] };
}

function body(overrides: Partial<IntegrationsStatusResponse> = {}): IntegrationsStatusResponse {
  return {
    paperless: {
      configured: true,
      host: 'docs.example.test:8443',
      filterTag: 'house',
      env: envOf('PAPERLESS'),
    },
    ai: {
      configured: true,
      provider: 'anthropic',
      model: 'model-x',
      host: 'llm.example.test',
      env: envOf('AI'),
    },
    singleSignOn: {
      configured: true,
      issuerHost: 'login.example.test',
      jitProvisioning: false,
      redirectUri: 'https://house.example.test/api/auth/oidc/callback',
      env: envOf('SSO'),
    },
    calendarContacts: { davUrl: 'https://house.example.test/dav/', env: envOf('DAV') },
    backups: {
      enabled: true,
      cadence: '0 2 * * *',
      retention: 5,
      lastRun: { timestamp: '2026-10-01T02:00:00.000Z', success: true },
      nextRun: '2026-10-02T02:00:00.000Z',
      env: envOf('BACKUP'),
    },
    diaryEvents: { enabled: true, env: envOf('HISTORY') },
    money: { currency: 'EUR', vatRate: 0.19, env: envOf('MONEY') },
    photos: {
      storagePath: '/data/photos',
      maxFileSizeBytes: 20 * 1024 * 1024,
      env: envOf('PHOTOS'),
    },
    publicAddress: {
      externalUrl: 'https://house.example.test/cs',
      trustProxy: true,
      secureCookies: true,
      env: envOf('PUBLIC'),
    },
    ...overrides,
  };
}

function probe(overrides: Partial<PaperlessStatusResponse> = {}): PaperlessStatusResponse {
  return {
    configured: true,
    reachable: true,
    error: null,
    paperlessUrl: 'http://pl-internal.example.test',
    filterTag: 'house',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('IntegrationsPage', () => {
  let IntegrationsPage: typeof PageTypes.IntegrationsPage;

  beforeEach(async () => {
    IntegrationsPage ??= (await import('./IntegrationsPage.js')).IntegrationsPage;
    mockGetIntegrationsStatus.mockReset();
    mockGetPaperlessStatus.mockReset();
    mockLocale = 'en';
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/settings/integrations']}>
        <IntegrationsPage />
      </MemoryRouter>,
    );
  }

  async function renderLoaded(data = body(), paperlessProbe: PaperlessStatusResponse = probe()) {
    mockGetIntegrationsStatus.mockResolvedValue(data);
    mockGetPaperlessStatus.mockResolvedValue(paperlessProbe);
    const view = renderPage();
    await screen.findByTestId('integration-paperless-fact-address');
    return view;
  }

  const fact = (anchor: string, name: string) =>
    screen.getByTestId(`integration-${anchor}-fact-${name}`);

  describe('structure', () => {
    it('renders nine sections in order with their headings, under one h1', async () => {
      await renderLoaded();

      const sections = document.querySelectorAll('main section, section');
      expect(Array.from(sections).map((s) => s.id)).toEqual(SECTION_ORDER.map(([id]) => id));
      for (const [id, title] of SECTION_ORDER) {
        const section = screen.getByTestId(`integration-${id}`);
        expect(within(section).getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
      }
      expect(screen.getByRole('heading', { level: 1, name: 'Integrations' })).toBeInTheDocument();
      expect(screen.getByTestId('integrations-intro')).toHaveTextContent(
        "You can't change these settings here",
      );
    });

    it('shows nine headings with skeletons and no environment names while loading', () => {
      mockGetIntegrationsStatus.mockReturnValue(new Promise(() => undefined));

      renderPage();

      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(9);
      expect(screen.getAllByRole('status', { name: /^Loading / }).length).toBe(9);
      expect(screen.queryByText(/FAKE_/)).toBeNull();
      expect(mockGetPaperlessStatus).not.toHaveBeenCalled();
    });

    it('renders every environment name from the server response, none hard-coded', async () => {
      const data = body();
      data.paperless.env = { required: ['FAKE_ENV_ONE'], optional: ['FAKE_ENV_TWO'] };
      data.money.env = { required: [], optional: [] };
      await renderLoaded(data);

      expect(screen.getByText('FAKE_ENV_ONE')).toBeInTheDocument();
      expect(screen.getByText('FAKE_ENV_TWO')).toBeInTheDocument();
      expect(screen.getByText('FAKE_AI_REQ')).toBeInTheDocument();
      expect(screen.getByText('FAKE_PUBLIC_OPT')).toBeInTheDocument();
      expect(
        within(screen.getByTestId('integration-currency-vat')).getByText(
          'No setup needed on the server.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText('PAPERLESS_URL')).toBeNull();
    });
  });

  describe('facts when everything is configured', () => {
    it('shows the facts of every card', async () => {
      await renderLoaded();

      expect(screen.getByTestId('integration-paperless-status')).toHaveTextContent('Connected');
      expect(fact('paperless', 'address')).toHaveTextContent('docs.example.test:8443');
      expect(fact('paperless', 'filter-tag')).toHaveTextContent('house');
      expect(screen.getByTestId('integration-ai-status')).toHaveTextContent('On');
      expect(fact('ai', 'provider')).toHaveTextContent('Anthropic');
      expect(fact('ai', 'model')).toHaveTextContent('model-x');
      expect(fact('ai', 'address')).toHaveTextContent('llm.example.test');
      expect(screen.getByTestId('integration-single-sign-on-status')).toHaveTextContent('On');
      expect(fact('single-sign-on', 'sign-in-service')).toHaveTextContent('login.example.test');
      expect(fact('single-sign-on', 'new-accounts')).toHaveTextContent(
        'Only people who already have an account',
      );
      expect(fact('single-sign-on', 'redirect-address').querySelector('code')).toHaveTextContent(
        'https://house.example.test/api/auth/oidc/callback',
      );
      expect(screen.getByTestId('integration-calendar-contacts-status')).toHaveTextContent('On');
      expect(fact('calendar-contacts', 'server-address')).toHaveTextContent(
        'https://house.example.test/dav/',
      );
      expect(screen.getByTestId('integration-automatic-backups-status')).toHaveTextContent('On');
      expect(fact('automatic-backups', 'schedule')).toHaveTextContent('0 2 * * *');
      expect(fact('automatic-backups', 'keeps')).toHaveTextContent('The latest 5 backups');
      expect(fact('automatic-backups', 'last-run')).toHaveTextContent('Succeeded');
      expect(fact('automatic-backups', 'last-run')).toHaveTextContent('2026');
      expect(fact('automatic-backups', 'next-run')).toHaveTextContent('2026');
      expect(screen.getByTestId('integration-history-status')).toHaveTextContent('On');
      expect(fact('currency-vat', 'currency')).toHaveTextContent('EUR, for example');
      expect(fact('currency-vat', 'vat-rate')).toHaveTextContent('19%');
      expect(fact('photos', 'folder')).toHaveTextContent('/data/photos');
      expect(fact('photos', 'largest-photo')).toHaveTextContent('20');
      expect(fact('public-address', 'public-address')).toHaveTextContent(
        'https://house.example.test/cs',
      );
      expect(fact('public-address', 'behind-proxy')).toHaveTextContent('Yes');
      expect(fact('public-address', 'secure-cookies')).toHaveTextContent('Yes, HTTPS only');
    });

    it('links the calendar and backups cards to their in-app pages', async () => {
      await renderLoaded();

      expect(screen.getByTestId('integration-calendar-contacts-link')).toHaveAttribute(
        'href',
        '/settings/profile#calendar-sync',
      );
      expect(screen.getByTestId('integration-automatic-backups-link')).toHaveAttribute(
        'href',
        '/settings/backups',
      );
    });

    it('shows an Off chip and no facts for unconfigured cards (History stays On)', async () => {
      const data = body({
        ai: { configured: false, provider: null, model: null, host: null, env: envOf('AI') },
        singleSignOn: {
          configured: false,
          issuerHost: null,
          jitProvisioning: false,
          redirectUri: 'http://localhost/api/auth/oidc/callback',
          env: envOf('SSO'),
        },
        diaryEvents: { enabled: false, env: envOf('HISTORY') },
        publicAddress: {
          externalUrl: null,
          trustProxy: false,
          secureCookies: false,
          env: envOf('PUBLIC'),
        },
      });
      await renderLoaded(data);

      expect(screen.getByTestId('integration-ai-status')).toHaveTextContent('Off');
      expect(screen.queryByTestId('integration-ai-fact-provider')).toBeNull();
      expect(screen.getByTestId('integration-single-sign-on-status')).toHaveTextContent('Off');
      expect(screen.queryByTestId('integration-single-sign-on-fact-sign-in-service')).toBeNull();
      expect(fact('single-sign-on', 'redirect-address')).toBeInTheDocument();
      expect(screen.getByTestId('integration-history-status')).toHaveTextContent('On');
      expect(screen.getByTestId('integration-history-status')).not.toHaveTextContent('Off');
      expect(fact('public-address', 'public-address')).toHaveTextContent('Not set.');
      expect(fact('public-address', 'behind-proxy')).toHaveTextContent('No');
      expect(fact('public-address', 'secure-cookies')).toHaveTextContent('No');
    });

    it('History is always on: the chip ignores diaryEvents.enabled, the hint says so, no docs link (#2223)', async () => {
      const data = body({ diaryEvents: { enabled: false, env: { required: [], optional: [] } } });
      await renderLoaded(data);

      const card = screen.getByTestId('integration-history');
      expect(screen.getByTestId('integration-history-status')).toHaveTextContent('On');
      expect(within(card).getByText("History is always on. It can't be turned off.")).toBeVisible();
      expect(within(card).queryByText(/It is on unless you turn it off/)).not.toBeInTheDocument();
      expect(within(card).getByText('No setup needed on the server.')).toBeInTheDocument();
      expect(screen.queryByTestId('integration-history-docs')).toBeNull();
      expect(screen.getByTestId('integration-single-sign-on-docs')).toBeInTheDocument();
      expect(screen.getByTestId('integration-ai-docs')).toBeInTheDocument();
    });

    it('shows the JIT wording for new accounts', async () => {
      const data = body();
      data.singleSignOn.jitProvisioning = true;
      await renderLoaded(data);

      expect(fact('single-sign-on', 'new-accounts')).toHaveTextContent('Created at first sign-in');
    });

    it('shows placeholders for missing hosts and models on a configured card', async () => {
      const data = body({
        ai: { configured: true, provider: null, model: null, host: null, env: envOf('AI') },
        singleSignOn: {
          configured: true,
          issuerHost: null,
          jitProvisioning: false,
          redirectUri: 'http://localhost/cb',
          env: envOf('SSO'),
        },
      });
      data.paperless.host = null;
      data.paperless.filterTag = null;
      await renderLoaded(data, probe({ filterTag: null }));

      expect(fact('paperless', 'address')).toHaveTextContent('—');
      expect(fact('paperless', 'filter-tag')).toHaveTextContent('None');
      expect(fact('ai', 'provider')).toHaveTextContent('—');
      expect(fact('ai', 'model')).toHaveTextContent('—');
      expect(fact('ai', 'address')).toHaveTextContent('—');
      expect(fact('single-sign-on', 'sign-in-service')).toHaveTextContent('—');
    });
  });

  describe('formatting', () => {
    it.each([
      ['openai', 'OpenAI'],
      ['anthropic', 'Anthropic'],
      ['gemini', 'Gemini'],
      ['ollama', 'Ollama'],
      ['generic', 'Other (OpenAI-compatible)'],
    ] as const)('shows provider %s as %s', async (provider, label) => {
      const data = body();
      data.ai.provider = provider;
      await renderLoaded(data);

      expect(fact('ai', 'provider')).toHaveTextContent(label);
    });

    it.each([
      [0.19, '19%'],
      [0.075, '7.50%'],
      [0, '0%'],
    ])('shows VAT %p as %s', async (rate, text) => {
      const data = body();
      data.money.vatRate = rate;
      await renderLoaded(data);

      expect(fact('currency-vat', 'vat-rate')).toHaveTextContent(text);
    });

    it('says All backups when retention is null', async () => {
      const data = body();
      data.backups.retention = null;
      await renderLoaded(data);

      expect(fact('automatic-backups', 'keeps')).toHaveTextContent('All backups');
    });

    it('says The latest backup for a retention of one', async () => {
      const data = body();
      data.backups.retention = 1;
      await renderLoaded(data);

      expect(fact('automatic-backups', 'keeps')).toHaveTextContent('The latest backup');
    });

    it('shows a failed last run and no next run when there is none', async () => {
      const data = body();
      data.backups.lastRun = { timestamp: '2026-10-01T02:00:00.000Z', success: false };
      data.backups.nextRun = null;
      await renderLoaded(data);

      expect(fact('automatic-backups', 'last-run')).toHaveTextContent('Failed');
      expect(screen.queryByTestId('integration-automatic-backups-fact-next-run')).toBeNull();
    });

    it('says no automatic backups have run yet when there is no last run', async () => {
      const data = body();
      data.backups.lastRun = null;
      await renderLoaded(data);

      expect(fact('automatic-backups', 'last-run')).toHaveTextContent(
        'No automatic backups have run yet',
      );
    });

    it('shows the schedule fact and an invalid notice for an invalid cadence', async () => {
      const data = body();
      data.backups = {
        enabled: false,
        cadence: 'bad',
        retention: null,
        lastRun: null,
        nextRun: null,
        env: envOf('BACKUP'),
      };
      await renderLoaded(data);

      expect(screen.getByTestId('integration-automatic-backups-status')).toHaveTextContent('Off');
      expect(fact('automatic-backups', 'schedule')).toHaveTextContent('bad');
      expect(
        screen.getByText("This schedule isn't valid, so automatic backups are off."),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('integration-automatic-backups-fact-keeps')).toBeNull();
    });

    it('shows only the Off chip when no cadence is set', async () => {
      const data = body();
      data.backups = {
        enabled: false,
        cadence: null,
        retention: null,
        lastRun: null,
        nextRun: null,
        env: envOf('BACKUP'),
      };
      await renderLoaded(data);

      expect(screen.getByTestId('integration-automatic-backups-status')).toHaveTextContent('Off');
      expect(screen.queryByTestId('integration-automatic-backups-fact-schedule')).toBeNull();
      expect(screen.queryByText(/isn't valid/)).toBeNull();
    });

    it('does not fetch again when the language changes', async () => {
      const view = await renderLoaded();
      expect(mockGetIntegrationsStatus).toHaveBeenCalledTimes(1);

      mockLocale = 'de';
      view.rerender(
        <MemoryRouter initialEntries={['/settings/integrations']}>
          <IntegrationsPage />
        </MemoryRouter>,
      );

      expect(mockGetIntegrationsStatus).toHaveBeenCalledTimes(1);
      expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('Paperless probe', () => {
    it('does not probe when Paperless is not configured and shows Not set up', async () => {
      const data = body();
      data.paperless = { configured: false, host: null, filterTag: null, env: envOf('PAPERLESS') };
      mockGetIntegrationsStatus.mockResolvedValue(data);
      renderPage();

      await waitFor(() =>
        expect(screen.getByTestId('integration-paperless-status')).toHaveTextContent('Not set up'),
      );
      expect(mockGetPaperlessStatus).not.toHaveBeenCalled();
      expect(screen.queryByTestId('integration-paperless-fact-address')).toBeNull();
    });

    it('shows a skeleton chip while the probe runs, then the result', async () => {
      const pending = deferred<PaperlessStatusResponse>();
      mockGetIntegrationsStatus.mockResolvedValue(body());
      mockGetPaperlessStatus.mockReturnValue(pending.promise);
      renderPage();

      await screen.findByRole('status', { name: 'Checking the connection to Paperless' });
      expect(screen.queryByTestId('integration-paperless-status')).toBeNull();

      pending.resolve(probe());
      await waitFor(() =>
        expect(screen.getByTestId('integration-paperless-status')).toHaveTextContent('Connected'),
      );
    });

    it('has no button when Paperless is reachable', async () => {
      await renderLoaded();

      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('shows one button, a notice and never the probe error or URL when unreachable', async () => {
      await renderLoaded(
        body(),
        probe({
          reachable: false,
          error: 'secret-ish-detail <host>',
          paperlessUrl: 'http://pl-internal.example.test',
        }),
      );

      expect(screen.getByTestId('integration-paperless-status')).toHaveTextContent("Can't connect");
      expect(screen.getAllByRole('button')).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
      expect(
        screen.getByText(/Cornerstone can't connect to Paperless right now/),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('secret-ish-detail');
      expect(document.body.textContent).not.toContain('pl-internal.example.test');
    });

    it('treats a failed probe request as unreachable', async () => {
      mockGetIntegrationsStatus.mockResolvedValue(body());
      mockGetPaperlessStatus.mockRejectedValue(new Error('boom'));
      renderPage();

      await screen.findByRole('button', { name: 'Check again' });
      expect(screen.getByTestId('integration-paperless-status')).toHaveTextContent("Can't connect");
    });

    it('notes a missing filter tag only when reachable, tag configured and not found', async () => {
      await renderLoaded(body(), probe({ filterTag: null }));
      expect(screen.getByTestId('integration-paperless-tag-notice')).toHaveTextContent(
        "Cornerstone can't find the filter tag “house” in Paperless",
      );
    });

    it('has no tag note when the tag was found', async () => {
      await renderLoaded(body(), probe({ filterTag: 'house' }));
      expect(screen.queryByTestId('integration-paperless-tag-notice')).toBeNull();
    });

    it('has no tag note when no tag is configured', async () => {
      const data = body();
      data.paperless.filterTag = null;
      await renderLoaded(data, probe({ filterTag: null }));
      expect(screen.queryByTestId('integration-paperless-tag-notice')).toBeNull();
    });

    it('has no tag note when Paperless is unreachable', async () => {
      await renderLoaded(body(), probe({ reachable: false, filterTag: null }));
      expect(screen.queryByTestId('integration-paperless-tag-notice')).toBeNull();
    });
  });

  describe('Check again', () => {
    it('disables the button while pending, ignores a second click, then focuses the heading on success', async () => {
      const user = userEvent.setup();
      await renderLoaded(body(), probe({ reachable: false }));
      const second = deferred<PaperlessStatusResponse>();
      mockGetPaperlessStatus.mockReturnValueOnce(second.promise);

      await user.click(screen.getByRole('button', { name: 'Check again' }));

      const pendingButton = await screen.findByRole('button', { name: 'Checking…' });
      expect(pendingButton).toHaveAttribute('aria-disabled', 'true');
      expect(pendingButton).not.toBeDisabled();
      await user.click(pendingButton);
      expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(2);

      second.resolve(probe());
      await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
      expect(screen.getByTestId('integration-paperless-status')).toHaveTextContent('Connected');
      await waitFor(() =>
        expect(screen.getByTestId('integrations-status')).toHaveTextContent(
          'Paperless is connected.',
        ),
      );
      await waitFor(() =>
        expect(document.activeElement).toBe(document.getElementById('paperless-heading')),
      );
    });

    it('announces a failed re-check and keeps the button', async () => {
      const user = userEvent.setup();
      await renderLoaded(body(), probe({ reachable: false }));
      mockGetPaperlessStatus.mockResolvedValueOnce(probe({ reachable: false }));

      await user.click(screen.getByRole('button', { name: 'Check again' }));

      await waitFor(() =>
        expect(screen.getByTestId('integrations-status')).toHaveTextContent(
          "Still can't connect to Paperless.",
        ),
      );
      expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Check again' })).not.toHaveAttribute(
        'aria-disabled',
      );
    });

    it('treats a rejected re-check as still unreachable', async () => {
      const user = userEvent.setup();
      await renderLoaded(body(), probe({ reachable: false }));
      mockGetPaperlessStatus.mockRejectedValueOnce(new Error('down'));

      await user.click(screen.getByRole('button', { name: 'Check again' }));

      await waitFor(() =>
        expect(screen.getByTestId('integrations-status')).toHaveTextContent(
          "Still can't connect to Paperless.",
        ),
      );
    });
  });

  describe('load error', () => {
    it('shows the heading focused with a translated reason for an API error', async () => {
      mockGetIntegrationsStatus.mockRejectedValue(
        new ApiClientError(403, { code: 'FORBIDDEN', message: 'server prose' }),
      );
      renderPage();

      const heading = await screen.findByRole('heading', {
        level: 2,
        name: "Couldn't load the integrations",
      });
      await waitFor(() => expect(document.activeElement).toBe(heading));
      expect(
        screen.getByText('You do not have permission to perform this action.'),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('server prose');
      expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(1);
    });

    it('shows the network reason for a NetworkError', async () => {
      mockGetIntegrationsStatus.mockRejectedValue(new NetworkError('offline', null));
      renderPage();

      expect(
        await screen.findByText("Can't reach the server. Check your connection and try again."),
      ).toBeInTheDocument();
    });

    it('shows the generic reason for an unexpected error', async () => {
      mockGetIntegrationsStatus.mockRejectedValue(new Error('weird'));
      renderPage();

      expect(
        await screen.findByText('An unexpected error occurred. Please try again.'),
      ).toBeInTheDocument();
    });

    it('announces trying again, then still not working, and keeps the button enabled', async () => {
      const user = userEvent.setup();
      mockGetIntegrationsStatus.mockRejectedValue(new NetworkError('offline', null));
      renderPage();
      const retry = await screen.findByRole('button', { name: 'Try again' });

      const second = deferred<IntegrationsStatusResponse>();
      mockGetIntegrationsStatus.mockReturnValueOnce(second.promise);
      await user.click(retry);
      await waitFor(() =>
        expect(screen.getByTestId('integrations-status')).toHaveTextContent('Trying again…'),
      );
      expect(retry).not.toBeDisabled();

      second.reject(new NetworkError('offline', null));
      await waitFor(() =>
        expect(screen.getByTestId('integrations-status')).toHaveTextContent(
          'Still not working. Try again in a moment.',
        ),
      );
      expect(screen.getByRole('button', { name: 'Try again' })).not.toBeDisabled();
    });

    it('ignores a second click while a retry is in flight', async () => {
      const user = userEvent.setup();
      mockGetIntegrationsStatus.mockRejectedValueOnce(new NetworkError('offline', null));
      renderPage();
      const retry = await screen.findByRole('button', { name: 'Try again' });

      const second = deferred<IntegrationsStatusResponse>();
      mockGetIntegrationsStatus.mockReturnValueOnce(second.promise);
      await user.click(retry);
      await user.click(retry);

      expect(mockGetIntegrationsStatus).toHaveBeenCalledTimes(2);
      second.reject(new NetworkError('offline', null));
      await waitFor(() =>
        expect(screen.getByTestId('integrations-status')).toHaveTextContent('Still not working'),
      );
    });

    it('focuses the Paperless heading after a successful retry', async () => {
      const user = userEvent.setup();
      mockGetIntegrationsStatus.mockRejectedValueOnce(new NetworkError('offline', null));
      renderPage();
      const retry = await screen.findByRole('button', { name: 'Try again' });

      mockGetIntegrationsStatus.mockResolvedValueOnce(body());
      mockGetPaperlessStatus.mockResolvedValue(probe());
      await user.click(retry);

      await screen.findByTestId('integration-paperless-fact-address');
      await waitFor(() =>
        expect(document.activeElement).toBe(document.getElementById('paperless-heading')),
      );
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });
  });
});
