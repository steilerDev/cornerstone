/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { WorkItemListRow } from '@cornerstone/shared';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { ToastList } from '../../components/Toast/Toast.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { KITCHEN, makeTaskRow } from '../../test/taskListFixtures.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as StatusChangeApiTypes from '../../lib/statusChangeApi.js';
import type * as UndoApiTypes from '../../lib/undoApi.js';
import type * as ActionsModule from './useTaskActions.js';
import type { TaskActionsHost } from './useTaskActions.js';

const mockDeleteWorkItem = jest.fn<typeof WorkItemsApiTypes.deleteWorkItem>();
const mockUpdateWorkItem = jest.fn<typeof WorkItemsApiTypes.updateWorkItem>();
const mockChangeStatus = jest.fn<typeof StatusChangeApiTypes.changeWorkItemStatus>();
const mockUndo = jest.fn<typeof UndoApiTypes.undoChange>();

jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  deleteWorkItem: mockDeleteWorkItem,
  updateWorkItem: mockUpdateWorkItem,
  listWorkItems: jest.fn(),
  getWorkItem: jest.fn(),
}));
jest.unstable_mockModule('../../lib/statusChangeApi.js', () => ({
  changeWorkItemStatus: mockChangeStatus,
  workItemStatusBody: (to: string, date: string | null) => ({ status: to, date }),
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: mockUndo }));

let useTaskActions: typeof ActionsModule.useTaskActions;
let out: ActionsModule.UseTaskActionsResult;

const A = makeTaskRow({ id: 'wi-a', title: 'Pour the slab', status: 'not_started' });
const B = makeTaskRow({ id: 'wi-b', title: 'Frame the walls', status: 'in_progress' });
const C = makeTaskRow({ id: 'wi-c', title: 'Hang the doors', status: 'completed', area: KITCHEN });

const headingRef = createRef<HTMLHeadingElement>();
const host = {
  refreshRows: jest.fn<TaskActionsHost['refreshRows']>(),
  refresh: jest.fn<TaskActionsHost['refresh']>(),
  queryKey: jest.fn<TaskActionsHost['queryKey']>(),
  headingRef,
};

/** Titles rendered in the DOM; `refusing` ids ignore focus (a hidden surface). */
function Harness({ titles = ['wi-a', 'wi-b', 'wi-c'] }: { titles?: string[] }) {
  out = useTaskActions(host);
  return (
    <div>
      <h1 ref={headingRef} tabIndex={-1}>
        Tasks
      </h1>
      {titles.map((id) => (
        <a key={id} href="#x" data-testid={`tasks-title-${id}`}>
          {id}
        </a>
      ))}
      <a href="#m" data-testid="tasks-title-mobile-wi-b">
        mobile b
      </a>
    </div>
  );
}

