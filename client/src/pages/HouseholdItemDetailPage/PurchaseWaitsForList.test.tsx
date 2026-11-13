/**
 * @jest-environment jsdom
 *
 * The Waits for list of the purchase page's Timing tab (#2249, D2/D11): tasks and milestones a
 * purchase cannot start before; Add from one shared picker, Remove with Undo.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { HouseholdItemPageDetail } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { makePurchaseDep, makePurchasePage } from '../../test/purchasePageFixtures.js';
import { ToastView } from '../../test/toastView.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as DepsApiTypes from '../../lib/householdItemDepsApi.js';
import type * as UndoApiTypes from '../../lib/undoApi.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as ListModule from './PurchaseWaitsForList.js';

const mockCreateDep = jest.fn<typeof DepsApiTypes.createHouseholdItemDep>();
const mockDeleteDep = jest.fn<typeof DepsApiTypes.deleteHouseholdItemDep>();
const mockUndoChange = jest.fn<typeof UndoApiTypes.undoChange>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();

jest.unstable_mockModule('../../lib/householdItemDepsApi.js', () => ({
  createHouseholdItemDep: mockCreateDep,
  deleteHouseholdItemDep: mockDeleteDep,
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: mockUndoChange }));
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({ listWorkItems: mockListWorkItems }));
jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestones: mockListMilestones,
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let List: typeof ListModule;
const refresh = jest.fn<() => Promise<void>>();
const ORIGIN = { origin: { to: '/project/household-items/hi-1?tab=timing', name: 'Sample sofa' } };
const UNDO = { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' };

const PURCHASE = makePurchasePage({
  dependencies: [
    makePurchaseDep('p1', {
      predecessor: { title: 'Paint walls', status: 'in_progress', endDate: '2026-03-05' },
    }),
    makePurchaseDep('7', {
      predecessorType: 'milestone',
      predecessor: { title: 'Shell done', status: null, endDate: '2026-04-01' },
    }),
    makePurchaseDep('p2', { predecessor: { title: 'Lay floor', status: 'not_started' } }),
    makePurchaseDep('9', {
      predecessorType: 'milestone',
      predecessor: { title: 'Roof done', status: null, endDate: null },
    }),
  ],
});

function renderList(purchase: HouseholdItemPageDetail = PURCHASE) {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <OriginProbe />
        <List.PurchaseWaitsForList purchase={purchase} refresh={refresh} originState={ORIGIN} />
        <ToastView />
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function openPicker() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('purchase-waits-for-add'));
  const input = await screen.findByRole('textbox');
  await user.click(input);
  return user;
}

describe('PurchaseWaitsForList', () => {
  beforeEach(async () => {
    for (const mock of [
      mockCreateDep,
      mockDeleteDep,
      mockUndoChange,
      mockListWorkItems,
      mockListMilestones,
      refresh,
    ]) {
      mock.mockReset();
    }
    mockCreateDep.mockResolvedValue({} as never);
    mockDeleteDep.mockResolvedValue({ undo: UNDO } as never);
    mockUndoChange.mockResolvedValue({} as never);
    mockListWorkItems.mockResolvedValue({
      items: [
        { id: 'p1', title: 'Paint walls', area: null },
        { id: 'p3', title: 'Tile bathroom', area: null },
      ],
    } as never);
    mockListMilestones.mockResolvedValue([
      { id: 7, title: 'Shell done', targetDate: '2026-04-01' },
      { id: 12, title: 'Handover', targetDate: '2026-09-01' },
    ] as never);
    refresh.mockResolvedValue(undefined);
    if (!List) List = await import('./PurchaseWaitsForList.js');
  });

  it('exports the list as the default too', () => {
    expect(List.default).toBe(List.PurchaseWaitsForList);
  });

  it('is titled "Waits for" with a level 2 heading', () => {
    renderList();
    expect(screen.getByRole('heading', { level: 2, name: /^Waits for/ })).toBeInTheDocument();
  });

  it('says the purchase waits for nothing when there are no dependencies', () => {
    renderList(makePurchasePage());
    expect(screen.getByText("This purchase doesn't wait for a task or milestone.")).toBeVisible();
  });

  describe('rows', () => {
    it('shows a task with its status badge and "Task · date"', () => {
      renderList();
      const row = screen.getByTestId('purchase-waits-for-row-work_item:p1');
      expect(row).toHaveTextContent('Paint walls');
      expect(row).toHaveTextContent('In progress');
      expect(row).toHaveTextContent(/Task · Mar 5, 2026/);
    });

    it('shows a milestone without a status badge, as "Milestone · date"', () => {
      renderList();
      const row = screen.getByTestId('purchase-waits-for-row-milestone:7');
      expect(row).toHaveTextContent('Shell done');
      expect(row).toHaveTextContent(/Milestone · Apr 1, 2026/);
      expect(row).not.toHaveTextContent(/In progress|Not started|Completed/);
    });

    it('shows only the kind word when there is no end date', () => {
      renderList();
      expect(screen.getByTestId('purchase-waits-for-row-work_item:p2')).toHaveTextContent(
        /Task⋮?$/,
      );
      expect(screen.getByTestId('purchase-waits-for-row-milestone:9')).toHaveTextContent(
        /Milestone⋮?$/,
      );
    });

    it('links a task to its page and a milestone to its page, both with the origin', () => {
      renderList();
      const task = screen.getByTestId('purchase-waits-for-link-work_item:p1');
      const milestone = screen.getByTestId('purchase-waits-for-link-milestone:7');
      expect(task).toHaveAttribute('href', '/project/work-items/p1');
      expect(milestone).toHaveAttribute('href', '/project/milestones/7');
      fireEvent.click(milestone);
      expect(probedPath()).toBe('/project/milestones/7');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });
  });

  describe('add', () => {
    it('offers tasks and milestones not yet listed, tagged with their kind', async () => {
      renderList();
      await openPicker();
      expect(await screen.findByRole('option', { name: /Tile bathroom/ })).toHaveTextContent(
        'Task',
      );
      expect(screen.getByRole('option', { name: /Handover/ })).toHaveTextContent('Milestone');
      expect(screen.queryByRole('option', { name: /Paint walls/ })).toBeNull();
      expect(screen.queryByRole('option', { name: /Shell done/ })).toBeNull();
    });

    it('adds a task, refreshes the page, then closes the picker', async () => {
      renderList();
      const user = await openPicker();
      await user.click(await screen.findByRole('option', { name: /Tile bathroom/ }));
      await waitFor(() =>
        expect(mockCreateDep).toHaveBeenCalledWith('hi-1', {
          predecessorType: 'work_item',
          predecessorId: 'p3',
        }),
      );
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    });

    it('adds a milestone with its id', async () => {
      renderList();
      const user = await openPicker();
      await user.click(await screen.findByRole('option', { name: /Handover/ }));
      await waitFor(() =>
        expect(mockCreateDep).toHaveBeenCalledWith('hi-1', {
          predecessorType: 'milestone',
          predecessorId: '12',
        }),
      );
    });

    it('shows a translated server error (a cycle or a duplicate) and keeps the picker open', async () => {
      mockCreateDep.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CIRCULAR_DEPENDENCY', message: 'raw' }),
      );
      renderList();
      const user = await openPicker();
      await user.click(await screen.findByRole('option', { name: /Tile bathroom/ }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('alert')).not.toHaveTextContent("Couldn't add it. Try again.");
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('falls back to "Couldn\'t add it. Try again." for a failure without a code', async () => {
      mockCreateDep.mockRejectedValueOnce(new Error('network'));
      renderList();
      const user = await openPicker();
      await user.click(await screen.findByRole('option', { name: /Tile bathroom/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't add it. Try again.");
    });

    it('clears the earlier error on the next pick', async () => {
      mockCreateDep.mockRejectedValueOnce(new Error('network'));
      renderList();
      const user = await openPicker();
      await user.click(await screen.findByRole('option', { name: /Tile bathroom/ }));
      await screen.findByRole('alert');
      await user.click(screen.getByRole('textbox'));
      await user.click(await screen.findByRole('option', { name: /Tile bathroom/ }));
      await waitFor(() => expect(mockCreateDep).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });
  });

  describe('remove', () => {
    async function remove(rowId: string) {
      fireEvent.click(screen.getByTestId(`purchase-waits-for-actions-${rowId}`));
      const item = await screen.findByTestId(`purchase-waits-for-remove-${rowId}`);
      await act(async () => {
        fireEvent.click(item);
      });
    }

    it('unlinks a task with its type and id, refreshes and offers Undo', async () => {
      renderList();
      await remove('work_item:p1');
      expect(mockDeleteDep).toHaveBeenCalledWith('hi-1', 'work_item', 'p1');
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(await screen.findByTestId('toast-undo')).toBeInTheDocument();
    });

    it('unlinks a milestone with its type and id', async () => {
      renderList();
      await remove('milestone:7');
      expect(mockDeleteDep).toHaveBeenCalledWith('hi-1', 'milestone', '7');
    });

    it('Undo restores the link and refreshes the page again', async () => {
      renderList();
      await remove('work_item:p1');
      await act(async () => {
        fireEvent.click(await screen.findByTestId('toast-undo'));
      });
      expect(mockUndoChange).toHaveBeenCalledWith('tok-1');
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    });
  });
});
