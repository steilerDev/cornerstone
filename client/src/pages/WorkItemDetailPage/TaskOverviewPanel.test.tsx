/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NoteResponse, WorkItemPageDetail } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeTaskPage } from '../../test/taskPageFixtures.js';
import type { UseAreasResult } from '../../hooks/useAreas.js';
import type * as NotesApiTypes from '../../lib/notesApi.js';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as SubtasksApiTypes from '../../lib/subtasksApi.js';
import type * as PanelModule from './TaskOverviewPanel.js';
import type { SectionCardController } from '../../components/SectionCard/SectionCard.js';

const mockListNotes = jest.fn<typeof NotesApiTypes.listNotes>();
const mockCreateNote = jest.fn<typeof NotesApiTypes.createNote>();
const mockDeleteNote = jest.fn<typeof NotesApiTypes.deleteNote>();
const mockUpdateNote = jest.fn<typeof NotesApiTypes.updateNote>();
const mockListUsers = jest.fn<typeof UsersApiTypes.listUsers>();
const mockDeleteSubtask = jest.fn<typeof SubtasksApiTypes.deleteSubtask>();
const mockCreateSubtask = jest.fn<typeof SubtasksApiTypes.createSubtask>();
const mockUseAreas = jest.fn<() => UseAreasResult>();

jest.unstable_mockModule('../../lib/notesApi.js', () => ({
  listNotes: mockListNotes,
  createNote: mockCreateNote,
  deleteNote: mockDeleteNote,
  updateNote: mockUpdateNote,
}));
jest.unstable_mockModule('../../lib/usersApi.js', () => ({ listUsers: mockListUsers }));
jest.unstable_mockModule('../../lib/subtasksApi.js', () => ({
  createSubtask: mockCreateSubtask,
  updateSubtask: jest.fn(),
  deleteSubtask: mockDeleteSubtask,
  reorderSubtasks: jest.fn(),
}));
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  updateWorkItem: jest.fn(),
  listWorkItems: jest.fn(),
}));
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  searchCompanies: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  fetchVendor: jest.fn(),
}));
jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  searchEverywhere: jest.fn<() => Promise<unknown>>().mockResolvedValue({ query: '', groups: [] }),
}));
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({ useAreas: mockUseAreas }));
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: { id: 'u-me', role: 'admin' } }),
}));
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let Panel: typeof PanelModule;

const note = (id: string, content: string, createdAt: string): NoteResponse => ({
  id,
  content,
  createdBy: { id: 'u-me', displayName: 'Me' },
  createdAt,
  updatedAt: createdAt,
});
const subtask = (id: string, title: string) => ({
  id,
  title,
  isCompleted: false,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

let notesOnServer: NoteResponse[] = [];
const refreshSpy = jest.fn<() => void>();

function Host({
  initial,
  detailsRef,
  whoWhereRef,
}: {
  initial: WorkItemPageDetail;
  detailsRef?: React.RefObject<SectionCardController | null>;
  whoWhereRef?: React.RefObject<SectionCardController | null>;
}) {
  const [revision, setRevision] = useState(0);
  const [task, setTask] = useState(initial);
  const headingRef = useRef<HTMLHeadingElement>(null);
  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} data-testid="page-h1">
        Pour slab
      </h1>
      <button
        type="button"
        data-testid="set-subtasks"
        onClick={() => setTask((c) => ({ ...c, subtasks: [] }))}
      />
      <Panel.TaskOverviewPanel
        task={task}
        revision={revision}
        refresh={async () => {
          refreshSpy();
          // the page refresh: the deleted subtask is gone from the next record
          setTask((current) => ({ ...current, subtasks: [...serverSubtasks] }));
          setRevision((value) => value + 1);
        }}
        originState={{ origin: { to: '/x' } }}
        headingRef={headingRef}
        detailsCardRef={detailsRef ?? null}
        whoWhereCardRef={whoWhereRef ?? null}
      />
    </>
  );
}
let serverSubtasks: ReturnType<typeof subtask>[] = [];

function renderPanel(task: WorkItemPageDetail = makeTaskPage()) {
  serverSubtasks = [...task.subtasks] as typeof serverSubtasks;
  return render(
    <MemoryRouter>
      <Host initial={task} />
    </MemoryRouter>,
  );
}

const addMenu = () => screen.getByTestId('task-add-menu');
async function openAdd() {
  fireEvent.click(await screen.findByRole('button', { name: 'Add to this task' }));
}
const itemNames = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

