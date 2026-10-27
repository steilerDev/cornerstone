/**
 * @jest-environment jsdom
 */
/**
 * Money > Financing (#2242, S9, AC1-AC4): cards for every funding source and grant.
 *
 * Mutations these tests catch: figures formatted client-side instead of taken from the response;
 * the signed over-allocation (D8) shown as 0 / unsigned; Ready to submit on a savings or Own
 * funds card, or its count read as part of the amount; Documents Link outside full mode; a
 * fixed grant shown as a percentage; Overdue on a received / rejected grant; the wrong form kind
 * opened by ?create=1&kind=; the Add buttons not returning focus to themselves; a failed load
 * without a Retry; the hash anchors not focusing their section heading.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { FinancingGrant, FinancingResponse, FinancingSource } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import i18n from '../../i18n/index.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { FinancingCreateContext } from '../../objectForms/financingCreateContext.js';
import type { OpenFinancingForm } from '../../objectForms/financingCreateContext.js';
import type * as PageModule from './FinancingPage.js';
import type * as FinancingApiTypes from '../../lib/financingApi.js';

const mockFetchFinancing = jest.fn<typeof FinancingApiTypes.fetchFinancing>();
jest.unstable_mockModule('../../lib/financingApi.js', () => ({
  fetchFinancing: mockFetchFinancing,
}));

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});

// The Documents button reads Paperless; its own tests cover it. The stub keeps its props visible.
let mockDocsMode: 'full' | 'readOnly' = 'full';
jest.unstable_mockModule('../../components/DocumentsPanel/index.js', () => ({
  DocumentsPanelButton: (props: {
    entityType: string;
    entityId: string;
    contextName?: string;
    linkAction?: boolean;
    testId?: string;
  }) => (
    <span data-testid={props.testId} data-entity={`${props.entityType}:${props.entityId}`}>
      Documents for {props.contextName}
      {props.linkAction && mockDocsMode === 'full' && (
        <button type="button" data-testid={`${props.testId}-link`}>
          Link
        </button>
      )}
    </span>
  ),
}));

const source = (over: Partial<FinancingSource> = {}): FinancingSource =>
  ({
    id: 'bs-a',
    name: 'Loan Alpha',
    sourceType: 'bank_loan',
    status: 'active',
    isDiscretionary: false,
    interestRate: 3.5,
    amount: 50000,
    allocated: 30000,
    unallocated: 20000,
    overAllocated: 0,
    paid: 12000,
    submitted: 4000,
    readyToSubmit: { count: 3, amount: 8000 },
    ...over,
  }) as FinancingSource;

const grant = (over: Partial<FinancingGrant> = {}): FinancingGrant => ({
  id: 'sp-1',
  name: 'Energy grant',
  status: 'approved',
  reductionType: 'percentage',
  rate: 30,
  eligibleCostCap: 12000,
  deadline: null,
  coveredItemCount: 2,
  expected: { expected: 3600, best: 3600, worst: 3600 },
  counted: true,
  ...over,
});

const response = (over: Partial<FinancingResponse> = {}): FinancingResponse => ({
  sources: [source()],
  grants: [grant()],
  ...over,
});

describe('FinancingPage', () => {
  let Page: typeof PageModule.FinancingPage;
  let media: MatchMediaControl;
  const open = jest.fn<OpenFinancingForm>();

  beforeEach(async () => {
    mockFetchFinancing.mockReset();
    mockFetchFinancing.mockResolvedValue(response());
    open.mockReset();
    mockDocsMode = 'full';
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Page) ({ FinancingPage: Page } = await import('./FinancingPage.js'));
  });

  afterEach(() => {
    media.restore();
    jest.restoreAllMocks();
  });

  function Where() {
    const location = useLocation();
    return (
      <output data-testid="where">{`${location.pathname}${location.search}${location.hash}`}</output>
    );
  }

  function renderPage(entry = '/budget/financing', state?: unknown, withProvider = true) {
    const page = (
      <MemoryRouter
        initialEntries={[
          {
            pathname: entry.split(/[?#]/)[0]!,
            search: entry.includes('?') ? `?${entry.split('?')[1]!.split('#')[0]}` : '',
            hash: entry.includes('#') ? `#${entry.split('#')[1]}` : '',
            state,
          },
        ]}
      >
        <Page />
        <Where />
      </MemoryRouter>
    );
    return render(
      withProvider ? <FinancingCreateContext value={open}>{page}</FinancingCreateContext> : page,
    );
  }

  const loaded = () => screen.findByTestId('financing-source-bs-a');

  describe('header and structure', () => {
    it('has one h1 "Financing", the Prepare bank report primary and a page-actions menu', async () => {
      renderPage();
      await loaded();

      expect(screen.getByRole('heading', { level: 1, name: 'Financing' })).toBeInTheDocument();
      const primary = screen.getByTestId('financing-prepare-bank-report');
      expect(primary).toHaveTextContent('Prepare bank report');
      expect(primary).toHaveAttribute('href', '/budget/reports');
      expect(screen.getByTestId('financing-page-actions')).toBeInTheDocument();
    });

    it('titles the two groups with their counts', async () => {
      mockFetchFinancing.mockResolvedValue(
        response({
          sources: [source(), source({ id: 'bs-b', name: 'Savings' })],
          grants: [grant()],
        }),
      );
      renderPage();
      await loaded();

      expect(
        screen.getByRole('heading', { level: 2, name: /Loans & own funds \(2\)/ }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: /Grants \(1\)/ })).toBeInTheDocument();
    });

    it('Print from the page menu prints on the next frame', async () => {
      const user = userEvent.setup();
      const print = jest.spyOn(window, 'print').mockImplementation(() => {});
      renderPage();
      await loaded();

      await user.click(screen.getByTestId('financing-page-actions'));
      await user.click(await screen.findByTestId('financing-action-print'));

      await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    });

    it('does not print after the page is left before the frame runs', async () => {
      const user = userEvent.setup();
      const print = jest.spyOn(window, 'print').mockImplementation(() => {});
      const frames: FrameRequestCallback[] = [];
      jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frames.push(cb);
        return frames.length;
      });
      const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
      const { unmount } = renderPage();
      await loaded();
      await user.click(screen.getByTestId('financing-page-actions'));
      await user.click(await screen.findByTestId('financing-action-print'));

      unmount();

      expect(cancel).toHaveBeenCalled();
      expect(print).not.toHaveBeenCalled();
    });
  });

  describe('loading, error and empty', () => {
    it('shows skeletons while loading, with no counts', () => {
      mockFetchFinancing.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(
        screen.getByRole('heading', { level: 2, name: 'Loans & own funds' }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('financing-source-bs-a')).toBeNull();
    });

    it('shows a translated API error with Retry, focuses the heading, and reloads on Retry', async () => {
      mockFetchFinancing.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw prose' }),
      );
      renderPage();

      const retry = await screen.findByTestId('financing-retry');
      expect(screen.queryByText('raw prose')).toBeNull();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());

      await userEvent.click(retry);

      await loaded();
      expect(mockFetchFinancing).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows the fixed copy for a failure that is not an API error', async () => {
      mockFetchFinancing.mockRejectedValueOnce(new Error('offline'));
      renderPage();
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('Financing could not be loaded.'),
      );
    });

    it('ignores a result that arrives after the page was left', async () => {
      let resolve: (value: FinancingResponse) => void = () => {};
      mockFetchFinancing.mockReturnValue(new Promise((res) => (resolve = res)));
      const { unmount } = renderPage();
      unmount();
      await act(async () => resolve(response()));
      expect(screen.queryByTestId('financing-source-bs-a')).toBeNull();
    });

    it('ignores a failure that arrives after the page was left', async () => {
      let reject: (error: unknown) => void = () => {};
      mockFetchFinancing.mockReturnValue(new Promise((_res, rej) => (reject = rej)));
      const { unmount } = renderPage();
      unmount();
      await act(async () => reject(new Error('late')));
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows one empty message per group with the glossary nouns', async () => {
      mockFetchFinancing.mockResolvedValue(response({ sources: [], grants: [] }));
      renderPage();

      expect(await screen.findByText('No funding sources yet')).toBeInTheDocument();
      expect(screen.getByText('No grants yet')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 2, name: /Loans & own funds \(0\)/ }),
      ).toBeInTheDocument();
    });
  });

  describe('a language change (#2242)', () => {
    afterEach(async () => {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    });

    it('re-renders in the new language without loading again', async () => {
      renderPage();
      await loaded();
      const calls = mockFetchFinancing.mock.calls.length;

      await act(async () => {
        await i18n.changeLanguage('de');
      });

      expect(screen.getByRole('heading', { level: 1, name: 'Finanzierung' })).toBeInTheDocument();
      expect(mockFetchFinancing).toHaveBeenCalledTimes(calls);
    });

    it('translates the load error again and keeps it, without a new request', async () => {
      mockFetchFinancing.mockRejectedValue(new Error('offline'));
      renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent('Financing could not be loaded.');
      const calls = mockFetchFinancing.mock.calls.length;

      await act(async () => {
        await i18n.changeLanguage('de');
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Finanzierung konnte nicht geladen werden.',
      );
      expect(mockFetchFinancing).toHaveBeenCalledTimes(calls);
    });
  });

  describe('source card (AC1-AC3)', () => {
    it('shows type, status, rate and the five figures from the response', async () => {
      renderPage();
      const card = within(await loaded());

      expect(card.getByRole('link', { name: 'Loan Alpha' })).toHaveAttribute(
        'href',
        '/budget/financing/sources/bs-a',
      );
      expect(card.getByText('Bank loan')).toBeInTheDocument();
      expect(card.getByText('Active')).toBeInTheDocument();
      expect(card.getByText('Rate 3.50%')).toBeInTheDocument();
      const figures = Object.fromEntries(
        card
          .getAllByRole('term')
          .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
      );
      expect(figures).toEqual({
        Amount: '€50,000.00',
        Allocated: '€30,000.00',
        Paid: '€12,000.00',
        Submitted: '€4,000.00',
        Unallocated: '€20,000.00',
      });
    });

    it('marks Paid and Ready to submit as figures, with the count in its own span (not part of the amount)', async () => {
      renderPage();
      const card = await loaded();

      expect(card.querySelector('[data-figure="paid"]')).toHaveTextContent('€12,000.00');
      const ready = card.querySelector('[data-figure="ready-to-submit"]')!;
      expect(ready).toHaveTextContent(/^€8,000\.00$/);
      expect(screen.getByTestId('financing-source-ready-count-bs-a')).toHaveTextContent(/^3$/);
      expect(ready).not.toContainElement(screen.getByTestId('financing-source-ready-count-bs-a'));
    });

    it('shows a whole rate without decimals and no rate for a source without one', async () => {
      mockFetchFinancing.mockResolvedValue(
        response({
          sources: [
            source({ id: 'bs-w', name: 'Whole', interestRate: 4 }),
            source({ id: 'bs-n', name: 'None', interestRate: null }),
          ],
        }),
      );
      renderPage();
      await screen.findByTestId('financing-source-bs-w');

      expect(
        within(screen.getByTestId('financing-source-bs-w')).getByText('Rate 4%'),
      ).toBeInTheDocument();
      expect(within(screen.getByTestId('financing-source-bs-n')).queryByText(/^Rate/)).toBeNull();
    });

    it('shows Unallocated as a negative number in the danger style and a bar note when over-allocated (D8)', async () => {
      mockFetchFinancing.mockResolvedValue(
        response({ sources: [source({ allocated: 62000, unallocated: 0, overAllocated: 12000 })] }),
      );
      renderPage();
      await loaded();

      const unallocated = screen.getByTestId('financing-source-unallocated-bs-a');
      expect(unallocated.textContent).toMatch(/^[-−]\s?€12,000\.00$/);
      expect(unallocated.className).toContain('danger');
      expect(screen.getByText('Over-allocated by €12,000.00')).toBeInTheDocument();
    });

    it('a source within its amount has a plain Unallocated and no over-allocation note', async () => {
      renderPage();
      await loaded();
      expect(screen.getByTestId('financing-source-unallocated-bs-a')).toHaveTextContent(
        /^€20,000\.00$/,
      );
      expect(screen.queryByText(/Over-allocated/)).toBeNull();
    });

    it('names the bar segments Submitted, Paid and Allocated with their cumulative totals (D9)', async () => {
      renderPage();
      await loaded();

      const bar = screen.getByRole('img');
      const label = bar.getAttribute('aria-label') ?? '';
      expect(label).toContain('Submitted €4,000.00');
      expect(label).toContain('Paid €12,000.00');
      expect(label).toContain('Allocated €30,000.00');
      expect(label).not.toContain('Over');
    });

    it('adds the overflow to the bar name when over-allocated', async () => {
      mockFetchFinancing.mockResolvedValue(
        response({ sources: [source({ allocated: 62000, unallocated: 0, overAllocated: 12000 })] }),
      );
      renderPage();
      await loaded();
      expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/€12,000\.00$/);
    });

    it('a loan card has a Prepare bank report menu item that opens the report for that source with the origin', async () => {
      const user = userEvent.setup();
      renderPage('/budget/financing', { origin: { to: '/budget/financing' } });
      await loaded();

      await user.click(screen.getByRole('button', { name: 'Actions for Loan Alpha' }));
      await user.click(await screen.findByTestId('financing-source-bank-report-bs-a'));

      expect(screen.getByTestId('where')).toHaveTextContent('/budget/reports?sourceId=bs-a');
    });

    it.each([
      ['savings', 'Savings', false],
      ['other', 'Other', false],
      ['discretionary', 'Own funds', true],
    ] as const)(
      'a %s card has no Ready to submit and no actions menu',
      async (sourceType, label, isDiscretionary) => {
        mockFetchFinancing.mockResolvedValue(
          response({
            sources: [
              source({
                id: 'bs-x',
                name: 'Source X',
                sourceType,
                isDiscretionary,
                interestRate: isDiscretionary ? 2 : null,
                readyToSubmit: { count: 0, amount: 0 },
              }),
            ],
          }),
        );
        renderPage();
        const card = await screen.findByTestId('financing-source-bs-x');

        expect(within(card).getByText(label)).toBeInTheDocument();
        expect(within(card).queryByText('Ready to submit')).toBeNull();
        expect(card.querySelector('[data-figure="ready-to-submit"]')).toBeNull();
        expect(screen.queryByTestId('financing-source-menu-bs-x')).toBeNull();
        expect(within(card).queryByText(/^Rate/)).toBeNull(); // Own funds never shows a rate
      },
    );

    it('a loan with nothing ready shows 0 and 0.00 in the muted style', async () => {
      mockFetchFinancing.mockResolvedValue(
        response({ sources: [source({ readyToSubmit: { count: 0, amount: 0 } })] }),
      );
      renderPage();
      await loaded();
      expect(screen.getByTestId('financing-source-ready-count-bs-a')).toHaveTextContent('0');
      expect(screen.getByText('Ready to submit').closest('p')!.className).toContain('muted');
    });

    it('Documents shows the entity, the record name and the Link action only in full mode', async () => {
      renderPage();
      await loaded();
      const docs = screen.getByTestId('financing-source-docs-bs-a');
      expect(docs).toHaveAttribute('data-entity', 'budget_source:bs-a');
      expect(docs).toHaveTextContent('Documents for Loan Alpha');
      expect(screen.getByTestId('financing-source-docs-bs-a-link')).toBeInTheDocument();
    });

    it('has no Link action while Paperless is read-only', async () => {
      mockDocsMode = 'readOnly';
      renderPage();
      await loaded();
      expect(screen.queryByTestId('financing-source-docs-bs-a-link')).toBeNull();
    });
  });

  describe('grant card (AC4)', () => {
    it('shows status, percentage rate, cap, expected, covered link and deadline', async () => {
      mockFetchFinancing.mockResolvedValue(
        response({ grants: [grant({ deadline: '2999-01-31' })] }),
      );
      renderPage();
      const card = within(await screen.findByTestId('financing-grant-sp-1'));

      expect(card.getByRole('link', { name: 'Energy grant' })).toHaveAttribute(
        'href',
        '/budget/financing/grants/sp-1',
      );
      expect(card.getByText('Approved')).toBeInTheDocument();
      expect(screen.getByTestId('financing-grant-rate-sp-1')).toHaveTextContent('30%');
      expect(card.queryByText('Fixed reduction')).toBeNull();
      expect(card.getByText('€12,000.00')).toBeInTheDocument();
      expect(screen.getByTestId('financing-grant-expected-sp-1')).toHaveTextContent('€3,600.00');
      const covered = screen.getByTestId('financing-grant-covered-sp-1');
      expect(covered).toHaveTextContent('2 items');
      expect(covered).toHaveAttribute('href', '/budget/financing/grants/sp-1?tab=work');
      expect(screen.getByTestId('financing-grant-deadline-sp-1')).toHaveTextContent('Jan');
      expect(screen.queryByText('Overdue')).toBeNull();
    });

    it('shows "No cap" and a dash for no deadline, and one covered item in the singular', async () => {
      mockFetchFinancing.mockResolvedValue(
        response({
          grants: [grant({ eligibleCostCap: null, deadline: null, coveredItemCount: 1 })],
        }),
      );
      renderPage();
      await screen.findByTestId('financing-grant-sp-1');

      expect(screen.getByText('No cap')).toBeInTheDocument();
      expect(screen.getByTestId('financing-grant-covered-sp-1')).toHaveTextContent('1 item');
      expect(screen.getByTestId('financing-grant-deadline-sp-1')).toHaveTextContent('–');
    });

    it('a legacy fixed grant shows the stored amount and a screen-reader "Fixed reduction", on a badge with no aria-label (FC1)', async () => {
      mockFetchFinancing.mockResolvedValue(
        response({ grants: [grant({ reductionType: 'fixed', rate: 1500 })] }),
      );
      renderPage();
      const card = await screen.findByTestId('financing-grant-sp-1');

      const badge = screen.getByTestId('financing-grant-rate-sp-1');
      expect(badge).toHaveTextContent('€1,500.00');
      expect(badge.textContent).not.toContain('%');
      expect(badge).not.toHaveAttribute('aria-label');
      expect(card).toHaveTextContent('Fixed reduction');
    });

    it.each([
      ['eligible', true],
      ['applied', true],
      ['approved', true],
      ['received', false],
      ['rejected', false],
    ] as const)('a %s grant with a past deadline is Overdue: %s', async (status, overdue) => {
      mockFetchFinancing.mockResolvedValue(
        response({ grants: [grant({ status, deadline: '2000-01-01' })] }),
      );
      renderPage();
      await screen.findByTestId('financing-grant-sp-1');

      expect(screen.queryByText('Overdue') !== null).toBe(overdue);
    });

    it('a deadline today or later is not overdue', async () => {
      mockFetchFinancing.mockResolvedValue(
        response({ grants: [grant({ deadline: '2999-12-31' })] }),
      );
      renderPage();
      await screen.findByTestId('financing-grant-sp-1');
      expect(screen.queryByText('Overdue')).toBeNull();
    });

    it('Documents is the grant entity with the Link action', async () => {
      renderPage();
      await screen.findByTestId('financing-grant-sp-1');
      expect(screen.getByTestId('financing-grant-docs-sp-1')).toHaveAttribute(
        'data-entity',
        'subsidy_program:sp-1',
      );
      expect(screen.getByTestId('financing-grant-docs-sp-1-link')).toBeInTheDocument();
    });
  });

  describe('creating', () => {
    it.each([
      ['financing-add-source', 'source', 'Add funding source'],
      ['financing-add-grant', 'grant', 'Add grant'],
    ] as const)(
      '%s opens the %s form with the button as the focus return target',
      async (testId, kind, label) => {
        const user = userEvent.setup();
        renderPage();
        await loaded();

        const button = screen.getByTestId(testId);
        expect(button).toHaveTextContent(label);
        await user.click(button);

        expect(open).toHaveBeenCalledTimes(1);
        const request = open.mock.calls[0]![0];
        expect(request.kind).toBe(kind);
        expect(request.returnFocusRef?.current).toBe(button);
      },
    );

    it('does nothing without the provider (unit use)', async () => {
      const user = userEvent.setup();
      renderPage('/budget/financing', undefined, false);
      await loaded();
      await user.click(screen.getByTestId('financing-add-source'));
      expect(open).not.toHaveBeenCalled();
    });

    it.each([
      ['?create=1&kind=grant', 'grant'],
      ['?create=1&kind=source', 'source'],
      ['?create=1', 'source'],
    ])('%s opens the %s form once and removes the params', async (query, kind) => {
      renderPage(`/budget/financing${query}`);

      await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
      expect(open.mock.calls[0]![0].kind).toBe(kind);
      await waitFor(() =>
        expect(screen.getByTestId('where')).toHaveTextContent(/^\/budget\/financing$/),
      );
    });

    it('from the New menu the focus returns to the create trigger', async () => {
      const trigger = document.createElement('button');
      trigger.setAttribute('data-create-trigger', '');
      document.body.appendChild(trigger);
      renderPage('/budget/financing?create=1&kind=grant', { createOpener: true });

      await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
      expect(open.mock.calls[0]![0].returnFocusRef?.current).toBe(trigger);
      trigger.remove();
    });

    it('a create request without the opener flag has no focus-return element', async () => {
      renderPage('/budget/financing?create=1&kind=grant');
      await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
      expect(open.mock.calls[0]![0].returnFocusRef?.current).toBeNull();
    });
  });

  describe('section anchors', () => {
    it.each([
      ['#sources', 'sources-heading'],
      ['#grants', 'grants-heading'],
    ])('%s focuses its group heading once loaded', async (hash, id) => {
      renderPage(`/budget/financing${hash}`);
      await loaded();

      await waitFor(() => expect(document.getElementById(id)).toHaveFocus());
    });
  });

  it('links every card with the page as origin state', async () => {
    const user = userEvent.setup();
    renderPage('/budget/financing', { origin: { to: '/' } });
    await loaded();

    await user.click(screen.getByRole('link', { name: 'Loan Alpha' }));

    expect(screen.getByTestId('where')).toHaveTextContent('/budget/financing/sources/bs-a');
  });

  it('keeps every test id unique', async () => {
    const { container } = renderPage();
    await loaded();
    const ids = Array.from(container.querySelectorAll('[data-testid]')).map((el) =>
      el.getAttribute('data-testid'),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