function mount(titles?: string[]) {
  return render(
    <ToastProvider>
      <ToastList />
      <MemoryRouter>
        <Harness titles={titles} />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(async () => {
  if (!useTaskActions) ({ useTaskActions } = await import('./useTaskActions.js'));
  for (const fn of [mockDeleteWorkItem, mockUpdateWorkItem, mockChangeStatus, mockUndo]) {
    fn.mockReset();
  }
  mockDeleteWorkItem.mockResolvedValue(undefined as never);
  mockUpdateWorkItem.mockResolvedValue({} as never);
  mockChangeStatus.mockResolvedValue({ record: {} as never, undo: null });
  mockUndo.mockResolvedValue({} as never);
  host.refreshRows.mockReset();
  host.refreshRows.mockResolvedValue({ lateCount: null });
  host.refresh.mockReset();
  host.queryKey.mockReset();
  host.queryKey.mockReturnValue('q1');
});

describe('row status changes', () => {
  it('Start sends the status and date, refreshes the row and announces it', async () => {
    mount();
    await act(() => out.actions.applyStatus(A, 'in_progress', '2026-06-01'));
    expect(mockChangeStatus).toHaveBeenCalledWith(
      'wi-a',
      expect.objectContaining({ status: 'in_progress', date: '2026-06-01' }),
    );
    expect(host.refreshRows).toHaveBeenCalledWith(['wi-a']);
    expect(out.announcement).toEqual({ key: 1, text: 'Pour the slab started.' });
  });

  it('Mark done announces it, with "Late now n." only when the Late count is known', async () => {
    mount();
    host.refreshRows.mockResolvedValue({ lateCount: 2 });
    await act(() => out.actions.applyStatus(B, 'completed', null));
    expect(out.announcement).toEqual({
      key: 1,
      text: 'Frame the walls marked done. Late now 2.',
    });
    host.refreshRows.mockResolvedValue({ lateCount: 0 });
    await act(() => out.actions.applyStatus(B, 'completed', null));
    expect(out.announcement).toEqual({
      key: 2,
      text: 'Frame the walls marked done. Late now 0.',
    });
    host.refreshRows.mockResolvedValue(null);
    await act(() => out.actions.applyStatus(B, 'completed', null));
    expect(out.announcement).toEqual({ key: 3, text: 'Frame the walls marked done.' });
  });

  it('Reopen moves a done task back to In progress without a date', async () => {
    mount();
    await act(() => out.actions.reopen(C));
    expect(mockChangeStatus).toHaveBeenCalledWith(
      'wi-c',
      expect.objectContaining({ status: 'in_progress', date: null }),
    );
    expect(out.announcement?.text).toBe('Hang the doors reopened.');
  });

  it('offers Undo, which reverts and reloads the list', async () => {
    mockChangeStatus.mockResolvedValue({
      record: {} as never,
      undo: { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' },
    });
    mount();
    await act(() => out.actions.applyStatus(A, 'in_progress', null));
    await userEvent.click(await screen.findByTestId('toast-undo-button'));
    await waitFor(() => expect(mockUndo).toHaveBeenCalledWith('tok-1'));
    await waitFor(() => expect(host.refresh).toHaveBeenCalledTimes(1));
  });

  it('a failed change toasts the error and leaves the list alone', async () => {
    mockChangeStatus.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    mount();
    await act(() => out.actions.applyStatus(A, 'in_progress', null));
    expect(await screen.findByTestId('toast-error')).toBeInTheDocument();
    expect(host.refreshRows).not.toHaveBeenCalled();
    expect(out.announcement).toBeNull();
  });
});

describe('bulk', () => {
  it('Set status skips tasks already in that status; nothing eligible just clears', async () => {
    mount();
    const clear = jest.fn();
    await act(() => out.actions.bulkSetStatus([A], 'not_started', clear));
    expect(clear).toHaveBeenCalledTimes(1);
    expect(mockUpdateWorkItem).not.toHaveBeenCalled();
    expect(host.refreshRows).not.toHaveBeenCalled();
    expect(out.bulkError).toBeNull();
  });

  it('all succeed: refreshes the changed rows, announces, clears and focuses the first untouched title', async () => {
    mount();
    const clear = jest.fn();
    host.refreshRows.mockResolvedValue({ lateCount: 1 });
    await act(() => out.actions.bulkSetStatus([A, B, C], 'completed', clear));
    expect(mockUpdateWorkItem).toHaveBeenCalledTimes(2);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-a', { status: 'completed' });
    expect(host.refreshRows).toHaveBeenCalledWith(['wi-a', 'wi-b']);
    expect(out.announcement?.text).toBe('2 of 2 updated. Late now 1.');
    expect(clear).toHaveBeenCalledTimes(1);
    // wi-a and wi-b were acted on; wi-c is the first title that was not.
    expect(screen.getByTestId('tasks-title-wi-c')).toHaveFocus();
  });

  it('focus skips a title that refuses it (hidden surface) and falls back to the h1', async () => {
    mount();
    const refusing = screen.getByTestId('tasks-title-wi-c');
    refusing.focus = () => undefined;
    const mobile = screen.getByTestId('tasks-title-mobile-wi-b');
    // wi-b is acted on (its mobile twin too); wi-c refuses focus
    await act(() => out.actions.bulkSetStatus([A, B], 'completed', jest.fn()));
    expect(refusing).not.toHaveFocus();
    expect(mobile).not.toHaveFocus();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  it('focus lands on the next title that does accept it after one that refuses', async () => {
    mount(['wi-a', 'wi-b', 'wi-c', 'wi-d']);
    screen.getByTestId('tasks-title-wi-c').focus = () => undefined;
    await act(() => out.actions.bulkSetStatus([A, B], 'completed', jest.fn()));
    expect(screen.getByTestId('tasks-title-wi-d')).toHaveFocus();
  });

  it('partial failure keeps the selection, shows the banner and announces it', async () => {
    mockUpdateWorkItem.mockImplementation((id) =>
      id === 'wi-b' ? Promise.reject(new Error('boom')) : Promise.resolve({} as never),
    );
    mount();
    const clear = jest.fn();
    await act(() => out.actions.bulkSetStatus([A, B], 'completed', clear));
    expect(host.refreshRows).toHaveBeenCalledWith(['wi-a']);
    expect(clear).not.toHaveBeenCalled();
    expect(out.announcement?.text).toBe("1 of 2 updated. The others couldn't be changed.");
    expect(out.bulkError).toBe("1 of 2 updated. The others couldn't be changed.");
  });

  it('the banner belongs to its query and returns with it; the next run clears it', async () => {
    mockUpdateWorkItem.mockRejectedValueOnce(new Error('boom'));
    const view = mount();
    await act(() => out.actions.bulkSetStatus([A], 'completed', jest.fn()));
    expect(out.bulkError).not.toBeNull();
    host.queryKey.mockReturnValue('q2');
    view.rerender(
      <ToastProvider>
        <ToastList />
        <MemoryRouter>
          <Harness />
        </MemoryRouter>
      </ToastProvider>,
    );
    expect(out.bulkError).toBeNull();
    await act(() => out.actions.bulkSetStatus([A], 'completed', jest.fn()));
    host.queryKey.mockReturnValue('q1');
    view.rerender(
      <ToastProvider>
        <ToastList />
        <MemoryRouter>
          <Harness />
        </MemoryRouter>
      </ToastProvider>,
    );
    expect(out.bulkError).toBeNull();
  });

  it('Set area skips tasks already in that area and sends the area id', async () => {
    mount();
    const clear = jest.fn();
    await act(() => out.actions.bulkSetArea([A, C], 'area-kitchen', clear));
    expect(mockUpdateWorkItem).toHaveBeenCalledTimes(1);
    expect(mockUpdateWorkItem).toHaveBeenCalledWith('wi-a', { areaId: 'area-kitchen' });
    expect(out.announcement?.text).toBe('1 of 1 updated.');
  });
});

describe('delete', () => {
  const NO_ITEM: WorkItemListRow | null = null;

  it('opens, cancels and ignores a confirm with no task', async () => {
    mount();
    expect(out.deletion.item).toBe(NO_ITEM);
    act(() => out.deletion.confirm());
    expect(mockDeleteWorkItem).not.toHaveBeenCalled();
    act(() => out.actions.requestDelete(A));
    expect(out.deletion.item).toBe(A);
    act(() => out.deletion.cancel());
    expect(out.deletion.item).toBeNull();
  });

  it('deletes, closes the dialog, then refreshes the row away', async () => {
    mount();
    act(() => out.actions.requestDelete(A));
    await act(async () => out.deletion.confirm());
    await waitFor(() => expect(host.refreshRows).toHaveBeenCalledWith(['wi-a']));
    expect(mockDeleteWorkItem).toHaveBeenCalledWith('wi-a');
    expect(out.deletion.item).toBeNull();
    expect(out.deletion.busy).toBe(false);
  });

  it('cannot be cancelled while the request is running', async () => {
    let finish: () => void = () => undefined;
    mockDeleteWorkItem.mockReturnValue(
      new Promise<never>((resolve) => (finish = () => resolve(undefined as never))),
    );
    mount();
    act(() => out.actions.requestDelete(A));
    act(() => out.deletion.confirm());
    await waitFor(() => expect(out.deletion.busy).toBe(true));
    act(() => out.deletion.cancel());
    expect(out.deletion.item).toBe(A);
    await act(async () => finish());
    await waitFor(() => expect(out.deletion.item).toBeNull());
  });

  it('a 409 blocks the delete and shows the translated error', async () => {
    mockDeleteWorkItem.mockRejectedValue(
      new ApiClientError(409, { code: 'CONFLICT', message: 'x' }),
    );
    mount();
    act(() => out.actions.requestDelete(A));
    await act(async () => out.deletion.confirm());
    await waitFor(() => expect(out.deletion.blocked).toBe(true));
    expect(out.deletion.error).toEqual(expect.any(String));
    expect(out.deletion.item).toBe(A);
    expect(host.refreshRows).not.toHaveBeenCalled();
    // opening it again resets the block
    act(() => out.actions.requestDelete(B));
    expect(out.deletion.blocked).toBe(false);
    expect(out.deletion.error).toBeNull();
  });

  it('another API error keeps the dialog usable', async () => {
    mockDeleteWorkItem.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    mount();
    act(() => out.actions.requestDelete(A));
    await act(async () => out.deletion.confirm());
    await waitFor(() => expect(out.deletion.error).not.toBeNull());
    expect(out.deletion.blocked).toBe(false);
  });

  it('a network failure and an unexpected failure get their own messages', async () => {
    mockDeleteWorkItem.mockRejectedValueOnce(new NetworkError('offline', null));
    mount();
    act(() => out.actions.requestDelete(A));
    await act(async () => out.deletion.confirm());
    await waitFor(() =>
      expect(out.deletion.error).toBe(
        "Can't reach the server. Check your connection and try again.",
      ),
    );
    mockDeleteWorkItem.mockRejectedValueOnce(new Error('weird'));
    await act(async () => out.deletion.confirm());
    await waitFor(() =>
      expect(out.deletion.error).toBe('An unexpected error occurred. Please try again.'),
    );
  });
});
