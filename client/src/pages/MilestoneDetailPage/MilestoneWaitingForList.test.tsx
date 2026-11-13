/**
 * @jest-environment jsdom
 *
 * The "Waiting for this milestone" list of the milestone page's Work tab (#2250): tasks and
 * purchases that cannot start before the milestone, Add from one shared picker (each kind goes to
 * its own API), Remove with Undo, and the inline refusal when the task already counts toward the
 * milestone (AC8).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { MilestoneDetail } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { makeMilestoneDetail, makeWaitingPurchase } from '../../test/milestonePageFixtures.js';
import { makeTaskSummary } from '../../test/taskPageFixtures.js';
import { ToastView } from '../../test/toastView.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as DepsApiTypes from '../../lib/householdItemDepsApi.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as SearchApiTypes from '../../lib/searchApi.js';
import type * as UndoApiTypes from '../../lib/undoApi.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as ListModule from './MilestoneWaitingForList.js';

const mockAddDependent = jest.fn<typeof MilestonesApiTypes.addDependentWorkItem>();
const mockRemoveDependent = jest.fn<typeof MilestonesApiTypes.removeDependentWorkItem>();
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockCreateDep = jest.fn<typeof DepsApiTypes.createHouseholdItemDep>();
const mockDeleteDep = jest.fn<typeof DepsApiTypes.deleteHouseholdItemDep>();
const mockSearchEverywhere = jest.fn<typeof SearchApiTypes.searchEverywhere>();
const mockUndoChange = jest.fn<typeof UndoApiTypes.undoChange>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();

jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  addDependentWorkItem: mockAddDependent,
  removeDependentWorkItem: mockRemoveDependent,
  listMilestones: mockListMilestones,
}));
jest.unstable_mockModule('../../lib/householdItemDepsApi.js', () => ({
  createHouseholdItemDep: mockCreateDep,
  deleteHouseholdItemDep: mockDeleteDep,
}));
jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  searchEverywhere: mockSearchEverywhere,
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: mockUndoChange }));
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({ listWorkItems: mockListWorkItems }));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let List: typeof ListModule;
const refresh = jest.fn<() => Promise<void>>();
const ORIGIN = { origin: { to: '/project/milestones/1?tab=work', name: 'Sample milestone' } };
const UNDO = { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' };

const MILESTONE = makeMilestoneDetail({
  workItems: [makeTaskSummary('c1', { title: 'Frame roof' })],
  dependentWorkItems: [
    makeTaskSummary('w1', {
      title: 'Tile roof',
      status: 'in_progress',
      startDate: '2026-04-01',
      projectedStartDate: '2026-04-06',
    }),
    makeTaskSummary('w2', { title: 'Paint walls', startDate: '2026-04-20' }),
    makeTaskSummary('w3', { title: 'Hang gutters' }),
  ],
  dependentHouseholdItems: [
    makeWaitingPurchase('h1', {
      name: 'Sample sofa',
      status: 'purchased',
      targetDeliveryDate: '2026-05-10',
    }),
    makeWaitingPurchase('h2', { name: 'Sample table' }),
  ],
});

function renderList(milestone: MilestoneDetail = MILESTONE) {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <OriginProbe />
        <List.MilestoneWaitingForList
          milestone={milestone}
          refresh={refresh}
          originState={ORIGIN}
        />
        <ToastView />
      </MemoryRouter>
    </ToastProvider>,
  );
}

/** Opens the picker and searches, since this picker offers nothing below two characters. */
async function search(query = 'Sa') {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('milestone-waiting-add'));
  const input = await screen.findByRole('textbox');
  await user.click(input);
  await user.type(input, query);
  return user;
}

