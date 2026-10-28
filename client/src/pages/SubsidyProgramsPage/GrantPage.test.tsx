/**
 * @jest-environment jsdom
 *
 * The grant page (#2242, S11, AC9). Module boundaries: the API functions, the Documents host and
 * the three section components (each has its own test). Header, strip, tabs, explanation,
 * History and the delete dialog are real.
 *
 * Mutations these tests catch:
 *  - D2: Log shown while a forward status move exists, or no Log at the end of the road;
 *  - a fixed grant shown as a percentage in the strip, or without the "Fixed reduction" text;
 *  - Overdue on a received / rejected grant;
 *  - one of the four explanation sentences (percent/fixed x cap/no cap) built from the wrong figures;
 *  - Delete treating a 409 as retryable; success not replacing to Financing with a toast and heading focus;
 *  - History asking for another object than subsidy_program:<id>;
 *  - a change in the Work tab not refreshing the page figures.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type {
  SubsidyApplicationStatus,
  SubsidyProgram,
  SubsidyProgramDetailResponse,
} from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import i18n from '../../i18n/index.js';
import * as statusChangeActual from '../../lib/statusChangeApi.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import type * as PageModule from './GrantPage.js';

const mockFetchGrant = jest.fn<(id: string) => Promise<SubsidyProgramDetailResponse>>();
const mockDeleteGrant = jest.fn<(id: string) => Promise<void>>();
jest.unstable_mockModule('../../lib/subsidyProgramsApi.js', () => ({
  fetchSubsidyProgram: mockFetchGrant,
  deleteSubsidyProgram: mockDeleteGrant,
  updateSubsidyProgram: jest.fn(),
  // EntityPicker's grant kind imports it
  fetchSubsidyPrograms: jest.fn(),
}));

const mockChangeStatus = jest.fn<(id: string, to: string) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/statusChangeApi.js', () => ({
  ...statusChangeActual,
  changeGrantStatus: mockChangeStatus,
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: jest.fn() }));
const mockListHistory = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/historyApi.js', () => ({ listHistory: mockListHistory }));
const mockFetchDeleteImpact = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
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

const mockShowToast = jest.fn();
const mockShowUndoToast = jest.fn();
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: unknown }) => children,
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    showUndoToast: mockShowUndoToast,
    dismissToast: jest.fn(),
  }),
}));
const mockFocusHeading = jest.fn<() => () => void>(() => () => {});
jest.unstable_mockModule('../../lib/focusPageHeading.js', () => ({
  focusPageHeading: jest.fn(),
  focusPageHeadingWhenReady: mockFocusHeading,
}));

let documentsFact: unknown = null;
jest.unstable_mockModule('../../components/DocumentsPanel/index.js', () => ({
  useDocumentsPanel: (entityType: string, entityId: string) => ({
    fact: documentsFact,
    panel: <div data-testid="documents-panel" data-type={entityType} data-id={entityId} />,
  }),
}));

jest.unstable_mockModule('./GrantDetailsSection.js', () => ({
  GrantDetailsSection: (props: { grant: SubsidyProgram; onSaved: () => Promise<unknown> }) => (
    <div data-testid="grant-details" data-grant={props.grant.id}>
      <button type="button" onClick={() => void props.onSaved()}>
        details-saved
      </button>
    </div>
  ),
}));
jest.unstable_mockModule('./GrantEligibilitySection.js', () => ({
  GrantEligibilitySection: (props: { grant: SubsidyProgram }) => (
    <div data-testid="grant-eligibility" data-grant={props.grant.id} />
  ),
}));
let workProps: { grantId: string; expectedAmount: number; onChanged: () => void } | null = null;
jest.unstable_mockModule('./GrantWorkPanel.js', () => ({
  GrantWorkPanel: (props: NonNullable<typeof workProps>) => {
    workProps = props;
    return (
      <div data-testid="grant-work" data-grant={props.grantId} data-expected={props.expectedAmount}>
        <button type="button" onClick={props.onChanged}>
          work-changed
        </button>
      </div>
    );
  },
}));

let GrantPage: (typeof PageModule)['GrantPage'];

const ID = 'sp-1';

function record(
  over: Partial<SubsidyProgram> = {},
  moneyOver: Record<string, unknown> = {},
): SubsidyProgramDetailResponse {
  return {
    subsidyProgram: {
      id: ID,
      name: 'Energy grant',
      reductionType: 'percentage',
      reductionValue: 30,
      maximumAmount: 12000,
      applicationStatus: 'applied' as SubsidyApplicationStatus,
      applicationDeadline: null,
      ...over,
    } as SubsidyProgram,
    money: {
      expected: { expected: 3600, best: 3600, worst: 3600 },
      eligibleCost: { expected: 12000, best: 12000, worst: 12000 },
      capped: false,
      counted: true,
      coveredItemCount: 2,
      ...moneyOver,
    } as never,
  };
}

let media: MatchMediaControl;

beforeEach(async () => {
  mockFetchGrant.mockReset().mockResolvedValue(record());
  mockDeleteGrant.mockReset().mockResolvedValue(undefined);
  mockChangeStatus.mockReset().mockResolvedValue({ record: {}, undo: null });
  mockListHistory.mockReset().mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 },
  });
  mockFetchDeleteImpact
    .mockReset()
    .mockResolvedValue({ entityType: 'subsidy_program', id: ID, effects: [] });
  mockShowToast.mockReset();
  mockShowUndoToast.mockReset();
  mockFocusHeading.mockClear();
  documentsFact = null;
  workProps = null;
  media = installMatchMedia({ '(min-width: 768px)': true });
  ({ GrantPage } = (await import('./GrantPage.js')) as typeof PageModule);
});

afterEach(() => {
  media.restore();
});

function Where() {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
}

function renderPage(entry = `/budget/financing/grants/${ID}`) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/budget/financing/grants/:id" element={<GrantPage />} />
        <Route path="/budget/financing" element={<div>Financing Page</div>} />
        <Route path="*" element={<div>Elsewhere</div>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

const loaded = () => screen.findByTestId('grant-header');
const strip = () => within(screen.getByTestId('grant-summary'));

describe('GrantPage', () => {
  describe('states', () => {
    it('shows a skeleton under the generic title while loading', () => {
      mockFetchGrant.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByRole('heading', { level: 1, name: 'Grant' })).toBeInTheDocument();
      expect(screen.queryByTestId('grant-header')).toBeNull();
    });

    it('titles the page with the grant name once loaded', async () => {
      renderPage();
      await loaded();
      expect(screen.getByRole('heading', { level: 1, name: 'Energy grant' })).toBeInTheDocument();
    });

    it('404 shows the not-found copy with Back to Financing', async () => {
      mockFetchGrant.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent('This grant could not be found.');
      await userEvent.click(screen.getByRole('button', { name: /Back to Financing/ }));
      expect(screen.getByTestId('where')).toHaveTextContent('/budget/financing');
    });

    it('an API error is translated and Try again loads again', async () => {
      mockFetchGrant.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw' }),
      );
      mockFetchGrant.mockResolvedValue(record());
      renderPage();
      expect(await screen.findByRole('alert')).not.toHaveTextContent('raw');

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      await loaded();
    });

    it('a failure that is not an API error shows the fixed copy', async () => {
      mockFetchGrant.mockRejectedValue(new Error('offline'));
      renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent('The grant could not be loaded.');
    });

    it('redirects to Financing when the route has no id', async () => {
      render(
        <MemoryRouter initialEntries={['/x']}>
          <Routes>
            <Route path="/x" element={<GrantPage />} />
            <Route path="/budget/financing" element={<div>Financing Page</div>} />
          </Routes>
        </MemoryRouter>,
      );
      expect(await screen.findByText('Financing Page')).toBeInTheDocument();
    });
  });

  describe('a language change (#2242)', () => {
    afterEach(async () => {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    });

    it('re-renders without loading the grant again', async () => {
      renderPage();
      await loaded();
      const calls = mockFetchGrant.mock.calls.length;

      await act(async () => {
        await i18n.changeLanguage('de');
      });

      expect(mockFetchGrant).toHaveBeenCalledTimes(calls);
      expect(screen.getByRole('tab', { name: 'Verlauf' })).toBeInTheDocument();
    });

    it('the not-found copy follows the language, without a new request', async () => {
      mockFetchGrant.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
      );
      renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent('This grant could not be found.');
      const calls = mockFetchGrant.mock.calls.length;

      await act(async () => {
        await i18n.changeLanguage('de');
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Dieses Förderprogramm konnte nicht gefunden werden.',
      );
      expect(mockFetchGrant).toHaveBeenCalledTimes(calls);
    });

    it('a plain failure shows the fixed copy of the current language', async () => {
      mockFetchGrant.mockRejectedValue(new Error('offline'));
      renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent('The grant could not be loaded.');

      await act(async () => {
        await i18n.changeLanguage('de');
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Das Förderprogramm konnte nicht geladen werden.',
      );
    });
  });

  describe('header (D2)', () => {
    it.each([
      ['eligible', 'Mark applied'],
      ['applied', 'Mark approved'],
      ['approved', 'Mark received'],
    ] as const)('%s leads with the forward move "%s"', async (status, label) => {
      mockFetchGrant.mockResolvedValue(record({ applicationStatus: status }));
      renderPage();
      await loaded();

      expect(screen.getByTestId('grant-primary-status')).toHaveTextContent(label);
      expect(screen.queryByTestId('grant-primary-log')).toBeNull();
    });

    it.each(['received', 'rejected'] as const)(
      '%s has no forward move and leads with Log',
      async (status) => {
        mockFetchGrant.mockResolvedValue(record({ applicationStatus: status }));
        renderPage();
        await loaded();

        expect(screen.getByTestId('grant-primary-log')).toHaveTextContent('Log');
        expect(screen.queryByTestId('grant-primary-status')).toBeNull();
      },
    );

    it('shows the status chip; the primary applies the status, refreshes and offers Undo', async () => {
      mockChangeStatus.mockResolvedValue({
        record: {},
        undo: { token: 'u_x', expiresAt: '2026-01-01T00:00:30Z' },
      });
      const user = userEvent.setup();
      renderPage();
      await loaded();
      expect(screen.getByTestId('grant-status-badge')).toHaveTextContent('Applied');

      mockFetchGrant.mockResolvedValue(record({ applicationStatus: 'approved' }));
      await user.click(screen.getByTestId('grant-primary-status'));

      await waitFor(() => expect(mockChangeStatus).toHaveBeenCalledWith(ID, 'approved'));
      expect(mockShowUndoToast).toHaveBeenCalledWith(
        expect.objectContaining({ dedupeKey: `subsidy_program:${ID}` }),
      );
      await waitFor(() =>
        expect(screen.getByTestId('grant-status-badge')).toHaveTextContent('Approved'),
      );
    });

    it('a failed status change toasts an error', async () => {
      mockChangeStatus.mockRejectedValue(new Error('boom'));
      renderPage();
      await loaded();
      await userEvent.click(screen.getByTestId('grant-primary-status'));
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('error', expect.any(String)));
    });
  });

  describe('summary strip', () => {
    it('shows rate, cap, expected and a dash for no deadline, in 5 columns', async () => {
      renderPage();
      await loaded();

      expect(strip().getByText('Rate').closest('div')).toHaveTextContent('30%');
      expect(strip().getByText('Eligible costs up to').closest('div')).toHaveTextContent(
        '€12,000.00',
      );
      expect(strip().getByText('Expected').closest('div')).toHaveTextContent('€3,600.00');
      expect(strip().getByText('Deadline').closest('div')).toHaveTextContent('Not set');
      expect(screen.getByTestId('grant-summary').querySelector('dl')).toHaveAttribute(
        'data-columns',
        '5',
      );
    });

    it('a fixed grant shows the stored amount with a screen-reader "Fixed reduction", and "No cap"', async () => {
      mockFetchGrant.mockResolvedValue(
        record({ reductionType: 'fixed', reductionValue: 1500, maximumAmount: null }),
      );
      renderPage();
      await loaded();

      const rate = strip().getByText('Rate').closest('div')!;
      expect(rate).toHaveTextContent('Fixed reduction');
      expect(rate).toHaveTextContent('€1,500.00');
      expect(rate.textContent).not.toContain('%');
      expect(strip().getByText('No cap')).toBeInTheDocument();
    });

    it('a percentage grant has no "Fixed reduction" text', async () => {
      renderPage();
      await loaded();
      expect(screen.getByTestId('grant-summary')).not.toHaveTextContent('Fixed reduction');
    });

    it('shows a whole rate without decimals and a fractional rate with two', async () => {
      mockFetchGrant.mockResolvedValue(record({ reductionValue: 2.5 }));
      renderPage();
      await loaded();
      expect(strip().getByText('Rate').closest('div')).toHaveTextContent(/2[.,]50\s?%/);
    });

    it.each([
      ['eligible', true],
      ['applied', true],
      ['approved', true],
      ['received', false],
      ['rejected', false],
    ] as const)('a %s grant with a past deadline is Overdue: %s', async (status, overdue) => {
      mockFetchGrant.mockResolvedValue(
        record({ applicationStatus: status, applicationDeadline: '2000-01-01' }),
      );
      renderPage();
      await loaded();
      expect(screen.queryByText('Overdue') !== null).toBe(overdue);
    });

    it('a future deadline is shown without Overdue', async () => {
      mockFetchGrant.mockResolvedValue(record({ applicationDeadline: '2999-01-31' }));
      renderPage();
      await loaded();
      expect(strip().getByText('Deadline').closest('div')).toHaveTextContent('Jan');
      expect(screen.queryByText('Overdue')).toBeNull();
    });

    it('appends the Documents fact the host provides', async () => {
      documentsFact = { id: 'documents', kind: 'static', label: 'Documents', value: '2' };
      renderPage();
      await loaded();
      expect(strip().getByText('Documents')).toBeInTheDocument();
      expect(screen.getByTestId('documents-panel')).toHaveAttribute('data-type', 'subsidy_program');
    });
  });

  describe('explanation: the four sentences', () => {
    it.each([
      [
        { reductionType: 'percentage', reductionValue: 30, maximumAmount: 12000 },
        'Expected is 30% of €12,000.00 covered costs, up to €12,000.00.',
      ],
      [
        { reductionType: 'percentage', reductionValue: 30, maximumAmount: null },
        'Expected is 30% of €12,000.00 covered costs.',
      ],
      [
        { reductionType: 'fixed', reductionValue: 500, maximumAmount: 2000 },
        'Expected is €500.00 per covered item, up to €2,000.00.',
      ],
      [
        { reductionType: 'fixed', reductionValue: 500, maximumAmount: null },
        'Expected is €500.00 per covered item.',
      ],
    ] as const)('%j', async (over, sentence) => {
      mockFetchGrant.mockResolvedValue(record(over as Partial<SubsidyProgram>));
      renderPage();
      await loaded();

      expect(screen.getByTestId('grant-explanation-text')).toHaveTextContent(sentence);
      expect(
        screen.getByRole('heading', { name: 'How the expected grant is calculated' }),
      ).toBeInTheDocument();
    });
  });

  describe('tabs', () => {
    it('Overview shows the Details and Eligibility sections for this grant', async () => {
      renderPage();
      await loaded();
      expect(screen.getByTestId('grant-details')).toHaveAttribute('data-grant', ID);
      expect(screen.getByTestId('grant-eligibility')).toHaveAttribute('data-grant', ID);
    });

    it('saving the details refreshes the record', async () => {
      renderPage();
      await loaded();
      const before = mockFetchGrant.mock.calls.length;
      await userEvent.click(screen.getByRole('button', { name: 'details-saved' }));
      await waitFor(() => expect(mockFetchGrant.mock.calls.length).toBe(before + 1));
    });

    it('the Work tab gets the grant id and the expected amount, and a change refreshes the page', async () => {
      const user = userEvent.setup();
      renderPage();
      await loaded();

      await user.click(screen.getByRole('tab', { name: 'Work' }));

      const panel = await screen.findByTestId('grant-work');
      expect(panel).toHaveAttribute('data-grant', ID);
      expect(panel).toHaveAttribute('data-expected', '3600');
      const before = mockFetchGrant.mock.calls.length;
      mockFetchGrant.mockResolvedValue(
        record({}, { expected: { expected: 4000, best: 4000, worst: 4000 } }),
      );
      await user.click(screen.getByRole('button', { name: 'work-changed' }));
      await waitFor(() => expect(mockFetchGrant.mock.calls.length).toBe(before + 1));
      expect(workProps?.grantId).toBe(ID);
    });

    it('?tab=work opens the Work tab directly', async () => {
      renderPage(`/budget/financing/grants/${ID}?tab=work`);
      await loaded();
      expect(await screen.findByTestId('grant-work')).toBeInTheDocument();
    });

    it('History asks for the subsidy_program history of this grant', async () => {
      const user = userEvent.setup();
      renderPage();
      await loaded();

      await user.click(screen.getByRole('tab', { name: 'History' }));

      await waitFor(() =>
        expect(mockListHistory).toHaveBeenCalledWith(
          { entityType: 'subsidy_program', entityId: ID, pageSize: 20 },
          expect.any(AbortSignal),
        ),
      );
      expect(await screen.findByText('No history yet.')).toBeInTheDocument();
    });
  });

  describe('delete', () => {
    async function openDelete(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: /actions/i }));
      await user.click(await screen.findByRole('menuitem', { name: /Delete/ }));
    }

    it('asks first and cancelling deletes nothing', async () => {
      const user = userEvent.setup();
      renderPage();
      await loaded();
      await openDelete(user);

      expect(await screen.findByText('Delete grant?')).toBeInTheDocument();
      expect(mockFetchDeleteImpact).toHaveBeenCalledWith('subsidy_program', ID);
      await user.click(screen.getByTestId('grant-delete-cancel'));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(mockDeleteGrant).not.toHaveBeenCalled();
    });

    it('success deletes, toasts, replaces to Financing and focuses its heading', async () => {
      const user = userEvent.setup();
      renderPage();
      await loaded();
      await openDelete(user);

      await user.click(await screen.findByTestId('grant-delete-confirm'));

      await waitFor(() => expect(mockDeleteGrant).toHaveBeenCalledWith(ID));
      expect(mockShowToast).toHaveBeenCalledWith('success', 'Energy grant deleted.');
      await waitFor(() =>
        expect(screen.getByTestId('where')).toHaveTextContent('/budget/financing'),
      );
      expect(mockFocusHeading).toHaveBeenCalledTimes(1);
    });

    it('a 409 (tasks linked) shows the translated error and blocks the action', async () => {
      mockDeleteGrant.mockRejectedValue(
        new ApiClientError(409, { code: 'SUBSIDY_PROGRAM_IN_USE', message: 'raw' }),
      );
      const user = userEvent.setup();
      renderPage();
      await loaded();
      await openDelete(user);
      await user.click(await screen.findByTestId('grant-delete-confirm'));

      expect(await screen.findByRole('alert')).not.toHaveTextContent('raw');
      expect(screen.queryByTestId('grant-delete-confirm')).toBeNull();
      expect(screen.getByTestId('where')).toHaveTextContent(`/budget/financing/grants/${ID}`);
    });

    it('another API error and a plain failure keep the action available', async () => {
      mockDeleteGrant.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw' }),
      );
      const user = userEvent.setup();
      renderPage();
      await loaded();
      await openDelete(user);
      await user.click(await screen.findByTestId('grant-delete-confirm'));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByTestId('grant-delete-confirm')).toBeInTheDocument();

      mockDeleteGrant.mockRejectedValueOnce(new Error('offline'));
      await user.click(screen.getByTestId('grant-delete-confirm'));
      expect(
        await screen.findByText('The grant could not be deleted. Please try again.'),
      ).toBeInTheDocument();
    });

    it('closing the dialog resets its error', async () => {
      mockDeleteGrant.mockRejectedValueOnce(new Error('offline'));
      const user = userEvent.setup();
      renderPage();
      await loaded();
      await openDelete(user);
      await user.click(await screen.findByTestId('grant-delete-confirm'));
      await screen.findByRole('alert');
      await user.click(screen.getByTestId('grant-delete-cancel'));

      await openDelete(user);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
