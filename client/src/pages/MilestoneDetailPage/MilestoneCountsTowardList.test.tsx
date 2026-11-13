/**
 * @jest-environment jsdom
 *
 * The "Counts toward this milestone" list of the milestone page's Work tab (#2250): the tasks
 * that count toward the milestone, Add from a task picker, Remove with Undo, and the inline
 * refusal when the task already waits for the milestone (AC8).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { MilestoneDetail } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { makeMilestoneDetail } from '../../test/milestonePageFixtures.js';
import { makeTaskSummary } from '../../test/taskPageFixtures.js';
import { ToastView } from '../../test/toastView.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as UndoApiTypes from '../../lib/undoApi.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as ListModule from './MilestoneCountsTowardList.js';

const mockLinkWorkItem = jest.fn<typeof MilestonesApiTypes.linkWorkItem>();
const mockUnlinkWorkItem = jest.fn<typeof MilestonesApiTypes.unlinkWorkItem>();
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockUndoChange = jest.fn<typeof UndoApiTypes.undoChange>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();

jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  linkWorkItem: mockLinkWorkItem,
  unlinkWorkItem: mockUnlinkWorkItem,
  listMilestones: mockListMilestones,
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: mockUndoChange }));
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({ listWorkItems: mockListWorkItems }));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let List: typeof ListModule;
const refresh = jest.fn<() => Promise<void>>();
const ORIGIN = { origin: { to: '/project/milestones/1?tab=work', name: 'Sample milestone' } };
const UNDO = { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' };

const MILESTONE = makeMilestoneDetail({
  workItems: [
    makeTaskSummary('t1', {
      title: 'Frame roof',
      status: 'in_progress',
      startDate: '2026-03-01',
      endDate: '2026-03-10',
      projectedStartDate: '2026-03-02',
      projectedEndDate: '2026-03-12',
    }),
    makeTaskSummary('t2', {
      title: 'Seal gutters',
      status: 'completed',
      startDate: '2026-03-05',
      endDate: '2026-03-06',
    }),
    makeTaskSummary('t3', { title: 'Order tiles', endDate: '2026-04-01' }),
    makeTaskSummary('t4', { title: 'Clear site' }),
    makeTaskSummary('t5', { title: 'Hang doors', startDate: '2026-05-01' }),
  ],
  dependentWorkItems: [makeTaskSummary('t9', { title: 'Paint walls' })],
});

function renderList(milestone: MilestoneDetail = MILESTONE) {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <OriginProbe />
        <List.MilestoneCountsTowardList
          milestone={milestone}
          refresh={refresh}
          originState={ORIGIN}
        />
        <ToastView />
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function openPicker() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('milestone-counts-add'));
  const input = await screen.findByRole('textbox');
  await user.click(input);
  return user;
}

describe('MilestoneCountsTowardList', () => {
  beforeEach(async () => {
    for (const mock of [
      mockLinkWorkItem,
      mockUnlinkWorkItem,
      mockListMilestones,
      mockUndoChange,
      mockListWorkItems,
      refresh,
    ]) {
      mock.mockReset();
    }
    mockLinkWorkItem.mockResolvedValue({} as never);
    mockUnlinkWorkItem.mockResolvedValue({ undo: UNDO } as never);
    mockUndoChange.mockResolvedValue({} as never);
    mockListMilestones.mockResolvedValue([] as never);
    mockListWorkItems.mockResolvedValue({
      items: [
        { id: 't1', title: 'Frame roof', status: 'in_progress', area: null },
        { id: 't9', title: 'Paint walls', status: 'not_started', area: null },
        { id: 't20', title: 'Lay floor', status: 'not_started', area: null },
      ],
    } as never);
    refresh.mockResolvedValue(undefined);
    if (!List) List = await import('./MilestoneCountsTowardList.js');
  });

  it('exports the list as the default too', () => {
    expect(List.default).toBe(List.MilestoneCountsTowardList);
  });

  it('is titled "Counts toward this milestone" with a level 2 heading', () => {
    renderList();
    expect(
      screen.getByRole('heading', { level: 2, name: /^Counts toward this milestone/ }),
    ).toBeInTheDocument();
  });

  it('says no task counts toward the milestone when there are none', () => {
    renderList(makeMilestoneDetail());
    expect(screen.getByText('No task counts toward this milestone yet.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add task' })).toBeVisible();
  });

  describe('rows', () => {
    it('shows one row per counted task, in the server order', () => {
      renderList();
      const rows = screen
        .getAllByTestId(/^milestone-counts-row-/)
        .map((row) => row.getAttribute('data-testid'));
      expect(rows).toEqual([
        'milestone-counts-row-t1',
        'milestone-counts-row-t2',
        'milestone-counts-row-t3',
        'milestone-counts-row-t4',
        'milestone-counts-row-t5',
      ]);
    });

    it('shows the title and the task status word as a badge', () => {
      renderList();
      expect(screen.getByTestId('milestone-counts-row-t1')).toHaveTextContent('Frame roof');
      expect(screen.getByTestId('milestone-counts-row-t1')).toHaveTextContent('In progress');
      expect(screen.getByTestId('milestone-counts-row-t2')).toHaveTextContent('Done');
    });

    // Mutation: preferring the planned dates would show 03-01 – 03-10 for the late task.
    it('shows "start – end" with the projected dates winning over the planned ones', () => {
      renderList();
      const row = screen.getByTestId('milestone-counts-row-t1');
      expect(row).toHaveTextContent('Mar 2, 2026 – Mar 12, 2026');
      expect(row).not.toHaveTextContent('Mar 1, 2026');
    });

    it('falls back to the planned dates when nothing is projected', () => {
      renderList();
      expect(screen.getByTestId('milestone-counts-row-t2')).toHaveTextContent(
        'Mar 5, 2026 – Mar 6, 2026',
      );
    });

    it('shows a lone date plainly when only one end is known', () => {
      renderList();
      const row = screen.getByTestId('milestone-counts-row-t3');
      expect(row).toHaveTextContent('Apr 1, 2026');
      expect(row).not.toHaveTextContent('–');
    });

    it('shows a lone start date plainly too', () => {
      renderList();
      const row = screen.getByTestId('milestone-counts-row-t5');
      expect(row).toHaveTextContent('May 1, 2026');
      expect(row).not.toHaveTextContent('–');
    });

    it('shows no date line for a task without dates', () => {
      renderList();
      expect(screen.getByTestId('milestone-counts-row-t4')).not.toHaveTextContent('2026');
    });

    it('does not list a purchase or a task that only waits for the milestone', () => {
      renderList();
      expect(screen.queryByText('Paint walls')).toBeNull();
    });

    it('links a task to its page with the origin', () => {
      renderList();
      const link = screen.getByTestId('milestone-counts-link-t1');
      expect(link).toHaveAttribute('href', '/project/work-items/t1');
      fireEvent.click(link);
      expect(probedPath()).toBe('/project/work-items/t1');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });
  });

  describe('add', () => {
    // Mutation: dropping dependentWorkItems from excludeIds offers the task that waits.
    it('offers tasks, leaving out those already counted and those waiting for the milestone', async () => {
      renderList();
      await openPicker();
      expect(await screen.findByRole('option', { name: /Lay floor/ })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Frame roof/ })).toBeNull();
      expect(screen.queryByRole('option', { name: /Paint walls/ })).toBeNull();
    });

    it('searches tasks, not purchases (the task picker kind)', async () => {
      renderList();
      await openPicker();
      await screen.findByRole('option', { name: /Lay floor/ });
      expect(mockListWorkItems).toHaveBeenCalled();
    });

    it('links the task with the milestone id, refreshes, then closes the picker', async () => {
      renderList();
      const user = await openPicker();
      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));
      await waitFor(() => expect(mockLinkWorkItem).toHaveBeenCalledWith(1, 't20'));
      expect(mockLinkWorkItem).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    });

    // AC8: the race where another tab made the task wait for this milestone.
    it('shows the specific message for CIRCULAR_DEPENDENCY, keeps the picker open and does not refresh', async () => {
      mockLinkWorkItem.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CIRCULAR_DEPENDENCY', message: 'raw' }),
      );
      renderList();
      const user = await openPicker();
      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This task waits for this milestone, so it cannot count toward it.',
      );
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
      expect(screen.getAllByTestId(/^milestone-counts-row-/)).toHaveLength(5);
    });

    it('translates another coded error through the error catalogue instead', async () => {
      mockLinkWorkItem.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'raw' }),
      );
      renderList();
      const user = await openPicker();
      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));
      const alert = await screen.findByRole('alert');
      expect(alert).not.toHaveTextContent('cannot count toward it');
      expect(alert).not.toHaveTextContent('raw');
      expect(alert).toHaveTextContent(/\S/);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('falls back to "Couldn\'t add it. Try again." for a failure without a code', async () => {
      mockLinkWorkItem.mockRejectedValueOnce(new Error('network'));
      renderList();
      const user = await openPicker();
      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't add it. Try again.");
    });

    it('clears the earlier error on the next pick', async () => {
      mockLinkWorkItem.mockRejectedValueOnce(new Error('network'));
      renderList();
      const user = await openPicker();
      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));
      await screen.findByRole('alert');
      await user.click(screen.getByRole('textbox'));
      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));
      await waitFor(() => expect(mockLinkWorkItem).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });
  });

  describe('remove', () => {
    async function remove(id: string) {
      fireEvent.click(screen.getByTestId(`milestone-counts-actions-${id}`));
      const item = await screen.findByTestId(`milestone-counts-remove-${id}`);
      await act(async () => {
        fireEvent.click(item);
      });
    }

    it('unlinks with the milestone and task ids, refreshes and offers Undo', async () => {
      renderList();
      await remove('t1');
      expect(mockUnlinkWorkItem).toHaveBeenCalledWith(1, 't1');
      expect(mockUnlinkWorkItem).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(await screen.findByTestId('toast-undo')).toBeInTheDocument();
    });

    // Mutation: dropping `return undo` loses the Undo button.
    it('hands the undo token to the toast: Undo restores with it and refreshes again', async () => {
      renderList();
      await remove('t1');
      await act(async () => {
        fireEvent.click(await screen.findByTestId('toast-undo'));
      });
      expect(mockUndoChange).toHaveBeenCalledWith('tok-1');
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    });
  });
});
