/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { WorkItemMilestones } from '@cornerstone/shared';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeTaskPage } from '../../test/taskPageFixtures.js';
import { ToastView } from '../../test/toastView.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import type * as LinkApiTypes from '../../lib/workItemMilestonesApi.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as UndoApiTypes from '../../lib/undoApi.js';
import type * as ListModule from './TaskMilestoneList.js';

const mockRemoveRequired = jest.fn<typeof LinkApiTypes.removeRequiredMilestone>();
const mockRemoveLinked = jest.fn<typeof LinkApiTypes.removeLinkedMilestone>();
const mockAddRequired = jest.fn<typeof LinkApiTypes.addRequiredMilestone>();
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockUndoChange = jest.fn<typeof UndoApiTypes.undoChange>();
jest.unstable_mockModule('../../lib/workItemMilestonesApi.js', () => ({
  removeRequiredMilestone: mockRemoveRequired,
  removeLinkedMilestone: mockRemoveLinked,
  addRequiredMilestone: mockAddRequired,
  addLinkedMilestone: jest.fn(),
}));
jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestones: mockListMilestones,
}));
jest.unstable_mockModule('../../lib/undoApi.js', () => ({ undoChange: mockUndoChange }));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let List: typeof ListModule;
const refresh = jest.fn<() => Promise<void>>();
const reload = jest.fn<() => Promise<void>>();
const ORIGIN = { origin: { to: '/project/work-items/wi-1?tab=timing' } };
const UNDO = { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' };

const MILESTONES: WorkItemMilestones = {
  required: [{ id: 4, name: 'Roof closed', targetDate: '2026-05-01' }],
  linked: [
    { id: 4, name: 'Roof closed', targetDate: null },
    { id: 9, name: 'Shell finished', targetDate: '2026-07-15' },
  ],
};

function renderList(
  props: { milestones?: WorkItemMilestones | null; failure?: FetchFailure | null } = {},
) {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <List.TaskMilestoneList
          task={makeTaskPage()}
          refresh={refresh}
          originState={ORIGIN}
          headingRef={{ current: null }}
          milestones={props.milestones === undefined ? MILESTONES : props.milestones}
          failure={props.failure ?? null}
          reload={reload}
        />
        <ToastView />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('TaskMilestoneList', () => {
  beforeEach(async () => {
    installMatchMedia({ '(min-width: 768px)': true });
    for (const mock of [
      mockRemoveRequired,
      mockRemoveLinked,
      mockAddRequired,
      mockListMilestones,
      mockUndoChange,
      refresh,
      reload,
    ]) {
      mock.mockReset();
    }
    mockRemoveRequired.mockResolvedValue({ undo: UNDO } as never);
    mockRemoveLinked.mockResolvedValue({ undo: UNDO } as never);
    mockUndoChange.mockResolvedValue({} as never);
    mockAddRequired.mockResolvedValue(undefined);
    mockListMilestones.mockResolvedValue([
      { id: 12, title: 'Windows in', targetDate: '2026-08-01' },
    ] as never);
    refresh.mockResolvedValue(undefined);
    reload.mockResolvedValue(undefined);
    if (!List) List = await import('./TaskMilestoneList.js');
  });

  it('names the relation in words on every row, with the date when there is one', () => {
    renderList();
    expect(screen.getByTestId('task-milestones-row-required:4')).toHaveTextContent('Waits for · ');
    expect(screen.getByTestId('task-milestones-row-required:4')).toHaveTextContent('2026');
    const counts = screen.getByTestId('task-milestones-row-linked:9');
    expect(counts).toHaveTextContent('Counts toward · ');
    // a milestone the task both waits for and counts toward keeps two distinct rows
    const dateless = screen.getByTestId('task-milestones-row-linked:4');
    expect(dateless).toHaveTextContent(/Counts toward/);
    expect(dateless).not.toHaveTextContent('·');
  });

  it('links each row to the milestone page with the origin', () => {
    renderList();
    expect(screen.getByTestId('task-milestones-link-linked:9')).toHaveAttribute(
      'href',
      '/project/milestones/9',
    );
  });

  it('shows the empty sentence', () => {
    renderList({ milestones: { required: [], linked: [] } });
    expect(screen.getByText('Not linked to a milestone.')).toBeInTheDocument();
  });

  it('shows nothing of the list while loading', () => {
    renderList({ milestones: null });
    expect(screen.queryByTestId('task-milestones-row-required:4')).toBeNull();
  });

  it('shows a load failure with Retry that reloads', () => {
    renderList({ milestones: null, failure: { kind: 'other' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('translates an API failure code', () => {
    renderList({
      milestones: null,
      failure: { kind: 'api', code: 'NOT_FOUND', notFound: true },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/.+/);
  });

  it('removes a waits-for row through the required endpoint, reloads both and undoes', async () => {
    renderList();
    fireEvent.click(screen.getByTestId('task-milestones-actions-required:4'));
    await act(async () => {
      fireEvent.click(await screen.findByTestId('task-milestones-remove-required:4'));
    });
    expect(mockRemoveRequired).toHaveBeenCalledWith('wi-1', 4);
    expect(mockRemoveLinked).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(await screen.findByTestId('toast-undo'));
    });
    expect(mockUndoChange).toHaveBeenCalledWith('tok-1');
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('removes a counts-toward row through the linked endpoint', async () => {
    renderList();
    fireEvent.click(screen.getByTestId('task-milestones-actions-linked:9'));
    await act(async () => {
      fireEvent.click(await screen.findByTestId('task-milestones-remove-linked:9'));
    });
    expect(mockRemoveLinked).toHaveBeenCalledWith('wi-1', 9);
    expect(mockRemoveRequired).not.toHaveBeenCalled();
  });

  it('opens the Link milestone dialog, offers the unlinked milestones and reloads after saving', async () => {
    renderList();
    const button = screen.getByTestId('task-milestones-add');
    fireEvent.click(button);
    expect(await screen.findByRole('dialog', { name: 'Link milestone' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('textbox'));
    fireEvent.click(await screen.findByRole('option', { name: /Windows in/ }));
    await act(async () => {
      fireEvent.click(screen.getByTestId('milestone-link-form-save'));
    });
    await waitFor(() => expect(mockAddRequired).toHaveBeenCalledWith('wi-1', 12));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(reload).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(button).toHaveFocus();
  });

  it('does not open the dialog before the milestones are loaded', () => {
    renderList({ milestones: null });
    expect(screen.queryByTestId('task-milestones-add')).toBeNull();
  });

  it('moves focus to the list Add button when the dialog closes and its empty-state opener is gone', async () => {
    const tree = (milestones: WorkItemMilestones) => (
      <ToastProvider>
        <MemoryRouter>
          <List.TaskMilestoneList
            task={makeTaskPage()}
            refresh={refresh}
            originState={ORIGIN}
            headingRef={{ current: null }}
            milestones={milestones}
            failure={null}
            reload={reload}
          />
        </MemoryRouter>
      </ToastProvider>
    );
    const { rerender } = render(tree({ required: [], linked: [] }));
    const empty = screen.getByRole('button', { name: 'Link milestone' });
    fireEvent.click(empty);
    await screen.findByRole('dialog');
    rerender(tree(MILESTONES));
    expect(empty.isConnected).toBe(false);
    fireEvent.click(screen.getByTestId('milestone-link-form-cancel'));
    await waitFor(() => expect(screen.getByTestId('task-milestones-add')).toHaveFocus());
  });
});