describe('TaskOverviewPanel', () => {
  beforeEach(async () => {
    installMatchMedia({ '(min-width: 768px)': true });
    for (const mock of [
      mockListNotes,
      mockCreateNote,
      mockDeleteNote,
      mockUpdateNote,
      mockListUsers,
      mockDeleteSubtask,
      refreshSpy,
    ]) {
      mock.mockReset();
    }
    serverSubtasks = [];
    notesOnServer = [];
    mockListNotes.mockImplementation(async () => ({ notes: notesOnServer }) as never);
    mockListUsers.mockResolvedValue({
      users: [
        { id: 'u-1', displayName: 'Pat Sample', email: 'pat@example.test' },
        {
          id: 'u-2',
          displayName: 'Gone Member',
          email: 'gone@example.test',
          deactivatedAt: '2026-01-01',
        },
      ],
    } as never);
    mockCreateNote.mockImplementation(async (_id, body) => {
      const created = note('n-new', body.content, '2026-03-05T10:00:00.000Z');
      notesOnServer = [created, ...notesOnServer];
      return created;
    });
    mockDeleteNote.mockImplementation(async (_id, noteId) => {
      notesOnServer = notesOnServer.filter((n) => n.id !== noteId);
    });
    mockDeleteSubtask.mockImplementation(async (_id, subtaskId) => {
      serverSubtasks = serverSubtasks.filter((item) => item.id !== subtaskId);
    });
    mockCreateSubtask.mockImplementation(async (_id, body) => {
      const created = subtask('s-new', body.title);
      serverSubtasks = [...serverSubtasks, created];
      return created as never;
    });
    mockUseAreas.mockReturnValue({
      areas: [],
      isLoading: false,
      error: null,
    } as unknown as UseAreasResult);
    if (!Panel) Panel = await import('./TaskOverviewPanel.js');
  });

  it('shows Details and Who and where, and no Checklist or Notes card for a bare task', async () => {
    renderPanel();
    expect(screen.getByTestId('section-task-details')).toBeInTheDocument();
    expect(screen.getByTestId('section-task-who-where')).toBeInTheDocument();
    await waitFor(() => expect(mockListNotes).toHaveBeenCalledWith('wi-1'));
    expect(screen.queryByTestId('section-task-checklist')).toBeNull();
    expect(screen.queryByTestId('section-task-notes')).toBeNull();
  });

  describe('notes', () => {
    it('loads them newest first', async () => {
      notesOnServer = [
        note('n-old', 'Old one', '2026-01-01T10:00:00.000Z'),
        note('n-new', 'New one', '2026-03-01T10:00:00.000Z'),
      ];
      renderPanel();
      const card = await screen.findByTestId('section-task-notes');
      const rows = card.querySelectorAll('[data-testid^="task-note-n"]');
      expect(Array.from(rows).map((row) => row.getAttribute('data-testid'))).toEqual([
        'task-note-n-new',
        'task-note-n-old',
      ]);
    });

    it('loads them again on every page refresh (revision)', async () => {
      renderPanel(makeTaskPage({ subtasks: [subtask('s1', 'Order gravel')] }));
      await waitFor(() => expect(mockListNotes).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('section-task-notes')).toBeNull();
      notesOnServer = [note('n1', 'Late note', '2026-03-01T10:00:00.000Z')];
      // ticking a checklist item refreshes the page
      await act(async () => {
        fireEvent.click(screen.getByRole('checkbox', { name: 'Order gravel' }));
      });
      expect(await screen.findByTestId('task-note-n1')).toBeInTheDocument();
      expect(mockListNotes).toHaveBeenCalledTimes(2);
    });

    it('shows a load failure with Retry, and Retry loads the notes', async () => {
      mockListNotes.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      notesOnServer = [note('n1', 'Hello', '2026-03-01T10:00:00.000Z')];
      renderPanel();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.queryByTestId('task-add-menu')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /Retry|Try again/ }));
      expect(await screen.findByTestId('task-note-n1')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('uses the fallback sentence for a non-API notes failure', async () => {
      mockListNotes.mockRejectedValueOnce(new Error('down'));
      renderPanel();
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the notes.");
    });

    it('ignores a notes failure after unmount', async () => {
      let reject!: (error: Error) => void;
      mockListNotes.mockReturnValueOnce(new Promise((_res, rej) => (reject = rej)));
      const { unmount } = renderPanel();
      unmount();
      await act(async () => reject(new Error('late')));
    });

    it('ignores notes that arrive after unmount', async () => {
      let resolve!: (value: never) => void;
      mockListNotes.mockReturnValueOnce(new Promise((res) => (resolve = res)));
      const { unmount } = renderPanel();
      unmount();
      await act(async () => resolve({ notes: [] } as never));
    });
  });

  describe('Add menu', () => {
    it('is hidden until the notes have loaded', async () => {
      let resolve!: (value: never) => void;
      mockListNotes.mockReturnValueOnce(new Promise((res) => (resolve = res)));
      renderPanel();
      expect(screen.queryByTestId('task-add-menu')).toBeNull();
      await act(async () => resolve({ notes: [] } as never));
      expect(addMenu()).toBeInTheDocument();
    });

    it('offers both items for a task with neither', async () => {
      renderPanel();
      await openAdd();
      expect(itemNames()).toEqual(['Checklist item', 'Note']);
    });

    it('offers only the missing one, and nothing when both exist', async () => {
      notesOnServer = [note('n1', 'Hello', '2026-03-01T10:00:00.000Z')];
      const { unmount } = renderPanel(makeTaskPage({ subtasks: [] }));
      await screen.findByTestId('task-note-n1');
      await openAdd();
      expect(itemNames()).toEqual(['Checklist item']);
      unmount();
      notesOnServer = [];
      renderPanel(makeTaskPage({ subtasks: [subtask('s1', 'Order gravel')] }));
      await openAdd();
      expect(itemNames()).toEqual(['Note']);
    });

    it('is not rendered when the task has both a checklist and notes', async () => {
      notesOnServer = [note('n1', 'Hello', '2026-03-01T10:00:00.000Z')];
      renderPanel(makeTaskPage({ subtasks: [subtask('s1', 'Order gravel')] }));
      await screen.findByTestId('task-note-n1');
      expect(screen.queryByTestId('task-add-menu')).toBeNull();
    });

    it('Checklist item shows the empty checklist card with its add field focused', async () => {
      renderPanel();
      await openAdd();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Checklist item' }));
      expect(await screen.findByTestId('section-task-checklist')).toBeInTheDocument();
      expect(screen.getByTestId('task-checklist-add-input')).toHaveFocus();
      await openAdd();
      expect(itemNames()).toEqual(['Note']);
    });

    it('Note opens the Add note dialog; saving shows the Notes card and focuses "Add note"', async () => {
      notesOnServer = [];
      renderPanel(makeTaskPage({ subtasks: [subtask('s1', 'Order gravel')] }));
      await openAdd();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Note' }));
      fireEvent.change(await screen.findByTestId('note-form-content'), {
        target: { value: 'Call the supplier' },
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId('note-form-save'));
      });
      expect(await screen.findByTestId('task-note-n-new')).toBeInTheDocument();
      expect(mockCreateNote).toHaveBeenCalledWith('wi-1', { content: 'Call the supplier' });
      await waitFor(() => expect(screen.getByTestId('task-notes-add')).toHaveFocus());
      expect(screen.queryByTestId('task-add-menu')).toBeNull();
    });

    it('cancelling the Add note dialog changes nothing', async () => {
      renderPanel();
      await openAdd();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Note' }));
      fireEvent.click(await screen.findByTestId('note-form-cancel'));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(mockCreateNote).not.toHaveBeenCalled();
      expect(screen.queryByTestId('section-task-notes')).toBeNull();
    });

    it('editing a note from its menu does not move focus to Add note', async () => {
      notesOnServer = [note('n1', 'Hello', '2026-03-01T10:00:00.000Z')];
      mockUpdateNote.mockResolvedValue(notesOnServer[0]!);
      renderPanel();
      await screen.findByTestId('task-note-n1');
      fireEvent.click(screen.getByRole('button', { name: /^Actions for the note/ }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
      expect(((await screen.findByTestId('note-form-content')) as HTMLTextAreaElement).value).toBe(
        'Hello',
      );
      await act(async () => {
        fireEvent.click(screen.getByTestId('note-form-save'));
      });
      await waitFor(() => expect(mockUpdateNote).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getByTestId('task-notes-add')).not.toHaveFocus();
    });
  });

  describe('focus after the last item goes', () => {
    it('last checklist item added from the Add menu, then deleted: focus moves to the Add menu', async () => {
      renderPanel();
      await openAdd();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Checklist item' }));
      fireEvent.change(await screen.findByTestId('task-checklist-add-input'), {
        target: { value: 'Order gravel' },
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId('task-checklist-add'));
      });
      fireEvent.click(await screen.findByRole('button', { name: 'Actions for Order gravel' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      await act(async () => {
        fireEvent.click(await screen.findByTestId('subtask-delete-confirm'));
      });
      await waitFor(() => expect(screen.queryByTestId('section-task-checklist')).toBeNull());
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add to this task' })).toHaveFocus(),
      );
    });

    // DEFECT (reported to dev-team-lead): when the checklist came from the server (not the Add
    // menu) the emptied marker is set after the refresh already hid the card, no state changes
    // afterwards, so the focus effect never runs and focus stays on the page heading (the Modal
    // fallback) instead of the Add menu trigger. Pinned as current behaviour.
    it('last server-loaded checklist item deleted: focus moves to the Add menu trigger', async () => {
      renderPanel(makeTaskPage({ subtasks: [subtask('s1', 'Order gravel')] }));
      await screen.findByTestId('task-add-menu');
      fireEvent.click(screen.getByRole('button', { name: 'Actions for Order gravel' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      await act(async () => {
        fireEvent.click(await screen.findByTestId('subtask-delete-confirm'));
      });
      await waitFor(() => expect(screen.queryByTestId('section-task-checklist')).toBeNull());
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add to this task' })).toHaveFocus(),
      );
      expect(screen.getByTestId('page-h1')).not.toHaveFocus();
    });

    it('last checklist item deleted while the Add menu is not shown: focus moves to the page heading', async () => {
      mockListNotes.mockRejectedValue(new Error('down'));
      renderPanel(makeTaskPage({ subtasks: [subtask('s1', 'Order gravel')] }));
      await screen.findByRole('alert');
      fireEvent.click(screen.getByRole('button', { name: 'Actions for Order gravel' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      await act(async () => {
        fireEvent.click(await screen.findByTestId('subtask-delete-confirm'));
      });
      await waitFor(() => expect(screen.getByTestId('page-h1')).toHaveFocus());
    });

    it('last note deleted: focus moves to the Add menu', async () => {
      notesOnServer = [note('n1', 'Hello', '2026-03-01T10:00:00.000Z')];
      renderPanel();
      await screen.findByTestId('task-note-n1');
      fireEvent.click(screen.getByRole('button', { name: /^Actions for the note/ }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      await act(async () => {
        fireEvent.click(await screen.findByTestId('note-delete-confirm'));
      });
      await waitFor(() => expect(screen.queryByTestId('section-task-notes')).toBeNull());
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add to this task' })).toHaveFocus(),
      );
    });

    it('deleting one of several items does not move focus', async () => {
      renderPanel(
        makeTaskPage({ subtasks: [subtask('s1', 'Order gravel'), subtask('s2', 'Book digger')] }),
      );
      await screen.findByTestId('task-add-menu');
      fireEvent.click(screen.getByRole('button', { name: 'Actions for Order gravel' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      await act(async () => {
        fireEvent.click(await screen.findByTestId('subtask-delete-confirm'));
      });
      await waitFor(() => expect(screen.queryByTestId('task-checklist-item-s1')).toBeNull());
      expect(screen.getByRole('button', { name: 'Add to this task' })).not.toHaveFocus();
    });
  });

  describe('members for the Who picker', () => {
    it('loads the members once and leaves the deactivated ones out', async () => {
      renderPanel();
      await waitFor(() => expect(mockListUsers).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByTestId('section-task-who-where-edit'));
      fireEvent.click(await screen.findByLabelText('Who'));
      expect(await screen.findByRole('option', { name: /Pat Sample/ })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Gone Member/ })).toBeNull();
    });

    it('shows a failure with Retry in the Who and where editor, and Retry loads the members again', async () => {
      mockListUsers.mockRejectedValueOnce(new Error('down'));
      renderPanel();
      await waitFor(() => expect(mockListUsers).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByTestId('section-task-who-where-edit'));
      expect(await screen.findByText("Couldn't load the household members.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Retry|Try again/ }));
      await waitFor(() => expect(mockListUsers).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(screen.queryByText("Couldn't load the household members.")).toBeNull(),
      );
    });

    it('ignores members that arrive after unmount', async () => {
      let resolve!: (value: never) => void;
      mockListUsers.mockReturnValueOnce(new Promise((res) => (resolve = res)));
      const { unmount } = renderPanel();
      unmount();
      await act(async () => resolve({ users: [] } as never));
    });

    it('ignores a members failure after unmount', async () => {
      let reject!: (error: Error) => void;
      mockListUsers.mockReturnValueOnce(new Promise((_res, rej) => (reject = rej)));
      const { unmount } = renderPanel();
      unmount();
      await act(async () => reject(new Error('late')));
    });
  });
});
