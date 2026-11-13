/**
 * @jest-environment jsdom
 *
 * The milestone page shell (#2250): states, the one h1, the Mark reached / Reopen primary with
 * Undo, Change target, the strip, tabs, history line, delete and shortcuts, plus the static
 * guarantee that the retired link pickers are gone. Only API clients are mocked; the panels,
 * the status hook and the toasts are real.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigationType,
  useSearchParams,
} from 'react-router-dom';
import { ApiClientError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeMilestoneDetail } from '../../test/milestonePageFixtures.js';
import { makeTaskSummary } from '../../test/taskPageFixtures.js';
import { ToastView } from '../../test/toastView.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as StatusApiTypes from '../../lib/statusChangeApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as HistoryApiTypes from '../../lib/historyApi.js';
import type * as UndoApiTypes from '../../lib/undoApi.js';
import type * as PageModule from './MilestoneDetailPage.js';

const mockGetMilestone = jest.fn<typeof MilestonesApiTypes.getMilestone>();
const mockDeleteMilestone = jest.fn<typeof MilestonesApiTypes.deleteMilestone>();
const mockUpdateMilestone = jest.fn<typeof MilestonesApiTypes.updateMilestone>();
const mockChangeStatus = jest.fn<typeof StatusApiTypes.changeMilestoneStatus>();
const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();
const mockListHistory = jest.fn<typeof HistoryApiTypes.listHistory>();
const mockUndoChange = jest.fn<typeof UndoApiTypes.undoChange>();

const realMilestonesApi = await import('../../lib/milestonesApi.js');
const realStatusApi = await import('../../lib/statusChangeApi.js');
const realUndoApi = await import('../../lib/undoApi.js');

jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  ...realMilestonesApi,
  getMilestone: mockGetMilestone,
  deleteMilestone: mockDeleteMilestone,
  updateMilestone: mockUpdateMilestone,
}));
jest.unstable_mockModule('../../lib/statusChangeApi.js', () => ({
  ...realStatusApi,
  changeMilestoneStatus: mockChangeStatus,
}));
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
}));
jest.unstable_mockModule('../../lib/historyApi.js', () => ({ listHistory: mockListHistory }));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({
  ...realUndoApi,
  undoChange: mockUndoChange,
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: { id: 'u-me', role: 'admin' } }),
}));

let Page: typeof PageModule;

const UNDO = { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' };
const MILESTONE = makeMilestoneDetail({
  title: 'Roof closed',
  targetDate: '2026-06-01',
  description: 'Roof is closed and dry.',
  createdBy: { id: 'u-1', displayName: 'Pat Sample', email: 'pat@example.test' },
  createdAt: '2026-01-05T08:00:00.000Z',
  updatedAt: '2026-02-10T08:00:00.000Z',
  workItems: [
    makeTaskSummary('t1', { title: 'Frame roof', status: 'completed' }),
    makeTaskSummary('t2', { title: 'Seal gutters', status: 'in_progress' }),
  ],
  projectedDate: '2026-06-04',
});
const REACHED = makeMilestoneDetail({
  ...MILESTONE,
  isCompleted: true,
  completedAt: '2026-05-20T10:00:00.000Z',
});

interface Seen {
  type: string;
  path: string;
  search: string;
  state: unknown;
}
const seen: Seen = { type: '', path: '', search: '', state: null };

function Probe() {
  const location = useLocation();
  const type = useNavigationType();
  const [params] = useSearchParams();
  seen.type = type;
  seen.path = location.pathname;
  seen.search = location.search;
  seen.state = location.state;
  return <div data-testid="probe-tab">{params.get('tab') ?? ''}</div>;
}

function renderPage(entry: string = '/project/milestones/1') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Probe />
        <Routes>
          <Route path="/project/milestones/:id" element={<Page.default />} />
          <Route path="/project/milestones" element={<div data-testid="milestones-list" />} />
          <Route path="/needs-no-id" element={<Page.MilestoneDetailPage />} />
          <Route path="*" element={null} />
        </Routes>
        <ToastView />
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function loaded(entry?: string) {
  const view = renderPage(entry);
  await screen.findByRole('heading', { level: 1, name: /Roof closed|Untitled milestone/ });
  return view;
}

const h1s = () => screen.queryAllByRole('heading', { level: 1 });

describe('MilestoneDetailPage', () => {
  beforeEach(async () => {
    installMatchMedia({ '(min-width: 768px)': true });
    for (const mock of [
      mockGetMilestone,
      mockDeleteMilestone,
      mockUpdateMilestone,
      mockChangeStatus,
      mockFetchDeleteImpact,
      mockListHistory,
      mockUndoChange,
    ]) {
      mock.mockReset();
    }
    mockGetMilestone.mockResolvedValue(MILESTONE);
    mockFetchDeleteImpact.mockResolvedValue({ entityType: 'milestone', id: '1', effects: [] });
    mockListHistory.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    } as never);
    mockDeleteMilestone.mockResolvedValue(undefined);
    mockUndoChange.mockResolvedValue({} as never);
    document.title = 'initial';
    seen.type = '';
    if (!Page) Page = await import('./MilestoneDetailPage.js');
  });

  describe('route and states', () => {
    it('sends a route without a milestone id back to the Milestones list with a replace', async () => {
      renderPage('/needs-no-id');
      await waitFor(() => expect(seen.path).toBe('/project/milestones'));
      expect(seen.type).toBe('REPLACE');
      expect(mockGetMilestone).not.toHaveBeenCalled();
    });

    it('loads the milestone by its numeric id', async () => {
      await loaded('/project/milestones/42');
      expect(mockGetMilestone).toHaveBeenCalledWith(42);
      expect(mockGetMilestone).toHaveBeenCalledTimes(1);
    });

    it('shows the typed h1 "Milestone" and a loading skeleton while loading', async () => {
      mockGetMilestone.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByRole('heading', { name: 'Milestone', level: 1 })).toBeVisible();
      expect(h1s()).toHaveLength(1);
      expect(screen.getByRole('status', { name: 'Loading milestone...' })).toBeInTheDocument();
      expect(screen.queryByTestId('milestone-header')).toBeNull();
    });

    it('shows one "Milestone not found" h1 and Back to Milestones on a 404, without Retry', async () => {
      mockGetMilestone.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'Milestone not found' }),
      );
      renderPage('/project/milestones/999');
      expect(
        await screen.findByRole('heading', { name: 'Milestone not found', level: 1 }),
      ).toBeVisible();
      expect(h1s()).toHaveLength(1);
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Back to Milestones' }));
      expect(await screen.findByTestId('milestones-list')).toBeInTheDocument();
    });

    // Mutation: passing "abc" to getMilestone sends NaN to the server (a 400, not a not-found).
    it('treats a non-numeric id as not found without calling the API', async () => {
      renderPage('/project/milestones/abc');
      expect(
        await screen.findByRole('heading', { name: 'Milestone not found', level: 1 }),
      ).toBeVisible();
      expect(mockGetMilestone).not.toHaveBeenCalled();
    });

    it.each(['0', '-3', '1.5', '01'])(
      'treats the id %p as not found without calling the API',
      async (raw) => {
        renderPage(`/project/milestones/${raw}`);
        expect(
          await screen.findByRole('heading', { name: 'Milestone not found', level: 1 }),
        ).toBeVisible();
        expect(mockGetMilestone).not.toHaveBeenCalled();
      },
    );

    it('keeps h1 "Milestone" above an alert with Back and Retry on an API error', async () => {
      mockGetMilestone.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      renderPage();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/.+/);
      expect(screen.getByRole('heading', { name: 'Milestone', level: 1 })).toBeVisible();
      expect(h1s()).toHaveLength(1);
      expect(within(alert).getByRole('button', { name: 'Back to Milestones' })).toBeVisible();
      expect(within(alert).getByRole('button', { name: 'Try again' })).toBeVisible();
    });

    it('Retry after a failure loads the milestone again', async () => {
      mockGetMilestone.mockRejectedValueOnce(new Error('down'));
      renderPage();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByRole('heading', { name: 'Roof closed', level: 1 })).toBeVisible();
      expect(mockGetMilestone).toHaveBeenCalledTimes(2);
    });

    it('Back from the error card goes to the Milestones list', async () => {
      mockGetMilestone.mockRejectedValueOnce(new Error('down'));
      renderPage();
      await screen.findByRole('alert');
      fireEvent.click(screen.getByRole('button', { name: 'Back to Milestones' }));
      expect(await screen.findByTestId('milestones-list')).toBeInTheDocument();
    });
  });

  describe('title', () => {
    // AC1: the title appears once.
    it('shows exactly one h1 with the title and no h2 repeating it', async () => {
      await loaded();
      expect(h1s()).toHaveLength(1);
      expect(screen.getByRole('heading', { name: 'Roof closed', level: 1 })).toBeVisible();
      const h2s = screen.getAllByRole('heading', { level: 2 });
      expect(h2s.length).toBeGreaterThan(0);
      for (const h2 of h2s) expect(h2).not.toHaveTextContent('Roof closed');
    });

    it('sets the tab title from the milestone title', async () => {
      await loaded();
      // The section segment comes from the nav registry (Milestones sit under Tasks).
      await waitFor(() => expect(document.title).toBe('Roof closed · Tasks · Cornerstone'));
    });

    it('falls back to "Untitled milestone" for a whitespace-only title', async () => {
      mockGetMilestone.mockResolvedValue(makeMilestoneDetail({ title: '   ' }));
      renderPage();
      expect(
        await screen.findByRole('heading', { name: 'Untitled milestone', level: 1 }),
      ).toBeVisible();
      expect(h1s()).toHaveLength(1);
    });
  });

  describe('header', () => {
    it('shows the status chip, Mark reached as the primary and Change target as the secondary', async () => {
      await loaded();
      expect(screen.getByTestId('milestone-header')).toBeInTheDocument();
      expect(screen.getByTestId('milestone-status')).toHaveTextContent('Late · 3 d');
      expect(screen.getByTestId('milestone-primary-reached')).toHaveTextContent('Mark reached');
      expect(screen.queryByTestId('milestone-primary-reopen')).toBeNull();
      expect(screen.getByTestId('milestone-secondary-change-target')).toHaveTextContent(
        'Change target',
      );
    });

    it('asks when it was reached and offers Today, On target and Pick a date', async () => {
      await loaded();
      fireEvent.click(screen.getByTestId('milestone-primary-reached'));
      expect((await screen.findAllByText('When was it reached?')).length).toBeGreaterThan(0);
      expect(await screen.findByTestId('milestone-primary-reached-date-today')).toBeVisible();
      expect(screen.getByTestId('milestone-primary-reached-date-planned')).toHaveTextContent(
        /On target/,
      );
      expect(screen.getByTestId('milestone-primary-reached-date-pick')).toBeVisible();
    });

    it('Mark reached with Today sends the reached state and today as the date, then offers Undo', async () => {
      mockChangeStatus.mockResolvedValue({ record: MILESTONE, undo: UNDO } as never);
      await loaded();
      fireEvent.click(screen.getByTestId('milestone-primary-reached'));
      await act(async () => {
        fireEvent.click(await screen.findByTestId('milestone-primary-reached-date-today'));
      });
      await waitFor(() =>
        expect(mockChangeStatus).toHaveBeenCalledWith(1, {
          isCompleted: true,
          completedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      );
      expect(mockChangeStatus).toHaveBeenCalledTimes(1);
      expect(await screen.findByTestId('toast-undo')).toBeInTheDocument();
      expect(screen.getByTestId('toasts')).toHaveTextContent('Roof closed');
      expect(screen.getByTestId('toasts')).toHaveTextContent('Reached');
    });

    it('Mark reached with the "On target" chip sends the target date', async () => {
      mockChangeStatus.mockResolvedValue({ record: MILESTONE, undo: UNDO } as never);
      await loaded();
      fireEvent.click(screen.getByTestId('milestone-primary-reached'));
      await act(async () => {
        fireEvent.click(await screen.findByTestId('milestone-primary-reached-date-planned'));
      });
      await waitFor(() =>
        expect(mockChangeStatus).toHaveBeenCalledWith(1, {
          isCompleted: true,
          completedAt: '2026-06-01',
        }),
      );
    });

    it('reloads the milestone after the change and again after Undo', async () => {
      mockChangeStatus.mockResolvedValue({ record: MILESTONE, undo: UNDO } as never);
      await loaded();
      const loads = mockGetMilestone.mock.calls.length;
      fireEvent.click(screen.getByTestId('milestone-primary-reached'));
      await act(async () => {
        fireEvent.click(await screen.findByTestId('milestone-primary-reached-date-today'));
      });
      await waitFor(() => expect(mockGetMilestone.mock.calls.length).toBe(loads + 1));
      await act(async () => {
        fireEvent.click(await screen.findByTestId('toast-undo'));
      });
      expect(mockUndoChange).toHaveBeenCalledWith('tok-1');
      await waitFor(() => expect(mockGetMilestone.mock.calls.length).toBe(loads + 2));
    });

    // AC7.
    describe('once reached', () => {
      beforeEach(() => {
        mockGetMilestone.mockResolvedValue(REACHED);
      });

      // Mutation: omitting the primary for a reached milestone (the template needs one).
      it('shows Reopen as the primary, never omitted, and no Mark reached', async () => {
        await loaded();
        expect(screen.getByTestId('milestone-primary-reopen')).toHaveTextContent('Reopen');
        expect(screen.queryByTestId('milestone-primary-reached')).toBeNull();
        expect(screen.getByTestId('milestone-status')).toHaveTextContent('Reached');
      });

      it('hides Change target', async () => {
        await loaded();
        expect(screen.queryByTestId('milestone-secondary-change-target')).toBeNull();
      });

      // Mutation: sending a date step for Reopen, or isCompleted:true.
      it('Reopen sends the not-reached state with no date step, then offers Undo in a toast', async () => {
        mockChangeStatus.mockResolvedValue({ record: REACHED, undo: UNDO } as never);
        await loaded();
        await act(async () => {
          fireEvent.click(screen.getByTestId('milestone-primary-reopen'));
        });
        expect(screen.queryByText('When was it reached?')).toBeNull();
        await waitFor(() =>
          expect(mockChangeStatus).toHaveBeenCalledWith(1, { isCompleted: false }),
        );
        expect(mockChangeStatus).toHaveBeenCalledTimes(1);
        expect(await screen.findByTestId('toast-undo')).toBeInTheDocument();
        expect(screen.getByTestId('toasts')).toHaveTextContent('Roof closed');
        expect(screen.getByTestId('toasts')).toHaveTextContent('Upcoming');
      });

      it('Undo restores through the undo token and reloads the milestone', async () => {
        mockChangeStatus.mockResolvedValue({ record: REACHED, undo: UNDO } as never);
        await loaded();
        await act(async () => {
          fireEvent.click(screen.getByTestId('milestone-primary-reopen'));
        });
        const loads = mockGetMilestone.mock.calls.length;
        await act(async () => {
          fireEvent.click(await screen.findByTestId('toast-undo'));
        });
        expect(mockUndoChange).toHaveBeenCalledWith('tok-1');
        await waitFor(() => expect(mockGetMilestone.mock.calls.length).toBe(loads + 1));
      });

      it('shows an error toast without Undo when Reopen fails, and the button works again', async () => {
        mockChangeStatus.mockRejectedValueOnce(new Error('down'));
        await loaded();
        await act(async () => {
          fireEvent.click(screen.getByTestId('milestone-primary-reopen'));
        });
        await waitFor(() =>
          expect(within(screen.getByTestId('toasts')).getAllByRole('listitem')).toHaveLength(1),
        );
        expect(screen.queryByTestId('toast-undo')).toBeNull();
        expect(screen.getByTestId('milestone-primary-reopen')).not.toBeDisabled();
        expect(screen.getByTestId('milestone-primary-reopen')).not.toHaveAttribute(
          'aria-busy',
          'true',
        );
      });
    });
  });

  describe('Change target', () => {
    it('opens the Details card in edit mode with focus on the Target date input', async () => {
      const user = userEvent.setup();
      await loaded();
      await user.click(screen.getByTestId('milestone-secondary-change-target'));
      const input = await screen.findByTestId('milestone-field-target-date');
      await waitFor(() => expect(input).toHaveFocus());
      expect(screen.getByTestId('milestone-field-title')).not.toHaveFocus();
    });

    // Mutation: returning to the card's Edit button instead of the button that opened it.
    it('Cancel returns focus to the Change target button', async () => {
      const user = userEvent.setup();
      await loaded();
      const button = screen.getByTestId('milestone-secondary-change-target');
      await user.click(button);
      await screen.findByTestId('milestone-field-target-date');
      await user.click(screen.getByTestId('section-milestone-details-cancel'));
      await waitFor(() => expect(button).toHaveFocus());
    });

    it('from the Work tab it selects Overview first, then focuses the Target date input', async () => {
      const user = userEvent.setup();
      await loaded('/project/milestones/1?tab=work');
      await user.click(screen.getByTestId('milestone-secondary-change-target'));
      const input = await screen.findByTestId('milestone-field-target-date');
      await waitFor(() => expect(input).toHaveFocus());
      expect(screen.getByRole('tab', { name: /Overview/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('saving a new target date sends it and reloads the milestone', async () => {
      const user = userEvent.setup();
      mockUpdateMilestone.mockResolvedValue({} as never);
      await loaded();
      const loads = mockGetMilestone.mock.calls.length;
      await user.click(screen.getByTestId('milestone-secondary-change-target'));
      fireEvent.change(await screen.findByTestId('milestone-field-target-date'), {
        target: { value: '2026-07-15' },
      });
      await user.click(screen.getByTestId('section-milestone-details-save'));
      await waitFor(() => expect(mockGetMilestone.mock.calls.length).toBe(loads + 1));
      expect(mockUpdateMilestone).toHaveBeenCalledWith(1, { targetDate: '2026-07-15' });
    });
  });

  describe('strip and tabs', () => {
    it('shows the four facts in the Milestone summary landmark', async () => {
      await loaded();
      const strip = screen.getByRole('region', { name: /Milestone summary/i });
      expect(within(strip).getByTestId('summary-fact-target')).toBeInTheDocument();
      expect(within(strip).getByTestId('summary-fact-projected')).toBeInTheDocument();
      expect(within(strip).getByTestId('summary-fact-againstTarget')).toBeInTheDocument();
      expect(within(strip).getByTestId('summary-fact-countsToward')).toHaveTextContent(
        '2 tasks · 1 open',
      );
      expect(strip.querySelectorAll('[data-testid^="summary-fact-"]')).toHaveLength(4);
    });

    it('shows the Against target word from the server projection', async () => {
      await loaded();
      expect(screen.getByTestId('milestone-against-target')).toHaveTextContent('Late · 3 d');
    });

    it('lists Overview, Work and History as one tab row with Overview first', async () => {
      await loaded();
      const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
      expect(tabs).toEqual([
        expect.stringMatching(/^Overview/),
        expect.stringMatching(/^Work/),
        expect.stringMatching(/^History/),
      ]);
      expect(screen.getByRole('tab', { name: /Overview/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('shows the Details card on Overview, with the description', async () => {
      await loaded();
      expect(screen.getByTestId('section-milestone-details')).toBeInTheDocument();
      expect(screen.getByText('Roof is closed and dry.')).toBeVisible();
    });

    it('the Work tab shows both lists with their rows', async () => {
      const user = userEvent.setup();
      await loaded();
      await user.click(screen.getByRole('tab', { name: /Work/ }));
      expect(
        await screen.findByRole('heading', { level: 2, name: /Counts toward this milestone/ }),
      ).toBeVisible();
      expect(
        screen.getByRole('heading', { level: 2, name: /Waiting for this milestone/ }),
      ).toBeVisible();
      expect(screen.getByTestId('milestone-counts-row-t1')).toHaveTextContent('Frame roof');
    });

    it('a strip fact opens its tab', async () => {
      await loaded();
      fireEvent.click(screen.getByTestId('summary-fact-countsToward'));
      expect(await screen.findByTestId('milestone-counts')).toBeInTheDocument();
      expect(screen.getByTestId('probe-tab')).toHaveTextContent('work');
    });
  });

  describe('history', () => {
    async function openHistory() {
      const user = userEvent.setup();
      await loaded();
      await user.click(screen.getByRole('tab', { name: /History/ }));
    }

    it('says who created the milestone and when it was last updated', async () => {
      await openHistory();
      expect(await screen.findByTestId('milestone-history-created')).toHaveTextContent(
        'Created by Pat Sample on Jan 5, 2026 · Last updated Feb 10, 2026',
      );
    });

    it('says "Created on" when the creator is unknown', async () => {
      mockGetMilestone.mockResolvedValue(
        makeMilestoneDetail({ title: 'Roof closed', createdBy: null }),
      );
      await openHistory();
      const line = await screen.findByTestId('milestone-history-created');
      expect(line).toHaveTextContent(/^Created on Jan 1, 2026 · Last updated Jan 1, 2026$/);
      expect(line).not.toHaveTextContent('Created by');
    });

    it('loads the milestone history feed for this milestone', async () => {
      await openHistory();
      await waitFor(() => expect(mockListHistory).toHaveBeenCalled());
      expect(mockListHistory.mock.calls[0]![0]).toMatchObject({
        entityType: 'milestone',
        entityId: '1',
      });
    });

    it('says nothing has happened when the feed is empty', async () => {
      await openHistory();
      expect(await screen.findByText('Nothing has happened to this milestone yet.')).toBeVisible();
    });

    it('reloads the feed after a status change (the revision bumps)', async () => {
      const user = userEvent.setup();
      mockChangeStatus.mockResolvedValue({ record: MILESTONE, undo: UNDO } as never);
      await openHistory();
      await waitFor(() => expect(mockListHistory).toHaveBeenCalledTimes(1));
      await user.click(screen.getByTestId('milestone-primary-reached'));
      await user.click(await screen.findByTestId('milestone-primary-reached-date-today'));
      await waitFor(() => expect(mockListHistory).toHaveBeenCalledTimes(2));
    });
  });

  describe('delete', () => {
    async function openByKey(key: string) {
      await loaded();
      fireEvent.keyDown(document.body, { key });
      return screen.findByRole('alertdialog');
    }

    it('opens from the header menu with the milestone name and loads the delete impact', async () => {
      await loaded();
      fireEvent.click(screen.getByTestId('object-header-menu'));
      fireEvent.click(await screen.findByTestId('object-header-delete'));
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog).toHaveTextContent('Roof closed');
      await waitFor(() => expect(mockFetchDeleteImpact).toHaveBeenCalledWith('milestone', 1));
    });

    it.each(['Delete', 'Backspace'])('opens with the %s key', async (key) => {
      const dialog = await openByKey(key);
      expect(dialog).toHaveTextContent('Roof closed');
    });

    it('does not load the delete impact before the dialog opens', async () => {
      await loaded();
      expect(mockFetchDeleteImpact).not.toHaveBeenCalled();
    });

    it('Cancel returns focus to the page heading', async () => {
      await openByKey('Delete');
      fireEvent.click(screen.getByTestId('milestone-delete-cancel'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(mockDeleteMilestone).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 1, name: 'Roof closed' })).toHaveFocus(),
      );
    });

    it('deleting returns to the Milestones list with a replace and a toast', async () => {
      await openByKey('Delete');
      await act(async () => {
        fireEvent.click(await screen.findByTestId('milestone-delete-confirm'));
      });
      expect(mockDeleteMilestone).toHaveBeenCalledWith(1);
      expect(await screen.findByTestId('milestones-list')).toBeInTheDocument();
      expect(seen.path).toBe('/project/milestones');
      expect(seen.type).toBe('REPLACE');
      expect(await screen.findByText('Milestone deleted')).toBeInTheDocument();
    });

    it('a blocked delete (409) shows the translated reason and no confirm button', async () => {
      mockDeleteMilestone.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CONFLICT', message: 'x' }),
      );
      await openByKey('Delete');
      await act(async () => {
        fireEvent.click(await screen.findByTestId('milestone-delete-confirm'));
      });
      expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toBeInTheDocument();
      expect(screen.queryByTestId('milestone-delete-confirm')).toBeNull();
    });

    it('another API error keeps the confirm button', async () => {
      mockDeleteMilestone.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      await openByKey('Delete');
      await act(async () => {
        fireEvent.click(await screen.findByTestId('milestone-delete-confirm'));
      });
      expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toBeInTheDocument();
      expect(screen.getByTestId('milestone-delete-confirm')).toBeInTheDocument();
    });

    it('a network failure shows the fallback sentence; reopening clears the error', async () => {
      mockDeleteMilestone.mockRejectedValueOnce(new Error('down'));
      await openByKey('Delete');
      await act(async () => {
        fireEvent.click(await screen.findByTestId('milestone-delete-confirm'));
      });
      expect(await screen.findByText("Couldn't delete the milestone.")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('milestone-delete-cancel'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      fireEvent.keyDown(document.body, { key: 'Delete' });
      await screen.findByRole('alertdialog');
      expect(screen.queryByText("Couldn't delete the milestone.")).toBeNull();
    });
  });

  describe('keyboard shortcuts', () => {
    it('e starts editing the Details card on the Overview tab', async () => {
      await loaded();
      fireEvent.keyDown(document.body, { key: 'e' });
      expect(await screen.findByTestId('milestone-field-title')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('milestone-field-title')).toHaveFocus());
    });

    it('e from the Work tab selects Overview first, then edits the Details card', async () => {
      await loaded('/project/milestones/1?tab=work');
      fireEvent.keyDown(document.body, { key: 'e' });
      expect(await screen.findByTestId('milestone-field-title')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Overview/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('? opens the shortcut help with the page shortcuts, without the Backspace twin', async () => {
      await loaded();
      fireEvent.keyDown(document.body, { key: '?' });
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('Edit the milestone details');
      expect(dialog).toHaveTextContent('Delete the milestone');
      expect(dialog).toHaveTextContent('Show keyboard shortcuts');
      expect(within(dialog).queryByText('Backspace')).toBeNull();
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
  });

  describe('AC6: the old link pickers are retired', () => {
    const dir = new URL('.', import.meta.url);
    const sources = readdirSync(dir)
      .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name))
      .map((name) => ({ name, text: readFileSync(new URL(name, dir), 'utf8') }));

    it('finds the page and its panel sources', () => {
      expect(sources.map((s) => s.name)).toEqual(
        expect.arrayContaining([
          'MilestoneDetailPage.tsx',
          'MilestoneCountsTowardList.tsx',
          'MilestoneWaitingForList.tsx',
        ]),
      );
    });

    it('imports SearchPicker nowhere in the page folder', () => {
      for (const source of sources) {
        expect({ file: source.name, imports: /SearchPicker/.test(source.text) }).toEqual({
          file: source.name,
          imports: false,
        });
      }
    });

    it('mentions neither milestone-link-search nor milestone-dependent-search', () => {
      for (const source of sources) {
        expect({
          file: source.name,
          hit: /milestone-link-search|milestone-dependent-search/.test(source.text),
        }).toEqual({ file: source.name, hit: false });
      }
    });

    it('uses the shared EntityPicker for both lists', () => {
      const byName = new Map(sources.map((s) => [s.name, s.text]));
      expect(byName.get('MilestoneCountsTowardList.tsx')).toContain('kind="task"');
      expect(byName.get('MilestoneWaitingForList.tsx')).toContain('kind="taskOrPurchase"');
    });
  });
});