describe('MilestoneWaitingForList', () => {
  beforeEach(async () => {
    for (const mock of [
      mockAddDependent,
      mockRemoveDependent,
      mockListMilestones,
      mockCreateDep,
      mockDeleteDep,
      mockSearchEverywhere,
      mockUndoChange,
      mockListWorkItems,
      refresh,
    ]) {
      mock.mockReset();
    }
    mockAddDependent.mockResolvedValue({ dependentWorkItems: [] });
    mockRemoveDependent.mockResolvedValue({ undo: UNDO } as never);
    mockCreateDep.mockResolvedValue({} as never);
    mockDeleteDep.mockResolvedValue({ undo: UNDO } as never);
    mockUndoChange.mockResolvedValue({} as never);
    mockListMilestones.mockResolvedValue([] as never);
    mockListWorkItems.mockResolvedValue({ items: [] } as never);
    mockSearchEverywhere.mockResolvedValue({
      query: 'Sa',
      groups: [
        {
          type: 'work_item',
          items: [
            { id: 'w1', label: 'Tile roof' },
            { id: 'c1', label: 'Frame roof' },
            { id: 'w20', label: 'Lay floor' },
          ],
        },
        {
          type: 'household_item',
          items: [
            { id: 'h1', label: 'Sample sofa' },
            { id: 'h20', label: 'Sample lamp' },
          ],
        },
      ],
    } as never);
    refresh.mockResolvedValue(undefined);
    if (!List) List = await import('./MilestoneWaitingForList.js');
  });

  it('exports the list as the default too', () => {
    expect(List.default).toBe(List.MilestoneWaitingForList);
  });

  it('is titled "Waiting for this milestone" with a level 2 heading', () => {
    renderList();
    expect(
      screen.getByRole('heading', { level: 2, name: /^Waiting for this milestone/ }),
    ).toBeInTheDocument();
  });

  it('says nothing waits for the milestone when there is nothing', () => {
    renderList(makeMilestoneDetail());
    expect(screen.getByText('Nothing waits for this milestone yet.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add task or purchase' })).toBeVisible();
  });

  describe('rows', () => {
    // Mutation: a purchase listed in the first list, or tasks after purchases.
    it('lists the waiting tasks first and then the waiting purchases', () => {
      renderList();
      const ids = screen
        .getAllByTestId(/^milestone-waiting-row-/)
        .map((row) => row.getAttribute('data-testid'));
      expect(ids).toEqual([
        'milestone-waiting-row-work_item:w1',
        'milestone-waiting-row-work_item:w2',
        'milestone-waiting-row-work_item:w3',
        'milestone-waiting-row-household_item:h1',
        'milestone-waiting-row-household_item:h2',
      ]);
    });

    it('does not list a task that counts toward the milestone', () => {
      renderList();
      expect(screen.queryByText('Frame roof')).toBeNull();
    });

    it('shows a task as "Task · date" with its status badge, the projected start winning', () => {
      renderList();
      const row = screen.getByTestId('milestone-waiting-row-work_item:w1');
      expect(row).toHaveTextContent('Tile roof');
      expect(row).toHaveTextContent('In progress');
      expect(row).toHaveTextContent('Task · Apr 6, 2026');
      expect(row).not.toHaveTextContent('Apr 1, 2026');
    });

    it('falls back to the planned start for a task that is not projected', () => {
      renderList();
      expect(screen.getByTestId('milestone-waiting-row-work_item:w2')).toHaveTextContent(
        'Task · Apr 20, 2026',
      );
    });

    it('shows only the kind word for a task without a date', () => {
      renderList();
      const row = screen.getByTestId('milestone-waiting-row-work_item:w3');
      expect(row).toHaveTextContent(/Task⋮?$/);
    });

    it('shows a purchase as "Purchase · target delivery date" with its purchase status word', () => {
      renderList();
      const row = screen.getByTestId('milestone-waiting-row-household_item:h1');
      expect(row).toHaveTextContent('Sample sofa');
      expect(row).toHaveTextContent('Ordered');
      expect(row).toHaveTextContent('Purchase · May 10, 2026');
    });

    it('shows only the kind word for a purchase without a target delivery date', () => {
      renderList();
      const row = screen.getByTestId('milestone-waiting-row-household_item:h2');
      expect(row).toHaveTextContent('Sample table');
      expect(row).toHaveTextContent(/Purchase⋮?$/);
    });

    it('links a task and a purchase to their own pages, both with the origin', () => {
      renderList();
      const task = screen.getByTestId('milestone-waiting-link-work_item:w1');
      const purchase = screen.getByTestId('milestone-waiting-link-household_item:h1');
      expect(task).toHaveAttribute('href', '/project/work-items/w1');
      expect(purchase).toHaveAttribute('href', '/project/household-items/h1');
      fireEvent.click(purchase);
      expect(probedPath()).toBe('/project/household-items/h1');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });
  });

  describe('add', () => {
    it('searches tasks and purchases together', async () => {
      renderList();
      await search('Sa');
      await screen.findByRole('option', { name: /Lay floor/ });
      expect(mockSearchEverywhere).toHaveBeenCalled();
      expect(mockSearchEverywhere.mock.calls[0]![0]).toMatchObject({
        types: ['work_item', 'household_item'],
      });
    });

    // Mutation: dropping `workItems` from excludeIds offers the task that already counts toward
    // it; dropping the rows offers what is already waiting.
    it('leaves out what already waits and what counts toward the milestone', async () => {
      renderList();
      await search('Sa');
      expect(await screen.findByRole('option', { name: /Lay floor/ })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Sample lamp/ })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Tile roof/ })).toBeNull();
      expect(screen.queryByRole('option', { name: /Sample sofa/ })).toBeNull();
      expect(screen.queryByRole('option', { name: /Frame roof/ })).toBeNull();
    });

    it('adds a task through addDependentWorkItem, refreshes, then closes the picker', async () => {
      renderList();
      const user = await search('Sa');
      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));
      await waitFor(() => expect(mockAddDependent).toHaveBeenCalledWith(1, 'w20'));
      expect(mockAddDependent).toHaveBeenCalledTimes(1);
      expect(mockCreateDep).not.toHaveBeenCalled();
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    });

    // Mutation: sending a purchase through the task endpoint, or the milestone id as a number.
    it('adds a purchase through createHouseholdItemDep with the milestone as predecessor', async () => {
      renderList();
      const user = await search('Sa');
      await user.click(await screen.findByRole('option', { name: /Sample lamp/ }));
      await waitFor(() =>
        expect(mockCreateDep).toHaveBeenCalledWith('h20', {
          predecessorType: 'milestone',
          predecessorId: '1',
        }),
      );
      expect(mockCreateDep).toHaveBeenCalledTimes(1);
      expect(mockAddDependent).not.toHaveBeenCalled();
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    });

    // AC8: the race where another tab made the task count toward this milestone.
    it('shows the specific message for CIRCULAR_DEPENDENCY, keeps the picker open and does not refresh', async () => {
      mockAddDependent.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CIRCULAR_DEPENDENCY', message: 'raw' }),
      );
      renderList();
      const user = await search('Sa');
      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This task counts toward this milestone, so it cannot wait for it.',
      );
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
      expect(screen.getAllByTestId(/^milestone-waiting-row-/)).toHaveLength(5);
    });

    it('shows the same refusal for a purchase that the server rejects', async () => {
      mockCreateDep.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CIRCULAR_DEPENDENCY', message: 'raw' }),
      );
      renderList();
      const user = await search('Sa');
      await user.click(await screen.findByRole('option', { name: /Sample lamp/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent('cannot wait for it');
      expect(refresh).not.toHaveBeenCalled();
    });

    it('translates another coded error through the error catalogue instead', async () => {
      mockAddDependent.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'raw' }),
      );
      renderList();
      const user = await search('Sa');
      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));
      const alert = await screen.findByRole('alert');
      expect(alert).not.toHaveTextContent('cannot wait for it');
      expect(alert).not.toHaveTextContent('raw');
      expect(alert).toHaveTextContent(/\S/);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('falls back to "Couldn\'t add it. Try again." for a failure without a code', async () => {
      mockAddDependent.mockRejectedValueOnce(new Error('network'));
      renderList();
      const user = await search('Sa');
      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't add it. Try again.");
    });

    it('clears the earlier error on the next pick', async () => {
      mockAddDependent.mockRejectedValueOnce(new Error('network'));
      renderList();
      const user = await search('Sa');
      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));
      await screen.findByRole('alert');
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'Sa');
      await user.click(await screen.findByRole('option', { name: /Lay floor/ }));
      await waitFor(() => expect(mockAddDependent).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });
  });

  describe('remove', () => {
    async function remove(rowId: string) {
      fireEvent.click(screen.getByTestId(`milestone-waiting-actions-${rowId}`));
      const item = await screen.findByTestId(`milestone-waiting-remove-${rowId}`);
      await act(async () => {
        fireEvent.click(item);
      });
    }

    it('removes a task through removeDependentWorkItem, refreshes and offers Undo', async () => {
      renderList();
      await remove('work_item:w1');
      expect(mockRemoveDependent).toHaveBeenCalledWith(1, 'w1');
      expect(mockRemoveDependent).toHaveBeenCalledTimes(1);
      expect(mockDeleteDep).not.toHaveBeenCalled();
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(await screen.findByTestId('toast-undo')).toBeInTheDocument();
    });

    // Mutation: removing a purchase through the task endpoint, or a numeric milestone id.
    it('removes a purchase through deleteHouseholdItemDep with the milestone type and id', async () => {
      renderList();
      await remove('household_item:h1');
      expect(mockDeleteDep).toHaveBeenCalledWith('h1', 'milestone', '1');
      expect(mockDeleteDep).toHaveBeenCalledTimes(1);
      expect(mockRemoveDependent).not.toHaveBeenCalled();
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(await screen.findByTestId('toast-undo')).toBeInTheDocument();
    });

    it('Undo restores with the token and refreshes again', async () => {
      renderList();
      await remove('household_item:h1');
      await act(async () => {
        fireEvent.click(await screen.findByTestId('toast-undo'));
      });
      expect(mockUndoChange).toHaveBeenCalledWith('tok-1');
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    });
  });
});
