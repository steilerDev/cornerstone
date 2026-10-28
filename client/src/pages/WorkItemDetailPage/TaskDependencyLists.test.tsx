/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { WorkItemPageDetail } from '@cornerstone/shared';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeDependency, makeTaskPage } from '../../test/taskPageFixtures.js';
import { OriginProbe, probedOrigin } from '../../test/originProbe.js';
import { ToastView } from '../../test/toastView.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as DependenciesApiTypes from '../../lib/dependenciesApi.js';
import type * as UndoApiTypes from '../../lib/undoApi.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as ListsModule from './TaskDependencyLists.js';

const mockDeleteDependency = jest.fn<typeof DependenciesApiTypes.deleteDependency>();
const mockCreateDependency = jest.fn<typeof DependenciesApiTypes.createDependency>();
const mockUpdateDependency = jest.fn<typeof DependenciesApiTypes.updateDependency>();
const mockUndoChange = jest.fn<typeof UndoApiTypes.undoChange>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();

jest.unstable_mockModule('../../lib/dependenciesApi.js', () => ({
  deleteDependency: mockDeleteDependency,
  createDependency: mockCreateDependency,
  updateDependency: mockUpdateDependency,
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: mockUndoChange }));
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Lists: typeof ListsModule;
const refresh = jest.fn<() => Promise<void>>();
const ORIGIN = { origin: { to: '/project/work-items/wi-1?tab=timing', name: 'Pour slab' } };
const UNDO = { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' };

const TASK: WorkItemPageDetail = makeTaskPage({
  dependencies: {
    predecessors: [
      makeDependency('p1', {
        workItem: { title: 'Dig trench', status: 'completed' },
        leadLagDays: 3,
      }),
      makeDependency('p2', {
        workItem: { title: 'Order pipes' },
        dependencyType: 'start_to_start',
        leadLagDays: -2,
      }),
    ],
    successors: [makeDependency('s1', { workItem: { title: 'Pour slab later' } })],
  },
});

function renderLists(task = TASK) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/project/work-items/wi-1']}>
        <OriginProbe />
        <Lists.TaskDependencyLists
          task={task}
          refresh={refresh}
          originState={ORIGIN}
          headingRef={{ current: null }}
        />
        <ToastView />
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function removeRow(listId: string, rowId: string) {
  fireEvent.click(screen.getByTestId(`${listId}-actions-${rowId}`));
  const item = await screen.findByTestId(`${listId}-remove-${rowId}`);
  await act(async () => {
    fireEvent.click(item);
  });
}

describe('TaskDependencyLists', () => {
  beforeEach(async () => {
    for (const mock of [
      mockDeleteDependency,
      mockCreateDependency,
      mockUpdateDependency,
      mockUndoChange,
      mockListWorkItems,
      refresh,
    ]) {
      mock.mockReset();
    }
    mockDeleteDependency.mockResolvedValue({ undo: UNDO } as never);
    mockUndoChange.mockResolvedValue({} as never);
    mockListWorkItems.mockResolvedValue({ items: [] } as never);
    refresh.mockResolvedValue(undefined);
    if (!Lists) Lists = await import('./TaskDependencyLists.js');
  });

  it('titles the lists "Waits for" and "Waiting for this task" (never a second "Holds up")', () => {
    renderLists();
    expect(within(screen.getByTestId('task-waits-for')).getByRole('heading')).toHaveTextContent(
      /^Waits for/,
    );
    expect(within(screen.getByTestId('task-waiting')).getByRole('heading')).toHaveTextContent(
      /^Waiting for this task/,
    );
    expect(screen.queryByText(/^Holds up/)).toBeNull();
  });

  it('lists each task with its relation wording and its lag or lead', () => {
    renderLists();
    const first = screen.getByTestId('task-waits-for-row-p1');
    expect(first).toHaveTextContent('Dig trench');
    expect(first).toHaveTextContent('Finishes before this starts · 3 days later');
    const second = screen.getByTestId('task-waits-for-row-p2');
    expect(second).toHaveTextContent('Starts before this starts · 2 days earlier');
    const waiting = screen.getByTestId('task-waiting-row-s1');
    expect(waiting).toHaveTextContent('Starts after this finishes');
    expect(waiting).not.toHaveTextContent('·');
  });

  it('uses the singular for one day', () => {
    renderLists(
      makeTaskPage({
        dependencies: {
          predecessors: [
            makeDependency('p1', { leadLagDays: 1 }),
            makeDependency('p2', { leadLagDays: -1 }),
          ],
          successors: [],
        },
      }),
    );
    expect(screen.getByTestId('task-waits-for-row-p1')).toHaveTextContent('1 day later');
    expect(screen.getByTestId('task-waits-for-row-p2')).toHaveTextContent('1 day earlier');
  });

  it('links each row to the other task and carries the origin', () => {
    renderLists();
    const link = screen.getByTestId('task-waits-for-link-p1');
    expect(link).toHaveAttribute('href', '/project/work-items/p1');
    fireEvent.click(link);
    expect(probedOrigin()).toEqual(ORIGIN.origin);
  });

  it('shows the empty sentences for tasks with no relations', () => {
    renderLists(makeTaskPage());
    expect(screen.getByText("This task doesn't wait for another task.")).toBeInTheDocument();
    expect(screen.getByText('No task waits for this one.')).toBeInTheDocument();
  });

  it('removes a "Waits for" row as predecessor p1 of this task, refreshes and offers Undo', async () => {
    renderLists();
    await removeRow('task-waits-for', 'p1');
    expect(mockDeleteDependency).toHaveBeenCalledWith('wi-1', 'p1');
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(await screen.findByTestId('toast-undo'));
    });
    expect(mockUndoChange).toHaveBeenCalledWith('tok-1');
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });

  it('removes a "Waiting for this task" row with the roles swapped', async () => {
    renderLists();
    await removeRow('task-waiting', 's1');
    expect(mockDeleteDependency).toHaveBeenCalledWith('s1', 'wi-1');
  });

  it('opens the Add dialog for the list, titled by its direction, and returns focus on Cancel', async () => {
    renderLists();
    const add = screen.getByTestId('task-waiting-add');
    fireEvent.click(add);
    expect(
      await screen.findByRole('dialog', { name: 'Add a task that waits for this one' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dependency-form-cancel'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(add).toHaveFocus();
    fireEvent.click(screen.getByTestId('task-waits-for-add'));
    expect(
      await screen.findByRole('dialog', { name: 'Add a task this one waits for' }),
    ).toBeInTheDocument();
  });

  it('opens Edit with the row current type and lag, and saves it for this task as successor', async () => {
    mockUpdateDependency.mockResolvedValue({} as never);
    renderLists();
    fireEvent.click(screen.getByTestId('task-waits-for-edit-p1'));
    const dialog = await screen.findByRole('dialog', { name: /Dig trench/ });
    expect(within(dialog).getByRole('spinbutton')).toHaveValue(3);
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '5' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('dependency-form-save'));
    });
    await waitFor(() =>
      expect(mockUpdateDependency).toHaveBeenCalledWith('wi-1', 'p1', {
        dependencyType: 'finish_to_start',
        leadLagDays: 5,
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('Edit on a "Waiting for this task" row addresses the other task as successor', async () => {
    mockUpdateDependency.mockResolvedValue({} as never);
    renderLists();
    fireEvent.click(screen.getByTestId('task-waiting-edit-s1'));
    await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(screen.getByTestId('dependency-form-save'));
    });
    await waitFor(() =>
      expect(mockUpdateDependency).toHaveBeenCalledWith('s1', 'wi-1', expect.anything()),
    );
  });

  it('moves focus to the list Add button when the dialog closes and its empty-state opener is gone', async () => {
    const tree = (task: WorkItemPageDetail) => (
      <ToastProvider>
        <MemoryRouter>
          <Lists.TaskDependencyLists
            task={task}
            refresh={refresh}
            originState={ORIGIN}
            headingRef={{ current: null }}
          />
        </MemoryRouter>
      </ToastProvider>
    );
    const { rerender } = render(tree(makeTaskPage()));
    const empty = within(screen.getByTestId('task-waits-for')).getByRole('button', { name: 'Add' });
    fireEvent.click(empty);
    await screen.findByRole('dialog');
    // the first row arrives while the dialog is open: the empty-state button is replaced
    rerender(tree(TASK));
    expect(empty.isConnected).toBe(false);
    fireEvent.click(screen.getByTestId('dependency-form-cancel'));
    await waitFor(() => expect(screen.getByTestId('task-waits-for-add')).toHaveFocus());
  });
});
